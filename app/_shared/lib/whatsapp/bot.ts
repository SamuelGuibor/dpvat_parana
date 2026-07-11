import { Prisma } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/app/_shared/lib/prisma";
import { broadcastToRelay } from "@/app/_shared/lib/chat-relay";
import { sendText, markMessageRead } from "./client";
import { runFlowForContact, listFlowsForBot } from "./flow-runner";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
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
  etapa: string | null;
  service: string | null;
}

interface LinkedCard extends ProcessInfo {
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
async function findLinkedCard(contactId: string): Promise<LinkedCard | null> {
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) return null;

  if (contact.userId) {
    const u = await db.user.findUnique({ where: { id: contact.userId }, include: { label: true } });
    if (u) return { kind: "user", id: u.id, name: u.name, etapa: u.label?.name ?? u.role, service: u.service };
  }
  if (contact.processId) {
    const p = await db.process.findUnique({ where: { id: contact.processId }, include: { label: true } });
    if (p) return { kind: "process", id: p.id, name: p.name, etapa: p.label?.name ?? p.role, service: p.service };
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
    if (u) return { kind: "user", id: u.id, name: u.name, etapa: u.label?.name ?? u.role, service: u.service };
  }

  const processes = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "Process"
    WHERE regexp_replace(COALESCE(telefone, '') || ' ' || COALESCE(telefone_secundario, ''), '\D', '', 'g') LIKE ${"%" + last8 + "%"}
    LIMIT 1
  `);
  if (processes.length) {
    const p = await db.process.findUnique({ where: { id: processes[0].id }, include: { label: true } });
    if (p) return { kind: "process", id: p.id, name: p.name, etapa: p.label?.name ?? p.role, service: p.service };
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
          ? { encontrado: true, nome: fresh.name, etapa: fresh.etapa, servico: fresh.service }
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
  const conversation = await db.whatsAppConversation.update({
    where: { contactId },
    data: { status: "queued", assignedToId: null, qualified: true, botFailCount: 0, closeCategory: "qualificado", queuedAt: new Date(), queueAlertAt: null },
  });
  await tagAsQualified(conversation.id);
  await postInternalNote(contactId, `🤖 Lead qualificado pela IA — ${reason}`);
  await handoffNotifyOnly(contactLabel, `LEAD QUALIFICADO ✅ — ${reason}`, contactId);
}

/** Cliente NÃO elegível: encerra o ticket como "não qualificada". */
async function disqualifyAndClose(contactId: string): Promise<void> {
  await db.whatsAppConversation.update({
    where: { contactId },
    // Encerrou como não qualificada: reseta a memória do cliente para que uma
    // futura conversa comece do zero.
    data: { status: "closed", assignedToId: null, qualified: false, closeCategory: "nao_qualificado", botFailCount: 0, botMemory: null, botState: null, urgent: false, queuedAt: null, queueAlertAt: null },
  });
}

/**
 * Assunto RESOLVIDO pelo próprio bot (ex.: cliente cadastrado só tirou uma
 * dúvida / consultou status e não precisa de mais nada). Encerra sem qualificar,
 * na categoria "perguntas" — reseta memória/estado para a próxima conversa
 * começar do zero.
 */
async function resolveAndClose(contactId: string, category: string = "perguntas"): Promise<void> {
  await db.whatsAppConversation.update({
    where: { contactId },
    data: { status: "closed", assignedToId: null, qualified: null, closeCategory: category, botFailCount: 0, botMemory: null, botState: null, urgent: false, queuedAt: null, queueAlertAt: null },
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
  if (delayMs > 0) await sleep(delayMs);

  const result = await sendText(phone, text);
  if (!result.waMessageId) {
    throw new Error(result.error ?? "Envio rejeitado pela Meta.");
  }

  const message = await db.whatsAppMessage.create({
    data: {
      contactId,
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
async function callBrainOnce(payload: object): Promise<BotDecision> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOT_TIMEOUT_MS);
  try {
    const res = await fetch(`${CHATBOT_URL}/reply`, {
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
    return (await res.json()) as BotDecision;
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
async function callBrain(payload: object): Promise<BotDecision> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= BOT_MAX_ATTEMPTS; attempt++) {
    try {
      return await callBrainOnce(payload);
    } catch (err) {
      lastErr = err;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      // Só o timeout é reprocessado — os demais erros não vão melhorar no retry.
      if (!isTimeout) throw err;
      console.warn(
        `[WHATSAPP BOT] Timeout do cérebro (tentativa ${attempt}/${BOT_MAX_ATTEMPTS}).`,
      );
      if (attempt < BOT_MAX_ATTEMPTS) await sleep(BOT_RETRY_DELAY_MS);
    }
  }
  // 3 tentativas e ainda timeout → propaga (AbortError) pra cair na fila.
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
    markMessageRead(message.waMessageId, true).catch(() => {});
  }

  try {
    const conversation = await db.whatsAppConversation.findUnique({
      where: { contactId },
      select: { id: true, botMemory: true, botState: true, botFailCount: true },
    });

    // ---- Mídia ----------------------------------------------------------
    // Áudio: a IA escuta (URL pré-assinada do S3 → Gemini multimodal).
    // Imagem/vídeo/documento: conferência é papel de humano → fila.
    let media: { url: string; mimeType: string } | null = null;
    if (message.mediaKey) {
      if (message.mediaType?.startsWith("audio/")) {
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: message.mediaKey }),
          { expiresIn: 600 },
        );
        media = { url, mimeType: message.mediaType };
      } else {
        // Recebeu documento/foto (ex: RG na coleta de dados) → humano confere.
        await sendBotReply(
          contactId, message.contactPhone, message.contactName,
          "Recebi seu arquivo! 📄 Vou passar para um de nossos atendentes conferir e já te retorno, tá bom?",
          humanDelay("x".repeat(60)),
        );
        await handoffToQueue(contactId, contactLabel, "cliente enviou documento/imagem para conferência");
        return;
      }
    }

    const clientText = message.body?.trim() ?? "";
    if (!clientText && !media) {
      // Mensagem sem conteúdo interpretável (sticker etc) → fila.
      await handoffToQueue(contactId, contactLabel, "mensagem sem texto/áudio interpretável");
      return;
    }

    // ---- Contexto -------------------------------------------------------
    const [history, card, flows] = await Promise.all([
      db.whatsAppMessage.findMany({
        where: { contactId, internal: false, id: { not: message.id }, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { direction: true, sentByBot: true, body: true },
      }),
      findLinkedCard(contactId),
      // Fluxos cadastrados COM descrição — a IA escolhe qual se encaixa.
      listFlowsForBot(),
    ]);

    const basePayload = {
      contact: { name: message.contactName, phone: message.contactPhone },
      processInfo: card ? { name: card.name, etapa: card.etapa, service: card.service } : null,
      // Fluxos que a IA pode disparar (action="send_flow" + flowName).
      flows,
      history: history
        .reverse()
        .filter((h) => h.body)
        .map((h) => ({
          role: h.direction === "in" ? "client" : h.sentByBot ? "bot" : "agent",
          text: h.body,
        })),
      message: clientText,
      media,
      memory: conversation?.botMemory ?? null,
      state: conversation?.botState ?? null,
      failCount: conversation?.botFailCount ?? 0,
      business: businessHours(),
    };

    // ---- IA (com no máximo 1 consulta intermediária ao banco) -----------
    let decision = await callBrain(basePayload);
    if (decision.action === "lookup" && decision.lookup) {
      const firstUsage = decision.usage;
      const lookupResult = await runLookup(decision.lookup, contactId, card);
      decision = await callBrain({ ...basePayload, lookupResult });
      // Soma o gasto das duas chamadas ao Claude na métrica de custo.
      decision = { ...decision, usage: sumUsage(firstUsage, decision.usage) };
      // Segunda passada não pode pedir lookup de novo: rebaixa pra continue.
      if (decision.action === "lookup") decision = { ...decision, action: "continue" };
    }

    // ---- Loop de "não entendi": 2 tentativas → especialista -------------
    let failCount = conversation?.botFailCount ?? 0;
    if (!decision.understood) {
      failCount += 1;
      if (failCount >= 2) {
        decision = {
          ...decision,
          action: "handoff",
          handoffReason: "IA não entendeu o cliente 2x",
          reply: "Para te atender melhor, vou encaminhar você para um de nossos especialistas, tá bom? 😊",
          replies: [],
        };
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
            "Só um instante que vou verificar isso pra você com um de nossos atendentes, tá? 😊",
            humanDelay("x".repeat(50)),
          );
          await handoffToQueue(contactId, contactLabel, "fluxo escolhido pela IA não pôde ser enviado", "perguntas");
        }
        break;
      }
      case "qualify":
        await qualifyToQueue(contactId, contactLabel, decision.handoffReason ?? "triagem aprovada pela IA");
        break;
      case "disqualify":
        await disqualifyAndClose(contactId);
        break;
      case "handoff":
        await handoffToQueue(
          contactId, contactLabel,
          decision.handoffReason ?? "transferido pelo bot",
          decision.closeCategory ?? "transferido",
          decision.urgent, // urgência da IA vira selo vermelho no inbox
        );
        break;
      case "resolve":
        // Assunto resolvido pelo próprio bot (dúvida/status). Encerra como
        // "perguntas" (ou a categoria que a IA indicar).
        await resolveAndClose(contactId, decision.closeCategory ?? "perguntas");
        break;
      default:
        break; // continue: só seguiu a conversa
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
      },
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
      contactName: message.contactName,
      contactPhone: message.contactPhone,
      metadata: { outcome: "error", error: true, timeout: isTimeout, detail },
    });
    await handoffToQueue(contactId, contactLabel, detail);
  }
}
