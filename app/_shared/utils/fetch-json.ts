// Leitura de JSON das rotas da equipe no navegador (SWR e chamadas avulsas).
//
// Por que existe (auditoria de 24/09/2026): o fetcher antigo da thread fazia
// `r.json()` sem olhar o status, e um 401/403/500 chegava como `{ error }` e
// era guardado pelo SWR como DADO — a thread esvaziava ou quebrava em
// `data.messages.length`. Aqui resposta não-ok LANÇA: o SWR guarda o erro,
// mantém o último dado bom na tela e a UI mostra o aviso.
//
// Módulo puro (sem React): tests/fetch-json.test.ts.

/** Resposta HTTP não-ok. `serverError` é o `{ error }` que a rota devolveu, se houver. */
export class HttpError extends Error {
  readonly status: number;
  readonly serverError: string | null;

  constructor(status: number, message: string, serverError: string | null = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.serverError = serverError;
  }
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let serverError: string | null = null;
    try {
      const body: unknown = await res.json();
      const err = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
      if (typeof err === "string" && err.trim()) serverError = err;
    } catch {
      // corpo vazio ou HTML (erro não tratado da função, página do proxy)
    }
    throw new HttpError(res.status, serverError ?? (res.statusText || `HTTP ${res.status}`), serverError);
  }
  return (await res.json()) as T;
}

/** GET sem cache; lança `HttpError` se a resposta não for 2xx. Serve de fetcher do SWR. */
export async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  return readJsonResponse<T>(res);
}

/** POST com corpo JSON; lança `HttpError` se a resposta não for 2xx. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return readJsonResponse<T>(res);
}

/**
 * Texto para o atendente. 401 = sessão vencida (o middleware barrou antes da
 * rota); com `{ error }` da rota, ele mesmo (ex.: "Acesso à dashboard
 * permitido apenas pela internet do escritório."); falha de rede do fetch
 * (TypeError) = sem conexão; o resto, genérico em português — nunca o
 * "Internal Server Error" cru.
 */
export function describeFetchError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Sua sessão expirou. Recarregue a página (F5) e entre de novo.";
    if (err.serverError) return err.serverError;
    return `Falha ao carregar (erro ${err.status}). Tente de novo.`;
  }
  if (err instanceof TypeError) return "Sem conexão com o servidor. Confira a internet.";
  return "Falha ao carregar. Tente de novo.";
}

// Teto da espera entre tentativas de um poll com erro. O padrão do SWR dobra
// até ~21 min (5 s × 2^8) — e, com erro guardado, o refreshInterval NÃO busca
// (swr 2.3.8), então só essa tentativa traz a thread de volta.
const POLL_RETRY_BASE_MS = 5_000;
const POLL_RETRY_MAX_MS = 30_000;

/**
 * Espera até a próxima tentativa de um poll que falhou (`retryCount` começa
 * em 1), ou `null` para parar: 401 é sessão vencida e tentar de novo não
 * resolve (o foco da aba ainda revalida). Rede, 5xx e 403 da trava de IP
 * (atendente trocou de rede com a aba aberta) voltam a tentar: 5 s, 10 s,
 * 20 s e daí a cada 30 s.
 */
export function pollRetryDelayMs(err: unknown, retryCount: number): number | null {
  if (err instanceof HttpError && err.status === 401) return null;
  const n = Number.isFinite(retryCount) && retryCount >= 1 ? Math.floor(retryCount) : 1;
  return Math.min(POLL_RETRY_MAX_MS, POLL_RETRY_BASE_MS * 2 ** Math.min(n - 1, 10));
}
