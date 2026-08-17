'use server';

import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { createLog } from '@/app/_shared/lib/log';
import { summarizeConversationToCard } from '@/app/_shared/lib/whatsapp/assist';
import { hashPassword } from '@/app/_shared/lib/password';
import { reportLeadStageToMeta } from '@/app/_shared/lib/meta-conversions';

// Ficha do cliente dentro do atendimento de WhatsApp.
//
// O vínculo contato ↔ cliente é pelo telefone: se já existe um User com o
// mesmo número, a ficha lê/edita direto o cadastro. Se não existe, os campos
// ficam salvos como rascunho na conversa (whatsapp_contacts.clientDraft) até
// alguém clicar em "Adicionar cliente", que cria o User de verdade.

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

// Campos editáveis pela ficha (subset do User relevante pro atendimento).
const CLIENT_FIELDS = [
  'name', 'cpf', 'rg', 'email', 'data_nasc', 'data_acidente',
  'estado_civil', 'profissao', 'nome_mae', 'cidade', 'estado',
  'rua', 'bairro', 'numero', 'cep', 'hospital', 'lesoes', 'obs',
  // Preenchidos só quando o cliente informa por conta própria (o bot não pede).
  'telefone_secundario', 'rede_social',
] as const;

export type ClientInfoFields = Partial<Record<(typeof CLIENT_FIELDS)[number], string | null>>;

function sanitizeFields(input: ClientInfoFields): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of CLIENT_FIELDS) {
    if (!(key in input)) continue;
    const v = input[key];
    out[key] = typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  return out;
}

export interface ClientInfoResult {
  registered: boolean;
  userId: string | null;
  phone: string;
  cardNumber: number | null;
  fields: ClientInfoFields;
  /** Campos preenchidos pela IA (ganham selo na ficha até alguém editar). */
  aiFields: string[];
  /** Hospital citado pelo cliente — a IA nunca preenche o select. */
  hospitalHint: string | null;
}

/**
 * Procura um User pelo telefone do contato (últimos 8 dígitos + conferência
 * de DDD em JS) — cobre diferenças de máscara e o 9º dígito do celular.
 */
async function findUserByPhone(phone: string): Promise<{ id: string } | null> {
  const digits = phone.replace(/\D/g, '');
  const last8 = digits.slice(-8);
  if (last8.length < 8) return null;

  const rows = await db.$queryRaw<{ id: string; telefone: string | null; telefone_secundario: string | null }[]>(
    Prisma.sql`
      SELECT id, telefone, telefone_secundario FROM "User"
      WHERE right(regexp_replace(coalesce(telefone, ''), '\\D', '', 'g'), 8) = ${last8}
         OR right(regexp_replace(coalesce(telefone_secundario, ''), '\\D', '', 'g'), 8) = ${last8}
      LIMIT 5
    `,
  );
  if (!rows.length) return null;

  // DDD do contato (formato Meta: 55 + DDD + número). Se algum candidato
  // bater o DDD também, prefere ele; senão fica com o primeiro dos 8 dígitos.
  const ddd = digits.startsWith('55') ? digits.slice(2, 4) : digits.slice(0, 2);
  const withDdd = rows.find((r) =>
    [r.telefone, r.telefone_secundario].some((t) => {
      const d = (t ?? '').replace(/\D/g, '');
      const dd = d.startsWith('55') ? d.slice(2, 4) : d.slice(0, 2);
      return d.slice(-8) === last8 && dd === ddd;
    }),
  );
  return withDdd ?? rows[0];
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

/** Carrega a ficha: do User vinculado (cadastrado) ou do rascunho da conversa. */
export async function getClientInfo(contactId: string): Promise<ClientInfoResult> {
  await requireTeamMember();

  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');

  // Resolve o vínculo: userId já salvo ou match por telefone (e memoriza).
  let userId = contact.userId;
  if (!userId) {
    const found = await findUserByPhone(contact.phone);
    if (found) {
      userId = found.id;
      await db.whatsAppContact.update({ where: { id: contactId }, data: { userId } });
      // Acabou de VINCULAR a conversa a um card → resumo automático do
      // histórico vira comentário no card (best-effort, nunca quebra a ficha).
      const me = await requireTeamMember();
      await summarizeConversationToCard(contactId, { userId }, me);
    }
  }

  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: Object.fromEntries([...CLIENT_FIELDS, 'cardNumber'].map((f) => [f, true])) as Record<string, true>,
    });
    if (user) {
      const u = user as unknown as Record<string, string | null> & { cardNumber?: number | null };
      const fields: ClientInfoFields = {};
      for (const key of CLIENT_FIELDS) fields[key] = u[key] ?? null;
      // Contato vinculado a um card → o nome do cadastro é o nome oficial. O
      // contato nasce com o apelido do perfil do WhatsApp, que é o que o bot e
      // a lista do inbox usam; alinha aqui para o cliente parar de ser chamado
      // pelo apelido depois de a equipe ter corrigido o nome no card.
      const cardName = u.name?.trim();
      if (cardName && cardName !== contact.name) {
        await db.whatsAppContact.update({ where: { id: contactId }, data: { name: cardName } });
      }
      return {
        registered: true,
        userId,
        phone: contact.phone,
        cardNumber: u.cardNumber ?? null,
        fields,
        aiFields: aiFieldList(contact.aiFilledFields),
        hospitalHint: contact.hospitalHint ?? null,
      };
    }
    // User apontado não existe mais → limpa o vínculo e cai pro rascunho.
    await db.whatsAppContact.update({ where: { id: contactId }, data: { userId: null } });
  }

  const draft = (contact.clientDraft ?? {}) as ClientInfoFields;
  return {
    registered: false,
    userId: null,
    phone: contact.phone,
    cardNumber: null,
    fields: { name: contact.name ?? null, ...draft },
    aiFields: aiFieldList(contact.aiFilledFields),
    hospitalHint: contact.hospitalHint ?? null,
  };
}

/** Lista de campos marcados como preenchidos pela IA (whatsapp_contacts). */
function aiFieldList(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.keys(raw as Record<string, unknown>);
}

/**
 * Salva a ficha: atualiza o cadastro se o contato já tem User vinculado,
 * senão guarda como rascunho da conversa.
 */
export async function saveClientInfo(contactId: string, input: ClientInfoFields): Promise<ClientInfoResult> {
  await requireTeamMember();

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

  return getClientInfo(contactId);
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
    await migrateDraftDocuments(contact, existing.id);
    await db.whatsAppContact.update({
      where: { id: contactId },
      data: { userId: existing.id, clientDraft: Prisma.DbNull },
    });
    // Vinculou ao cadastro existente → resumo da conversa no card.
    await summarizeConversationToCard(contactId, { userId: existing.id }, me);
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

  await migrateDraftDocuments(contact, user.id);

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
  // como primeiro comentário (best-effort).
  await summarizeConversationToCard(contactId, { userId: user.id }, me);

  // Entrou no kanban = lead qualificado de fato → devolve pra Meta (API de
  // Conversões). O dedupe evita duplicar se a IA/atendente já reportou.
  void reportLeadStageToMeta(contactId, 'qualificado');

  return getClientInfo(contactId);
}

/** Move os documentos anexados como rascunho na conversa pro cadastro real do cliente. */
async function migrateDraftDocuments(
  contact: { id: string; draftDocuments: unknown },
  userId: string,
): Promise<void> {
  const drafts = (contact.draftDocuments as { key: string; name: string }[]) ?? [];
  if (!drafts.length) return;
  await db.document.createMany({
    data: drafts.map((d) => ({ userId, key: d.key, name: d.name })),
  });
  await db.whatsAppContact.update({ where: { id: contact.id }, data: { draftDocuments: Prisma.DbNull } });
}
