// Decisões das guardas das rotas da equipe (quem usa é
// app/_shared/lib/route-auth.ts). Puras — sem Next, sem banco — para o
// tests/route-guards.test.ts.
//
// Por que existem (auditoria de 24/09/2026): as leituras do inbox estão saindo
// das server actions (fila serial por aba: o clique do atendente esperava o
// poll terminar) para route handlers GET. Numa rota o texto do erro chega à UI
// (a action mascara em produção), então o status tem que separar "sem acesso"
// de "o banco falhou": erro transitório do Neon não pode virar "Acesso
// restrito à equipe".

/**
 * Recusa de acesso (sem sessão de equipe, fora da internet do escritório, sem
 * a permissão). Continua sendo `Error` para quem já faz `catch` das actions.
 */
export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessError";
  }
}

/**
 * `instanceof` e, de reserva, o `name`: cada rota é um bundle próprio do Next,
 * e uma cópia duplicada do módulo faria o `instanceof` falhar em silêncio
 * (a recusa viraria 500).
 */
export function isAccessError(err: unknown): err is AccessError {
  return err instanceof AccessError || (err instanceof Error && err.name === "AccessError");
}

/** Texto da rota quando a falha NÃO é de acesso (banco, rede, bug). */
export const ROUTE_FAILURE_MESSAGE = "Falha ao carregar. Tente de novo.";

export interface GuardFailure {
  status: 403 | 500;
  error: string;
}

/** Erro da guarda → resposta: recusa de acesso = 403 com o motivo; o resto = 500 genérico. */
export function guardFailure(err: unknown): GuardFailure {
  if (isAccessError(err)) {
    return { status: 403, error: err.message || "Acesso restrito à equipe." };
  }
  return { status: 500, error: ROUTE_FAILURE_MESSAGE };
}

/**
 * POST vindo do próprio site: o host do `Origin` bate com o host que o
 * navegador pediu. Atrás do proxy da Vercel esse host chega em
 * `x-forwarded-host` (o `host` pode ser o interno), e é o mesmo critério que o
 * Next usa para server actions. Sem `Origin` (ou `"null"`, de sandbox/arquivo)
 * = recusa: todo navegador atual manda Origin em POST.
 */
export function isSameOrigin(
  origin: string | null | undefined,
  forwardedHost: string | null | undefined,
  host: string | null | undefined,
): boolean {
  if (!origin || origin === "null") return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  // Proxy encadeado pode mandar "a, b": vale o primeiro (o do navegador).
  const expected = forwardedHost?.split(",")[0]?.trim() || host?.trim() || "";
  if (!expected) return false;
  return originHost.toLowerCase() === expected.toLowerCase();
}
