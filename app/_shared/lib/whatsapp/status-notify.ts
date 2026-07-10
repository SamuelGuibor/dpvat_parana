import { getStatusLabelsByService, getStatusOrderByService } from "@/app/nova-dash/card-dialog/constants";
import { sendSystemWhatsApp } from "./outbound";

// Notificação de PROGRESSO pro cliente: quando o checklist "Progressão de
// Status" do card avança, o cliente recebe no WhatsApp a etapa em que o
// processo está — mensagem própria do status, independente do que estiver
// escrito nas automações de coluna.
//
// Fora da janela de 24h a Meta só aceita template aprovado: configure o nome
// em WHATSAPP_STATUS_TEMPLATE (default "atualizacao_status"), com 2 variáveis
// no corpo: {{1}} = nome do cliente, {{2}} = etapa.

const STATUS_TEMPLATE_NAME = process.env.WHATSAPP_STATUS_TEMPLATE ?? "atualizacao_status";

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

    const labels = getStatusLabelsByService(params.service);
    const order = getStatusOrderByService(params.service);
    const label = labels[params.newStatus] ?? params.newStatus;
    const stepIndex = order.indexOf(params.newStatus);
    const progress = stepIndex >= 0 ? ` (etapa ${stepIndex + 1} de ${order.length})` : "";

    const firstName = (params.clientName ?? "").trim().split(/\s+/)[0] || "cliente";
    const text =
      `Olá, ${firstName}! 👋\n\n` +
      `Temos uma atualização do seu atendimento: seu processo avançou para a etapa *${label}*${progress}. ✅\n\n` +
      `Qualquer dúvida, é só responder por aqui. 😊`;

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
