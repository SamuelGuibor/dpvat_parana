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

/** Nunca lança. Registra o erro com destaque no console. */
export async function reportCriticalError(context: string, err: unknown): Promise<void> {
  console.error(`🚨 [ERRO CRÍTICO] [${context}]`, err);
}
