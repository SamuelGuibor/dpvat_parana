// Espera até reabrir o EventSource do relay SSE (useChatStream, use-chat.ts).
//
// O retry era fixo em 3 s. Com CORS (ALLOWED_ORIGIN), segredo ou relay errado o
// EventSource falha de novo na hora, e cada aba aberta pedia /api/chat/token
// ~20 vezes por minuto para sempre (auditoria de 24/09/2026). Dobrando a espera
// a cada falha seguida, o loop cai para 1 pedido por minuto por aba; quem zera
// a contagem é a conexão que abre, então uma queda isolada (deploy do relay,
// rede) ainda volta em 3 s. O polling cobre a lista e a thread nesse meio-tempo.
const SSE_RETRY_BASE_MS = 3_000;
const SSE_RETRY_MAX_MS = 60_000;

/**
 * Espera antes da próxima tentativa, dado o nº de falhas seguidas (começa em
 * 1): 3 s, 6 s, 12 s, 24 s, 48 s e daí a cada 60 s.
 */
export function sseReconnectDelayMs(failures: number): number {
  const n = Number.isFinite(failures) && failures >= 1 ? Math.floor(failures) : 1;
  return Math.min(SSE_RETRY_MAX_MS, SSE_RETRY_BASE_MS * 2 ** Math.min(n - 1, 10));
}
