'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { requireTeam, type SessionPermissions } from '@/app/_shared/lib/permissions-server';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import { HIRED_TAG_NAME } from '@/app/_shared/lib/whatsapp/close-categories';

// Tags livres pra organizar conversas de WhatsApp (ex.: "Urgente", "VIP",
// "Recontato"), independente do status (fila/meus/bot/encerradas).

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

async function requireTeamMember(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (!me || !TEAM_ROLES.includes(me.role)) throw new Error('Sem permissão para o atendimento de WhatsApp.');
}

export interface WhatsAppTagDTO {
  id: string;
  name: string;
  color: string;
}

export async function listWhatsAppTags(): Promise<WhatsAppTagDTO[]> {
  await requireTeamMember();
  const tags = await db.whatsAppTag.findMany({ orderBy: { name: 'asc' } });
  return tags.map((t) => ({ id: t.id, name: t.name, color: t.color }));
}

export async function saveWhatsAppTag(input: { id?: string; name: string; color: string }): Promise<WhatsAppTagDTO> {
  await requireTeamMember();
  const name = input.name.trim();
  if (!name) throw new Error('Dê um nome à tag.');
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : '#10b981';

  const tag = input.id
    ? await db.whatsAppTag.update({ where: { id: input.id }, data: { name, color } })
    : await db.whatsAppTag.create({ data: { name, color } });
  return { id: tag.id, name: tag.name, color: tag.color };
}

export async function deleteWhatsAppTag(id: string): Promise<void> {
  await requireTeamMember();
  await db.whatsAppTag.delete({ where: { id } });
}

/**
 * Marca (`on=true`) ou desmarca uma tag numa conversa — idempotente.
 *
 * Por que não é mais um "toggle" (auditoria de 24/09/2026): o inbox aplica a
 * tag na hora (patch otimista) e o 2º clique rápido chegava ao servidor como
 * outro toggle, desfazendo a tag. Com o estado desejado explícito, repetir o
 * pedido não muda nada.
 *
 * - Marcar usa `skipDuplicates`: reaplicar uma tag que já existe NÃO recria a
 *   linha, então o `createdAt` (a data da aplicação, que o KPI "Contratados
 *   (bot)" filtra por mês) fica estável. Tirar e pôr de novo gera data nova, de
 *   propósito.
 * - Log `wa_tag_add`/`wa_tag_remove` só quando mudou de fato: é a trilha de
 *   quem pôs/tirou cada tag (não é purgável na retenção).
 * - Devolve as tags atuais da conversa, na ordem de aplicação (a mesma da
 *   lista), para o inbox trocar o estado otimista pela verdade do banco.
 */
export async function setConversationTag(
  conversationId: string,
  tagId: string,
  on: boolean,
): Promise<{ tags: WhatsAppTagDTO[]; changed: boolean }> {
  // Action nova: guard de permissions-server (lê o banco, aplica a trava de IP).
  const me = await requireTeam();
  return applyConversationTag(me, conversationId, tagId, on === true);
}

/**
 * @deprecated Mantido por UM deploy só para abas abertas com o bundle antigo
 * (o id da action continua existindo e o clique não quebra). O inbox atual usa
 * `setConversationTag`. REMOVER no deploy seguinte.
 */
export async function toggleConversationTag(conversationId: string, tagId: string): Promise<void> {
  const me = await requireTeam();
  const existing = await db.whatsAppConversationTag.findUnique({
    where: { conversationId_tagId: { conversationId, tagId } },
    select: { tagId: true },
  });
  await applyConversationTag(me, conversationId, tagId, !existing);
}

async function applyConversationTag(
  me: SessionPermissions,
  conversationId: string,
  tagId: string,
  on: boolean,
): Promise<{ tags: WhatsAppTagDTO[]; changed: boolean }> {
  if (typeof conversationId !== 'string' || !conversationId || typeof tagId !== 'string' || !tagId) {
    throw new Error('Conversa ou tag inválida.');
  }

  // Escrita e contexto do log em paralelo: nenhuma leitura depende da escrita.
  //
  // A escrita "toca" o updatedAt da conversa na MESMA transação: a lista do
  // inbox sincroniza por delta (loadConversationsSince), e REMOVER tag apaga
  // a linha de whatsapp_conversation_tags sem deixar rastro — sem o toque, as
  // outras abas só veriam na lista completa de 10 min. Tocar é seguro:
  // updatedAt da conversa não entra em métrica nenhuma (closedAt substituiu;
  // bot-funnel só o repassa no DTO). updateMany (e não update) para conversa
  // apagada no meio não virar erro.
  const [[write], conv, tag] = await Promise.all([
    db.$transaction([
      on
        ? db.whatsAppConversationTag.createMany({ data: [{ conversationId, tagId }], skipDuplicates: true })
        : db.whatsAppConversationTag.deleteMany({ where: { conversationId, tagId } }),
      db.whatsAppConversation.updateMany({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    ]),
    db.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { contactId: true, numberId: true, contact: { select: { name: true, phone: true } } },
    }),
    db.whatsAppTag.findUnique({ where: { id: tagId }, select: { name: true } }),
  ]);
  const changed = write.count > 0;

  const [rows] = await Promise.all([
    db.whatsAppConversationTag.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { tag: { select: { id: true, name: true, color: true } } },
    }),
    changed && conv
      ? logWhatsAppEvent({
        action: on ? 'wa_tag_add' : 'wa_tag_remove',
        message: `${on ? 'aplicou' : 'removeu'} a tag "${tag?.name ?? tagId}" ${on ? 'em' : 'de'} ${conv.contact?.name ?? conv.contact?.phone ?? 'contato'}`,
        authorId: me.userId,
        authorName: me.name ?? 'Atendente',
        contactId: conv.contactId,
        contactName: conv.contact?.name,
        contactPhone: conv.contact?.phone,
        numberId: conv.numberId,
        metadata: { tagId, tagName: tag?.name ?? null, conversationId },
      })
      : Promise.resolve(),
  ]);

  return { tags: rows.map((r) => r.tag), changed };
}

// KPI "Contratados (bot)" da Gestão Estratégica: conversas de WhatsApp com a
// tag "Contratados" (aplicada pela equipe no inbox). Conta SÓ essa tag — a
// tag "Qualificada" não vira contratado aqui. Não dá pra excluir quem tem as
// duas: o fluxo normal é qualificar primeiro e contratar depois, então todas
// as contratadas carregam também a de qualificada.
//
// Nome EXATO (HIRED_TAG_NAME, a mesma régua do funil em bot-funnel.ts): o
// `contains 'contratad'` de antes também contava a tag de churn "Contratado e
// perdido (churn)", e o card não batia com o funil (auditoria de 24/09/2026).
//
// Respeita o filtro de data do dashboard, como os outros KPIs — e como o
// número do CRM que entra junto na "Meta do mês (contratos)". No filtro
// padrão (mês corrente) as duas parcelas falam do mesmo período.
export async function getContratadosTagCount(fromISO?: string, toISO?: string): Promise<number> {
  // Guard da equipe lendo o banco (com a trava de IP): só sessão deixava o
  // cliente logado por CPF chamar a action.
  await requireTeam();

  const hired = await db.whatsAppTag.findUnique({ where: { name: HIRED_TAG_NAME }, select: { id: true } });
  if (!hired) return 0;

  const range = fromISO && toISO ? { gte: new Date(fromISO), lte: new Date(toISO) } : undefined;
  return db.whatsAppConversation.count({
    where: {
      tags: { some: { tagId: hired.id, ...(range ? { createdAt: range } : {}) } },
    },
  });
}
