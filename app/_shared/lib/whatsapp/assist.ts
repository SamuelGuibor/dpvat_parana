import { db } from "@/app/_shared/lib/prisma";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { AssistError } from "@/app/_shared/utils/assist-errors";
import { maskMemorySecrets, maskSecretsInSequence } from "@/app/_shared/utils/mask-secrets";
import { findLinkedCard } from "./bot";
import { transcribeStoredAudio } from "./transcribe";

// Agent-assist: chamadas de IA que AJUDAM o atendente humano (não respondem
// sozinhas ao cliente). Todas usam o mesmo microserviço do bot (CHATBOT_URL):
//   - suggestReplyForContact  → propõe a próxima resposta (humano revisa/envia)
//   - summarizeConversation   → resumo curto do histórico (vira comentário no card)
//   - transcribeMessageAudio  → transcreve um áudio da thread (persiste na mensagem)
// O gasto de tokens vai pro log (wa_suggest / wa_summary / wa_transcribe) e
// entra na conta do Canto da IA. O log leva também `durationMs` = tempo SÓ da
// chamada à IA (sem as leituras do banco), para o gestor ver quanto o Copiloto
// demora. Não confundir com o `durationMs` dos logs wa_bot antigos, que era a
// idade da conversa (hoje `conversationAgeMs`): nenhum painel soma os dois.
//
// Falhas saem como `AssistError` com `code` (assist-errors.ts): a rota
// POST /api/whatsapp/assist/<op> devolve a mensagem PT-BR com o status do
// code, em vez do erro mascarado das server actions.

const CHATBOT_URL = process.env.CHATBOT_URL?.replace(/\/$/, "") ?? "";
const CHATBOT_SECRET = process.env.CHATBOT_SECRET ?? "";
// 30 s: desde que a IA do Copiloto saiu da fila de server actions (rota
// POST, 26/09/2026) a espera não congela mais a aba, só o botão fica girando.
// A rota tem maxDuration 60, com folga para as leituras do banco.
const ASSIST_TIMEOUT_MS = 30_000;

function assistConfigured(): boolean {
  return !!CHATBOT_URL && !!CHATBOT_SECRET;
}

async function callAssist<T>(path: string, body: object): Promise<T> {
  if (!assistConfigured()) {
    throw new AssistError("not_configured", "Serviço de IA não configurado (CHATBOT_URL/CHATBOT_SECRET).");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSIST_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${CHATBOT_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bot-secret": CHATBOT_SECRET },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      // Sem isto o atendente via um "fetch failed"/500 cru na tela. Os dois
      // casos reais: o microserviço do bot fora do ar (dev sem o serviço
      // rodando, ou Railway caído) e a resposta que estourou o tempo.
      console.error(`[WHATSAPP ASSIST] Falha ao chamar ${CHATBOT_URL}${path}:`, err);
      if (err instanceof Error && err.name === "AbortError") {
        throw new AssistError("timeout", "A IA demorou demais para responder. Tente de novo.");
      }
      throw new AssistError(
        "offline",
        "Serviço de IA fora do ar — não consegui falar com o chatbot. Tente de novo em instantes.",
      );
    }
    // 504 = o micro desistiu pelo próprio prazo: para o atendente é "demorou".
    if (res.status === 504) {
      throw new AssistError("timeout", "A IA demorou demais para responder. Tente de novo.");
    }
    if (!res.ok) throw new AssistError("upstream", `IA respondeu HTTP ${res.status}. Tente de novo.`);
    try {
      return (await res.json()) as T;
    } catch {
      throw new AssistError("upstream", "A IA devolveu uma resposta ilegível. Tente de novo.");
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Texto que o micro devolveu, ou `AssistError("upstream")` se veio vazio/fora do formato. */
function requireText(value: unknown, emptyMessage: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new AssistError("upstream", emptyMessage);
}

interface HistoryTurn {
  role: "client" | "bot" | "agent";
  text: string;
}

/**
 * Histórico recente da conversa no formato que o cérebro entende, com
 * senha/código mascarados (mask-secrets.ts, decisão do dono de 30/09/2026): a
 * sugestão e os resumos também vão à IA, e o valor nunca vai. O atendente vê
 * o texto original na thread.
 */
async function loadHistory(contactId: string, take = 40): Promise<HistoryTurn[]> {
  const rows = await db.whatsAppMessage.findMany({
    where: { contactId, internal: false, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: { direction: true, sentByBot: true, body: true, transcript: true, mediaType: true },
  });
  const turns = rows
    .reverse()
    .map((m) => {
      // Áudio já transcrito entra como texto — melhora sugestão e resumo.
      const text = m.body?.trim()
        ? m.body
        : m.transcript
          ? `[áudio] ${m.transcript}`
          : m.mediaType
            ? "📎 (anexo)"
            : "";
      if (!text) return null;
      return {
        role: (m.direction === "in" ? "client" : m.sentByBot ? "bot" : "agent") as HistoryTurn["role"],
        text,
      };
    })
    .filter((t): t is HistoryTurn => !!t);
  const masked = maskSecretsInSequence(turns.map((t) => t.text));
  return turns.map((t, i) => ({ ...t, text: masked[i] }));
}

// ---------------------------------------------------------------------------
// Sugestão de resposta (IA propõe → humano aprova/edita → envia)
// ---------------------------------------------------------------------------
export async function suggestReplyForContact(
  contactId: string,
  agent: { id: string; name: string },
): Promise<string> {
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { name: true, phone: true },
  });
  if (!contact) throw new AssistError("not_found", "Contato não encontrado.");

  const [history, conversation, card] = await Promise.all([
    loadHistory(contactId),
    db.whatsAppConversation.findUnique({ where: { contactId }, select: { botMemory: true } }),
    findLinkedCard(contactId).catch(() => null),
  ]);

  const t0 = Date.now();
  const out = await callAssist<{ suggestion?: unknown; usage?: object | null }>("/suggest", {
    contact: { name: contact.name, phone: contact.phone },
    processInfo: card ? { name: card.name, etapa: card.etapa, service: card.service } : null,
    history,
    memory: maskMemorySecrets(conversation?.botMemory),
    agentName: agent.name,
  });
  const durationMs = Date.now() - t0;

  // Log ANTES de conferir o texto: a IA já cobrou mesmo se veio vazio.
  await logWhatsAppEvent({
    action: "wa_suggest",
    message: "pediu sugestão de resposta à IA",
    authorId: agent.id,
    authorName: agent.name,
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { usage: out.usage ?? undefined, durationMs },
  });

  return requireText(out.suggestion, "A IA não devolveu uma sugestão. Tente de novo.");
}

// ---------------------------------------------------------------------------
// Resumo da conversa sob demanda (aba Copiloto do inbox): devolve o texto pro
// atendente em vez de gravar comentário no card.
// ---------------------------------------------------------------------------
export async function summarizeConversationForAgent(
  contactId: string,
  agent: { id: string; name: string },
): Promise<string> {
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { name: true, phone: true },
  });
  if (!contact) throw new AssistError("not_found", "Contato não encontrado.");

  const [history, conversation] = await Promise.all([
    loadHistory(contactId, 60),
    db.whatsAppConversation.findUnique({ where: { contactId }, select: { botMemory: true } }),
  ]);
  if (!history.length) throw new AssistError("bad_input", "Ainda não há conversa para resumir.");

  const t0 = Date.now();
  const out = await callAssist<{ summary?: unknown; usage?: object | null }>("/summarize", {
    contact: { name: contact.name, phone: contact.phone },
    history,
    memory: maskMemorySecrets(conversation?.botMemory),
  });
  const durationMs = Date.now() - t0;

  await logWhatsAppEvent({
    action: "wa_summary",
    message: "pediu resumo da conversa à IA (Copiloto)",
    authorId: agent.id,
    authorName: agent.name,
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { usage: out.usage ?? undefined, durationMs },
  });

  return requireText(out.summary, "A IA não devolveu o resumo. Tente de novo.");
}

// ---------------------------------------------------------------------------
// Resumo da conversa → comentário no card do kanban (dispara ao VINCULAR o
// contato a um User/Process). Best-effort: falha aqui nunca quebra o vínculo.
// ---------------------------------------------------------------------------
export async function summarizeConversationToCard(
  contactId: string,
  target: { userId?: string; processId?: string },
  author: { id: string; name: string },
): Promise<void> {
  try {
    if (!assistConfigured()) return;
    if (!target.userId && !target.processId) return;

    const contact = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: { name: true, phone: true },
    });
    if (!contact) return;

    const [history, conversation] = await Promise.all([
      loadHistory(contactId, 60),
      db.whatsAppConversation.findUnique({ where: { contactId }, select: { botMemory: true } }),
    ]);
    // Sem conversa não há o que resumir.
    if (!history.length) return;

    const cardName = target.userId
      ? (await db.user.findUnique({ where: { id: target.userId }, select: { name: true } }))?.name
      : (await db.process.findUnique({ where: { id: target.processId! }, select: { name: true } }))?.name;

    const t0 = Date.now();
    const out = await callAssist<{ summary: string; usage?: object | null }>("/summarize", {
      contact: { name: contact.name, phone: contact.phone },
      history,
      memory: maskMemorySecrets(conversation?.botMemory),
    });
    const durationMs = Date.now() - t0;

    await db.comment.create({
      data: {
        text: `🤖 Resumo da conversa de WhatsApp (+${contact.phone}):\n\n${out.summary}`,
        authorName: "🤖 IA — WhatsApp",
        targetName: cardName ?? contact.name ?? `+${contact.phone}`,
        userId: target.userId ?? null,
        processId: target.processId ?? null,
      },
    });

    await logWhatsAppEvent({
      action: "wa_summary",
      message: "IA resumiu a conversa no card do cliente",
      authorId: author.id,
      authorName: author.name,
      contactId,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { usage: out.usage ?? undefined, durationMs, userId: target.userId, processId: target.processId },
    });
  } catch (err) {
    console.error("[WHATSAPP ASSIST] Falha ao resumir conversa pro card:", contactId, err);
  }
}

// ---------------------------------------------------------------------------
// Transcrição de áudio sob demanda (botão "transcrever" do inbox). O resultado
// é PERSISTIDO na mensagem — o segundo clique (de qualquer atendente) é grátis.
// A chamada é a mesma da transcrição antecipada do bot (transcribe.ts); o log
// wa_transcribe sai no nome do atendente, com o usage do micro novo.
// ---------------------------------------------------------------------------
export async function transcribeMessageAudio(
  messageId: string,
  agent: { id: string; name: string },
): Promise<string> {
  return transcribeStoredAudio(messageId, { author: agent });
}
