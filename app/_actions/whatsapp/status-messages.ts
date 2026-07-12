"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { db } from "../../_shared/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  getStatusOrderByService,
  getStatusLabelsByService,
  statusServiceKey,
} from "../../nova-dash/card-dialog/constants";
import {
  defaultStatusMessage,
  renderCustomStatusMessage,
  notifyStatusProgress,
} from "../../_shared/lib/whatsapp/status-notify";
import { isWindowOpen } from "../../_shared/lib/whatsapp/outbound";

// Server actions da aba "Progresso" do card para GERENCIAR as mensagens
// automáticas de progressão de status enviadas ao cliente no WhatsApp:
//   - listar (com texto efetivo, padrão e se está ligada) por serviço
//   - salvar texto custom / ligar-desligar por etapa
//   - estado da janela de 24h do card (texto livre x template)
//   - reenviar manualmente a mensagem da etapa atual

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Usuário não autenticado.");
  return session;
}

export interface StatusMessageRow {
  status: string;
  label: string;
  defaultText: string;
  customText: string | null;
  effectiveText: string;
  enabled: boolean;
}

/**
 * Lista as mensagens de todas as etapas de um serviço, já resolvendo o texto
 * efetivo (custom ou padrão). `clientName` é opcional só para a pré-visualização
 * ficar com o nome real do cliente do card.
 */
export async function listStatusMessages(
  service: string | null | undefined,
  clientName?: string | null,
): Promise<{ serviceKey: string; rows: StatusMessageRow[] }> {
  await requireSession();

  const serviceKey = statusServiceKey(service);
  const order = getStatusOrderByService(service);
  const labels = getStatusLabelsByService(service);

  const configs = await db.statusMessageConfig.findMany({ where: { serviceKey } });
  const byStatus = new Map(configs.map((c) => [c.status, c]));

  const rows: StatusMessageRow[] = order.map((status) => {
    const config = byStatus.get(status);
    const custom = config?.customText?.trim() || null;
    const defaultText = defaultStatusMessage(service, status, clientName);
    const effectiveText = custom
      ? renderCustomStatusMessage(custom, service, status, clientName)
      : defaultText;
    return {
      status,
      label: labels[status] ?? status,
      defaultText,
      customText: config?.customText ?? null,
      effectiveText,
      enabled: config?.enabled ?? true,
    };
  });

  return { serviceKey, rows };
}

/** Salva (upsert) o texto custom e/ou o liga-desliga de uma etapa. */
export async function saveStatusMessage(input: {
  service: string | null | undefined;
  status: string;
  enabled: boolean;
  customText: string | null;
}): Promise<void> {
  await requireSession();
  const serviceKey = statusServiceKey(input.service);
  const customText = input.customText?.trim() ? input.customText.trim() : null;

  await db.statusMessageConfig.upsert({
    where: { serviceKey_status: { serviceKey, status: input.status } },
    update: { enabled: input.enabled, customText },
    create: { serviceKey, status: input.status, enabled: input.enabled, customText },
  });
}

/**
 * Estado da janela de 24h da Meta para o telefone do card (somente leitura, não
 * cria contato). Aberta = pode texto livre; fechada = só template aprovado.
 */
export async function getCardWindowState(
  phone: string | null | undefined,
): Promise<{ contactFound: boolean; windowOpen: boolean }> {
  await requireSession();
  const digits = (phone ?? "").replace(/\D/g, "");
  const last8 = digits.slice(-8);
  if (last8.length < 8) return { contactFound: false, windowOpen: false };

  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "whatsapp_contacts"
    WHERE right(regexp_replace(phone, '\\D', '', 'g'), 8) = ${last8}
    LIMIT 1
  `);
  if (!rows.length) return { contactFound: false, windowOpen: false };

  const windowOpen = await isWindowOpen(rows[0].id);
  return { contactFound: true, windowOpen };
}

/** Reenvia manualmente, sob demanda, a mensagem da etapa atual do card. */
export async function resendStatusMessage(input: {
  phone: string | null | undefined;
  clientName: string | null | undefined;
  service: string | null | undefined;
  status: string;
}): Promise<void> {
  const session = await requireSession();
  await notifyStatusProgress({
    phone: input.phone,
    clientName: input.clientName,
    service: input.service,
    newStatus: input.status,
    authorId: session.user.id,
    authorName: session.user.name ?? "Usuário",
  });
}
