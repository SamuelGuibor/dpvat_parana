import { Prisma } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/app/_shared/lib/prisma";
import { broadcastToRelay } from "@/app/_shared/lib/chat-relay";
import { sendText, markMessageRead } from "./client";
import { runFlowForContact, listFlowsForBot } from "./flow-runner";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { captureConversation } from "./brain";
import { recordAppliedRules, recordCodeIntervention } from "./rule-events";
import { reportLeadStageToMeta } from "@/app/_shared/lib/meta-conversions";
import { getStatusLabel, getStatusDescription } from "@/app/nova-dash/card-dialog/constants";
import {
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

/** Cérebro a usar para este telefone: staging para números de teste, senão produção. */
function brainUrlFor(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (CHATBOT_URL_STAGING && TEST_NUMBERS.includes(digits)) return CHATBOT_URL_STAGING;
  return CHATBOT_URL;
}

// Debounce de RAJADA: cliente que digita a mensagem picada em 3-4 balões gera
// 3-4 webhooks em segundos — sem isso são 3-4 chamadas ao Claude respondendo
// fora de ordem. Cada invocação espera DEBOUNCE_MS; se nesse meio tempo chegou
// mensagem MAIS NOVA do cliente, esta invocação desiste (a da mensagem mais
// recente processa o lote inteiro de uma vez).
const BURST_DEBOUNCE_MS = 8_000;
// 45s: o caminho de áudio tem dois saltos (S3 → transcrição Gemini → Claude);
// 25s era curto demais e derrubava pra fila com "erro no bot" mesmo o cérebro
// respondendo bem (só que tarde).
const BOT_TIMEOUT_MS = 45_000;
// Timeout do cérebro (IA) → até 3 tentativas antes de cair na fila humana.
// Só o TIMEOUT é reprocessado; outros erros (serviço fora, HTTP 4xx/5xx) caem
// direto pra fila, sem reprocessar.
const BOT_MAX_ATTEMPTS = 3;
const BOT_RETRY_DELAY_MS = 1_000;
const QUALIFIED_TAG_NAME = "Qualificada";

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

interface BotUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

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
  urgent: boolean;
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
  // Tokens gastos na chamada ao Claude (o microserviço devolve; alimenta o
  // custo semanal/mensal no dashboard do chatbot).
  usage?: BotUsage | null;
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

/** Remove fragmentos de JSON vazados pela IA antes de qualquer envio. */
function sanitizeDecision(d: BotDecision): BotDecision {
  const rawReplies = Array.isArray(d.replies) ? d.replies : [];
  const replies = rawReplies.filter((r) => typeof r === "string" && !looksLikeJsonFragment(r));
  // No `reply` único só o teste estrutural: mensagem curta legítima ("Ok!")
  // não pode ser descartada por parecer token solto.
  const reply = typeof d.reply === "string" && d.reply && isJsonSkeleton(d.reply) ? "" : d.reply;
  if (replies.length !== rawReplies.length || reply !== d.reply) {
    console.warn(
      `[WHATSAPP BOT] Resposta da IA continha fragmento(s) de JSON — descartados ${rawReplies.length - replies.length} item(ns) de replies${reply !== d.reply ? " + reply" : ""}.`,
    );
  }
  return { ...d, reply, replies };
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
        where: fresh.kind === "user" ? { userId: fresh.id } : { processId: fresh.id },
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
async function postInternalNote(contactId: string, body: string): Promise<void> {
  try {
    const message = await db.whatsAppMessage.create({
      data: { contactId, direction: "out", body, sentByBot: true, internal: true, status: "sent" },
    });
    const contact = await db.whatsAppContact.findUnique({ where: { id: contactId }, select: { name: true, phone: true } });
    const recipients = await whatsappRecipients();
    await broadcastToRelay({
      channelId: whatsappChannelId(contactId),
      recipients,
      message: {
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
      } satisfies WhatsAppMessageDTO,
    });
  } catch (err) {
    console.error("[WHATSAPP BOT] Falha ao registrar nota interna:", err);
  }
}

/**
 * Joga a conversa na fila de distribuição e avisa a equipe (Notification +
 * Discord). NUNCA envia mensagem de erro ao cliente — se a IA falhou, o
 * cliente simplesmente passa a ser atendido por um humano.
 */
async function handoffToQueue(
  contactId: string,
  contactLabel: string,
  reason: string,
  closeCategory: string = "transferido",
  urgent = false,
): Promise<void> {
  await db.whatsAppConversation.update({
    where: { contactId },
    // queuedAt alimenta o SLA da fila (cron alerta se ninguém assumir).
    data: { status: "queued", assignedToId: null, botFailCount: 0, closeCategory, queuedAt: new Date(), queueAlertAt: null, ...(urgent ? { urgent: true } : {}) },
  });

  // Motivo da transferência visível NA THREAD (nota interna, só equipe).
  await postInternalNote(contactId, `🤖 Transferido para atendimento humano — ${reason}`);

  try {
    const recipients = await whatsappRecipients();
    for (const id of recipients) {
      await db.notification.create({
        data: {
          recipientId: id,
          authorId: "whatsapp-bot",
          authorName: "🤖 Bot WhatsApp",
          targetName: contactLabel,
          message: `WhatsApp: ${contactLabel} aguardando atendente (${reason})`,
          // Clicar na notificação abre a conversa direto no inbox.
          contactId,
        },
      });
    }
  } catch (err) {
    console.error("[WHATSAPP BOT] Falha ao criar notificações de handoff:", err);
  }

  // Aviso no Discord, mesmo padrão do webhook do Trello (best-effort).
  const discordUrl = process.env.DISCORD_WEBHOOK_URL_WHATSAPP;
  if (discordUrl) {
    try {
      await fetch(discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "📲 Cliente aguardando atendimento no WhatsApp",
            description: `**${contactLabel}**\n${reason}`,
            color: 0x25d366,
            timestamp: new Date().toISOString(),
          }],
        }),
      });
    } catch (err) {
      console.error("[WHATSAPP BOT] Falha ao avisar o Discord:", err);
    }
  }
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

/** Lead QUALIFICADO: fila de espera + tag "Qualificada" + aviso pra equipe. */
async function qualifyToQueue(contactId: string, contactLabel: string, reason: string): Promise<void> {
  // Já era qualificado antes (lead voltando)? Então NÃO é uma nova qualificação:
  // não reposta a nota de "lead novo", não re-notifica a equipe como lead
  // inédito e não redispara o evento pra Meta — só garante que voltou pra fila.
  const existing = await db.whatsAppConversation.findUnique({
    where: { contactId },
    select: { qualified: true },
  });
  const alreadyQualified = existing?.qualified === true;

  const conversation = await db.whatsAppConversation.update({
    where: { contactId },
    data: { status: "queued", assignedToId: null, qualified: true, botFailCount: 0, closeCategory: "qualificado", queuedAt: new Date(), queueAlertAt: null },
  });
  await tagAsQualified(conversation.id);

  if (alreadyQualified) {
    await postInternalNote(contactId, `🤖 Lead qualificado retornou ao atendimento — ${reason}`);
    return;
  }

  await postInternalNote(contactId, `🤖 Lead qualificado pela IA — ${reason}`);
  await handoffNotifyOnly(contactLabel, `LEAD QUALIFICADO ✅ — ${reason}`, contactId);
  // Devolve pra Meta (API de Conversões) que este lead qualificou — otimiza
  // as campanhas por qualidade. Fire-and-forget, nunca quebra o fluxo.
  void reportLeadStageToMeta(contactId, "qualificado");
}

/** Cliente NÃO elegível: encerra o ticket como "não qualificada". */
async function disqualifyAndClose(contactId: string): Promise<void> {
  // Cérebro: snapshot ANTES do update (que zera botMemory/botState logo abaixo).
  await captureConversation(contactId, "bot_disqualify", {
    closeCategory: "nao_qualificado",
    qualified: false,
  });
  await db.whatsAppConversation.update({
    where: { contactId },
    // A ficha (botMemory/botState) é PRESERVADA de propósito (25/07/2026): se o
    // cliente mandar um "obrigado"/"Bgdooo" logo depois, a reabertura vem com
    // contexto e a IA responde curto em vez de recomeçar a triagem do zero
    // (caso Luiz: 4 ciclos de saudação→triagem→despedida na mesma tarde). A
    // limpeza acontece na REABERTURA, se a conversa estiver velha (service.ts).
    data: { status: "closed", assignedToId: null, qualified: false, closeCategory: "nao_qualificado", botFailCount: 0, urgent: false, queuedAt: null, queueAlertAt: null, recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null },
  });
  void reportLeadStageToMeta(contactId, "nao_qualificado");
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
  await db.whatsAppConversation.update({
    where: { contactId },
    data: {
      status: "closed", assignedToId: null,
      qualified: keepContext ? true : null,
      closeCategory: category, botFailCount: 0,
      // Ficha preservada em TODOS os desfechos (25/07/2026) — ver comentário no
      // disqualifyAndClose. A limpeza é na reabertura, por idade (service.ts).
      urgent: false, queuedAt: null, queueAlertAt: null,
      // Desfecho real → ciclo de recuperação zerado.
      recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null,
    },
  });
}

/**
 * Rede de segurança contra DESFECHO MUDO: a IA encerrou/transferiu sem devolver
 * nenhum texto e sem declarar silêncio deliberado (silent) — o cliente acabou
 * de falar e ficaria sem resposta alguma. Envia um fallback mínimo e registra
 * a intervenção em Métricas (kind="code"). Best-effort: falha no envio não
 * pode travar o encerramento que vem em seguida.
 */
async function sendMutedFallback(
  contactId: string,
  message: { contactPhone: string; contactName: string | null },
  text: string,
  reason: string,
): Promise<void> {
  try {
    await sendBotReply(contactId, message.contactPhone, message.contactName, text, humanDelay(text));
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
}

/** Só as notificações do handoff (sem mexer no status — já foi atualizado). */
async function handoffNotifyOnly(contactLabel: string, reason: string, contactId?: string): Promise<void> {
  try {
    const recipients = await whatsappRecipients();
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
  const discordUrl = process.env.DISCORD_WEBHOOK_URL_WHATSAPP;
  if (discordUrl) {
    try {
      await fetch(discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "📲 WhatsApp",
            description: `**${contactLabel}**\n${reason}`,
            color: 0x25d366,
            timestamp: new Date().toISOString(),
          }],
        }),
      });
    } catch { /* best-effort */ }
  }
}

// ---------------------------------------------------------------------------
// Envio de resposta do bot
// ---------------------------------------------------------------------------

/**
 * Envia a resposta do bot pro cliente (com delay humanizado opcional) e
 * registra/transmite como as demais mensagens. Exportada também pro cron de
 * silêncio (/api/whatsapp/cron).
 */
export async function sendBotReply(
  contactId: string,
  phone: string,
  name: string | null,
  text: string,
  delayMs = 0,
): Promise<void> {
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
    return;
  }
  const lastOut = await db.whatsAppMessage.findFirst({
    where: { contactId, direction: "out", deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { body: true, createdAt: true },
  });
  if (lastOut?.body && lastOut.body.trim() === text.trim()
    && Date.now() - lastOut.createdAt.getTime() < 10 * 60_000) {
    console.warn("[WHATSAPP BOT] Envio bloqueado: mensagem idêntica recente (anti-spam).", contactId);
    return;
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
  const recipients = await whatsappRecipients();
  await broadcastToRelay({ channelId: dto.channelId, recipients, message: dto });
}

// ---------------------------------------------------------------------------
// Chamada ao microserviço
// ---------------------------------------------------------------------------
async function callBrainOnce(payload: object, baseUrl: string = CHATBOT_URL): Promise<BotDecision> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOT_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": CHATBOT_SECRET,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`chatbot HTTP ${res.status}`);
    return sanitizeDecision((await res.json()) as BotDecision);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chama o cérebro com RETRY apenas em timeout (a IA demorou demais). Faz até
 * BOT_MAX_ATTEMPTS tentativas; esgotadas todas, propaga o timeout para o fluxo
 * de erro do chamador, que joga a conversa na fila de distribuição. Erros que
 * NÃO são timeout (serviço fora, HTTP 4xx/5xx) sobem na hora, sem reprocessar.
 */
async function callBrain(payload: object, baseUrl: string = CHATBOT_URL): Promise<BotDecision> {
  let lastErr: unknown;
  // Erros que NÃO são timeout (refusal do modelo, HTTP 5xx do microserviço)
  // ganham UMA segunda chance antes de derrubar pra fila humana — a maioria é
  // transitória (29/07/2026; antes qualquer erro caía na fila direto).
  let errorRetried = false;
  for (let attempt = 1; attempt <= BOT_MAX_ATTEMPTS; attempt++) {
    try {
      return await callBrainOnce(payload, baseUrl);
    } catch (err) {
      lastErr = err;
      const isTimeout = err instanceof Error && err.name === "AbortError";
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
  const { contactId, message } = ingest;
  const contactLabel = message.contactName ?? `+${message.contactPhone}`;

  // Sem serviço de bot configurado, não deixa o cliente falando com o vazio.
  if (!isBotConfigured()) {
    await handoffToQueue(contactId, contactLabel, "bot não configurado");
    return;
  }

  // Tique azul + "digitando..." no celular do cliente enquanto a IA pensa —
  // best-effort, roda em paralelo sem atrasar o fluxo.
  if (message.waMessageId) {
    markMessageRead(message.waMessageId, true, ingest.numberId).catch(() => {});
  }

  // ---- Debounce de rajada -------------------------------------------------
  // Espera BURST_DEBOUNCE_MS: se o cliente mandou outra mensagem nesse meio
  // tempo, ESTA invocação desiste — a invocação da mensagem mais nova é quem
  // responde, com o lote inteiro agregado (ver "burst" abaixo). Assim 3
  // mensagens picadas viram UMA chamada ao Claude, e não 3 respostas fora de
  // ordem.
  await sleep(BURST_DEBOUNCE_MS);
  // Desempate determinístico: duas mensagens gravadas no MESMO milissegundo
  // (dois webhooks concorrentes) não se enxergavam como "mais nova" com o `gt`
  // estrito — as DUAS invocações prosseguiam e o cliente recebia resposta
  // dupla. Em empate de createdAt, o maior id (cuid ~monotônico) vence.
  const findNewerInbound = () => db.whatsAppMessage.findFirst({
    where: {
      contactId,
      direction: "in",
      deletedAt: null,
      id: { not: message.id },
      OR: [
        { createdAt: { gt: new Date(message.createdAt) } },
        { createdAt: new Date(message.createdAt), id: { gt: message.id } },
      ],
    },
    select: { id: true },
  });
  if (await findNewerInbound()) {
    console.log(`[WHATSAPP BOT] ${contactId}: mensagem mais nova chegou durante o debounce — esta invocação desiste.`);
    return;
  }

  try {
    const conversation = await db.whatsAppConversation.findUnique({
      where: { contactId },
      select: { id: true, status: true, botMemory: true, botState: true, botFailCount: true, qualified: true, closeCategory: true },
    });

    // Durante o debounce um atendente pode ter assumido/encerrado a conversa —
    // nesse caso o bot não tem mais nada a fazer aqui.
    if (conversation && conversation.status !== "bot") {
      console.log(`[WHATSAPP BOT] ${contactId}: conversa saiu do modo bot durante o debounce (${conversation.status}).`);
      return;
    }

    // ---- Mídia ----------------------------------------------------------
    // TUDO vai pra IA com URL pré-assinada: áudio é transcrito (Gemini) e
    // imagem/PDF o Claude LÊ direto (visão). O que fazer com o arquivo —
    // confirmar recebimento, validar, pedir o próximo, transferir com resumo —
    // é regido pelas INSTRUÇÕES editáveis + playbook, não mais por atalho de
    // código (decisão de 25/07/2026; antes, qualquer arquivo não-áudio
    // transferia pra fila na hora, atropelando as regras aprendidas).
    let media: { url: string; mimeType: string } | null = null;
    if (message.mediaKey && message.mediaType) {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: message.mediaKey }),
        { expiresIn: 600 },
      );
      media = { url, mimeType: message.mediaType };
    }

    // ---- Lote da rajada ---------------------------------------------------
    // Todas as mensagens do cliente desde a nossa última resposta formam UM
    // "turno" só: os textos são agregados numa única mensagem pra IA. (Mídia
    // de mensagens anteriores do lote não é reprocessada — só a da mensagem
    // que disparou esta invocação, tratada acima.)
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
      select: { id: true, body: true },
    });
    const burstIds = burst.length ? burst.map((b) => b.id) : [message.id];
    const clientText = (burst.length ? burst.map((b) => b.body?.trim()).filter(Boolean) : [message.body?.trim()])
      .filter(Boolean)
      .join("\n");

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
      await handoffToQueue(contactId, contactLabel, "mensagem sem texto/áudio interpretável");
      return;
    }

    // ---- Contexto -------------------------------------------------------
    const [history, card, flows] = await Promise.all([
      db.whatsAppMessage.findMany({
        where: { contactId, internal: false, id: { notIn: burstIds }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { direction: true, sentByBot: true, body: true },
      }),
      findLinkedCard(contactId),
      // Fluxos cadastrados COM descrição — a IA escolhe qual se encaixa.
      listFlowsForBot(),
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
        .filter((h) => h.body)
        .map((h) => ({
          role: h.direction === "in" ? "client" : h.sentByBot ? "bot" : "agent",
          text: h.body,
        })),
      message: crossedWithLastOut ? `${clientText}\n\n${crossNote}` : clientText,
      media,
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
      business: businessHours(),
    };

    // ---- IA (com no máximo 1 consulta intermediária ao banco) -----------
    // Números de teste usam o cérebro de STAGING (validação de prompt novo).
    const brainUrl = brainUrlFor(message.contactPhone);
    if (brainUrl !== CHATBOT_URL) {
      console.log(`[WHATSAPP BOT] ${message.contactPhone} é número de TESTE → cérebro de staging.`);
    }
    let decision = await callBrain(basePayload, brainUrl);
    if (decision.action === "lookup" && decision.lookup) {
      const firstUsage = decision.usage;
      const lookupResult = await runLookup(decision.lookup, contactId, card);
      decision = await callBrain({ ...basePayload, lookupResult }, brainUrl);
      // Soma o gasto das duas chamadas ao Claude na métrica de custo.
      decision = { ...decision, usage: sumUsage(firstUsage, decision.usage) };
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
        const firstUsage = decision.usage;
        let second = await callBrain(basePayload, brainUrl);
        // O retry não repete a consulta intermediária: lookup vira continue.
        if (second.action === "lookup") second = { ...second, action: "continue" };
        decision = { ...second, usage: sumUsage(firstUsage, second.usage) };
      } catch {
        // Mantém a decisão vazia — cai no handoff do default como antes.
      }
    }

    // ---- Corrida pós-cérebro (30/07/2026) ---------------------------------
    // O debounce só protege ANTES da chamada à IA — mas o cérebro leva vários
    // segundos, e o cliente pode mandar outra mensagem nesse meio tempo (era o
    // que gerava resposta dupla e a IA tratando a mensagem nova como resposta
    // da pergunta errada). Se chegou mensagem mais nova, esta invocação
    // DESISTE antes de enviar ou persistir qualquer coisa: a invocação da
    // mensagem nova reprocessa o lote inteiro (burst) com o contexto completo.
    if (await findNewerInbound()) {
      console.log(`[WHATSAPP BOT] ${contactId}: mensagem nova chegou enquanto a IA pensava — descartando esta resposta (a invocação mais nova responde o lote).`);
      return;
    }

    // ---- Loop de "não entendi": 2 tentativas → especialista -------------
    // ATENÇÃO: isto é uma TRAVA DE CÓDIGO que sobrescreve a decisão da IA —
    // dispara antes de qualquer regra do playbook e por isso é registrada em
    // Métricas como intervenção de código (kind="code"), não como regra.
    let failCount = conversation?.botFailCount ?? 0;
    if (!decision.understood) {
      failCount += 1;
      if (failCount >= 2) {
        decision = {
          ...decision,
          action: "handoff",
          handoffReason: "IA não entendeu o cliente 2x",
          reply: "Para te atender melhor, vou encaminhar você para um de nossos especialistas, tá bom?",
          replies: [],
        };
        await recordCodeIntervention({
          contactId,
          contactName: message.contactName,
          botState: decision.state || null,
          action: "handoff",
          detail: 'Trava de código: "não entendi" 2x seguidas → transferência automática com texto fixo (a IA não escolheu isso).',
        });
      }
    } else {
      failCount = 0;
    }

    // ---- Urgência: transfere na hora -------------------------------------
    if (decision.urgent && decision.action === "continue") {
      decision = {
        ...decision,
        action: "handoff",
        handoffReason: decision.handoffReason ?? "urgência detectada",
      };
      await recordCodeIntervention({
        contactId,
        contactName: message.contactName,
        botState: decision.state || null,
        action: "handoff",
        detail: "Trava de código: IA sinalizou urgência em action=continue → promovida a transferência automática.",
      });
    }

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
        await sendBotReply(contactId, message.contactPhone, message.contactName, text, humanDelay(text));
      } catch (err) {
        console.error("[WHATSAPP BOT] Confirmação de opt-out não entregue (encerrando mesmo assim):", contactId, err);
      }
      // Cérebro: opt-out era o ÚNICO desfecho sem snapshot — casos de fricção
      // (cliente irritado) são justamente os mais valiosos pra revisão.
      await captureConversation(contactId, "bot_disqualify", {
        closeCategory: "nao_qualificado",
        qualified: false,
      });
      await db.whatsAppConversation.update({
        where: { contactId },
        data: {
          status: "closed", assignedToId: null, closeCategory: "nao_qualificado", qualified: false,
          botFailCount: 0, urgent: false, queuedAt: null, queueAlertAt: null,
          recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null,
        },
      });
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
        },
      });
      return;
    }

    // ---- Persiste memória/estado ------------------------------------------
    await db.whatsAppConversation.update({
      where: { contactId },
      data: {
        botMemory: decision.memory || conversation?.botMemory || null,
        botState: decision.state || conversation?.botState || null,
        botFailCount: failCount,
      },
    });

    // ---- Responde (com delay humanizado) e executa a ação -----------------
    // Quando a IA qualifica o lead, ela devolve o roteiro comercial inteiro em
    // `replies`: enviamos CADA bloco como uma mensagem separada, em sequência,
    // sem esperar o cliente responder entre elas. Fora disso, um único `reply`.
    const outgoing = decision.replies?.length
      ? decision.replies
      : decision.reply
        ? [decision.reply]
        : [];
    for (const msg of outgoing) {
      await sendBotReply(
        contactId, message.contactPhone, message.contactName,
        msg, humanDelay(msg),
      );
    }

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
        // Fluxo inexistente/falhou e nada foi enviado → não deixa o cliente no
        // vácuo: manda ao menos uma confirmação e passa pra fila humana.
        if (!sent && outgoing.length === 0) {
          await sendBotReply(
            contactId, message.contactPhone, message.contactName,
            "Só um instante que vou verificar isso pra você com um de nossos atendentes, tá?",
            humanDelay("x".repeat(50)),
          );
          await handoffToQueue(contactId, contactLabel, "fluxo escolhido pela IA não pôde ser enviado", "perguntas");
        }
        break;
      }
      case "qualify":
        // Qualificar sem nenhum texto deixaria o lead no vácuo até um humano
        // assumir — garante ao menos a ponte pro atendente.
        if (outgoing.length === 0) {
          await sendMutedFallback(
            contactId, message,
            "Perfeito! Vou te passar para um de nossos atendentes dar sequência, tá bom? Já já alguém fala com você 😊",
            "qualify sem texto",
          );
        }
        await qualifyToQueue(contactId, contactLabel, decision.handoffReason ?? "triagem aprovada pela IA");
        break;
      case "disqualify":
        // Encerrar MUDO só quando a IA declarou silêncio deliberado (silent) —
        // ex.: agradecimento pós-despedida. Vazio sem a flag = falha da IA:
        // manda uma despedida mínima pra não abandonar o cliente falando.
        if (outgoing.length === 0 && !decision.silent) {
          await sendMutedFallback(
            contactId, message,
            "Obrigado pelo contato! Qualquer coisa é só mandar uma mensagem por aqui, tá bom? 😊",
            "disqualify sem texto e sem silent",
          );
        }
        await disqualifyAndClose(contactId);
        break;
      case "handoff":
        // Transferência sem texto: o cliente ficaria esperando sem saber que um
        // humano vai assumir — avisa antes de enfileirar.
        if (outgoing.length === 0 && !decision.silent) {
          await sendMutedFallback(
            contactId, message,
            "Vou te passar para um de nossos atendentes, só um instante, tá bom?",
            "handoff sem texto",
          );
        }
        await handoffToQueue(
          contactId, contactLabel,
          decision.handoffReason ?? "transferido pelo bot",
          decision.closeCategory ?? "transferido",
          decision.urgent, // urgência da IA vira selo vermelho no inbox
        );
        break;
      case "resolve":
        // Assunto resolvido pelo próprio bot (dúvida/status). Encerra como
        // "perguntas" (ou a categoria que a IA indicar). Mesmo guard de
        // silêncio do disqualify.
        if (outgoing.length === 0 && !decision.silent) {
          await sendMutedFallback(
            contactId, message,
            "Certo! Se precisar de mais alguma coisa é só mandar uma mensagem por aqui 😊",
            "resolve sem texto e sem silent",
          );
        }
        await resolveAndClose(contactId, decision.closeCategory ?? "perguntas");
        break;
      default:
        // "continue" SEM nenhuma resposta = a IA se perdeu e não devolveu
        // texto. Antes isso deixava o cliente no vácuo (bot mudo, ainda em modo
        // bot, ninguém avisado). Agora joga pra fila humana com o motivo, pra um
        // atendente assumir na hora em vez de o cliente ficar sem resposta.
        if (outgoing.length === 0) {
          await handoffToQueue(contactId, contactLabel, "IA devolveu resposta vazia (sem texto para enviar ao cliente)");
        }
        break; // continue com resposta: só seguiu a conversa
    }

    // ---- Auditoria/métricas da IA -----------------------------------------
    // Uma linha por decisão do bot; alimenta o dashboard do chatbot (quantos
    // qualificados/não, dúvidas, % de entendimento, tempo até qualificar).
    let durationMs: number | undefined;
    const terminal = ["qualify", "disqualify", "resolve", "handoff"].includes(decision.action);
    if (terminal && conversation) {
      const conv = await db.whatsAppConversation.findUnique({
        where: { contactId }, select: { createdAt: true },
      });
      if (conv) durationMs = Date.now() - conv.createdAt.getTime();
    }
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
        urgent: decision.urgent,
        qualified: decision.action === "qualify" ? true : decision.action === "disqualify" ? false : undefined,
        // Categoria de encerramento (perguntas/qualificado/novo_acidente/...).
        closeCategory: decision.closeCategory ?? undefined,
        flowName: decision.action === "send_flow" ? decision.flowName ?? undefined : undefined,
        durationMs,
        usage: decision.usage ?? undefined,
        // Diagnóstico: o que o micro devolveu em appliedRules. `undefined` no
        // metadata = o campo NEM VEIO na resposta (micro rodando código antigo,
        // sem o campo no schema); [] = veio e a IA não citou regra nenhuma.
        appliedRules: decision.appliedRules,
        hasAppliedRulesField: "appliedRules" in decision,
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
    // (o "erro no bot" genérico não dizia nada).
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const detail = isTimeout
      ? "timeout: o cérebro (IA) demorou demais para responder"
      : `erro no bot: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[WHATSAPP BOT] Falha no fluxo do bot — caindo pra fila humana:", err);
    // Métrica: registra o erro da IA para o dashboard (quantos erros x acertos).
    await logWhatsAppEvent({
      action: "wa_bot",
      message: `IA: erro — ${detail}`,
      authorId: "whatsapp-bot",
      authorName: "🤖 Bot WhatsApp",
      contactId,
      numberId: ingest.numberId,
      contactName: message.contactName,
      contactPhone: message.contactPhone,
      metadata: { outcome: "error", error: true, timeout: isTimeout, detail },
    });
    await handoffToQueue(contactId, contactLabel, detail);
  }
}
