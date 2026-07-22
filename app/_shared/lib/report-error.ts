// Alerta de erro crítico via webhook do Discord — observabilidade mínima em
// produção (os console.error na Vercel são efêmeros; se uma automação ou o
// webhook do WhatsApp falhar de madrugada, ninguém fica sabendo).
//
// Use nos pontos que ENGOLEM erro de propósito (webhook que precisa responder
// 200 à Meta, automações fire-and-forget, createLog): mantém o comportamento
// de não quebrar a operação, mas o erro chega no canal do Discord.
//
// Se um dia o projeto adotar Sentry, este módulo é o único lugar a trocar.

const WEBHOOK =
  process.env.DISCORD_WEBHOOK_URL_ERRORS ?? process.env.DISCORD_WEBHOOK_URL;

/** Nunca lança. Loga no console e, se configurado, avisa no Discord. */
export async function reportCriticalError(context: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(`[${context}]`, err);

  if (!WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🚨 **Erro crítico** em \`${context}\`\n\`\`\`\n${message.slice(0, 1500)}\n\`\`\``,
      }),
      cache: "no-store",
    });
  } catch (notifyErr) {
    console.error("[REPORT-ERROR] Falha ao notificar Discord:", notifyErr);
  }
}
