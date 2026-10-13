import { db } from "./prisma";
import {
  buildBusinessMessagingEvent,
  eventsWereReceived,
  normalizePhone,
  sha256,
  type BusinessMessagingEventName,
} from "@/app/_shared/utils/meta-capi-payload";

// API de Conversões da Meta (CRM / Conversion Leads). Envia mudanças de estágio
// do funil (coluna do kanban / status do card) para o dataset configurado, para
// otimização de campanhas de leads por qualidade.
// Docs: https://developers.facebook.com/docs/marketing-api/conversions-api/guides/crm-integration
//
// Dois formatos convivem no mesmo dataset ("Novo CRM"):
// - CRM ("system_generated"): LeadQualificado / LeadNaoQualificado. Um público
//   de exclusão das campanhas depende do LeadNaoQualificado — não renomear.
// - Mensagens comerciais ("business_messaging"): LeadSubmitted e Purchase, com
//   id da WABA + ctwa_clid. É o que liga a conversão ao clique do anúncio
//   Click-to-WhatsApp (guia do gestor de tráfego, 13/10/2026). Só para quem
//   veio de anúncio (contato com ctwaClid); orgânico não entra.

const API_VERSION = "v25.0";
const DATASET_ID = process.env.META_DATASET_ID;
const ACCESS_TOKEN = process.env.META_CONVERSIONS_TOKEN;

/**
 * POST no dataset. Devolve true só quando a Meta confirmou o recebimento
 * (`events_received` ≥ 1) — quem chama só marca "enviado" nesse caso, para a
 * falha não sumir no dedupe (antes o estágio era gravado mesmo com erro e o
 * evento nunca era reenviado). Nunca lança.
 */
async function postEvents(data: Record<string, unknown>[], label: string): Promise<boolean> {
  if (!DATASET_ID || !ACCESS_TOKEN) return false; // integração desligada
  const payload = {
    data,
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
    const body = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(body);
    } catch {
      // corpo não-JSON: cai no erro abaixo
    }
    if (!res.ok || !eventsWereReceived(json)) {
      console.error(`[meta-conversions] Falha ao enviar "${label}": ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[meta-conversions] Erro de rede ao enviar "${label}":`, err);
    return false;
  }
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
 * falha vira console.error para não quebrar o fluxo do kanban. Devolve se a
 * Meta recebeu.
 */
export async function sendMetaCrmEvent(event: CrmLeadEvent): Promise<boolean> {
  if (!DATASET_ID || !ACCESS_TOKEN) return false; // integração desligada

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
  if (!userData.em && !userData.ph && !userData.lead_id && !userData.ctwa_clid) return false;

  return postEvents(
    [
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
    event.eventName,
  );
}

// Estágios do funil reportados à Meta. Mapeiam o desfecho da conversa
// (decidido pela IA ou pelo atendente) para o event_name do CRM.
export const META_LEAD_STAGES = {
  qualificado: "LeadQualificado",
  nao_qualificado: "LeadNaoQualificado",
  // Sub-motivos de não qualificado (dashboard) reportam o mesmo evento genérico.
  nq_sem_cobertura: "LeadNaoQualificado",
  nq_fora_prazo: "LeadNaoQualificado",
  nq_sem_lesao: "LeadNaoQualificado",
  nq_desistiu: "LeadNaoQualificado",
} as const;

/**
 * Reporta o estágio do lead à API de Conversões a partir do contato do
 * WhatsApp. Faz o dedupe (não reenvia o mesmo estágio) e registra no contato
 * o que foi enviado — só depois de a Meta confirmar. Qualificado também gera o
 * LeadSubmitted de mensagens comerciais (atribuição ao anúncio). Nunca lança.
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

    if (contact.metaLeadStage !== eventName) {
      const draft = (contact.clientDraft ?? {}) as Record<string, unknown>;
      const sent = await sendMetaCrmEvent({
        eventName,
        phone: contact.phone,
        email: typeof draft.email === "string" ? draft.email : null,
        firstName: contact.name,
        ctwaClid: contact.ctwaClid,
      });
      if (sent) {
        await db.whatsAppContact.update({
          where: { id: contactId },
          data: { metaLeadStage: eventName, metaLeadStageAt: new Date() },
        });
      }
    }

    if (closeCategory === "qualificado") await reportBusinessMessagingEvent(contactId, "LeadSubmitted");
  } catch (err) {
    console.error("[meta-conversions] Falha ao reportar estágio do lead:", err);
  }
}

// Coluna do contato que marca cada evento de mensagens comerciais já aceito.
const SENT_AT_FIELD = {
  LeadSubmitted: "metaLeadSubmittedAt",
  Purchase: "metaPurchaseAt",
} as const satisfies Record<BusinessMessagingEventName, string>;

/**
 * Envia LeadSubmitted (lead qualificado) ou Purchase (pasta fechada = tag
 * "Contratados") no formato de mensagens comerciais. No máximo um de cada por
 * contato; contato sem ctwaClid (orgânico) é ignorado. Nunca lança.
 */
export async function reportBusinessMessagingEvent(
  contactId: string,
  eventName: BusinessMessagingEventName,
): Promise<void> {
  const field = SENT_AT_FIELD[eventName];
  try {
    const contact = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: { phone: true, numberId: true, ctwaClid: true, metaLeadSubmittedAt: true, metaPurchaseAt: true },
    });
    if (!contact?.ctwaClid || contact[field]) return;

    // WABA do número que recebeu o clique (multi-número). Só o contato SEM
    // número (anterior ao multi-número) herda a WABA principal das envs:
    // número cadastrado sem wabaId não pode cair na principal — o evento
    // sairia com a WABA errada e a atribuição sumiria sem erro.
    const wabaId = contact.numberId
      ? (await db.whatsAppNumber.findUnique({ where: { id: contact.numberId }, select: { wabaId: true } }))?.wabaId
      : process.env.WHATSAPP_WABA_ID;
    if (!wabaId) {
      console.error(`[meta-conversions] ${eventName} sem WABA para o contato ${contactId}`);
      return;
    }

    const occurredAt = new Date();
    const sent = await postEvents(
      [buildBusinessMessagingEvent({ eventName, contactId, wabaId, ctwaClid: contact.ctwaClid, phone: contact.phone, occurredAt })],
      eventName,
    );
    if (sent) {
      await db.whatsAppContact.update({ where: { id: contactId }, data: { [field]: occurredAt } });
    }
  } catch (err) {
    console.error(`[meta-conversions] Falha ao reportar ${eventName}:`, err);
  }
}
