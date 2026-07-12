import {
  getStatusLabelsByService,
  getStatusOrderByService,
  statusServiceKey,
} from "@/app/nova-dash/card-dialog/constants";
import { db } from "@/app/_shared/lib/prisma";
import { sendSystemWhatsApp } from "./outbound";

// Notificação de PROGRESSO pro cliente: quando o checklist "Progressão de
// Status" do card avança, o cliente recebe no WhatsApp a etapa em que o
// processo está — mensagem própria do status, independente do que estiver
// escrito nas automações de coluna.
//
// O texto de cada etapa pode ser customizado/desligado por serviço na aba
// "Progresso" do card (tabela status_message_configs). Sem config, usa o texto
// padrão abaixo.
//
// Fora da janela de 24h a Meta só aceita template aprovado: configure o nome
// em WHATSAPP_STATUS_TEMPLATE (default "atualizacao_status"), com 2 variáveis
// no corpo: {{1}} = nome do cliente, {{2}} = etapa. (O texto customizado só
// vale DENTRO da janela — fora dela a Meta exige o template aprovado.)

const STATUS_TEMPLATE_NAME = process.env.WHATSAPP_STATUS_TEMPLATE ?? "atualizacao_status";

function firstNameOf(clientName: string | null | undefined): string {
  return (clientName ?? "").trim().split(/\s+/)[0] || "cliente";
}

/** Primeira etapa "de N": texto de progresso ex.: " (etapa 3 de 7)". */
function progressSuffix(service: string | null | undefined, newStatus: string): string {
  const order = getStatusOrderByService(service);
  const stepIndex = order.indexOf(newStatus);
  return stepIndex >= 0 ? ` (etapa ${stepIndex + 1} de ${order.length})` : "";
}

/** Texto PADRÃO da mensagem de progresso (usado quando não há texto custom). */
export function defaultStatusMessage(
  service: string | null | undefined,
  newStatus: string,
  clientName: string | null | undefined,
): string {
  const labels = getStatusLabelsByService(service);
  const label = labels[newStatus] ?? newStatus;
  const firstName = firstNameOf(clientName);
  return (
    `Olá, ${firstName}!\n\n` +
    `Temos uma atualização do seu atendimento: seu processo avançou para a etapa *${label}*${progressSuffix(service, newStatus)}.\n\n` +
    `Qualquer dúvida, é só responder por aqui.`
  );
}

/** Aplica os placeholders {nome} e {etapa} num texto customizado. */
export function renderCustomStatusMessage(
  template: string,
  service: string | null | undefined,
  newStatus: string,
  clientName: string | null | undefined,
): string {
  const labels = getStatusLabelsByService(service);
  const label = labels[newStatus] ?? newStatus;
  return template
    .replaceAll("{nome}", firstNameOf(clientName))
    .replaceAll("{etapa}", label);
}

/**
 * Resolve o texto efetivo (custom ou padrão) e se o envio está habilitado para
 * um dado serviço/status. Fonte única usada tanto pelo envio real quanto pela
 * pré-visualização na UI.
 */
export async function resolveStatusMessage(params: {
  service: string | null | undefined;
  status: string;
  clientName: string | null | undefined;
}): Promise<{ enabled: boolean; text: string; isCustom: boolean }> {
  const key = statusServiceKey(params.service);
  const config = await db.statusMessageConfig.findUnique({
    where: { serviceKey_status: { serviceKey: key, status: params.status } },
  });
  const enabled = config?.enabled ?? true;
  const custom = config?.customText?.trim() || null;
  const text = custom
    ? renderCustomStatusMessage(custom, params.service, params.status, params.clientName)
    : defaultStatusMessage(params.service, params.status, params.clientName);
  return { enabled, text, isCustom: !!custom };
}

export async function notifyStatusProgress(params: {
  phone: string | null | undefined;
  clientName: string | null | undefined;
  service: string | null | undefined;
  newStatus: string;
  authorId: string;
  authorName: string;
}): Promise<void> {
  try {
    const phone = (params.phone ?? "").trim();
    if (!phone) return;

    const { enabled, text } = await resolveStatusMessage({
      service: params.service,
      status: params.newStatus,
      clientName: params.clientName,
    });
    // Aviso desligado para esta etapa (config da aba Progresso) → não envia.
    if (!enabled) {
      console.info(`[PROGRESSO] Aviso de status desativado para ${statusServiceKey(params.service)}/${params.newStatus} — envio pulado.`);
      return;
    }

    const labels = getStatusLabelsByService(params.service);
    const label = labels[params.newStatus] ?? params.newStatus;
    const firstName = firstNameOf(params.clientName);

    const result = await sendSystemWhatsApp({
      phone,
      clientName: params.clientName ?? null,
      text,
      templateName: STATUS_TEMPLATE_NAME,
      templateVars: [firstName, label],
      authorId: params.authorId,
      authorName: params.authorName,
      source: "progress",
    });
    if (!result.sent) {
      console.warn(`[PROGRESSO] WhatsApp de status não enviado: ${result.reason}`);
    }
  } catch (err) {
    // Nunca quebra a atualização do card por causa da notificação.
    console.error("[PROGRESSO] Falha ao notificar status via WhatsApp:", err);
  }
}
