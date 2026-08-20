import crypto from "crypto";
import { db } from "@/app/_shared/lib/prisma";

// Token público do link de assinatura.
//
// O link vai por WhatsApp e é aberto SEM login — então ele é o único segredo
// que protege o documento. Por isso: 32 bytes aleatórios (não sequencial, não
// derivado de id/telefone), validade curta e NENHUM dado pessoal na URL.

const TOKEN_TTL_DAYS = 7;

export function newSignatureToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function tokenExpiry(from = new Date()): Date {
  return new Date(from.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60_000);
}

/**
 * Base pública do site. Em produção vem do NEXTAUTH_URL (já configurado);
 * SIGNATURE_BASE_URL permite apontar pra outro domínio ou pro ngrok em teste.
 */
export function publicBaseUrl(): string {
  const raw =
    process.env.SIGNATURE_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export function signUrlFor(token: string): string {
  return `${publicBaseUrl()}/assinar/${token}`;
}

export function verifyUrlFor(token: string): string {
  return `${publicBaseUrl()}/verificar/${token}`;
}

export type TokenLookup =
  | { ok: true; request: NonNullable<Awaited<ReturnType<typeof findByToken>>> }
  | { ok: false; reason: "nao_encontrado" | "expirado" | "cancelado" };

function findByToken(token: string) {
  return db.signatureRequest.findUnique({
    where: { token },
    include: { contact: { select: { id: true, name: true, phone: true } } },
  });
}

/**
 * Carrega o ciclo pelo token do link, já classificando os casos em que a
 * página deve mostrar uma tela amigável em vez do documento.
 * Um ciclo JÁ ASSINADO continua acessível (o cliente baixa o PDF assinado).
 */
export async function loadByToken(token: string): Promise<TokenLookup> {
  if (!token || token.length < 20) return { ok: false, reason: "nao_encontrado" };

  const request = await findByToken(token);
  if (!request) return { ok: false, reason: "nao_encontrado" };

  if (["cancelado", "recusado"].includes(request.status)) {
    return { ok: false, reason: "cancelado" };
  }
  const jaAssinou = ["assinado", "validado"].includes(request.status);
  if (!jaAssinou && request.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expirado" };
  }
  return { ok: true, request };
}
