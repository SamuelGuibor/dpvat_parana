import { randomUUID } from "crypto";
import { db } from "@/app/_shared/lib/prisma";
import { recordMentions } from "@/app/_shared/lib/mention-inbox";

/**
 * Tarefas por setor — central de roteamento das tarefas automáticas do sistema
 * (bot da IA, webhook do BotConversa…) para a Caixa de Menções e Tarefas.
 *
 * COMO DAR MANUTENÇÃO: cada tipo de tarefa aponta para o slug de um setor
 * (os setores são criados na aba Setores do Espaço de Trabalho — o slug é o
 * mesmo que se digita no @menção). Para rotear uma tarefa nova:
 *
 *   1. adicione o tipo em SectorTaskKind e a linha no SECTOR_TASK_ROUTES;
 *   2. chame recordSectorTask({ kind, ... }) na origem do evento.
 *
 * Se o setor do slug não existir (ou existir sem ninguém), a tarefa NÃO se
 * perde: cai no broadcast para os ADMIN* (comportamento antigo), só sem a
 * etiqueta de setor. Basta criar o setor e colocar as pessoas nele que as
 * próximas tarefas já chegam certas.
 */
export type SectorTaskKind = "wa_lead_qualificado" | "botconversa_contratado";

const SECTOR_TASK_ROUTES: Record<SectorTaskKind, { sectorSlug: string }> = {
  // Lead qualificado pela IA no WhatsApp → criar card + enviar contrato.
  wa_lead_qualificado: { sectorSlug: "comercial" },
  // Webhook do BotConversa com evento "contratado".
  botconversa_contratado: { sectorSlug: "comercial" },
};

const FALLBACK_ROLES = ["ADMIN", "ADMIN+", "ADMIN++"];

interface SectorTaskInput {
  kind: SectorTaskKind;
  /** Nome exibido como autor ("Bot WhatsApp", "BotConversa"). */
  authorName: string;
  source: "whatsapp" | "botconversa";
  text: string;
  targetName: string;
  /** WhatsApp: contactId da conversa (abre direto no inbox). */
  channelId?: string | null;
}

/**
 * Cria a tarefa na caixa de todo mundo do setor responsável. Best-effort como
 * o recordMentions: nunca derruba o fluxo que a disparou.
 */
export async function recordSectorTask({
  kind,
  authorName,
  source,
  text,
  targetName,
  channelId = null,
}: SectorTaskInput): Promise<void> {
  try {
    const { sectorSlug } = SECTOR_TASK_ROUTES[kind];
    const sector = await db.sector.findUnique({
      where: { slug: sectorSlug },
      select: { id: true, name: true, users: { select: { id: true } } },
    });

    let recipientIds = sector?.users.map((u) => u.id) ?? [];
    if (recipientIds.length === 0) {
      const team = await db.user.findMany({
        where: { role: { in: FALLBACK_ROLES } },
        select: { id: true },
      });
      recipientIds = team.map((u) => u.id);
    }

    await recordMentions({
      recipientIds,
      authorId: null,
      authorName,
      source,
      text,
      targetName,
      channelId,
      // Mesmo no fallback a etiqueta do setor é mantida (se ele existir):
      // a tarefa continua agrupada no lugar certo da caixa.
      sectorId: sector?.id ?? null,
      sectorName: sector?.name ?? null,
      // A tarefa é UMA só: as cópias compartilham o groupId e quem der vazão
      // primeiro resolve para o setor inteiro (mention-actions.ts).
      groupId: randomUUID(),
    });
  } catch (err) {
    console.error(`[SECTOR TASKS] Falha ao criar a tarefa "${kind}":`, err);
  }
}
