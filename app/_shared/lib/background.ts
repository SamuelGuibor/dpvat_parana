import { waitUntil } from "@vercel/functions";

// Trabalho que pode terminar DEPOIS da resposta (aviso ao relay SSE, log de
// auditoria sem IA, tique azul na Meta) sem segurar o clique do atendente.
//
// Por que não uma promise solta: na Vercel a função pode ser congelada assim
// que responde, e o que ficou pendente se perde em silêncio (broadcast e log
// sumiam sem erro). O Next 14.2.35 não tem after()/unstable_after, e o
// contexto interno que ele usa para isso não é API pública. O waitUntil
// oficial do @vercel/functions estende a vida da função até a task acabar
// (teto = maxDuration da rota) e funciona em route handler e server action.
//
// Fora da Vercel (dev local, vitest, script) não há contexto de requisição e
// o waitUntil vira no-op: a task roda do mesmo jeito, só sem a garantia.
//
// NUNCA use para o que precisa estar gravado quando a tela recebe a resposta:
// log de `move` e histórico do card (createLog do kanban) e log de IA com
// metadata.usage continuam com await no caminho da ação.

/**
 * Dispara `task` na hora (sem await) e pede à Vercel para esperar por ela.
 * Nunca lança: erro síncrono ou rejeição viram `console.error("[BG] <label>")`.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  let pending: Promise<unknown>;
  try {
    pending = Promise.resolve(task());
  } catch (err) {
    // Task que lança antes de devolver a promise não pode derrubar a ação.
    pending = Promise.reject(err);
  }
  const guarded = pending.catch((err) => {
    console.error(`[BG] ${label}`, err);
  });
  try {
    waitUntil(guarded);
  } catch (err) {
    // Sem contexto válido o waitUntil só devolve undefined; o try é defesa
    // contra mudança de comportamento da lib — a task já está rodando.
    console.error(`[BG] waitUntil indisponível (${label})`, err);
  }
}
