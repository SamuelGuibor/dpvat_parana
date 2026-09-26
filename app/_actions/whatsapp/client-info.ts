'use server';

import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { createLog } from '@/app/_shared/lib/log';
import { summarizeConversationToCard } from '@/app/_shared/lib/whatsapp/assist';
import { hashPassword } from '@/app/_shared/lib/password';
import { reportLeadStageToMeta } from '@/app/_shared/lib/meta-conversions';
import { runAfterResponse } from '@/app/_shared/lib/background';
import {
  CLIENT_FIELDS, findUserByPhone, loadClientInfo, migrateDraftDocuments,
} from '@/app/_shared/lib/whatsapp/copilot-data';
import type { ClientInfoFields, ClientInfoResult } from '@/app/_shared/lib/whatsapp/copilot-types';

// Ficha do cliente dentro do atendimento de WhatsApp: as MUTAÇÕES (salvar a
// ficha, "Adicionar cliente") e o atalho "Abrir conversa" do card.
//
// A LEITURA da ficha (com o vínculo pelo telefone, o resumo no card e a
// migração dos rascunhos de documento) mora em
// app/_shared/lib/whatsapp/copilot-data.ts, e o inbox a lê junto com os
// documentos por GET /api/whatsapp/inbox/copilot/<contactId>, fora da fila
// serial de server actions. Os tipos moram em copilot-types.ts.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

async function requireTeamMember(): Promise<{ id: string; name: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true },
  });
  if (!me || !TEAM_ROLES.includes(me.role)) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
  return { id: me.id, name: me.name ?? 'Atendente' };
}

/**
 * Contato de WhatsApp de um card/User — atalho "Abrir conversa" do CardDialog.
 * Vínculo direto (contact.userId) ou match por telefone (últimos 8 dígitos).
 */
export async function findWhatsAppContactForCard(userId: string): Promise<string | null> {
  await requireTeamMember();

  // Só vale contato COM conversa: o inbox abre conversas, e contato sem
  // conversa (211 no banco, ex.: criados na ficha sem nunca trocar mensagem)
  // deixava o inbox parado no "Selecione uma conversa" — parecia bug do botão.
  const linked = await db.whatsAppContact.findFirst({
    where: { userId, conversation: { isNot: null } },
    select: { id: true },
  });
  if (linked) return linked.id;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { telefone: true, telefone_secundario: true },
  });
  if (!user) return null;

  for (const phone of [user.telefone, user.telefone_secundario]) {
    const last8 = (phone ?? '').replace(/\D/g, '').slice(-8);
    if (last8.length < 8) continue;
    const contact = await db.whatsAppContact.findFirst({
      where: { phone: { endsWith: last8 }, conversation: { isNot: null } },
      select: { id: true },
    });
    if (contact) return contact.id;
  }
  return null;
}

/**
 * @deprecated bundle antigo: a ficha vem junto com os documentos de GET
 * /api/whatsapp/inbox/copilot/<contactId>. Fica por UM deploy só para as abas
 * abertas com o bundle antigo (que ainda chamam esta action pelo id); no
 * deploy seguinte, remover se ficar sem uso (npx knip).
 */
export async function getClientInfo(contactId: string): Promise<ClientInfoResult> {
  const ctx = await requireTeam();
  return loadClientInfo(contactId, { id: ctx.userId, name: ctx.name ?? 'Atendente' });
}

function sanitizeFields(input: ClientInfoFields): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of CLIENT_FIELDS) {
    if (!(key in input)) continue;
    const v = input[key];
    out[key] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return out;
}

/**
 * Salva a ficha: atualiza o cadastro se o contato já tem User vinculado,
 * senão guarda como rascunho da conversa.
 */
export async function saveClientInfo(contactId: string, input: ClientInfoFields): Promise<ClientInfoResult> {
  const me = await requireTeamMember();

  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');

  const fields = sanitizeFields(input);

  // Valores atuais, para saber o que o humano REALMENTE mudou: campo editado
  // na mão perde o selo de "preenchido pela IA".
  const before: Record<string, string | null> = contact.userId
    ? (((await db.user.findUnique({
      where: { id: contact.userId },
      select: Object.fromEntries(CLIENT_FIELDS.map((f) => [f, true])) as Record<string, true>,
    })) ?? {}) as unknown as Record<string, string | null>)
    : ((contact.clientDraft ?? {}) as Record<string, string | null>);

  const marks = { ...((contact.aiFilledFields ?? {}) as Record<string, string>) };
  let marksChanged = false;
  for (const [key, value] of Object.entries(fields)) {
    if (!(key in marks)) continue;
    if ((before[key] ?? null) !== value) {
      delete marks[key];
      marksChanged = true;
    }
  }

  if (contact.userId) {
    // Email é unique no User — não sobrescreve com null pra não quebrar login.
    const data = { ...fields };
    if (!data.email) delete data.email;
    await db.user.update({ where: { id: contact.userId }, data });
    if (fields.name) {
      await db.whatsAppContact.update({ where: { id: contactId }, data: { name: fields.name } });
    }
  } else {
    await db.whatsAppContact.update({
      where: { id: contactId },
      data: { clientDraft: fields, ...(fields.name ? { name: fields.name } : {}) },
    });
  }

  // Escolheu o hospital no select → a dica da IA cumpriu o papel e sai.
  const clearHint = !!fields.hospital && !!contact.hospitalHint;
  if (marksChanged || clearHint) {
    await db.whatsAppContact.update({
      where: { id: contactId },
      data: {
        ...(marksChanged ? { aiFilledFields: marks as Prisma.InputJsonValue } : {}),
        ...(clearHint ? { hospitalHint: null } : {}),
      },
    });
  }

  return loadClientInfo(contactId, me);
}

/**
 * "Adicionar cliente": cria o User com os dados da ficha (mesmo padrão do
 * webhook do Botconversa — label da primeira coluna, cardNumber da sequence)
 * e vincula o contato. O rascunho é apagado.
 */
export async function addClientFromConversation(contactId: string, input: ClientInfoFields): Promise<ClientInfoResult> {
  const me = await requireTeamMember();

  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');
  if (contact.userId) throw new Error('Este contato já está vinculado a um cliente.');

  const fields = sanitizeFields(input);
  if (!fields.name) throw new Error('Preencha ao menos o nome do cliente.');

  // Evita duplicar: se apareceu um cadastro com esse telefone, só vincula.
  const existing = await findUserByPhone(contact.phone);
  if (existing) {
    // Mesmo vínculo atômico da leitura da ficha (copilot-data.ts): se outra
    // aba vinculou pelo telefone no meio, ela já migrou os rascunhos e pediu
    // o resumo.
    const link = await db.whatsAppContact.updateMany({
      where: { id: contactId, userId: null },
      data: { userId: existing.id, clientDraft: Prisma.DbNull },
    });
    if (link.count === 1) {
      await migrateDraftDocuments(contactId, existing.id);
      // Vinculou ao cadastro existente → resumo da conversa no card, depois
      // da resposta (mesmo motivo da leitura da ficha: a IA segurava a fila).
      runAfterResponse('resumo de vínculo', () =>
        summarizeConversationToCard(contactId, { userId: existing.id }, me));
    }
    // Vincular a um card também conta como lead qualificado pra Meta.
    void reportLeadStageToMeta(contactId, 'qualificado');
    return saveClientInfo(contactId, input);
  }

  const [label, seq] = await Promise.all([
    db.label.findFirst({ where: { order: 0 }, select: { id: true } }),
    db.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('card_number_seq') AS nextval`),
  ]);
  const cardNumber = Number(seq[0].nextval);

  const email = fields.email ?? `inserir_email-${contact.phone}@gmail.com`;
  const rest = { ...fields };
  delete rest.email;

  const user = await db.user.create({
    data: {
      ...rest,
      email,
      telefone: contact.phone,
      role: 'Filtro de Cartões',
      password: await hashPassword('segurosparana1'),
      cardNumber,
      // Card já nasce na primeira etapa do fluxo (igual ao "criar card"
      // normal), SEM notificar o cliente — a notificação de progresso só
      // dispara em MUDANÇA de status (update-users), nunca na criação.
      // Antes nascia sem etapa e a marcação manual da etapa 1 disparava o
      // "seu processo avançou para Processo iniciado" indevido.
      service: 'INSS',
      status: 'INSS_S1',
      statusStartedAt: new Date(),
      ...(label && { labelId: label.id }),
    },
  });

  await migrateDraftDocuments(contactId, user.id);

  // Criação de card pela ficha do WhatsApp também conta em "Criações".
  await createLog({
    action: 'create',
    message: 'criou o card (pela ficha do WhatsApp)',
    authorId: me.id,
    authorName: me.name,
    userId: user.id,
  });

  await db.whatsAppContact.update({
    where: { id: contactId },
    data: { userId: user.id, clientDraft: Prisma.DbNull, ...(fields.name ? { name: fields.name } : {}) },
  });

  // Card recém-criado a partir da conversa → resumo automático do histórico
  // como primeiro comentário (best-effort, depois da resposta: o card e a
  // ficha aparecem sem esperar a IA).
  runAfterResponse('resumo de vínculo', () =>
    summarizeConversationToCard(contactId, { userId: user.id }, me));

  // Entrou no kanban = lead qualificado de fato → devolve pra Meta (API de
  // Conversões). O dedupe evita duplicar se a IA/atendente já reportou.
  void reportLeadStageToMeta(contactId, 'qualificado');

  return loadClientInfo(contactId, me);
}
