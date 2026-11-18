// Token de SISTEMA EXTERNO para as rotas /api/external/* (T-WOJYR).
//
// Servidor a servidor, sem cookie do NextAuth: o sistema de fora manda
// `Authorization: Bearer crmapi_...`. No banco (api_tokens) fica só o sha256;
// o claro aparece uma vez, ao gerar (scripts/gerar-token-api.mjs, que repete
// o prefixo e o hash daqui). Revogar = gravar revokedAt pelo mesmo script.
//
// Diferente do token do operador (op/auth.ts): não é de uma pessoa e não tem
// permissão por ferramenta; quem tem o token lê o que a rota expõe. Por isso a
// rota escolhe a dedo os campos (nada de segredo da linha, CPF, ficha da IA).
//
// Token na query NUNCA: a URL vai para o log de acesso da Vercel.

import { createHash, randomBytes } from "crypto";
import { db } from "./prisma";
import { rateLimit } from "./rate-limit";
import { runAfterResponse } from "./background";

export const API_TOKEN_PREFIX = "crmapi_";

/** lastUsedAt só é regravado depois deste intervalo (evita 1 UPDATE por chamada). */
const LAST_USED_TOUCH_MS = 5 * 60_000;

/** Limite por token (uso normal) e por IP (chute de token), por minuto. */
export const API_TOKEN_RATE_PER_MIN = 60;
const API_IP_RATE_PER_MIN = 120;

/**
 * Falha de autenticação/limite. Token ausente, inválido e revogado dão o MESMO
 * 401 com o mesmo texto: quem chuta token não aprende se acertou um revogado.
 */
export class ApiAuthError extends Error {
  constructor(
    public status: 401 | 429,
    message: string,
  ) {
    super(message);
    this.name = "ApiAuthError";
  }
}

const UNAUTHORIZED = "Token da API ausente, inválido ou revogado.";

export interface ApiTokenContext {
  tokenId: string;
  label: string;
}

export function generateApiToken(): string {
  return API_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** "Bearer crmapi_..." → token; qualquer outra coisa (inclusive token do operador) → null. */
export function parseApiBearer(header: string | null | undefined): string | null {
  const m = header?.match(/^Bearer\s+(\S+)\s*$/i);
  if (!m || !m[1].startsWith(API_TOKEN_PREFIX)) return null;
  return m[1];
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "desconhecido";
}

/** Lê o Bearer, aplica o limite e confere o hash no banco. Lança ApiAuthError. */
export async function resolveApiToken(req: Request): Promise<ApiTokenContext> {
  // IP primeiro: sem isso, cada token chutado ganharia um balde novo.
  if (!rateLimit(`api-ip:${clientIp(req)}`, API_IP_RATE_PER_MIN, 60_000)) {
    throw new ApiAuthError(429, "Muitas requisições. Espere um minuto.");
  }
  const token = parseApiBearer(req.headers.get("authorization"));
  if (!token) throw new ApiAuthError(401, UNAUTHORIZED);
  const tokenHash = hashApiToken(token);
  if (!rateLimit(`api:${tokenHash}`, API_TOKEN_RATE_PER_MIN, 60_000)) {
    throw new ApiAuthError(429, "Muitas requisições. Espere um minuto.");
  }

  const row = await db.apiToken.findUnique({
    where: { tokenHash },
    select: { id: true, label: true, revokedAt: true, lastUsedAt: true },
  });
  if (!row || row.revokedAt) throw new ApiAuthError(401, UNAUTHORIZED);

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_TOUCH_MS) {
    runAfterResponse("api_token_last_used", () =>
      db.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }),
    );
  }
  return { tokenId: row.id, label: row.label };
}
