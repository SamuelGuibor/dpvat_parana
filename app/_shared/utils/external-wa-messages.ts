// Regras puras da API externa de mensagens do WhatsApp (T-WOJYR):
// leitura dos parâmetros, autor de cada mensagem e limpeza do `interactive`.
// A rota (app/api/external/whatsapp/messages/route.ts) só faz banco e S3.

import { normalizePhoneBR, phoneVariantsBR } from "./phone-variants";
import { parseInteractive, type WaFormField } from "./wa-forms";

export const EXTERNAL_MESSAGES_DEFAULT_LIMIT = 100;
export const EXTERNAL_MESSAGES_MAX_LIMIT = 500;

export interface ExternalMessagesQuery {
  /** Telefone normalizado (55 + DDD + número). */
  phone: string;
  /** Formas gravadas possíveis (com/sem o 9º dígito), mesmo DDD. */
  variants: string[];
  limit: number;
  before: Date | null;
  after: Date | null;
  numberId: string | null;
  /** messages=0 → só os dados da conversa. */
  withMessages: boolean;
  /** includeMedia=1 → URL assinada do S3 em cada mídia. */
  includeMedia: boolean;
}

function parseDate(raw: string | null): Date | null | undefined {
  if (raw == null || raw === "") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Lê a query; erro = texto do 400. */
export function parseExternalMessagesQuery(
  params: URLSearchParams,
): { ok: true; query: ExternalMessagesQuery } | { ok: false; error: string } {
  const rawPhone = params.get("phone")?.trim();
  if (!rawPhone) return { ok: false, error: "Parâmetro phone obrigatório (ex.: 5541999999999)." };
  const phone = normalizePhoneBR(rawPhone);
  const variants = phone ? phoneVariantsBR(phone) : [];
  if (!phone || !variants.length) {
    return { ok: false, error: "phone inválido: use 55 + DDD + número (12 ou 13 dígitos)." };
  }

  const before = parseDate(params.get("before"));
  const after = parseDate(params.get("after"));
  if (before === undefined) return { ok: false, error: "before inválido: use data ISO 8601 (ex.: 2026-11-18T15:00:00.000Z)." };
  if (after === undefined) return { ok: false, error: "after inválido: use data ISO 8601 (ex.: 2026-11-18T15:00:00.000Z)." };

  const n = Math.trunc(Number(params.get("limit")));
  const limit = Number.isFinite(n) && n >= 1 ? Math.min(n, EXTERNAL_MESSAGES_MAX_LIMIT) : EXTERNAL_MESSAGES_DEFAULT_LIMIT;

  const numberId = params.get("numberId")?.trim() || null;
  if (numberId && !/^[a-z0-9]{1,40}$/i.test(numberId)) return { ok: false, error: "numberId inválido." };

  return {
    ok: true,
    query: {
      phone,
      variants,
      limit,
      before,
      after,
      numberId,
      withMessages: params.get("messages") !== "0",
      includeMedia: params.get("includeMedia") === "1",
    },
  };
}

export type ExternalMessageAuthor = "cliente" | "bot" | "equipe" | "sistema";

/**
 * Quem escreveu: recebida = cliente; enviada por um membro (authorId) =
 * equipe; pelo cérebro = bot; o resto (automação do kanban, progresso,
 * cobrança, recuperação) = sistema. authorId vem antes de sentByBot, como na
 * bolha do inbox.
 */
export function externalMessageAuthor(m: {
  direction: string;
  sentByBot: boolean;
  authorId: string | null;
}): ExternalMessageAuthor {
  if (m.direction === "in") return "cliente";
  if (m.authorId) return "equipe";
  if (m.sentByBot) return "bot";
  return "sistema";
}

export type PublicInteractive =
  | { kind: "flow"; flowName: string; cta: string; header: string | null; footer: string | null }
  | { kind: "flow_reply"; flowName: string | null; fields: WaFormField[] };

/**
 * `interactive` (formulário do WhatsApp) só com o que o cliente viu ou
 * respondeu. Lista do que PODE sair, não do que sai: o envio guarda também o
 * `token` do Flow, ids internos (formVersionId, metaFlowId) e o `queueReason`
 * (motivo do cérebro para a nota da Fila), que não são da conversa.
 */
export function publicInteractive(value: unknown): PublicInteractive | null {
  const it = parseInteractive(value);
  if (!it) return null;
  if (it.kind === "flow") {
    return { kind: "flow", flowName: it.flowName, cta: it.cta, header: it.header ?? null, footer: it.footer ?? null };
  }
  return { kind: "flow_reply", flowName: it.flowName, fields: it.fields };
}
