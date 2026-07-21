import crypto from "crypto";
import { db } from "./prisma";

// API de Conversões da Meta (CRM / Conversion Leads). Envia mudanças de estágio
// do funil (coluna do kanban / status do card) para o dataset configurado, para
// otimização de campanhas de leads por qualidade.
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api/guides/crm-integration

const API_VERSION = "v25.0";
const DATASET_ID = process.env.META_DATASET_ID;
const ACCESS_TOKEN = process.env.META_CONVERSIONS_TOKEN;

// SHA-256 exigido pela Meta para dados de contato (minúsculo, sem espaços).
function sha256(value: string) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// Telefone no formato E.164 sem "+": só dígitos, com DDI 55 se faltar.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export interface CrmLeadEvent {
  /** Nome do estágio do funil (ex.: "Lead", "Qualificado", "Fechamento"). */
  eventName: string;
  email?: string | null;
  phone?: string | null;
  phoneSecondary?: string | null;
  /** lead_id da Meta (15-17 dígitos), quando o lead veio de Lead Ads. */
  leadId?: string | null;
  /** Click id do anúncio Click-to-WhatsApp (capturado no referral do webhook). */
  ctwaClid?: string | null;
  firstName?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

/**
 * Envia um evento de estágio de CRM para a API de Conversões. Nunca lança:
 * falha vira console.error para não quebrar o fluxo do kanban.
 */
export async function sendMetaCrmEvent(event: CrmLeadEvent): Promise<void> {
  if (!DATASET_ID || !ACCESS_TOKEN) return; // integração desligada

  const userData: Record<string, unknown> = {};
  if (event.email) userData.em = [sha256(event.email)];

  const phones = [event.phone, event.phoneSecondary]
    .map((p) => (p ? normalizePhone(p) : null))
    .filter((p): p is string => Boolean(p))
    .map(sha256);
  if (phones.length) userData.ph = phones;

  if (event.leadId && /^\d{15,17}$/.test(event.leadId)) {
    userData.lead_id = Number(event.leadId);
  }
  if (event.ctwaClid) userData.ctwa_clid = event.ctwaClid; // NÃO é hasheado
  if (event.firstName) userData.fn = [sha256(event.firstName.split(" ")[0])];
  if (event.city) userData.ct = [sha256(event.city.replace(/\s/g, ""))];
  if (event.state) userData.st = [sha256(event.state)];
  if (event.zipCode) userData.zp = [sha256(event.zipCode.replace(/\D/g, ""))];

  // Sem nenhum identificador a Meta rejeita o evento; não vale a chamada.
  if (!userData.em && !userData.ph && !userData.lead_id && !userData.ctwa_clid) return;

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "system_generated",
        user_data: userData,
        custom_data: {
          event_source: "crm",
          lead_event_source: "Seguros Paraná CRM",
        },
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_TEST_EVENT_CODE }
      : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${DATASET_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`[meta-conversions] Falha ao enviar "${event.eventName}": ${res.status} ${body}`);
    }
  } catch (err) {
    console.error("[meta-conversions] Erro de rede:", err);
  }
}

// Estágios do funil reportados à Meta. Mapeiam o desfecho da conversa
// (decidido pela IA ou pelo atendente) para o event_name do CRM.
export const META_LEAD_STAGES = {
  qualificado: "LeadQualificado",
  nao_qualificado: "LeadNaoQualificado",
} as const;

/**
 * Reporta o estágio do lead à API de Conversões a partir do contato do
 * WhatsApp. Faz o dedupe (não reenvia o mesmo estágio) e registra no contato
 * o que foi enviado. Fire-and-forget: nunca lança, nunca bloqueia o fluxo.
 */
export async function reportLeadStageToMeta(
  contactId: string,
  closeCategory: string,
): Promise<void> {
  const eventName = META_LEAD_STAGES[closeCategory as keyof typeof META_LEAD_STAGES];
  if (!eventName) return; // perguntas/transferido/etc. não são estágio de funil

  try {
    const contact = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: { phone: true, name: true, ctwaClid: true, metaLeadStage: true, clientDraft: true },
    });
    if (!contact) return;
    if (contact.metaLeadStage === eventName) return; // já reportado

    const draft = (contact.clientDraft ?? {}) as Record<string, unknown>;
    await sendMetaCrmEvent({
      eventName,
      phone: contact.phone,
      email: typeof draft.email === "string" ? draft.email : null,
      firstName: contact.name,
      ctwaClid: contact.ctwaClid,
    });

    await db.whatsAppContact.update({
      where: { id: contactId },
      data: { metaLeadStage: eventName, metaLeadStageAt: new Date() },
    });
  } catch (err) {
    console.error("[meta-conversions] Falha ao reportar estágio do lead:", err);
  }
}
