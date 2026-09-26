// Alerta de erro crítico — observabilidade mínima em produção (os
// console.error na Vercel são efêmeros; se uma automação ou o webhook do
// WhatsApp falhar de madrugada, ninguém fica sabendo).
//
// Use nos pontos que ENGOLEM erro de propósito (webhook que precisa responder
// 200 à Meta, automações fire-and-forget, createLog): mantém o comportamento
// de não quebrar a operação e centraliza o registro.
//
// O transporte pro Discord foi removido (17/08/2026 — saída do Discord). Se um
// dia o projeto adotar Sentry ou outro sink, este módulo é o único lugar a
// trocar.
//
// 25/09/2026: além do console, o erro vira Log "critical_error" (com o
// contactId quando há contato). Só com console.error as conversas que ficavam
// órfãs no bot não tinham causa investigável: falha do handoff no catch do
// bot, da ficha ou do status de entrega sumia com o log da função.

import { createLog } from "@/app/_shared/lib/log";
import { createTtlCache } from "@/app/_shared/utils/ttl-cache";
import { criticalErrorKey, describeError } from "@/app/_shared/utils/critical-error";

// O mesmo erro (contexto + contato + mensagem) é gravado no máximo uma vez a
// cada 10 min por instância: evento repetido da Meta (número desconhecido) ou
// banco fora do ar não pode virar uma linha por mensagem recebida.
const REPEAT_WINDOW_MS = 10 * 60_000;
const recentlyLogged = createTtlCache<string, true>({ ttlMs: REPEAT_WINDOW_MS, maxEntries: 500 });

export interface CriticalErrorExtra {
  /** Contato do WhatsApp afetado: liga o erro à conversa (metadata.contactId). */
  contactId?: string | null;
  /** Dados extras NÃO sensíveis (ids, fase). Nada de texto do cliente. */
  metadata?: Record<string, unknown>;
}

/** Nunca lança. Registra o erro com destaque no console e no Log "critical_error". */
export async function reportCriticalError(
  context: string,
  err: unknown,
  extra: CriticalErrorExtra = {},
): Promise<void> {
  console.error(`🚨 [ERRO CRÍTICO] [${context}]`, err);
  try {
    const info = describeError(err);
    const key = criticalErrorKey(context, info.message, extra.contactId);
    if (recentlyLogged.get(key)) return;
    recentlyLogged.set(key, true);
    // createLog já engole a própria falha (banco fora do ar = só o console).
    await createLog({
      action: "critical_error",
      message: `${context}: ${info.message}`,
      authorId: "system",
      authorName: "Sistema",
      metadata: {
        ...(extra.metadata ?? {}),
        context,
        error: info.message,
        errorName: info.name,
        ...(info.stack ? { stack: info.stack } : {}),
        // Mesmo formato do logWhatsAppEvent: quem procura os logs de um
        // contato acha o erro junto.
        ...(extra.contactId ? { channel: "whatsapp", contactId: extra.contactId } : {}),
      },
    });
  } catch (logErr) {
    console.error("[ERRO CRÍTICO] Falha ao registrar o log critical_error:", logErr);
  }
}
