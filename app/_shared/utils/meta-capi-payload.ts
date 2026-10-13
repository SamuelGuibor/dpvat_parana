import crypto from "crypto";

// Montagem dos eventos da API de Conversões da Meta (puro, testável). O envio
// e o controle do que já foi mandado ficam em app/_shared/lib/meta-conversions.ts.

/** SHA-256 exigido pela Meta para dados de contato (minúsculo, sem espaços). */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/** Telefone no formato E.164 sem "+": só dígitos, com DDI 55 se faltar. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

// Valor de uma pasta fechada para a otimização das campanhas — combinado com o
// gestor de tráfego no guia de rastreio de 13/10/2026 (R$ 1.500 por contrato).
export const META_PURCHASE_VALUE_BRL = 1500;

// Eventos de mensagens comerciais (Click-to-WhatsApp). Só nomes da lista
// padrão da Meta para action_source "business_messaging" — nome customizado
// não está documentado lá, por isso LeadQualificado/LeadNaoQualificado seguem
// no formato CRM ("system_generated").
export type BusinessMessagingEventName = "LeadSubmitted" | "Purchase";

export interface BusinessMessagingEventInput {
  eventName: BusinessMessagingEventName;
  contactId: string;
  /** WABA do número que recebeu o clique (multi-número: nunca um id fixo). */
  wabaId: string;
  /** Exatamente o valor gravado do referral, sem alteração. */
  ctwaClid: string;
  phone?: string | null;
  /** Momento em que o evento aconteceu no CRM (não o do envio). */
  occurredAt: Date;
}

/**
 * Evento no formato de mensagens comerciais: é o que liga a conversão ao
 * clique do anúncio. `page_id` (Messenger) no lugar do id da WABA faz a Meta
 * aceitar o evento sem atribuir. `event_id` fixo por contato+evento: reenvio
 * vira duplicado descartado pela Meta (no máximo 1 LeadSubmitted e 1 Purchase
 * por contato).
 */
export function buildBusinessMessagingEvent(input: BusinessMessagingEventInput): Record<string, unknown> {
  const userData: Record<string, unknown> = {
    whatsapp_business_account_id: input.wabaId,
    ctwa_clid: input.ctwaClid, // NÃO é hasheado
  };
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (phone) userData.ph = [sha256(phone)];

  return {
    event_name: input.eventName,
    // Segundos Unix (milissegundos fazem a Meta recusar por data).
    event_time: Math.floor(input.occurredAt.getTime() / 1000),
    event_id: `${input.contactId}-${input.eventName === "Purchase" ? "purchase" : "lead"}`,
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: userData,
    ...(input.eventName === "Purchase"
      ? { custom_data: { value: META_PURCHASE_VALUE_BRL, currency: "BRL" } }
      : {}),
  };
}

/** A Meta só aceitou o lote se devolveu `events_received` ≥ 1. */
export function eventsWereReceived(body: unknown): boolean {
  const n = (body as { events_received?: unknown } | null)?.events_received;
  return typeof n === "number" && n >= 1;
}
