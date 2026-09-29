import { db } from "@/app/_shared/lib/prisma";
import { TEAM_ROLES, resolvePermissions } from "@/app/_shared/lib/permissions";
import { isManager } from "@/app/_shared/lib/managers";
import { reportCriticalError } from "@/app/_shared/lib/report-error";
import { WA_QUEUE_SECTOR_SLUG, sectorRecipientIds } from "@/app/_shared/lib/sector-tasks";
import { createTtlCache } from "@/app/_shared/utils/ttl-cache";
import { ownerSectorRecipients, type AlertAudience } from "@/app/_shared/utils/alert-policy";
import { resolveConversationOwner } from "./ownership";

// Quem recebe cada aviso do WhatsApp no sino (auditoria de 24/09/2026, EF-10):
// dono → setor da Fila → equipe → gestores. A política (qual audiência em qual
// degrau) é pura, em app/_shared/utils/alert-policy.ts; aqui só se resolve cada
// audiência no banco. Sem "use server": chamado pelo bot, pela ingestão e pelo
// cron, nunca pelo navegador. `whatsappRecipients` mora aqui (e é reexportada
// por service.ts) para que service.ts use este módulo sem import circular.

const TEAM_ROLE_LIST: string[] = [...TEAM_ROLES];

// A equipe muda raramente, e esta lista era 1 query em TODO evento (mensagem
// recebida, envio, nota, reação, notificação do bot/cron). 60 s por instância:
// membro novo fica sem tempo real por até 1 min e o removido ainda recebe o
// broadcast por até 1 min (o relay continua exigindo o token de sessão dele).
const RECIPIENTS_TTL_MS = 60_000;
const recipientsCache = createTtlCache<"team", string[]>({ ttlMs: RECIPIENTS_TTL_MS });

/** Todos os membros da equipe (ADMIN*): broadcast do relay e avisos da equipe inteira. */
export async function whatsappRecipients(): Promise<string[]> {
  const cached = recipientsCache.get("team");
  // Cópia: quem chama pode mexer no array (menções, loops de notificação).
  if (cached) return [...cached];
  const team = await db.user.findMany({
    where: { role: { in: TEAM_ROLE_LIST } },
    select: { id: true },
  });
  const ids = team.map((u) => u.id);
  recipientsCache.set("team", ids);
  return [...ids];
}

/**
 * Quem tem a Visão do Gestor, lido do banco (não do JWT): a permissão
 * `manager_dashboard` resolvida como em `getSessionPermissions` (padrão do
 * cargo + overrides em User.permissions) OU a allowlist MANAGER_EMAILS.
 */
async function managerRecipientIds(): Promise<string[]> {
  const team = await db.user.findMany({
    where: { role: { in: TEAM_ROLE_LIST } },
    select: { id: true, email: true, role: true, permissions: true },
  });
  return team
    .filter((u) => resolvePermissions(u.role, u.permissions).manager_dashboard || isManager(u.email))
    .map((u) => u.id);
}

export interface AlertRecipientsInput {
  contactId: string;
  audience: AlertAudience;
  /** assignedToId atual: ponto de partida do dono pegajoso (resolveConversationOwner). */
  assignedToId?: string | null;
  /**
   * Dono já resolvido pelo chamador (fila do bot, alerta de entrega). `null` =
   * sabidamente sem dono; `undefined` = resolver aqui.
   */
  ownerId?: string | null;
}

/**
 * Destinatários do aviso. Nunca lança nem devolve menos do que devia por erro:
 * na falha o aviso vai para a equipe inteira (melhor sobrar do que o lead ficar
 * sem ninguém avisado) e o erro fica no Log critical_error. Gestor sem ninguém
 * resolvido também cai na equipe.
 */
export async function waAlertRecipients(input: AlertRecipientsInput): Promise<string[]> {
  const { contactId, audience } = input;
  try {
    if (audience === "team") return await whatsappRecipients();
    if (audience === "managers") {
      const managers = await managerRecipientIds();
      return managers.length ? managers : await whatsappRecipients();
    }
    const ownerId = input.ownerId !== undefined
      ? input.ownerId
      : await resolveConversationOwner(contactId, input.assignedToId);
    // O setor só é consultado quando entra na conta (sem dono, ou dono + setor).
    const sector = audience === "owner_or_sector" && ownerId ? [] : await sectorRecipientIds(WA_QUEUE_SECTOR_SLUG);
    return ownerSectorRecipients(audience, ownerId, sector);
  } catch (err) {
    await reportCriticalError("WHATSAPP destinatários do aviso", err, { contactId });
    return whatsappRecipients().catch(() => []);
  }
}
