'use server';

import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { inferCategory } from '@/app/_shared/lib/document-categories';
import { createLog } from '@/app/_shared/lib/log';
import { summarizeConversationToCard } from '@/app/_shared/lib/whatsapp/assist';
import { hashPassword } from '@/app/_shared/lib/password';
import { reportLeadStageToMeta } from '@/app/_shared/lib/meta-conversions';
import { runAfterResponse } from '@/app/_shared/lib/background';
import { parseDraftDocuments, planDraftMigration } from '@/app/_shared/utils/draft-documents';

// Ficha do cliente dentro do atendimento de WhatsApp.
//
// O vínculo contato ↔ cliente é pelo telefone: se já existe um User com o
// mesmo número, a ficha lê/edita direto o cadastro. Se não existe, os campos
// ficam salvos como rascunho na conversa (whatsapp_contacts.clientDraft) até
// alguém clicar em "Adicionar cliente", que cria o User de verdade. Os
// documentos do rascunho (draftDocuments) viram Document do card em qualquer
// vínculo: pelo telefone (getClientInfo) ou pelo "Adicionar cliente".

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
  /**
   * A conversa acabou de ser vinculada ao card pelo telefone nesta chamada.
   * A aba Arquivos pode ter carregado antes (ainda como rascunho): o inbox
   * dispara 'wa-docs-changed' para ela recarregar com os documentos do card.
   */
  justLinked?: boolean;
  /** Rascunhos de documento que viraram Document do card nesta chamada. */
  migratedDrafts?: number;
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
  const me = await requireTeamMember();

  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');

  // Resolve o vínculo: userId já salvo ou match por telefone (e memoriza).
  let userId = contact.userId;
  let justLinked = false;
  if (!userId) {
    const found = await findUserByPhone(contact.phone);
    if (found) {
      // Vínculo atômico: duas abas abrindo a mesma conversa juntas só vinculam
      // (e resumem) uma vez. Quem perde a corrida segue como cadastrado, sem
      // resumo novo, com o vínculo que ficou gravado.
      const link = await db.whatsAppContact.updateMany({
        where: { id: contactId, userId: null },
        data: { userId: found.id },
      });
      if (link.count === 1) {
        userId = found.id;
        justLinked = true;
        // Acabou de VINCULAR a conversa a um card → resumo automático do
        // histórico vira comentário no card. Sai do caminho da resposta: o
        // Next 14 serializa as server actions da aba, então a ficha, os links
        // das mídias e o envio esperavam os 2-4 s da IA. runAfterResponse usa
        // o waitUntil: a Vercel não congela a função antes de o resumo gravar
        // o comentário e o log wa_summary com metadata.usage (a IA já foi paga
        // no micro; sem o log o gasto sumia do Canto da IA).
        runAfterResponse('resumo de vínculo', () =>
          summarizeConversationToCard(contactId, { userId: found.id }, me));
      } else {
        const fresh = await db.whatsAppContact.findUnique({
          where: { id: contactId },
          select: { userId: true },
        });
        userId = fresh?.userId ?? null;
      }
    }
  }

  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: Object.fromEntries([...CLIENT_FIELDS, 'cardNumber'].map((f) => [f, true])) as Record<string, true>,
    });
    if (user) {
      // Documento anexado na ficha antes de o card existir: vira arquivo do
      // card no vínculo de agora e, para contato vinculado com rascunho preso
      // (vínculo por telefone antigo não migrava), na próxima abertura. O
      // parse evita abrir transação em toda abertura sem rascunho.
      const migratedDrafts = parseDraftDocuments(contact.draftDocuments).length
        ? await migrateDraftDocuments(contactId, userId)
        : 0;
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
        ...(justLinked ? { justLinked } : {}),
        ...(migratedDrafts ? { migratedDrafts } : {}),
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
    // Mesmo vínculo atômico do getClientInfo: se outra aba vinculou pelo
    // telefone no meio, ela já migrou os rascunhos e pediu o resumo.
    const link = await db.whatsAppContact.updateMany({
      where: { id: contactId, userId: null },
      data: { userId: existing.id, clientDraft: Prisma.DbNull },
    });
    if (link.count === 1) {
      await migrateDraftDocuments(contactId, existing.id);
      // Vinculou ao cadastro existente → resumo da conversa no card, depois
      // da resposta (mesmo motivo do getClientInfo: a IA segurava a fila).
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

  return getClientInfo(contactId);
}

/**
 * Move os documentos anexados como rascunho na conversa pro cadastro real do
 * cliente. Devolve quantos rascunhos saíram do contato (0 = nada a migrar,
 * outra chamada já migrou, ou falhou).
 *
 * Reivindica o rascunho numa transação com a linha do contato travada (FOR
 * UPDATE): duas abas abrindo a mesma conversa, ou a ficha e o "Adicionar
 * cliente" juntos, esperam uma pela outra, e a segunda já lê o rascunho vazio.
 * Ler o JSON fora da trava deixava as duas criarem os mesmos documentos.
 *
 * Best-effort: se falhar, a transação desfaz tudo (o rascunho continua lá) e a
 * próxima abertura da conversa tenta de novo; a ficha nunca quebra por isso.
 */
async function migrateDraftDocuments(contactId: string, userId: string): Promise<number> {
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ draftDocuments: unknown }[]>(Prisma.sql`
        SELECT "draftDocuments" FROM whatsapp_contacts WHERE id = ${contactId} FOR UPDATE
      `);
      const drafts = parseDraftDocuments(rows[0]?.draftDocuments);
      if (!drafts.length) return 0;

      // Sem filtro de deletedAt de propósito: key na lixeira do card também
      // conta (é restaurada em vez de ganhar uma 2ª linha). Uma linha por key
      // para o mesmo arquivo não aparecer duas vezes na aba Arquivos do card.
      const existing = await tx.document.findMany({
        where: { userId, key: { in: drafts.map((d) => d.key) } },
        select: { id: true, key: true, deletedAt: true },
      });
      const plan = planDraftMigration(drafts, existing);

      if (plan.create.length) {
        await tx.document.createMany({
          data: plan.create.map((d) => ({ userId, key: d.key, name: d.name, category: inferCategory(d.name) })),
        });
      }
      if (plan.restoreIds.length) {
        await tx.document.updateMany({
          where: { id: { in: plan.restoreIds } },
          data: { deletedAt: null, deletedBy: null },
        });
      }
      await tx.whatsAppContact.update({ where: { id: contactId }, data: { draftDocuments: Prisma.DbNull } });
      return drafts.length;
    });
  } catch (err) {
    console.error('[WHATSAPP FICHA] Falha ao migrar rascunhos de documentos para o card:', contactId, err);
    return 0;
  }
}
