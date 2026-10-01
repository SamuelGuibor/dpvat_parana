import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/app/_shared/lib/prisma";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { maskSecretsInSequence } from "@/app/_shared/utils/mask-secrets";
import {
  CLOSING_JUDGE_SYSTEM, closingJudgeTranscript, parseClosingVerdict,
} from "@/app/_shared/utils/closing-judge";

// IA que julga se a última mensagem do cliente encerra o assunto ou retoma o
// contato, para a conversa com atendente humano (SLA do cron), onde o cérebro
// do bot não roda. Só é chamada quando a mensagem PARECE fecho pela lista de
// palavras (isClosingAck); o resto avisa o atendente sem IA. Regras e prompt
// em closing-judge.ts.

const CLOSING_MODEL = "claude-haiku-4-5-20251001";
const CLOSING_HISTORY = 12;
const CLOSING_TIMEOUT_MS = 15_000;

/**
 * true = a IA julgou que o cliente só encerrou o assunto (não avisa ninguém).
 * Sem chave, erro ou resposta ilegível → false: na dúvida o atendente é avisado.
 * Toda chamada grava wa_followup (mode 'human_sla') com o usage.
 */
export async function clientMessageIsClosing(conv: {
  contactId: string;
  numberId: string | null;
  contact: { name: string | null; phone: string };
}): Promise<boolean> {
  if (!process.env.CLAUDE_API_KEY) return false;
  let usage: Record<string, unknown> | undefined;
  const t0 = Date.now();
  const log = (message: string, metadata: Record<string, unknown>) =>
    logWhatsAppEvent({
      action: "wa_followup",
      message,
      authorId: "whatsapp-bot",
      authorName: "🤖 Bot WhatsApp",
      contactId: conv.contactId,
      numberId: conv.numberId,
      contactName: conv.contact.name,
      contactPhone: conv.contact.phone,
      metadata: { mode: "human_sla", bySystem: true, usage, durationMs: Date.now() - t0, ...metadata },
    });

  try {
    const recent = await db.whatsAppMessage.findMany({
      where: { contactId: conv.contactId, internal: false, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: CLOSING_HISTORY,
      select: { direction: true, sentByBot: true, body: true, mediaType: true, createdAt: true },
    });
    const messages = recent.reverse();
    // Senha e código nunca vão a IA nenhuma (mask-secrets.ts).
    const texts = maskSecretsInSequence(messages.map((m) => (m.body ?? "").trim()))
      .map((t, i) => t || (messages[i].mediaType ? `[anexo: ${messages[i].mediaType}]` : "[mensagem vazia]"));

    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, timeout: CLOSING_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.messages.create({
      model: CLOSING_MODEL,
      max_tokens: 200,
      system: CLOSING_JUDGE_SYSTEM,
      messages: [{ role: "user", content: `CONVERSA (horário de Brasília):\n${closingJudgeTranscript(messages, texts)}` }],
    });
    usage = {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const verdict = parseClosingVerdict(raw);
    if (!verdict) {
      await log("IA do cron (SLA humano): resposta ilegível — atendente avisado", { action: "notify", error: "formato" });
      return false;
    }
    await log(
      `IA do cron (SLA humano): ${verdict.closing ? "cliente encerrou o assunto" : "cliente espera resposta"}`,
      { action: verdict.closing ? "closing" : "notify", reason: verdict.reason },
    );
    return verdict.closing;
  } catch (err) {
    await log("IA do cron (SLA humano): falhou — atendente avisado", {
      action: "notify",
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
