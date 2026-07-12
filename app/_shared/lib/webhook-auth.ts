import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// Autenticação de webhooks externos (BotConversa, Trello…) por shared secret.
// O chamador envia o segredo no header "x-webhook-secret" ou em "?secret=".
//
// Compatibilidade: enquanto a env correspondente NÃO estiver configurada, o
// endpoint continua aberto (só loga aviso) — assim nada quebra até você criar
// o segredo na Vercel e colar o mesmo valor no painel do serviço externo.

export function verifyWebhookSecret(req: NextRequest, envName: string): boolean {
  const secret = process.env[envName];
  if (!secret) {
    console.warn(
      `[WEBHOOK] ${envName} não configurado — endpoint aceitando chamadas SEM autenticação. ` +
        `Defina a env e configure o mesmo valor no serviço externo para fechar o acesso.`,
    );
    return true;
  }

  const provided =
    req.headers.get("x-webhook-secret") ?? req.nextUrl.searchParams.get("secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
