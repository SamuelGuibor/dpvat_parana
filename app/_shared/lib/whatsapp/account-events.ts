import { createLog } from "@/app/_shared/lib/log";

// Eventos ADMINISTRATIVOS da WhatsApp Cloud API (tudo que não é "messages"):
// violação de política (account_update), restrições, nota de qualidade do
// número, aprovação/pausa de template etc. A Meta envia esses webhooks junto
// com o e-mail de aviso — antes deste módulo o endpoint descartava tudo sem
// rastro, e a única evidência da violação era o e-mail genérico.
//
// Destino: log de auditoria (action "wa_account") + payload cru no console
// (Vercel logs). A "Saúde da conta" do ChatbotDashboard (Visão do Gestor) lê
// esses logs — decisão de produto: painel do gestor, não sino da equipe.
//
// Política: NUNCA quebra o webhook (falha aqui é só console.error).

const META_AUTHOR_ID = "whatsapp-meta";
const META_AUTHOR_NAME = "Meta / WhatsApp";

type Value = Record<string, unknown>;

/** Gravidade do evento — o dashboard usa pra cor/ícone sem re-interpretar o payload. */
export type AccountEventSeverity = "critical" | "warning" | "ok" | "info";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function severityOf(field: string, value: Value): AccountEventSeverity {
  const event = (str(value.event) ?? "").toUpperCase();
  switch (field) {
    case "account_update": {
      const hasTrouble =
        !!value.violation_info || !!value.ban_info ||
        (Array.isArray(value.restriction_info) && value.restriction_info.length > 0) ||
        /VIOLATION|DISABLED|RESTRICTION|BAN|LOCK/.test(event);
      return hasTrouble ? "critical" : "info";
    }
    case "account_alerts":
      return "warning";
    case "account_review_update":
      return event === "APPROVED" || str(value.decision)?.toUpperCase() === "APPROVED" ? "ok" : "warning";
    case "phone_number_quality_update":
      if (/FLAGGED|DOWNGRADE|RED/.test(event)) return "warning";
      if (/UNFLAGGED|UPGRADE/.test(event)) return "ok";
      return "info";
    case "message_template_status_update":
      if (/REJECTED|PAUSED|DISABLED/.test(event)) return "warning";
      if (event === "APPROVED") return "ok";
      return "info";
    case "message_template_quality_update": {
      const score = (str(value.new_quality_score) ?? "").toUpperCase();
      if (score === "RED" || score === "YELLOW") return "warning";
      if (score === "GREEN") return "ok";
      return "info";
    }
    default:
      return "info";
  }
}

/** Resumo legível (pt-BR) por tipo de evento; cai num dump compacto se o formato for desconhecido. */
export function describeEvent(field: string, value: Value): string {
  switch (field) {
    case "account_update": {
      const parts: string[] = [];
      const event = str(value.event);
      if (event) parts.push(`evento: ${event}`);
      const violation = value.violation_info as Value | undefined;
      if (violation && str(violation.violation_type)) parts.push(`violação: ${violation.violation_type}`);
      const restrictions = Array.isArray(value.restriction_info) ? (value.restriction_info as Value[]) : [];
      for (const r of restrictions) {
        parts.push(`restrição: ${str(r.restriction_type) ?? "?"}${str(r.expiration) ? ` até ${r.expiration}` : ""}`);
      }
      const ban = value.ban_info as Value | undefined;
      if (ban && str(ban.waba_ban_state)) parts.push(`ban: ${ban.waba_ban_state}`);
      return parts.length
        ? `Atualização da conta WhatsApp Business — ${parts.join(" | ")}`
        : `Atualização da conta WhatsApp Business (${compact(value)})`;
    }
    case "account_alerts":
      return `Alerta da Meta na conta WhatsApp Business (${compact(value)})`;
    case "account_review_update":
      return `Revisão da conta WhatsApp Business: ${str(value.decision) ?? compact(value)}`;
    case "phone_number_quality_update": {
      const parts: string[] = [];
      if (str(value.event)) parts.push(`evento: ${value.event}`);
      if (str(value.current_limit)) parts.push(`limite de envio: ${value.current_limit}`);
      if (str(value.display_phone_number)) parts.push(`número: ${value.display_phone_number}`);
      return `Qualidade do número WhatsApp mudou — ${parts.join(" | ") || compact(value)}`;
    }
    case "message_template_status_update": {
      const name = str(value.message_template_name) ?? "?";
      const event = str(value.event) ?? "?";
      const reason = str(value.reason);
      return `Template "${name}": ${event}${reason && reason !== "NONE" ? ` (motivo: ${reason})` : ""}`;
    }
    case "message_template_quality_update": {
      const name = str(value.message_template_name) ?? "?";
      return `Qualidade do template "${name}": ${str(value.previous_quality_score) ?? "?"} → ${str(value.new_quality_score) ?? "?"}`;
    }
    case "security":
      return `Evento de segurança na conta WhatsApp Business (${compact(value)})`;
    case "phone_number_name_update":
      return `Nome de exibição do número: ${str(value.decision) ?? compact(value)}`;
    default:
      return `Evento "${field}" da conta WhatsApp Business (${compact(value)})`;
  }
}

/** JSON compacto e truncado — cabe num resumo sem poluir. */
function compact(value: Value): string {
  try {
    const json = JSON.stringify(value);
    return json.length > 300 ? json.slice(0, 300) + "…" : json;
  } catch {
    return "payload não serializável";
  }
}

/**
 * Processa um change de webhook que NÃO é "messages". Sempre loga o payload
 * cru no console (fica nos logs da Vercel para investigação posterior).
 */
export async function handleAccountEvent(field: string, value: Value | undefined): Promise<void> {
  try {
    console.log(`[WHATSAPP ACCOUNT] Evento "${field}":`, JSON.stringify(value ?? null));
    if (!value) return;

    await createLog({
      action: "wa_account",
      message: describeEvent(field, value),
      authorId: META_AUTHOR_ID,
      authorName: META_AUTHOR_NAME,
      metadata: { field, severity: severityOf(field, value), value },
    });
  } catch (err) {
    console.error(`[WHATSAPP ACCOUNT] Falha ao processar evento "${field}":`, err);
  }
}
