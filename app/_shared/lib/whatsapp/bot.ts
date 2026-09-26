import { Prisma } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/app/_shared/lib/prisma";
import { sendText, markMessageRead } from "./client";
import { runFlowForContact, listFlowsForBot } from "./flow-runner";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { captureConversation } from "./brain";
import { recordAppliedRules, recordCodeIntervention } from "./rule-events";
import { reportLeadStageToMeta } from "@/app/_shared/lib/meta-conversions";
// tokens.ts não importa nada deste arquivo — import estático seguro (o core
// da assinatura, que importa daqui, entra por import DINÂMICO no handler).
import { signUrlFor } from "@/app/_shared/lib/signature/tokens";
import { getStatusLabel, getStatusDescription } from "@/app/nova-dash/card-dialog/constants";
import { clientDocumentMediaWhere, docsReceivedSince } from "@/app/_shared/utils/wa-media";
import { buildAudioTranscriptNote } from "@/app/_shared/utils/audio-note";
import {
  BOT_TURN_BUDGET_MS, BRAIN_MIN_ATTEMPT_MS, BURST_DEBOUNCE_MS, EARLY_TRANSCRIBE_WAIT_MS,
  brainAttemptTimeoutMs, brainTimeoutError, isBrainTimeoutError, isTerminalBotAction, microBudgetMs,
  newerInboundWhere, settleWithin, shouldAbortSend, type SendGuardVerdict,
} from "@/app/_shared/utils/bot-timing";
import { transcribeInboundAudio } from "./transcribe";
import {
  discardOutcomeOf, queueEffective, sumUsageByModel, turnTimings,
  type AiUsage, type DiscardOutcome, type EffectiveOutcome,
} from "@/app/_shared/utils/bot-telemetry";
import { reportCriticalError } from "@/app/_shared/lib/report-error";
import { findConversationOwner, type ConversationOwner } from "./ownership";
import { waAlertRecipients } from "./alert-recipients";
import { QUALIFIED_TAG_NAME, WA_QUALIFIED_MARK } from "./close-categories";
import { syncCloseTag } from "./close-tags";
import {
  broadcastWhatsAppEvent,
  whatsappChannelId,
  whatsappRecipients,
  type IngestResult,
  type WhatsAppMessageDTO,
} from "./service";

// Integração com o microserviço de IA (D:\Chatbot_whatsapp / Railway).
//
// O serviço é o "cérebro" stateless: recebe mensagem (texto e/ou áudio),
// histórico, ficha de memória e estado da conversa, e devolve a decisão
// { reply, action, memory, state, ... }. Este módulo:
//   - persiste memória/estado por conversa (a IA "lembra" entre mensagens)
//   - aplica delay humanizado antes de responder
//   - executa a ação: continuar, qualificar (fila + tag), desqualificar
//     (encerra como não qualificada) ou transferir pra fila humana
//   - roda as consultas ao banco que a IA pedir (só dados NÃO sensíveis)
// Qualquer falha (serviço fora, IA com erro, timeout) manda a conversa DIRETO
// pra fila de distribuição, SEM enviar mensagem de erro ao cliente.

const CHATBOT_URL = process.env.CHATBOT_URL?.replace(/\/$/, "") ?? "";
const CHATBOT_SECRET = process.env.CHATBOT_SECRET ?? "";
// ---- Ambiente de HOMOLOGAÇÃO do bot -----------------------------------------
// CHATBOT_URL_STAGING: URL de um cérebro de teste (prompt novo em validação).
// WHATSAPP_TEST_NUMBERS: números (E.164, separados por vírgula) cujas conversas
// usam o cérebro de staging — os clientes reais continuam no de produção.
// Fluxo: número de teste da Meta manda mensagem → cai aqui como qualquer
// cliente → responde com o prompt de staging, sem afetar ninguém.
const CHATBOT_URL_STAGING = process.env.CHATBOT_URL_STAGING?.replace(/\/$/, "") ?? "";
const TEST_NUMBERS = (process.env.WHATSAPP_TEST_NUMBERS ?? "")
  .split(",")
  .map((s) => s.replace(/\D/g, ""))
  .filter(Boolean);

/**
 * Texto de uma mensagem no histórico enviado ao cérebro.
 *
 * Anexo sem legenda tem `body` vazio: antes ele era simplesmente filtrado fora
 * e o cérebro NUNCA ficava sabendo que a foto/PDF existiu — nem no turno em que
 * chegou, nem em nenhum turno seguinte. Na coleta de documentos isso vira loop:
 * o bot cobra pra sempre um RG que o cliente já mandou. O marcador abaixo
 * mantém o anexo visível no histórico (e a transcrição do áudio junto).
 */
function historyText(m: {
  body: string | null;
  mediaType: string | null;
  transcript: string | null;
}): string {
  const body = m.body?.trim() ?? "";
  if (!m.mediaType) return body;
  // WhatsApp manda "audio/ogg; codecs=opus" — o parâmetro depois do ";" atrapalha.
  const mime = m.mediaType.split(";")[0].trim();
  const label = mime.startsWith("image/")
    ? "imagem/foto"
    : mime === "application/pdf"
      ? "PDF"
      : mime.startsWith("audio/")
        ? "áudio"
        : mime.startsWith("video/")
          ? "vídeo"
          : `arquivo (${mime || "tipo desconhecido"})`;
  const transcript = m.transcript?.trim();
  const marker = transcript
    ? `[anexo: ${label} — transcrição: ${transcript}]`
    : `[anexo: ${label}]`;
  return [body, marker].filter(Boolean).join(" ");
}

/**
 * Autor de cada turno do histórico enviado à IA. Antes era só client/bot/agent
 * e as mensagens proativas do sistema (recuperação, lembrete de assinatura...)
 * iam como "bot" — a IA não sabia separar o que ela disse, o que a equipe
 * disse e o que foi disparo automático, e travava com resposta vazia quando o
 * cliente respondia a uma pergunta do atendente (128 handoffs em 30 dias até
 * 22/09/2026).
 */
function historyRole(m: { direction: string; sentByBot: boolean; systemSource: string | null }): "client" | "bot" | "agent" | "system" {
  if (m.direction === "in") return "client";
  if (!m.sentByBot) return "agent";
  return m.systemSource ? "system" : "bot";
}

const SYSTEM_SOURCE_LABELS: Record<string, string> = {
  recovery: "recuperação de conversa parada",
  automation: "automação do Kanban",
  progress: "aviso de andamento do processo",
  signature_otp: "código de verificação da assinatura",
  signature_reminder: "lembrete de assinatura",
  signature_resend: "reenvio do link de assinatura",
};

function systemSourceLabel(source: string): string {
  return SYSTEM_SOURCE_LABELS[source] ?? source;
}

/** Cérebro a usar para este telefone: staging para números de teste, senão produção. */
function brainUrlFor(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (CHATBOT_URL_STAGING && TEST_NUMBERS.includes(digits)) return CHATBOT_URL_STAGING;
  return CHATBOT_URL;
}

// Debounce de rajada: BURST_DEBOUNCE_MS (bot-timing.ts, 8 s; o webhook usa o
// mesmo valor para a ficha automática).
// 45s: o caminho de áudio tem dois saltos (S3 → transcrição Gemini → Claude);
// 25s era curto demais e derrubava pra fila com "erro no bot" mesmo o cérebro
// respondendo bem (só que tarde).
const BOT_TIMEOUT_MS = 45_000;
// Timeout do cérebro (IA) → até 3 tentativas antes de cair na fila humana
// (504 do micro, "prazo do CRM esgotado", também conta como timeout). Outros
// erros têm 1 retry. Todas cabem no prazo do turno (BOT_TURN_BUDGET_MS,
// bot-timing.ts): sem tempo para outra tentativa, o erro sobe e o handoff sai
// antes do maxDuration do webhook. Não aumente timeout nem tentativas.
const BOT_MAX_ATTEMPTS = 3;
const BOT_RETRY_DELAY_MS = 1_000;
// Fato conversationFacts.recentAttendant: alguém da equipe escreveu ao cliente
// nesta janela. Fixo em 7 dias (a mesma do HUMAN_TOUCH_LOOKBACK_MS da
// recuperação) e não ligado ao WA_HUMAN_HOLD_DAYS: o micro escreve "nos
// últimos 7 dias" no prompt e a regra das instruções depende desse texto.
const RECENT_ATTENDANT_MS = 7 * 24 * 60 * 60_000;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface ProcessInfo {
  name: string | null;
  // Etapa AMIGÁVEL para o cliente (mesmo texto da timeline de status), não o
  // nome interno da coluna do Trello. Ex.: "Perícia médica", não "Enviar
  // Mensagem – Previdenciário".
  etapa: string | null;
  // Explicação em texto plano da etapa, para a IA saber contar ao cliente o que
  // está acontecendo naquela fase.
  etapaDescricao: string | null;
  service: string | null;
}

export interface LinkedCard extends ProcessInfo {
  kind: "user" | "process";
  id: string;
}

type BotUsage = AiUsage;

interface BotDecision {
  reply: string;
  // Roteiro comercial disparado de uma vez: cada item vira uma mensagem
  // separada no WhatsApp, enviada em sequência sem esperar o cliente.
  replies?: string[];
  action: "continue" | "qualify" | "disqualify" | "handoff" | "lookup" | "send_flow" | "resolve";
  // Nome do fluxo cadastrado a disparar quando action="send_flow".
  flowName?: string | null;
  // Categoria de encerramento (para qualify/disqualify/handoff/resolve):
  // qualificado | nao_qualificado | perguntas | novo_acidente | transferido.
  closeCategory?: string | null;
  handoffReason?: string;
  lookup: string | null;
  memory: string;
  state: string;
  intent: string;
  emotion: string;
  understood: boolean;
  confidence: number;
  // A IA identificou (pelo contexto) que o cliente quer PARAR de receber
  // mensagens. Diferente de disqualify: aqui marcamos optedOut no contato.
  optOut?: boolean;
  // IDs das regras do playbook (R1, R2...) que a IA declarou terem influenciado
  // esta resposta. Vira WhatsAppRuleEvent — telemetria da aba Métricas.
  appliedRules?: string[];
  // Silêncio DELIBERADO: a IA declarou que encerrar sem mensagem é o correto
  // (ex.: agradecimento pós-despedida). Sem esta flag, desfecho terminal com
  // reply vazio é tratado como falha da IA e recebe texto de fallback.
  silent?: boolean;
  // O microserviço detectou e descartou raciocínio/JSON vazado no texto do
  // cliente (27/08/2026). Sem texto, o fluxo cai pra fila humana — a flag faz
  // o log dizer o motivo real em vez de "a IA devolveu resposta vazia".
  leaked?: boolean;
  // Tokens gastos na chamada ao Claude (o microserviço devolve; alimenta o
  // custo semanal/mensal no dashboard do chatbot).
  usage?: BotUsage | null;
  // Transcrições dos áudios do lote, feitas pelo micro na hora da decisão
  // ({ id = WhatsAppMessage.id, transcript }). Persistimos em
  // WhatsAppMessage.transcript: sem isso o conteúdo do áudio sumia do
  // histórico dos turnos seguintes (a IA via só "[anexo: áudio]").
  transcripts?: { id: string; transcript: string }[] | null;
  // Tokens da transcrição dos áudios (Gemini), um item por áudio. Separado de
  // `usage` de propósito: é outro modelo, com outro preço (MODEL_PRICING), e
  // vira um log wa_transcribe próprio. Micro antigo não manda: fica sem custo,
  // como antes.
  transcribeUsage?: BotUsage[] | null;
}

function sumUsage(a?: BotUsage | null, b?: BotUsage | null): BotUsage | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return {
    model: b.model || a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

function isBotConfigured(): boolean {
  return !!CHATBOT_URL && !!CHATBOT_SECRET;
}

// ---------------------------------------------------------------------------
// Filtro de sanidade da resposta da IA (29/07/2026, caso Mateus Leandro):
// a saída estruturada do modelo degenerou e o esqueleto do próprio JSON vazou
// como itens de `replies` ('replies":[],', 'action":', 'flowNam', 'nenhum'...)
// — e cada fragmento virou uma mensagem no WhatsApp do cliente. Blocos
// legítimos de `replies` são sempre frases completas; item que parece
// fragmento de JSON ou token solto do schema é descartado antes do envio.
// ---------------------------------------------------------------------------
const SCHEMA_TOKENS = new Set([
  "reply", "replies", "action", "flowname", "closecategory", "handoffreason",
  "lookup", "memory", "state", "intent", "emotion", "urgent", "understood",
  "confidence", "optout", "appliedrules", "silent", "usage",
  "continue", "qualify", "disqualify", "handoff", "send_flow", "sendflow",
  "resolve", "nenhum", "null", "true", "false",
]);

/** Pontuação estrutural de JSON ('"key":', '[]', começa com {,}:...). */
function isJsonSkeleton(text: string): boolean {
  return /"\s*:/.test(text) || /\[\s*\]/.test(text) || /^\s*[{}\[\],:]/.test(text);
}

/** Item de `replies` que é lixo de JSON, e não um bloco de mensagem real. */
function looksLikeJsonFragment(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (isJsonSkeleton(t)) return true;
  // Chave/valor do schema como palavra solta ("handoffReason", "continue").
  const bare = t.toLowerCase().replace(/[^a-z_]/g, "");
  if (SCHEMA_TOKENS.has(bare)) return true;
  // Token solto: sem espaço, curto e sem cara de frase ("flowNam", "nenh").
  if (!/\s/.test(t) && t.length <= 15 && !/[.!?…]$/.test(t)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Vazamento de RACIOCÍNIO (27/08/2026, casos Sebastião Lourenço/Edivaldo/
// Victor): a saída é JSON válido, mas o modelo escreveu o rascunho do próprio
// pensamento dentro do texto do cliente ("categoria: mesmo assunto...",
// "action reply curta.", "step final", "let's write actual reply.}") — e cada
// item de `replies` virou uma mensagem no WhatsApp. Como são frases inteiras,
// escapavam de looksLikeJsonFragment. A correção de fundo está no
// microserviço (campo `rationale` no schema, onde o modelo pensa de verdade);
// este espelho aqui é a ÚLTIMA barreira antes do envio e vale mesmo com o
// micro rodando código antigo.
// ---------------------------------------------------------------------------
const REASONING_PATTERNS: RegExp[] = [
  // Rótulo interno em inglês abrindo a mensagem ("action reply curta.").
  /^\s*(action|step|state|reply|replies|rationale|memory|final answer|thinking)/i,
  // Rótulo de deliberação em pt-BR com dois-pontos ("categoria: ...").
  /^\s*(categoria|avalia[çc][ãa]o|an[áa]lise|racioc[íi]nio|delibera[çc][ãa]o|decis[ãa]o|passo|nota interna|resumo interno)\s*[:=]/i,
  // Atribuição de campo do schema no meio da prosa ("state=coleta_documentos").
  /(state|action|closeCategory|handoffReason|flowName|replies|intent|silent|confidence|memory|rationale)\s*[:=]\s*["'\[]?[a-z_]/i,
  // Rascunho em inglês ("let's write actual reply", "final json").
  /(let'?s|final json|actual reply|i (should|will|need to)|we (should|need to))/i,
  // Chave de JSON solta no meio do texto — mensagem de WhatsApp não tem { }.
  /[{}]/,
  // Fala SOBRE o cliente em 3ª pessoa (o bot fala COM ele, sempre "você").
  /o cliente/i,
  // Planejamento da própria resposta.
  /(vou (responder|usar|mandar uma)|n[ãa]o repetir|melhor apenas|responder curto|sem repetir cobran[çc]a)/i,
  // Degeneração de amostragem: alfabeto que não é o nosso (CJK/cirílico).
  /[Ѐ-ӿ　-ヿ一-鿿가-힯]/,
];

/** Texto que é rascunho de raciocínio, e não mensagem pronta pro cliente. */
function looksLikeReasoning(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return REASONING_PATTERNS.some((re) => re.test(t));
}

// Etapas em que `replies` (várias mensagens em sequência) é legítimo: só o
// disparo do roteiro comercial, único caso previsto nas instruções.
const SCRIPT_STATES = new Set([
  "script_beneficio_1", "script_beneficio_2", "script_beneficio_3",
  "script_honorarios", "script_fechamento", "pergunta_interesse",
]);

/** Remove fragmentos de JSON e raciocínio vazados pela IA antes de qualquer envio. */
function sanitizeDecision(d: BotDecision): BotDecision {
  const rawReplies = Array.isArray(d.replies) ? d.replies : [];
  let replies = rawReplies.filter(
    (r) => typeof r === "string" && !looksLikeJsonFragment(r) && !looksLikeReasoning(r),
  );
  // No `reply` único o teste de token solto NÃO se aplica: mensagem curta
  // legítima ("Ok!") não pode ser descartada por parecer fragmento.
  const replyLeaked = typeof d.reply === "string" && !!d.reply
    && (isJsonSkeleton(d.reply) || looksLikeReasoning(d.reply));
  const reply = replyLeaked ? "" : d.reply;
  // Uma sequência é um bloco só: se um pedaço saiu podre, o resto também não
  // é confiável — descarta a sequência inteira.
  const leaked = replyLeaked || replies.length !== rawReplies.length;
  if (replies.length !== rawReplies.length) replies = [];
  // Fora das etapas do roteiro, várias mensagens em sequência é saída
  // degenerada: ignora `replies` e segue só com `reply`.
  if (replies.length && !SCRIPT_STATES.has(d.state)) {
    console.warn(
      `[WHATSAPP BOT] replies com ${replies.length} item(ns) fora do roteiro (state=${d.state}) — ignorado; usando só 'reply'.`,
    );
    replies = [];
  }
  if (leaked) {
    console.error(
      "[WHATSAPP BOT] VAZAMENTO: a IA escreveu raciocínio/JSON no texto do cliente — descartado. " +
      `state=${d.state} | reply=${JSON.stringify((d.reply ?? "").slice(0, 300))} | ` +
      `replies=${JSON.stringify(rawReplies.map((r) => String(r).slice(0, 200)))}`,
    );
  }
  return { ...d, reply, replies, leaked: leaked || d.leaked };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Delay humanizado: proporcional ao tamanho da resposta, entre 1.2s e 3.5s. */
function humanDelay(text: string): number {
  return Math.min(1200 + text.length * 20, 3500);
}

// ---------------------------------------------------------------------------
// Horário comercial (America/Sao_Paulo): seg-sex 08-18h, sábado 08-12h.
// ---------------------------------------------------------------------------
function businessHours(): { open: boolean; reopens: string; greeting: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");

  // Saudação pelo horário de Brasília (para o bot cumprimentar corretamente).
  const greeting = hour >= 5 && hour < 12 ? "bom dia" : hour >= 12 && hour < 18 ? "boa tarde" : "boa noite";

  const dayIdx: Record<string, number> = { "dom.": 0, "seg.": 1, "ter.": 2, "qua.": 3, "qui.": 4, "sex.": 5, "sáb.": 6 };
  const d = dayIdx[weekday] ?? 1;

  const open = (d >= 1 && d <= 5 && hour >= 8 && hour < 18) || (d === 6 && hour >= 8 && hour < 12);
  if (open) return { open: true, reopens: "", greeting };

  let reopens: string;
  if (d >= 1 && d <= 5 && hour < 8) reopens = "hoje às 08h";
  else if (d >= 1 && d <= 4) reopens = "amanhã às 08h";
  else if (d === 5) reopens = "no sábado às 08h";
  else if (d === 6 && hour < 8) reopens = "hoje às 08h";
  else reopens = "na segunda-feira às 08h";
  return { open: false, reopens, greeting };
}

// ---------------------------------------------------------------------------
// Vínculo do telefone com o cadastro (kanban)
// ---------------------------------------------------------------------------

/**
 * Vincula o telefone do WhatsApp a um card do kanban (User ou Process).
 * Prioridade: vínculo manual no contato; senão, busca pelos últimos 8 dígitos.
 * Só expõe dados NÃO sensíveis (nome, etapa, serviço) — nada de obs/CPF/endereço.
 */
export async function findLinkedCard(contactId: string): Promise<LinkedCard | null> {
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) return null;

  if (contact.userId) {
    const u = await db.user.findUnique({ where: { id: contact.userId }, include: { label: true } });
    if (u) return { kind: "user", id: u.id, name: u.name, etapa: getStatusLabel(u.service, u.status) ?? u.label?.name ?? u.role, etapaDescricao: getStatusDescription(u.service, u.status), service: u.service };
  }
  if (contact.processId) {
    const p = await db.process.findUnique({ where: { id: contact.processId }, include: { label: true } });
    if (p) return { kind: "process", id: p.id, name: p.name, etapa: getStatusLabel(p.service, p.status) ?? p.label?.name ?? p.role, etapaDescricao: getStatusDescription(p.service, p.status), service: p.service };
  }

  const last8 = contact.phone.replace(/\D/g, "").slice(-8);
  if (last8.length < 8) return null;

  const users = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "User"
    WHERE regexp_replace(COALESCE(telefone, '') || ' ' || COALESCE(telefone_secundario, ''), '\D', '', 'g') LIKE ${"%" + last8 + "%"}
    LIMIT 1
  `);
  if (users.length) {
    const u = await db.user.findUnique({ where: { id: users[0].id }, include: { label: true } });
    if (u) return { kind: "user", id: u.id, name: u.name, etapa: getStatusLabel(u.service, u.status) ?? u.label?.name ?? u.role, etapaDescricao: getStatusDescription(u.service, u.status), service: u.service };
  }

  const processes = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "Process"
    WHERE regexp_replace(COALESCE(telefone, '') || ' ' || COALESCE(telefone_secundario, ''), '\D', '', 'g') LIKE ${"%" + last8 + "%"}
    LIMIT 1
  `);
  if (processes.length) {
    const p = await db.process.findUnique({ where: { id: processes[0].id }, include: { label: true } });
    if (p) return { kind: "process", id: p.id, name: p.name, etapa: getStatusLabel(p.service, p.status) ?? p.label?.name ?? p.role, etapaDescricao: getStatusDescription(p.service, p.status), service: p.service };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Consultas que a IA pode pedir (action="lookup"). Só dados NÃO sensíveis:
// status/etapa, cadastro sim/não, QUANTIDADE de documentos. Nunca conteúdo.
// ---------------------------------------------------------------------------
async function runLookup(kind: string, contactId: string, card: LinkedCard | null): Promise<{ kind: string; data: object }> {
  switch (kind) {
    case "status_processo": {
      const fresh = card ?? (await findLinkedCard(contactId));
      return {
        kind,
        data: fresh
          ? { encontrado: true, nome: fresh.name, etapa: fresh.etapa, etapaDescricao: fresh.etapaDescricao, servico: fresh.service }
          : { encontrado: false },
      };
    }
    case "dados_cadastro": {
      const fresh = card ?? (await findLinkedCard(contactId));
      return { kind, data: { cadastrado: !!fresh, nome: fresh?.name ?? null } };
    }
    case "documentos_enviados": {
      const fresh = card ?? (await findLinkedCard(contactId));
      if (!fresh) return { kind, data: { cadastrado: false, quantidade: 0 } };
      const quantidade = await db.document.count({
        where: fresh.kind === "user"
          ? { userId: fresh.id, deletedAt: null }
          : { processId: fresh.id, deletedAt: null },
      });
      return { kind, data: { cadastrado: true, quantidade } };
    }
    default:
      return { kind, data: { erro: "consulta desconhecida" } };
  }
}

// ---------------------------------------------------------------------------
// Fila, qualificação e encerramento
// ---------------------------------------------------------------------------

/**
 * Nota interna na thread (só a equipe vê): registra o motivo de transferências
 * e eventos do bot inline na conversa, pro atendente ter contexto na hora.
 * Best-effort — falha aqui não interrompe o fluxo.
 */
export async function postInternalNote(contactId: string, body: string): Promise<void> {
  try {
    const message = await db.whatsAppMessage.create({
      data: { contactId, direction: "out", body, sentByBot: true, internal: true, status: "sent" },
    });
    // Toca o updatedAt da conversa DEPOIS da nota (sem lastMessageAt: nota não
    // reordena a lista): a lista do inbox sincroniza por delta, e o motivo da
    // Fila (a última nota do bot) só chegaria às abas abertas na lista
    // completa de 10 min quando a nota sai depois do update que enfileira.
    const [contact] = await Promise.all([
      db.whatsAppContact.findUnique({ where: { id: contactId }, select: { name: true, phone: true } }),
      db.whatsAppConversation.updateMany({ where: { contactId }, data: { updatedAt: new Date() } }),
    ]);
    // Relay depois da resposta (não segura o laço do bot nem o webhook).
    broadcastWhatsAppEvent({
      id: message.id,
      channelId: whatsappChannelId(contactId),
      contactId,
      direction: "out",
      body,
      mediaKey: null,
      mediaType: null,
      status: "sent",
      sentByBot: true,
      authorId: null,
      createdAt: message.createdAt.toISOString(),
      contactName: contact?.name ?? null,
      contactPhone: contact?.phone ?? "",
      conversationStatus: "queued",
    } satisfies WhatsAppMessageDTO);
  } catch (err) {
    console.error("[WHATSAPP BOT] Falha ao registrar nota interna:", err);
  }
}

/**
 * Condição de entrada dos helpers de fila. `onlyIfStatus: "bot"` = só move se
 * a conversa AINDA está com o bot (update condicional no banco). Todo chamador
 * do fluxo do bot passa isso; sem ele o comportamento é o antigo (incondicional).
 *
 * `extraNote` = texto acrescentado à nota interna da fila, depois do motivo
 * (hoje, a transcrição dos áudios do lote: buildAudioTranscriptNote). Vai na
 * MESMA nota, não numa segunda: a lista da Fila mostra a última nota do bot
 * como motivo (loadConversations), e uma nota só com a transcrição tomaria o
 * lugar dele.
 */
export interface QueueOpts {
  onlyIfStatus?: "bot";
  extraNote?: string;
}

/** Motivo da nota interna + o texto extra (transcrição), numa nota só. */
function withExtraNote(note: string, extraNote: string | undefined): string {
  const extra = extraNote?.trim();
  return extra ? `${note}\n\n${extra}` : note;
}

/**
 * Joga a conversa na fila de distribuição e avisa a equipe (Notification).
 * NUNCA envia mensagem de erro ao cliente — se a IA falhou, o cliente
 * simplesmente passa a ser atendido por um humano.
 *
 * Devolve se moveu. Com `onlyIfStatus` e a conversa já fora do modo bot
 * (atendente assumiu, já está na fila ou encerrada), não mexe em nada: sem nota
 * interna e sem notificação. Caso de 11/09 18:47: o atendente assumiu enquanto
 * o cérebro pensava e, ~1 min depois, o timeout devolveu a conversa à Fila sem
 * dono (assignedToId null) e com nota de "timeout".
 *
 * DONO PEGAJOSO (EF-1): a fila guarda o último atendente (o atribuído, se ainda
 * é da equipe, ou o autor da última mensagem humana dos 7 dias) e só ele é
 * notificado; sem dono, o setor da Fila (alert-recipients.ts). A equipe inteira
 * só entra pelos degraus do SLA da fila no cron: avisar as 17 pessoas a cada
 * transferência somava ~450 notificações por dia em 09/2026. Continua 'queued'
 * (queuedAt, SLA e métricas de fila iguais): é roteamento, a decisão segue do
 * cérebro.
 */
export async function handoffToQueue(
  contactId: string,
  contactLabel: string,
  reason: string,
  closeCategory: string = "transferido",
  opts: QueueOpts = {},
): Promise<boolean> {
  const owner = await queueOwner(contactId);
  const { count } = await db.whatsAppConversation.updateMany({
    where: { contactId, ...(opts.onlyIfStatus ? { status: opts.onlyIfStatus } : {}) },
    // queuedAt alimenta o SLA da fila (cron alerta se ninguém assumir).
    data: { status: "queued", assignedToId: owner?.id ?? null, botFailCount: 0, closeCategory, queuedAt: new Date(), queueAlertAt: null },
  });
  if (count === 0) {
    console.log(`[WHATSAPP BOT] ${contactId}: transferência para a fila ignorada — a conversa já não está com o bot (${reason}).`);
    return false;
  }

  // Motivo da transferência visível NA THREAD (nota interna, só equipe; o
  // histórico do cérebro filtra internal, então o nome não chega à IA).
  await postInternalNote(contactId, withExtraNote(`🤖 Transferido para atendimento humano — ${reason}${ownerSuffix(owner)}`, opts.extraNote));

  try {
    const recipients = await waAlertRecipients({ contactId, ownerId: owner?.id ?? null, audience: "owner_or_sector" });
    for (const id of recipients) {
      await db.notification.create({
        data: {
          recipientId: id,
          authorId: "whatsapp-bot",
          authorName: "🤖 Bot WhatsApp",
          targetName: contactLabel,
          message: owner
            ? `WhatsApp: ${contactLabel} voltou para você, aguardando atendimento (${reason})`
            : `WhatsApp: ${contactLabel} aguardando atendente (${reason})`,
          // Clicar na notificação abre a conversa direto no inbox.
          contactId,
        },
      });
    }
  } catch (err) {
    console.error("[WHATSAPP BOT] Falha ao criar notificações de handoff:", err);
  }
  return true;
}

/**
 * Dono que a conversa leva para a fila (ownership.ts). `knownAssignee` = o
 * assignedToId que o chamador já leu (undefined = ler aqui). Falha na busca não
 * impede a transferência: cai na fila sem dono, como antes.
 */
async function queueOwner(contactId: string, knownAssignee?: string | null): Promise<ConversationOwner | null> {
  try {
    const assignee = knownAssignee !== undefined
      ? knownAssignee
      : (await db.whatsAppConversation.findUnique({ where: { contactId }, select: { assignedToId: true } }))?.assignedToId;
    return await findConversationOwner(contactId, assignee);
  } catch (err) {
    await reportCriticalError("WHATSAPP BOT dono da fila", err, { contactId });
    return null;
  }
}

/** " — volta para Ana" na nota interna da fila; vazio sem dono. */
function ownerSuffix(owner: ConversationOwner | null): string {
  return owner ? ` — volta para ${owner.name?.trim() || "o último atendente"}` : "";
}

/** Garante a tag "Qualificada" e anexa à conversa. */
async function tagAsQualified(conversationId: string): Promise<void> {
  const tag = await db.whatsAppTag.upsert({
    where: { name: QUALIFIED_TAG_NAME },
    update: {},
    create: { name: QUALIFIED_TAG_NAME, color: "#10b981" },
  });
  await db.whatsAppConversationTag.upsert({
    where: { conversationId_tagId: { conversationId, tagId: tag.id } },
    update: {},
    create: { conversationId, tagId: tag.id },
  });
}

/**
 * Lead QUALIFICADO: fila de espera + tag "Qualificada" + aviso pra equipe.
 *
 * Devolve se moveu. O bot passa `onlyIfStatus: "bot"`: entre a decisão e este
 * ponto sai o roteiro comercial inteiro (vários blocos, até ~15 s), e um
 * atendente que assumiu nesse meio tempo perdia a conversa de volta para a
 * Fila, o mesmo bug do handoff. A assinatura (signature/core.ts) chama sem
 * opts, com o comportamento de sempre.
 *
 * Dono pegajoso igual ao handoffToQueue: a fila guarda o último atendente. O
 * aviso de lead qualificado vai para o dono E o setor da Fila (quem cria o card
 * e manda o contrato), com a marca WA_QUALIFIED_MARK que o sino destaca e fixa
 * no topo: no meio de ~1.890 avisos por dia ele passava despercebido (EF-10).
 */
export async function qualifyToQueue(
  contactId: string,
  contactLabel: string,
  reason: string,
  opts: QueueOpts = {},
): Promise<boolean> {
  // Já era qualificado antes (lead voltando)? Então NÃO é uma nova qualificação:
  // não reposta a nota de "lead novo", não re-notifica a equipe como lead
  // inédito e não redispara o evento pra Meta — só garante que voltou pra fila.
  const existing = await db.whatsAppConversation.findUnique({
    where: { contactId },
    select: { id: true, qualified: true, assignedToId: true },
  });
  if (!existing) return false;
  const alreadyQualified = existing.qualified === true;
  const owner = await queueOwner(contactId, existing.assignedToId);

  const { count } = await db.whatsAppConversation.updateMany({
    where: { contactId, ...(opts.onlyIfStatus ? { status: opts.onlyIfStatus } : {}) },
    data: { status: "queued", assignedToId: owner?.id ?? null, qualified: true, botFailCount: 0, closeCategory: "qualificado", queuedAt: new Date(), queueAlertAt: null },
  });
  if (count === 0) {
    console.log(`[WHATSAPP BOT] ${contactId}: qualificação sem ida à fila — a conversa já não está com o bot (${reason}).`);
    return false;
  }
  await tagAsQualified(existing.id);

  if (alreadyQualified) {
    await postInternalNote(contactId, withExtraNote(`🤖 Lead qualificado retornou ao atendimento — ${reason}${ownerSuffix(owner)}`, opts.extraNote));
    return true;
  }

  await postInternalNote(contactId, withExtraNote(`🤖 Lead qualificado pela IA — ${reason}${ownerSuffix(owner)}`, opts.extraNote));
  const recipients = await waAlertRecipients({ contactId, ownerId: owner?.id ?? null, audience: "owner_and_sector" });
  await handoffNotifyOnly(contactLabel, `${WA_QUALIFIED_MARK} — ${reason}`, contactId, recipients);
  // Lead qualificado SEM card ainda: cria a tarefa na caixa de Menções e
  // Tarefas da equipe — criar o card e enviar o contrato pra assinatura não
  // pode depender de alguém lembrar do aviso volátil do sino.
  void createCardTaskForTeam(contactId, contactLabel, reason);
  // Devolve pra Meta (API de Conversões) que este lead qualificou — otimiza
  // as campanhas por qualidade. Fire-and-forget, nunca quebra o fluxo.
  void reportLeadStageToMeta(contactId, "qualificado");
  return true;
}

/**
 * Tarefa "criar card + enviar contrato" na caixa de Menções e Tarefas quando a
 * IA qualifica um lead que ainda não tem card. Roteada para o setor
 * responsável (sector-tasks.ts). Best-effort: nunca quebra o fluxo de
 * qualificação.
 */
async function createCardTaskForTeam(contactId: string, contactLabel: string, reason: string): Promise<void> {
  try {
    const contact = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: { userId: true },
    });
    if (!contact || contact.userId) return; // já tem card — nada a fazer

    const { recordSectorTask } = await import("@/app/_shared/lib/sector-tasks");
    await recordSectorTask({
      kind: "wa_lead_qualificado",
      authorName: "Bot WhatsApp",
      source: "whatsapp",
      text: `Lead qualificado pela IA — criar o card e enviar o contrato pra assinatura. Motivo: ${reason}`,
      targetName: `WhatsApp · ${contactLabel}`,
      channelId: contactId, // abre a conversa direto no inbox
    });
  } catch (err) {
    console.error("[WA BOT] Falha ao criar a tarefa de card do lead qualificado:", err);
  }
}

/**
 * Cliente NÃO elegível: encerra o ticket como "não qualificada".
 *
 * `category` (16/09/2026): a IA agora devolve o SUB-MOTIVO da desqualificação
 * (nq_acidente_muito_antigo, nq_sem_qualidade_de_segurado...) — as mesmas
 * chaves do menu "Encerrar" do inbox. Só aceitamos prefixo "nq_" (qualquer
 * outra coisa cai no genérico), pra nunca gravar uma categoria que não seja de
 * não qualificado num encerramento por disqualify.
 *
 * Devolve a categoria gravada (vai para o desfecho efetivo do log wa_bot).
 */
async function disqualifyAndClose(contactId: string, category?: string | null): Promise<string> {
  const closeCategory = category && category.startsWith("nq_") ? category : "nao_qualificado";
  // Cérebro: snapshot ANTES do update (que zera botMemory/botState logo abaixo).
  await captureConversation(contactId, "bot_disqualify", {
    closeCategory,
    qualified: false,
  });
  const conv = await db.whatsAppConversation.update({
    where: { contactId },
    // A ficha (botMemory/botState) é PRESERVADA de propósito (25/07/2026): se o
    // cliente mandar um "obrigado"/"Bgdooo" logo depois, a reabertura vem com
    // contexto e a IA responde curto em vez de recomeçar a triagem do zero
    // (caso Luiz: 4 ciclos de saudação→triagem→despedida na mesma tarde). A
    // limpeza acontece na REABERTURA, se a conversa estiver velha (service.ts).
    data: { status: "closed", closedAt: new Date(), assignedToId: null, qualified: false, closeCategory, botFailCount: 0, queuedAt: null, queueAlertAt: null, recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null },
    select: { id: true },
  });
  // Tag do motivo ("Não qualificada — Acidente muito antigo"), como no
  // encerramento manual: sem ela o filtro por motivo não trazia o bot.
  await syncCloseTag(conv.id, closeCategory);
  void reportLeadStageToMeta(contactId, "nao_qualificado");
  return closeCategory;
}

/**
 * Assunto RESOLVIDO pelo próprio bot (ex.: cliente cadastrado só tirou uma
 * dúvida / consultou status e não precisa de mais nada). Encerra sem
 * qualificar, na categoria "perguntas". A ficha é preservada — a limpeza, se
 * couber, acontece na reabertura (janela de validade no service.ts).
 */
async function resolveAndClose(contactId: string, category: string = "perguntas"): Promise<void> {
  // Se o contato JÁ era qualificado (ex.: qualificado que voltou só pra tirar
  // uma dúvida), não rebaixa o desfecho nem apaga a ficha — preserva qualified
  // e a memória para uma eventual retomada. Caso normal reseta para começar do
  // zero na próxima conversa.
  const existing = await db.whatsAppConversation.findUnique({
    where: { contactId },
    select: { qualified: true },
  });
  const keepContext = existing?.qualified === true;
  // Cérebro: snapshot antes de qualquer reset de ficha.
  await captureConversation(contactId, "bot_resolve", {
    closeCategory: category,
    qualified: keepContext ? true : null,
  });
  const conv = await db.whatsAppConversation.update({
    where: { contactId },
    data: {
      status: "closed", closedAt: new Date(), assignedToId: null,
      qualified: keepContext ? true : null,
      closeCategory: category, botFailCount: 0,
      // Ficha preservada em TODOS os desfechos (25/07/2026) — ver comentário no
      // disqualifyAndClose. A limpeza é na reabertura, por idade (service.ts).
      queuedAt: null, queueAlertAt: null,
      // Desfecho real → ciclo de recuperação zerado.
      recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null,
    },
    select: { id: true },
  });
  // "Perguntas / dúvidas" etc. A "Qualificada" de quem já era qualificado
  // fica (só desqualificação a tira: close-tag-plan.ts).
  await syncCloseTag(conv.id, category);
}

/**
 * Rede de segurança contra DESFECHO MUDO: a IA encerrou/transferiu sem devolver
 * nenhum texto e sem declarar silêncio deliberado (silent) — o cliente acabou
 * de falar e ficaria sem resposta alguma. Envia um fallback mínimo e registra
 * a intervenção em Métricas (kind="code"). Best-effort: falha no envio não
 * pode travar o encerramento que vem em seguida. Devolve se a mensagem saiu
 * (latência do turno no log wa_bot).
 */
async function sendMutedFallback(
  contactId: string,
  message: { contactPhone: string; contactName: string | null },
  text: string,
  reason: string,
): Promise<boolean> {
  let sent = false;
  try {
    sent = await sendBotReply(contactId, message.contactPhone, message.contactName, text, humanDelay(text));
  } catch (err) {
    console.error("[WHATSAPP BOT] Fallback anti-mudez não entregue (seguindo com o desfecho):", contactId, err);
  }
  await recordCodeIntervention({
    contactId,
    contactName: message.contactName,
    botState: null,
    action: "fallback_texto",
    detail: `Rede de segurança: ${reason} — a IA encerrou sem mensagem e sem silent=true; texto mínimo enviado pelo código.`,
  });
  return sent;
}

/**
 * Só as notificações do handoff (sem mexer no status — já foi atualizado).
 * `onlyTo` = destinatários já resolvidos (waAlertRecipients); omitido ou vazio
 * = a equipe toda.
 */
async function handoffNotifyOnly(
  contactLabel: string,
  reason: string,
  contactId?: string,
  onlyTo?: string[],
): Promise<void> {
  try {
    const recipients = onlyTo?.length ? onlyTo : await whatsappRecipients();
    for (const id of recipients) {
      await db.notification.create({
        data: {
          recipientId: id,
          authorId: "whatsapp-bot",
          authorName: "🤖 Bot WhatsApp",
          targetName: contactLabel,
          message: `WhatsApp: ${contactLabel} — ${reason}`,
          contactId: contactId ?? null,
        },
      });
    }
  } catch (err) {
    console.error("[WHATSAPP BOT] Falha ao notificar equipe:", err);
  }
}

// ---------------------------------------------------------------------------
// Envio de resposta do bot
// ---------------------------------------------------------------------------

/**
 * Envia a resposta do bot pro cliente (com delay humanizado opcional) e
 * registra/transmite como as demais mensagens. Exportada também pro cron de
 * silêncio (/api/whatsapp/cron).
 *
 * Devolve true só se a mensagem saiu (o 1º envio marca a latência do turno no
 * log wa_bot); false = barrada em silêncio pelo guard anti-spam abaixo. Falha
 * da Meta continua lançando. Os chamadores antigos ignoram o retorno.
 */
export async function sendBotReply(
  contactId: string,
  phone: string,
  name: string | null,
  text: string,
  delayMs = 0,
): Promise<boolean> {
  // Guard anti-spam (política da Meta):
  // 1. NUNCA responde a quem pediu opt-out.
  // 2. NÃO reenvia uma mensagem idêntica à última enviada nos últimos 10min —
  //    evita o padrão de "mesma saudação repetida" que caracteriza spam.
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { optedOut: true, numberId: true },
  });
  if (contact?.optedOut) {
    console.warn("[WHATSAPP BOT] Envio bloqueado: contato em opt-out.", contactId);
    return false;
  }
  const lastOut = await db.whatsAppMessage.findFirst({
    where: { contactId, direction: "out", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { body: true, createdAt: true },
  });
  if (lastOut?.body && lastOut.body.trim() === text.trim()
    && Date.now() - lastOut.createdAt.getTime() < 10 * 60_000) {
    console.warn("[WHATSAPP BOT] Envio bloqueado: mensagem idêntica recente (anti-spam).", contactId);
    return false;
  }

  if (delayMs > 0) await sleep(delayMs);

  const result = await sendText(phone, text, undefined, contact?.numberId);
  if (!result.waMessageId) {
    throw new Error(result.error ?? "Envio rejeitado pela Meta.");
  }

  const message = await db.whatsAppMessage.create({
    data: {
      contactId,
      numberId: contact?.numberId ?? null,
      waMessageId: result.waMessageId,
      direction: "out",
      body: text,
      status: "sent",
      sentByBot: true,
    },
  });
  const conversation = await db.whatsAppConversation.update({
    where: { contactId },
    data: { lastMessageAt: new Date() },
  });

  const dto: WhatsAppMessageDTO = {
    id: message.id,
    channelId: whatsappChannelId(contactId),
    contactId,
    direction: "out",
    body: text,
    mediaKey: null,
    mediaType: null,
    status: "sent",
    sentByBot: true,
    authorId: null,
    createdAt: message.createdAt.toISOString(),
    contactName: name,
    contactPhone: phone,
    conversationStatus: conversation.status,
  };
  broadcastWhatsAppEvent(dto);
  return true;
}

// ---------------------------------------------------------------------------
// Chamada ao microserviço
// ---------------------------------------------------------------------------
async function callBrainOnce(
  payload: object,
  baseUrl: string = CHATBOT_URL,
  timeoutMs: number = BOT_TIMEOUT_MS,
): Promise<BotDecision> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": CHATBOT_SECRET,
        // Orçamento do micro nesta tentativa (26/09/2026): 3 s a menos que o
        // abort daqui, para ele responder 504 com o motivo e parar de pagar
        // Claude/Gemini antes de o CRM cortar. Micro antigo ignora o header.
        "x-bot-budget-ms": String(microBudgetMs(timeoutMs)),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // O microserviço já manda `detail` traduzido pro humano (sobrecarga da
      // Anthropic, saldo insuficiente, chave inválida etc — ver
      // classifyClaudeError em bot.js); sem isso só chegava "chatbot HTTP 500"
      // no dashboard, escondendo a causa real.
      const body = await res.json().catch(() => null);
      const message = body?.detail ? `chatbot HTTP ${res.status}: ${body.detail}` : `chatbot HTTP ${res.status}`;
      // 504 = o micro estourou o orçamento acima (ou o proxy desistiu): é
      // timeout, com a mesma política de retry e o mesmo metadata.timeout do
      // abort daqui. Sem isso o timeout virava "erro comum" (1 retry em vez
      // de 3) e a série de timeouts sumia do painel.
      if (res.status === 504) throw brainTimeoutError(message);
      throw new Error(message);
    }
    return sanitizeDecision((await res.json()) as BotDecision);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chama o cérebro com RETRY apenas em timeout (a IA demorou demais). Faz até
 * BOT_MAX_ATTEMPTS tentativas; esgotadas todas, propaga o timeout para o fluxo
 * de erro do chamador, que joga a conversa na fila de distribuição. Erros que
 * NÃO são timeout (serviço fora, HTTP 4xx/5xx) têm 1 retry.
 *
 * `deadline` (epoch ms): prazo total do turno. Cada tentativa usa o menor
 * entre BOT_TIMEOUT_MS e o que sobra; sem tempo para uma tentativa útil
 * (BRAIN_MIN_ATTEMPT_MS), desiste com o último erro (ou um timeout).
 */
async function callBrain(
  payload: object,
  baseUrl: string = CHATBOT_URL,
  deadline: number | null = null,
): Promise<BotDecision> {
  let lastErr: unknown;
  // Erros que NÃO são timeout (refusal do modelo, HTTP 5xx do microserviço)
  // ganham UMA segunda chance antes de derrubar pra fila humana — a maioria é
  // transitória (29/07/2026; antes qualquer erro caía na fila direto).
  let errorRetried = false;
  for (let attempt = 1; attempt <= BOT_MAX_ATTEMPTS; attempt++) {
    const timeoutMs = brainAttemptTimeoutMs({
      perAttemptMs: BOT_TIMEOUT_MS,
      deadline,
      now: Date.now(),
      minAttemptMs: BRAIN_MIN_ATTEMPT_MS,
    });
    if (timeoutMs === null) {
      console.warn(`[WHATSAPP BOT] Prazo do turno esgotado antes da tentativa ${attempt} ao cérebro.`);
      throw lastErr ?? brainTimeoutError("prazo total do turno esgotado antes de chamar o cérebro");
    }
    try {
      return await callBrainOnce(payload, baseUrl, timeoutMs);
    } catch (err) {
      lastErr = err;
      const isTimeout = isBrainTimeoutError(err);
      if (!isTimeout) {
        if (errorRetried) throw err;
        errorRetried = true;
        console.warn(
          `[WHATSAPP BOT] Erro do cérebro (${err instanceof Error ? err.message : String(err)}) — retry único antes da fila.`,
        );
        await sleep(BOT_RETRY_DELAY_MS);
        continue;
      }
      console.warn(
        `[WHATSAPP BOT] Timeout do cérebro (tentativa ${attempt}/${BOT_MAX_ATTEMPTS}).`,
      );
      if (attempt < BOT_MAX_ATTEMPTS) await sleep(BOT_RETRY_DELAY_MS);
    }
  }
  // Tentativas esgotadas → propaga pra cair na fila.
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Ponto de entrada (chamado pelo webhook quando a conversa está em modo bot)
// ---------------------------------------------------------------------------
export async function handleIncomingWhatsApp(ingest: IngestResult): Promise<void> {
  // Relógio do turno ANTES do debounce (os 8 s entram na latência: é o tempo
  // que o cliente de fato espera). Tempos e desfecho vão no log wa_bot
  // (bot-telemetry.ts); até 26/09/2026 não existia medida de latência.
  const startedAt = Date.now();
  const { contactId, message } = ingest;
  const contactLabel = message.contactName ?? `+${message.contactPhone}`;
  const inboundAt = new Date(message.createdAt).getTime();
  let brainMs = 0;
  let firstSentAt: number | null = null;
  const markSent = (sent: boolean) => {
    if (sent && firstSentAt === null) firstSentAt = Date.now();
  };
  const timings = () => turnTimings({ startedAt, inboundAt, firstSentAt, brainMs, now: Date.now() });
  // Gasto do Claude neste turno (lookup e retry somados). Fica fora do try
  // para o catch gravar o que já foi pago quando a falha vem depois do
  // cérebro (ex.: a Meta recusou o envio); `logged` evita contar 2x. Objeto (e
  // não `let`) porque a closure `brain` escreve nele.
  const turnCost: { usage: BotUsage | null; logged: boolean } = { usage: null, logged: false };

  // Todo handoff do fluxo do bot é condicional (onlyIfStatus "bot"): se um
  // atendente assumiu a conversa enquanto o bot trabalhava, ela fica com ele.
  const ONLY_IF_BOT: QueueOpts = { onlyIfStatus: "bot" };

  // Sem serviço de bot configurado, não deixa o cliente falando com o vazio.
  if (!isBotConfigured()) {
    await handoffToQueue(contactId, contactLabel, "bot não configurado", "transferido", ONLY_IF_BOT);
    return;
  }

  // Tique azul + "digitando..." no celular do cliente enquanto a IA pensa —
  // best-effort, roda em paralelo sem atrasar o fluxo.
  if (message.waMessageId) {
    markMessageRead(message.waMessageId, true, ingest.numberId).catch(() => {});
  }

  // Cérebro deste telefone: staging para números de teste, senão produção. A
  // transcrição antecipada vai ao mesmo micro da decisão.
  const brainUrl = brainUrlFor(message.contactPhone);
  // Prazo total do turno (BOT_TURN_BUDGET_MS, contado de startedAt): toda
  // chamada ao cérebro cabe nele, para o handoff sair antes do maxDuration.
  const turnDeadline = startedAt + BOT_TURN_BUDGET_MS;

  // ---- Transcrição antecipada do áudio (26/09/2026) ------------------------
  // O áudio DESTA mensagem começa a ser transcrito agora, junto com o
  // debounce, e não só no micro depois dele (cada áudio somava ~3-7 s na
  // resposta). Depois do sleep espera no máximo EARLY_TRANSCRIBE_WAIT_MS; não
  // deu, cancela e o micro transcreve na decisão, como antes. A invocação que
  // vai desistir na rajada também espera: ela grava o transcript e a vencedora
  // lê do banco. Só a mensagem desta invocação (não o lote): cada balão tem a
  // sua invocação, e a Meta manda em geral um por POST. Não é áudio → não
  // chama nada.
  const earlyAbort = new AbortController();
  const earlyTranscript = transcribeInboundAudio(message, { baseUrl: brainUrl, signal: earlyAbort.signal });

  // Mensagem do cliente mais nova que esta (desempate por id no mesmo ms:
  // newerInboundWhere). Declarada FORA do try porque o catch também a usa; só
  // é chamada dentro dele (falha de banco aqui cai no handoff, não some no
  // webhook).
  const findNewerInbound = () => db.whatsAppMessage.findFirst({
    where: newerInboundWhere(contactId, message),
    select: { id: true },
  });
  // A conversa segue com o bot? Um atendente pode assumir ou encerrar a
  // qualquer momento dos ~20 s do cérebro e dos blocos da resposta.
  const isStillBot = async () =>
    (await db.whatsAppConversation.findUnique({ where: { contactId }, select: { status: true } }))?.status === "bot";

  // ---- Debounce de rajada -------------------------------------------------
  // Espera BURST_DEBOUNCE_MS: se o cliente mandou outra mensagem nesse meio
  // tempo, ESTA invocação desiste — a invocação da mensagem mais nova é quem
  // responde, com o lote inteiro agregado (ver "burst" abaixo). Assim 3
  // mensagens picadas viram UMA chamada ao Claude, e não 3 respostas fora de
  // ordem.
  await sleep(BURST_DEBOUNCE_MS);
  // Nunca lança (transcribeInboundAudio devolve null na falha). Fica antes do
  // bloco "Lote da rajada": o transcript gravado já vem na leitura do burst e
  // o áudio segue como texto para o micro.
  if (!(await settleWithin(earlyTranscript, EARLY_TRANSCRIBE_WAIT_MS))) {
    earlyAbort.abort();
    console.log(`[WHATSAPP BOT] ${contactId}: transcrição antecipada passou de ${EARLY_TRANSCRIBE_WAIT_MS} ms — o micro transcreve na decisão.`);
  }

  try {
    if (await findNewerInbound()) {
      console.log(`[WHATSAPP BOT] ${contactId}: mensagem mais nova chegou durante o debounce — esta invocação desiste.`);
      return;
    }

    const conversation = await db.whatsAppConversation.findUnique({
      where: { contactId },
      select: { id: true, status: true, createdAt: true, closedAt: true, botMemory: true, botState: true, botFailCount: true, qualified: true, closeCategory: true },
    });

    // Durante o debounce um atendente pode ter assumido/encerrado a conversa —
    // nesse caso o bot não tem mais nada a fazer aqui.
    if (conversation && conversation.status !== "bot") {
      console.log(`[WHATSAPP BOT] ${contactId}: conversa saiu do modo bot durante o debounce (${conversation.status}).`);
      return;
    }

    // ---- Lote da rajada ---------------------------------------------------
    // Todas as mensagens do cliente desde a nossa última resposta formam UM
    // "turno" só: os textos são agregados numa única mensagem pra IA e o anexo
    // sai do LOTE INTEIRO — não só da mensagem que disparou esta invocação.
    const lastOut = await db.whatsAppMessage.findFirst({
      where: { contactId, direction: "out", internal: false, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const burst = await db.whatsAppMessage.findMany({
      where: {
        contactId,
        direction: "in",
        deletedAt: null,
        ...(lastOut ? { createdAt: { gt: lastOut.createdAt } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 12,
      select: { id: true, body: true, mediaKey: true, mediaType: true, transcript: true },
    });
    const burstIds = burst.length ? burst.map((b) => b.id) : [message.id];
    let clientText = (burst.length ? burst.map((b) => b.body?.trim()).filter(Boolean) : [message.body?.trim()])
      .filter(Boolean)
      .join("\n");

    // ---- Mídia ----------------------------------------------------------
    // TUDO vai pra IA com URL pré-assinada: áudio é transcrito (Gemini) e
    // imagem/PDF o Claude LÊ direto (visão). O que fazer com o arquivo —
    // confirmar recebimento, validar, pedir o próximo, transferir com resumo —
    // é regido pelas INSTRUÇÕES editáveis + playbook, não mais por atalho de
    // código (decisão de 25/07/2026; antes, qualquer arquivo não-áudio
    // transferia pra fila na hora, atropelando as regras aprendidas).
    //
    // Os anexos vêm do LOTE, não da mensagem que disparou: quem manda a foto
    // do RG e emenda um "bom dia" faz o TEXTO ganhar o debounce, e a foto —
    // que tem `body` vazio — sumia do turno inteiro (caso Zico, 15/08/2026).
    //
    // 16/08/2026 (caso Rose): o lote inteiro vai pro cérebro em `mediaList` —
    // antes só o ÚLTIMO arquivo era aberto e uma nota mandava "considerar os
    // outros como RECEBIDOS", o que fazia a IA confirmar RG que nunca veio.
    // O micro abre cada imagem/PDF, transcreve cada áudio e declara como NÃO
    // LIDO o que não conseguiu abrir. `media` (último anexo) continua sendo
    // enviado só por compatibilidade com um micro antigo.
    const attachments = (burst.length ? burst : [message]).filter(
      (m) => m.mediaKey && m.mediaType,
    );
    const mediaList: { id: string; url: string; mimeType: string }[] = [];
    for (const m of attachments) {
      if (!m.mediaKey || !m.mediaType) continue;
      // Áudio já transcrito (invocação anterior deste mesmo lote que desistiu
      // na corrida, ou botão "transcrever"): entra como texto direto e não
      // paga transcrição de novo no micro.
      const saved = (m as { transcript?: string | null }).transcript?.trim();
      if (m.mediaType.startsWith("audio/") && saved) {
        clientText = [clientText, `[áudio transcrito] ${saved}`].filter(Boolean).join("\n");
        continue;
      }
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: m.mediaKey }),
        { expiresIn: 600 },
      );
      mediaList.push({ id: m.id, url, mimeType: m.mediaType });
    }
    const lastMedia = mediaList.at(-1) ?? null;
    const media: { url: string; mimeType: string } | null = lastMedia
      ? { url: lastMedia.url, mimeType: lastMedia.mimeType }
      : null;

    // ---- Mensagem que CRUZOU com a última resposta do bot ------------------
    // O cliente enviou esta mensagem ANTES (ou no exato instante) de a nossa
    // última mensagem sair — ele ainda estava respondendo a pergunta ANTERIOR
    // quando o bot já fez a próxima. Sem aviso, a IA lê a resposta como se
    // fosse da pergunta mais recente: grava o dado no campo errado e o roteiro
    // descarrilha. A nota abaixo entra junto com a mensagem pro cérebro.
    const crossedWithLastOut =
      !!lastOut && new Date(message.createdAt).getTime() <= lastOut.createdAt.getTime();
    const crossNote =
      "[NOTA DO SISTEMA: esta mensagem do cliente CRUZOU com a sua última mensagem — " +
      "ele a enviou antes de ver a sua pergunta mais recente. Interprete-a como resposta " +
      "ao que você tinha perguntado ANTES. Registre o dado na pergunta certa da ficha; " +
      "se ela também já responder a sua última pergunta, NÃO a repita — senão, retome a " +
      "última pergunta de forma natural, sem soar repetitiva.]";

    if (!clientText && !media) {
      // Mensagem sem conteúdo interpretável (sticker etc) → fila.
      await handoffToQueue(contactId, contactLabel, "mensagem sem texto/áudio interpretável", "transferido", ONLY_IF_BOT);
      return;
    }

    // ---- Assinatura eletrônica --------------------------------------------
    // Import dinâmico: signature/core importa deste arquivo (sendBotReply,
    // qualifyToQueue...) — o import estático criaria ciclo de módulos.
    const signature = await import("@/app/_shared/lib/signature/core");

    // 1. Ciclo em "coletando"/"confirmando": a mensagem é a resposta ao pedido
    //    de dados pendentes (texto ou foto de RG/CNH — a extração relê tudo) ou
    //    ao RESUMO — o módulo de assinatura trata e o cérebro normal NÃO roda.
    const contactRef = { phone: message.contactPhone, name: message.contactName };
    if (await signature.handleSignatureClientReply(contactId, contactRef, clientText, media)) {
      return;
    }

    // 2. Contrato NA RUA (link enviado, sem assinatura): trava de código +
    //    bloco de contexto pro cérebro (camadas 1 e 2 do plano).
    let signatureContext: {
      status: string; sentBy: string; sentAt: string | null;
      remindersSent: number; maxReminders: number; link: string;
    } | null = null;
    const cycle = await signature.activeCycle(contactId);
    if (cycle && cycle.pdfKey && ["aguardando", "visualizado"].includes(cycle.status)) {
      // Cliente afirma que JÁ ASSINOU mas o ciclo não registra assinatura: o
      // bot não discute — confere quem tem que conferir (atendente).
      if (/\bassinei\b|j[aá] (esta|está|ta|tá) assinad|acabei de assinar/i.test(clientText)) {
        await sendBotReply(
          contactId, message.contactPhone, message.contactName,
          "Deixa eu verificar isso aqui pra você, um instante 😊",
          1200,
        );
        await postInternalNote(
          contactId,
          `🖊️ Cliente AFIRMA que assinou, mas o ciclo de assinatura está "${cycle.status}" — conferir o link/documento e ajudar a concluir.`,
        );
        await handoffToQueue(contactId, contactLabel, "cliente afirma que assinou o contrato — conferir ciclo de assinatura", "transferido", ONLY_IF_BOT);
        return;
      }
      signatureContext = {
        status: cycle.status,
        sentBy: cycle.deliveredBy === "bot"
          ? "VOCÊ (o link saiu automaticamente nesta conversa)"
          // Sem NOME (23/09/2026): o nome do atendente não vai mais ao cérebro —
          // a IA passou a citá-lo nas respostas ao cliente.
          : "um ATENDENTE da equipe (não foi você — não repita a explicação dele)",
        sentAt: cycle.sentAt
          ? cycle.sentAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
          : null,
        remindersSent: cycle.remindersSent,
        maxReminders: 3,
        link: signUrlFor(cycle.token),
      };
    }

    // ---- Contexto -------------------------------------------------------
    // Fatos que ANTES eram trava de código no action="resolve" (14/09/2026) e
    // agora são CONTEXTO: o cérebro é quem decide se um cliente cadastrado ou
    // uma conversa que recebeu documentos pode ser "resolvida" ou tem que ir
    // pra equipe (instruções: CATEGORIAS DE ENCERRAMENTO; desde 26/09/2026 o
    // micro não repete mais a regra no bloco dinâmico, só os fatos).
    // docsReceived (25/09/2026): só foto/PDF (sem áudio nem figurinha), fora da
    // lixeira e do atendimento ATUAL (desde o último encerramento). Antes era a
    // vida inteira do contato com qualquer anexo, e o cérebro transferia dúvida
    // simples de quem só tinha mandado áudio num atendimento antigo.
    const docsReceived = conversation
      ? await db.whatsAppMessage.count({
          where: {
            contactId,
            direction: "in",
            deletedAt: null,
            mediaKey: { not: null },
            createdAt: { gte: docsReceivedSince(conversation) },
            ...clientDocumentMediaWhere(),
          },
        })
      : 0;

    const [history, card, flows, recentAttendantMsg] = await Promise.all([
      db.whatsAppMessage.findMany({
        where: { contactId, internal: false, id: { notIn: burstIds }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { direction: true, sentByBot: true, systemSource: true, body: true, mediaType: true, transcript: true },
      }),
      findLinkedCard(contactId),
      // Fluxos cadastrados COM descrição — a IA escolhe qual se encaixa.
      listFlowsForBot(),
      // Mensagem de atendente (out, não bot, não nota interna — o mesmo
      // "agent" do historyRole) na janela do fato recentAttendant. O
      // histórico de 30 mensagens nem sempre alcança. Índice
      // [contactId, createdAt].
      db.whatsAppMessage.findFirst({
        where: {
          contactId, direction: "out", sentByBot: false, internal: false, deletedAt: null,
          createdAt: { gte: new Date(Date.now() - RECENT_ATTENDANT_MS) },
        },
        select: { id: true },
      }),
    ]);

    const basePayload = {
      // Qual dos NOSSOS números atende esta conversa (multi-tenant): hoje o
      // cérebro ignora, mas o campo já viaja para permitir variação por número
      // no bloco dinâmico sem quebrar o cache do playbook (que segue único).
      numberId: ingest.numberId,
      contact: { name: message.contactName, phone: message.contactPhone },
      processInfo: card ? { name: card.name, etapa: card.etapa, etapaDescricao: card.etapaDescricao, service: card.service } : null,
      // Fluxos que a IA pode disparar (action="send_flow" + flowName).
      flows,
      history: history
        .reverse()
        .map((h) => ({
          role: historyRole(h),
          // O NOME do atendente NÃO viaja mais para a IA (23/09/2026): o bot
          // passou a citá-lo nas respostas ao cliente ("como o Leonardo pediu
          // ...") — a conversa tem que soar como uma voz só do escritório. O
          // rótulo do turno fica genérico ([atendente]); só a origem das
          // mensagens automáticas continua indo ([mensagem automática: ...]).
          source: h.direction === "out" && h.sentByBot && h.systemSource ? systemSourceLabel(h.systemSource) : null,
          text: historyText(h),
        }))
        .filter((h) => h.text),
      message: crossedWithLastOut ? `${clientText}\n\n${crossNote}` : clientText,
      media,
      // Lote completo de anexos ({ id, url, mimeType }) — o micro novo abre
      // todos; um micro antigo simplesmente ignora este campo e usa `media`.
      mediaList: mediaList.length ? mediaList : undefined,
      memory: conversation?.botMemory ?? null,
      state: conversation?.botState ?? null,
      failCount: conversation?.botFailCount ?? 0,
      // Desfecho anterior deste contato (sobrevive ao fechamento). Quando
      // qualified=true, o cérebro NÃO deve refazer a triagem: é um lead já
      // qualificado voltando — retomar contrato, tirar dúvida ou (se for
      // acidente diferente) oferecer nova qualificação.
      priorOutcome: {
        qualified: conversation?.qualified ?? null,
        closeCategory: conversation?.closeCategory ?? null,
      },
      // Sinais da conversa atual que mudam o desfecho correto (ver instruções:
      // ENCERRAMENTO CONTEXTUAL / CATEGORIAS DE ENCERRAMENTO).
      conversationFacts: {
        // Fotos/PDFs que o cliente mandou NESTE atendimento (desde o último
        // encerramento; áudio e figurinha não contam) — se houver, "resolver"
        // deixa o caso sem andamento.
        docsReceived,
        // O número está vinculado a um cadastro no Kanban (cliente da casa).
        registeredClient: !!card,
        // Alguém da equipe escreveu a este cliente nos últimos 7 dias (dono
        // pegajoso, D5): a conversa devolvida ao bot já estava com a equipe, e
        // a IA retomava a triagem e desqualificava lead já atendido. Só o fato;
        // como agir fica nas instruções (ATENDENTE HUMANO NA CONVERSA). Micro
        // antigo ignora o campo.
        recentAttendant: !!recentAttendantMsg,
      },
      business: businessHours(),
      // Contrato aguardando assinatura → bloco "ASSINATURA EM ANDAMENTO" no
      // cérebro (não recomeçar triagem, não gerar outro link, reenviar ESTE).
      signature: signatureContext,
    };

    // ---- IA (com no máximo 1 consulta intermediária ao banco) -----------
    // Números de teste usam o cérebro de STAGING (validação de prompt novo;
    // brainUrl é resolvido no início do turno).
    if (brainUrl !== CHATBOT_URL) {
      console.log(`[WHATSAPP BOT] ${message.contactPhone} é número de TESTE → cérebro de staging.`);
    }
    // Toda chamada ao cérebro passa aqui: soma o tempo (brainMs) e o gasto do
    // Claude (turnCost) e junta o da transcrição dos áudios. A 2ª chamada
    // (lookup ou retry de resposta vazia) manda o mesmo mediaList, e o micro
    // transcreve de novo: cada transcrição é gasto real. Todas dividem o
    // mesmo prazo do turno (turnDeadline).
    const transcribeUsages: BotUsage[] = [];
    const brain = async (payload: object): Promise<BotDecision> => {
      const t0 = Date.now();
      try {
        const d = await callBrain(payload, brainUrl, turnDeadline);
        turnCost.usage = sumUsage(turnCost.usage, d.usage);
        if (Array.isArray(d.transcribeUsage)) transcribeUsages.push(...d.transcribeUsage);
        return d;
      } finally {
        brainMs += Date.now() - t0;
      }
    };
    let decision = await brain(basePayload);
    if (decision.action === "lookup" && decision.lookup) {
      const lookupResult = await runLookup(decision.lookup, contactId, card);
      decision = await brain({ ...basePayload, lookupResult });
      // Segunda passada não pode pedir lookup de novo: rebaixa pra continue.
      if (decision.action === "lookup") decision = { ...decision, action: "continue" };
    }

    // ---- Retry de resposta vazia (29/07/2026) -----------------------------
    // "continue" sem NENHUM texto e sem silent = a IA se perdeu. Antes de
    // jogar pra fila humana (default do switch lá embaixo), refaz UMA chamada
    // com o mesmo contexto/histórico — na maioria das vezes a segunda vem com
    // texto. Se vier vazia de novo, o handoff acontece como antes.
    if (decision.action === "continue" && !decision.silent
      && !decision.reply?.trim() && !decision.replies?.length) {
      console.warn(`[WHATSAPP BOT] ${contactId}: IA devolveu resposta vazia — retry único antes do handoff.`);
      try {
        // 23/09/2026: o retry não repete a MESMA pergunta — avisa o cérebro do
        // que aconteceu e pede que ELE escolha a saída (responder, silent ou
        // handoff). Antes a 2ª chamada era idêntica à 1ª e, vindo vazia de
        // novo, quem decidia era o código (fila).
        const emptyNote =
          "[NOTA DO SISTEMA: a sua resposta anterior a esta mesma mensagem veio VAZIA e nada foi " +
          "enviado ao cliente. Escolha AGORA um caminho explícito: (a) escreva a mensagem que falta; " +
          "(b) se realmente não há nada a dizer (o cliente só confirmou algo já combinado), use " +
          "silent=true; (c) se o assunto não é seu ou você não tem o contexto, use action=\"handoff\" " +
          "com handoffReason dizendo o motivo real. NUNCA devolva vazio de novo.]";
        let second = await brain({
          ...basePayload,
          message: `${basePayload.message}

${emptyNote}`,
        });
        // O retry não repete a consulta intermediária: lookup vira continue.
        if (second.action === "lookup") second = { ...second, action: "continue" };
        decision = second;
      } catch {
        // Mantém a decisão vazia — cai no handoff do default como antes.
      }
    }
    // O gasto das chamadas ao Claude (lookup e retry inclusos) vai inteiro
    // na métrica de custo do log desta decisão.
    decision = { ...decision, usage: turnCost.usage };

    // ---- Persiste transcrições dos áudios do lote (16/08/2026) ------------
    // O micro transcreve cada áudio na hora da decisão e devolve o texto com o
    // id da mensagem. Gravar em WhatsAppMessage.transcript faz o conteúdo
    // aparecer no histórico dos próximos turnos (antes a IA via só "[anexo:
    // áudio]" e re-perguntava o que o cliente já tinha dito) e poupa o botão
    // "transcrever" do inbox de pagar IA de novo. Roda ANTES da checagem de
    // corrida: a transcrição pertence à mensagem, vale mesmo se esta invocação
    // desistir de responder.
    const validTranscriptIds = new Set([...burst.map((b) => b.id), message.id]);
    const decisionTranscripts = (decision.transcripts ?? []).filter(
      (t) => t?.id && t.transcript?.trim() && validTranscriptIds.has(t.id),
    );
    if (decisionTranscripts.length) {
      await Promise.all(decisionTranscripts.map((t) =>
        db.whatsAppMessage
          .update({ where: { id: t.id }, data: { transcript: t.transcript.trim() } })
          .catch((err) => console.error("[WHATSAPP BOT] Falha ao salvar transcrição:", t.id, err)),
      ));
    }
    // Transcrição dos áudios do lote na nota da fila (D11, 26/09/2026): quem
    // pega a conversa lê o que o cliente disse antes de decidir, em vez de
    // descartar um "IA não entendeu" sem ouvir. Vale a transcrição que o micro
    // acabou de devolver; senão a já gravada (transcrição antecipada ou botão
    // do inbox). Sem áudio transcrito, a nota sai como antes.
    const transcriptById = new Map(decisionTranscripts.map((t) => [t.id, t.transcript.trim()]));
    const audioNote = buildAudioTranscriptNote(
      (burst.length ? burst : [message])
        .filter((m) => m.mediaType?.startsWith("audio/"))
        .map((m) => ({ transcript: transcriptById.get(m.id) ?? (m as { transcript?: string | null }).transcript ?? null })),
    );
    // Opções da fila nas ações deste turno: sempre condicionais ao modo bot.
    const queueOpts: QueueOpts = audioNote ? { ...ONLY_IF_BOT, extraNote: audioNote } : ONLY_IF_BOT;
    // Custo da transcrição feita pelo micro no /reply (Gemini): log
    // wa_transcribe próprio, por modelo, NUNCA somado ao usage do Claude
    // (outro preço). Até 26/09/2026 esse gasto não aparecia em lugar nenhum.
    // bySystem: fora do feed de atividade da equipe no painel Chatbot. Também
    // antes da corrida: o áudio foi transcrito mesmo que a resposta seja
    // descartada.
    for (const usage of sumUsageByModel(transcribeUsages)) {
      await logWhatsAppEvent({
        action: "wa_transcribe",
        message: `IA transcreveu ${transcribeUsages.length === 1 ? "o áudio" : `${transcribeUsages.length} áudios`} do cliente (bot)`,
        authorId: "whatsapp-bot",
        authorName: "🤖 Bot WhatsApp",
        contactId,
        numberId: ingest.numberId,
        contactName: message.contactName,
        contactPhone: message.contactPhone,
        metadata: { usage, bySystem: true, audios: transcribeUsages.length },
      });
    }

    // Resposta jogada fora (corrida, atendente assumiu, envio interrompido):
    // log próprio `wa_bot_discarded` com o gasto do Claude, que antes sumia.
    // Não é wa_bot de propósito: nenhuma métrica de decisão nem o critério de
    // órfã do cron contam esses turnos (bot-telemetry.ts).
    const logDiscarded = async (outcome: DiscardOutcome, sentBlocks: number, why: string) => {
      turnCost.logged = true;
      await logWhatsAppEvent({
        action: "wa_bot_discarded",
        message: `IA: resposta descartada — ${why}`,
        authorId: "whatsapp-bot",
        authorName: "🤖 Bot WhatsApp",
        contactId,
        numberId: ingest.numberId,
        contactName: message.contactName,
        contactPhone: message.contactPhone,
        metadata: {
          outcome,
          intendedAction: decision.action,
          usage: turnCost.usage ?? undefined,
          sentBlocks,
          ...timings(),
        },
      });
    };

    // ---- Corrida pós-cérebro (30/07/2026) ---------------------------------
    // O debounce só protege ANTES da chamada à IA — mas o cérebro leva vários
    // segundos, e o cliente pode mandar outra mensagem nesse meio tempo (era o
    // que gerava resposta dupla e a IA tratando a mensagem nova como resposta
    // da pergunta errada). Se chegou mensagem mais nova, esta invocação
    // DESISTE antes de enviar ou persistir qualquer coisa: a invocação da
    // mensagem nova reprocessa o lote inteiro (burst) com o contexto completo.
    if (await findNewerInbound()) {
      console.log(`[WHATSAPP BOT] ${contactId}: mensagem nova chegou enquanto a IA pensava — descartando esta resposta (a invocação mais nova responde o lote).`);
      await logDiscarded("discarded_race", 0, "o cliente escreveu de novo enquanto a IA pensava");
      return;
    }
    // Um atendente assumiu ou encerrou enquanto o cérebro pensava: a conversa
    // é dele. Desiste sem enviar nem persistir nada (antes o bot respondia por
    // cima do atendente e ainda executava a ação, até mandar para a Fila).
    if (!(await isStillBot())) {
      console.log(`[WHATSAPP BOT] ${contactId}: conversa saiu do modo bot enquanto a IA pensava — descartando esta resposta.`);
      await logDiscarded("discarded_status", 0, "a conversa saiu do modo bot enquanto a IA pensava");
      return;
    }

    // ---- Contador de "não entendi" ---------------------------------------
    // 23/09/2026: ATÉ AQUI isto era uma TRAVA DE CÓDIGO — na 2ª vez seguida com
    // understood=false o código descartava a decisão da IA e mandava um texto
    // fixo de transferência (~136 transferências/mês que a IA não escolheu).
    // Agora o número de tentativas segue viajando no payload (failCount) e QUEM
    // DECIDE transferir é o cérebro (instruções: 2ª vez sem entender → handoff).
    let failCount = conversation?.botFailCount ?? 0;
    failCount = decision.understood ? 0 : failCount + 1;

    // ---- Opt-out identificado pela IA (com contexto) ----------------------
    // MUDANÇA 25/07/2026 (caso "nah, acho que me confundi" → optedOut=true →
    // silêncio eterno): a IA NÃO marca mais optedOut sozinha. Falso positivo
    // aqui é irreversível e invisível — o contato some sem despedida, nunca
    // reabre e nem entra na fila de revisão. Agora o sinal da IA vira um PEDIDO
    // DE CONFIRMAÇÃO: encerramos a conversa normalmente (com snapshot pro
    // cérebro e ficha preservada) e ensinamos o comando SAIR — só o comando
    // exato (regex do service.ts, exigência da Meta) descadastra de verdade.
    if (decision.optOut) {
      const bye = decision.reply?.trim();
      const confirm = "Se você preferir não receber mais nenhuma mensagem nossa, é só responder SAIR, tá bom? 😊";
      const text = bye ? `${bye}\n\n${confirm}` : confirm;
      try {
        markSent(await sendBotReply(contactId, message.contactPhone, message.contactName, text, humanDelay(text)));
      } catch (err) {
        console.error("[WHATSAPP BOT] Confirmação de opt-out não entregue (encerrando mesmo assim):", contactId, err);
      }
      // Cérebro: opt-out era o ÚNICO desfecho sem snapshot — casos de fricção
      // (cliente irritado) são justamente os mais valiosos pra revisão.
      await captureConversation(contactId, "bot_disqualify", {
        closeCategory: "nao_qualificado",
        qualified: false,
      });
      const closedConv = await db.whatsAppConversation.update({
        where: { contactId },
        data: {
          status: "closed", closedAt: new Date(), assignedToId: null, closeCategory: "nao_qualificado", qualified: false,
          botFailCount: 0, queuedAt: null, queueAlertAt: null,
          recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null,
        },
        select: { id: true },
      });
      await syncCloseTag(closedConv.id, "nao_qualificado");
      await logWhatsAppEvent({
        action: "wa_bot",
        message: "IA: possível descadastro — confirmação com comando SAIR enviada (optedOut NÃO marcado)",
        authorId: "whatsapp-bot",
        authorName: "🤖 Bot WhatsApp",
        contactId,
        numberId: ingest.numberId,
        contactName: message.contactName,
        contactPhone: message.contactPhone,
        metadata: {
          outcome: "disqualify", optOut: true, intent: decision.intent,
          closeCategory: "nao_qualificado", usage: decision.usage ?? undefined,
          facts: basePayload.conversationFacts,
          effective: { status: "closed", reason: "nao_qualificado (possível descadastro)" } satisfies EffectiveOutcome,
          conversationAgeMs: conversation ? Date.now() - conversation.createdAt.getTime() : undefined,
          ...timings(),
        },
      });
      turnCost.logged = true;
      return;
    }

    // ---- Persiste memória/estado ------------------------------------------
    // Só quando algo deste turno de fato sai (1º bloco ou a ação). Se o envio
    // parar antes do 1º bloco, nada foi dito ao cliente e a invocação da
    // mensagem nova decide com a memória/estado de antes, como na corrida
    // pós-cérebro.
    let memoryPersisted = false;
    const persistMemory = async () => {
      if (memoryPersisted) return;
      memoryPersisted = true;
      await db.whatsAppConversation.update({
        where: { contactId },
        data: {
          botMemory: decision.memory || conversation?.botMemory || null,
          botState: decision.state || conversation?.botState || null,
          botFailCount: failCount,
        },
      });
    };

    // ---- Responde (com delay humanizado) e executa a ação -----------------
    // Quando a IA qualifica o lead, ela devolve o roteiro comercial inteiro em
    // `replies`: enviamos CADA bloco como uma mensagem separada, em sequência,
    // sem esperar o cliente responder entre elas. Fora disso, um único `reply`.
    const outgoing = decision.replies?.length
      ? decision.replies
      : decision.reply
        ? [decision.reply]
        : [];
    // Antes de CADA bloco, depois do atraso humanizado (que continua igual,
    // inclusive no 1º), confere se chegou mensagem nova do cliente e se a
    // conversa segue com o bot (regras em shouldAbortSend). Antes o bot mandava
    // tudo: falava depois de a conversa ir para o atendente e mandava o resto
    // do roteiro por cima da mensagem nova do cliente.
    let blocksSent = 0;
    let verdict: SendGuardVerdict = "continue_sending";
    // Motivo da parada total (vai para o log wa_bot_discarded).
    let stopOutcome: DiscardOutcome = "discarded_race";
    for (const msg of outgoing) {
      await sleep(humanDelay(msg));
      const [newer, stillBot] = await Promise.all([findNewerInbound(), isStillBot()]);
      verdict = shouldAbortSend({ hasNewerInbound: !!newer, stillBot, action: decision.action, blocksSent });
      if (verdict !== "continue_sending") {
        stopOutcome = discardOutcomeOf({ stillBot });
        break;
      }
      await persistMemory();
      markSent(await sendBotReply(contactId, message.contactPhone, message.contactName, msg, 0));
      blocksSent += 1;
    }
    // Releitura depois do último bloco: o roteiro leva até ~15 s e a ação
    // (fila, encerramento, fluxo) não pode atropelar quem assumiu nesse tempo.
    // Sem bloco enviado, a releitura pós-cérebro acabou de acontecer.
    if (
      verdict === "continue_sending" && blocksSent > 0
      && (isTerminalBotAction(decision.action) || decision.action === "send_flow")
      && !(await isStillBot())
    ) {
      verdict = "stop_all";
      stopOutcome = "discarded_status";
    }
    if (verdict === "stop_all") {
      console.log(
        `[WHATSAPP BOT] ${contactId}: envio interrompido (${blocksSent}/${outgoing.length} bloco(s), action=${decision.action}) — ` +
        "chegou mensagem nova do cliente ou a conversa saiu do modo bot; a ação não roda.",
      );
      await logDiscarded(
        stopOutcome,
        blocksSent,
        `envio interrompido em ${blocksSent}/${outgoing.length} bloco(s) (${stopOutcome === "discarded_status" ? "a conversa saiu do modo bot" : "o cliente escreveu de novo"}); a ação não rodou`,
      );
      return;
    }
    // Chegou mensagem nova no meio do roteiro: os blocos restantes ficam, a
    // ação terminal roda (decidida com o lote completo).
    const blocksSkipped = outgoing.length - blocksSent;
    if (blocksSkipped > 0) {
      console.log(`[WHATSAPP BOT] ${contactId}: mensagem nova no meio da resposta — ${blocksSkipped} bloco(s) não enviado(s); ${decision.action} segue.`);
    }
    await persistMemory();

    // Handoff/qualify condicionais que não moveram (a conversa saiu do bot no
    // último instante) ficam registrados no log da decisão.
    let queueSkipped = false;
    // Onde a conversa ficou DE FATO (bot-telemetry.ts): o `outcome` é o que a
    // IA escolheu, e um "continue" vazio, por exemplo, termina na Fila.
    let effective: EffectiveOutcome = { status: "bot" };
    const toQueue = (moved: boolean, reason: string) => {
      queueSkipped = !moved;
      effective = queueEffective(moved, reason);
    };
    switch (decision.action) {
      case "send_flow": {
        // A IA escolheu um fluxo cadastrado que se encaixa na situação do
        // cliente (ex.: explicar a etapa do processo). Dispara e segue.
        const sent = decision.flowName
          ? await runFlowForContact(decision.flowName, {
              id: contactId,
              phone: message.contactPhone,
              name: message.contactName,
            })
          : false;
        markSent(sent);
        // Fluxo inexistente/falhou e nada foi enviado → não deixa o cliente no
        // vácuo: manda ao menos uma confirmação e passa pra fila humana.
        if (!sent && outgoing.length === 0) {
          markSent(await sendBotReply(
            contactId, message.contactPhone, message.contactName,
            "Só um instante que vou verificar isso pra você com um de nossos atendentes, tá?",
            humanDelay("x".repeat(50)),
          ));
          const reason = "fluxo escolhido pela IA não pôde ser enviado";
          toQueue(await handoffToQueue(contactId, contactLabel, reason, "perguntas", queueOpts), reason);
        }
        break;
      }
      case "qualify":
        // Qualificar sem nenhum texto deixaria o lead no vácuo até um humano
        // assumir — garante ao menos a ponte pro atendente.
        if (outgoing.length === 0) {
          markSent(await sendMutedFallback(
            contactId, message,
            "Perfeito! Vou te passar para um de nossos atendentes dar sequência, tá bom? Já já alguém fala com você 😊",
            "qualify sem texto",
          ));
        }
        // Assinatura automática (SIGNATURE_AUTO_ENABLED): tenta extrair os
        // dados e mandar o RESUMO pro cliente confirmar. "confirming" = a
        // conversa FICA em modo bot esperando o "sim" (a fila vem depois de
        // confirmado/assinado); "queue" = flag desligada, dados incompletos ou
        // falha → segue o caminho de sempre (nota interna explica o porquê).
        if ((await signature.maybeStartSignatureFlow(contactId, contactRef)) === "queue") {
          const reason = decision.handoffReason ?? "triagem aprovada pela IA";
          toQueue(await qualifyToQueue(contactId, contactLabel, reason, queueOpts), reason);
        } else {
          effective = { status: "signature" };
        }
        break;
      case "disqualify":
        // Encerrar MUDO só quando a IA declarou silêncio deliberado (silent) —
        // ex.: agradecimento pós-despedida. Vazio sem a flag = falha da IA:
        // manda uma despedida mínima pra não abandonar o cliente falando.
        if (outgoing.length === 0 && !decision.silent) {
          markSent(await sendMutedFallback(
            contactId, message,
            "Obrigado pelo contato! Qualquer coisa é só mandar uma mensagem por aqui, tá bom? 😊",
            "disqualify sem texto e sem silent",
          ));
        }
        effective = { status: "closed", reason: await disqualifyAndClose(contactId, decision.closeCategory) };
        break;
      case "handoff":
        // Transferência sem texto: o cliente ficaria esperando sem saber que um
        // humano vai assumir — avisa antes de enfileirar.
        if (outgoing.length === 0 && !decision.silent) {
          markSent(await sendMutedFallback(
            contactId, message,
            "Vou te passar para um de nossos atendentes, só um instante, tá bom?",
            "handoff sem texto",
          ));
        }
        {
          const reason = decision.handoffReason ?? "transferido pelo bot";
          toQueue(await handoffToQueue(
            contactId, contactLabel,
            reason,
            decision.closeCategory ?? "transferido",
            queueOpts,
          ), reason);
        }
        break;
      case "resolve":
        // Assunto resolvido pelo próprio bot (dúvida/status). Encerra como
        // "perguntas" (ou a categoria que a IA indicar). Mesmo guard de
        // silêncio do disqualify.
        if (outgoing.length === 0 && !decision.silent) {
          markSent(await sendMutedFallback(
            contactId, message,
            "Certo! Se precisar de mais alguma coisa é só mandar uma mensagem por aqui 😊",
            "resolve sem texto e sem silent",
          ));
        }
        // 23/09/2026: a promoção automática de "resolve" para fila (cliente
        // cadastrado ou documentos recebidos) saiu daqui — os dois sinais vão
        // no payload (conversationFacts) e o cérebro decide o desfecho.
        {
          const category = decision.closeCategory ?? "perguntas";
          await resolveAndClose(contactId, category);
          effective = { status: "closed", reason: category };
        }
        break;
      default:
        // "continue" SEM nenhuma resposta = a IA se perdeu e não devolveu
        // texto. Antes isso deixava o cliente no vácuo (bot mudo, ainda em modo
        // bot, ninguém avisado). Agora joga pra fila humana com o motivo, pra um
        // atendente assumir na hora em vez de o cliente ficar sem resposta.
        // silent=true em continue = o cliente só confirmou algo já combinado
        // ("ok", 👍) — a conversa segue aberta com o bot, sem transferir.
        if (outgoing.length === 0 && !decision.silent) {
          const reason = decision.leaked
            ? "a IA vazou raciocínio no lugar da resposta (texto descartado antes do envio)"
            : "IA devolveu resposta vazia (sem texto para enviar ao cliente)";
          toQueue(await handoffToQueue(contactId, contactLabel, reason, "transferido", queueOpts), reason);
        }
        break; // continue com resposta: só seguiu a conversa
    }

    // ---- Auditoria/métricas da IA -----------------------------------------
    // Uma linha por decisão do bot; alimenta o dashboard do chatbot (quantos
    // qualificados/não, dúvidas, % de entendimento, tempo até qualificar).
    // Idade da conversa nos desfechos terminais (mediana de "tempo até
    // qualificar"). Era `durationMs`, que parecia latência e não é; o
    // createdAt já veio no select do início (a conversa é 1:1 com o contato e
    // nunca é recriada), sem a consulta extra de antes.
    const conversationAgeMs = isTerminalBotAction(decision.action) && conversation
      ? Date.now() - conversation.createdAt.getTime()
      : undefined;
    turnCost.logged = true;
    await logWhatsAppEvent({
      action: "wa_bot",
      message: `IA: ${decision.action} (${decision.intent})`,
      authorId: "whatsapp-bot",
      authorName: "🤖 Bot WhatsApp",
      contactId,
      numberId: ingest.numberId,
      contactName: message.contactName,
      contactPhone: message.contactPhone,
      metadata: {
        outcome: decision.action,
        intent: decision.intent,
        emotion: decision.emotion,
        understood: decision.understood,
        confidence: decision.confidence,
        qualified: decision.action === "qualify" ? true : decision.action === "disqualify" ? false : undefined,
        // Categoria de encerramento (perguntas/qualificado/novo_acidente/...).
        closeCategory: decision.closeCategory ?? undefined,
        flowName: decision.action === "send_flow" ? decision.flowName ?? undefined : undefined,
        conversationAgeMs,
        usage: decision.usage ?? undefined,
        // Onde a conversa ficou de fato ("continue" vazio termina na Fila) e
        // os tempos do turno: latência até a 1ª mensagem, tempo no cérebro e
        // duração total (bot-telemetry.ts).
        effective,
        ...timings(),
        // Silêncio escolhido pelo cérebro: mede o falso positivo de órfã do
        // cron (silent=true numa pergunta de verdade).
        silent: decision.silent ? true : undefined,
        // Diagnóstico: o que o micro devolveu em appliedRules. `undefined` no
        // metadata = o campo NEM VEIO na resposta (micro rodando código antigo,
        // sem o campo no schema); [] = veio e a IA não citou regra nenhuma.
        appliedRules: decision.appliedRules,
        hasAppliedRulesField: "appliedRules" in decision,
        // Quantas vezes a rede de segurança de vazamento de raciocínio pegou
        // algo — dá pra medir se o campo `rationale` resolveu de fato.
        leaked: decision.leaked ? true : undefined,
        // Fatos que o cérebro recebeu neste turno: sem eles não dá para
        // conferir em produção se a decisão (resolver × transferir) seguiu o
        // docsReceived/registeredClient certo.
        facts: basePayload.conversationFacts,
        // Blocos do roteiro que não saíram porque o cliente escreveu no meio
        // (a ação rodou mesmo assim).
        blocksSkipped: blocksSkipped > 0 ? blocksSkipped : undefined,
        // Fila condicional que não moveu: a conversa saiu do bot no último
        // instante (atendente assumiu) e ficou com ele.
        handoffSkipped: queueSkipped ? true : undefined,
      },
    });

    // ---- Telemetria do playbook ---------------------------------------------
    // Regras aprendidas que a IA declarou ter aplicado nesta resposta → aba
    // "Métricas" da Revisão da IA. Best-effort: nunca derruba o fluxo.
    await recordAppliedRules({
      appliedRules: decision.appliedRules,
      contactId,
      contactName: message.contactName,
      botState: decision.state || null,
      action: decision.action,
      replyText: outgoing[0] ?? null,
    });
  } catch (err) {
    // Erro em QUALQUER ponto → fila de distribuição direto, SEM mensagem de
    // erro pro cliente ("Ocorreu um erro..." nunca chega no WhatsApp dele).
    // O motivo real vai junto na fila/notificação pra facilitar o diagnóstico
    // (o "erro no bot" genérico não dizia nada). O 504 do micro e o prazo do
    // turno também contam como timeout (isBrainTimeoutError).
    const isTimeout = isBrainTimeoutError(err);
    const detail = isTimeout
      ? "timeout: o cérebro (IA) demorou demais para responder"
      : `erro no bot: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[WHATSAPP BOT] Falha no fluxo do bot — caindo pra fila humana:", err);
    // O gasto do Claude que já foi pago (falha depois do cérebro, ex.: a Meta
    // recusou o envio) entra no log do erro, senão some do Canto da IA.
    const unloggedUsage = turnCost.logged ? undefined : turnCost.usage ?? undefined;
    turnCost.logged = true;
    const errorLog = (text: string, effective: EffectiveOutcome, extra: Record<string, unknown>) =>
      logWhatsAppEvent({
        action: "wa_bot",
        message: text,
        authorId: "whatsapp-bot",
        authorName: "🤖 Bot WhatsApp",
        contactId,
        numberId: ingest.numberId,
        contactName: message.contactName,
        contactPhone: message.contactPhone,
        // Métrica: registra o erro da IA para o dashboard (quantos erros x acertos).
        metadata: {
          outcome: "error", error: true, timeout: isTimeout, detail,
          usage: unloggedUsage, effective, ...timings(), ...extra,
        },
      });

    // O cliente escreveu de novo enquanto esta invocação falhava: a invocação
    // da mensagem nova junta o lote e decide (se ela também falhar, cai no
    // próprio catch). Transferir daqui tiraria a conversa do bot por cima dela.
    if (await findNewerInbound().catch(() => null)) {
      await errorLog(
        `IA: erro — ${detail} (a mensagem mais nova do cliente decide)`,
        { status: "bot", reason: "a mensagem mais nova do cliente decide" },
        { deferredToNewer: true },
      );
      return;
    }

    // Handoff condicional: se um atendente assumiu durante a espera do cérebro
    // (o timeout chega até ~100 s depois do início do turno, o prazo em
    // BOT_TURN_BUDGET_MS), a conversa fica com ele, sem nota nem notificação.
    // A falha do próprio handoff não pode sumir com o log da função: vira
    // critical_error com o contato.
    let handoff: "moved" | "skipped" | "failed";
    try {
      handoff = (await handoffToQueue(contactId, contactLabel, detail, "transferido", ONLY_IF_BOT)) ? "moved" : "skipped";
    } catch (handoffErr) {
      handoff = "failed";
      await reportCriticalError("WHATSAPP BOT handoff", handoffErr, { contactId, metadata: { botError: detail.slice(0, 300) } });
    }
    await errorLog(
      `IA: erro — ${detail}`,
      handoff === "failed" ? { status: "bot", reason: "a transferência para a Fila falhou" } : queueEffective(handoff === "moved", detail),
      {
        handoffSkipped: handoff === "skipped",
        ...(handoff === "failed" ? { handoffFailed: true } : {}),
      },
    );
  }
}
