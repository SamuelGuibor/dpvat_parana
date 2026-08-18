/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import { markMessageRead } from '@/app/_shared/lib/whatsapp/client';
import { CLOSE_CATEGORY_LABELS, CLOSE_CATEGORY_OPTIONS, QUALIFIED_BY_CATEGORY } from '@/app/_shared/lib/whatsapp/close-categories';
import { captureConversation } from '@/app/_shared/lib/whatsapp/brain';
import { reportLeadStageToMeta } from '@/app/_shared/lib/meta-conversions';

// Fila e atribuição de conversas de WhatsApp (estilo Botconversa):
// bot → queued (handoff) → human (atendente assume) → closed.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

/** Busca contactId + nome/telefone para anexar aos logs de auditoria. */
async function convContact(conversationId: string) {
  const conv = await db.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: { contactId: true, status: true, contact: { select: { name: true, phone: true } } },
  });
  return conv;
}

async function requireTeamMember(): Promise<{ id: string; name: string }> {
  // Role e nome já vêm no JWT da sessão — o findUnique extra por chamada era
  // uma query redundante em TODO poll do inbox.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  if (!TEAM_ROLES.includes(session.user.role ?? '')) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
  return { id: session.user.id, name: session.user.name ?? 'Atendente' };
}

/**
 * Contagem leve de conversas não lidas para o badge das abas. Não hidrata
 * contato/tags/preview — o poll do badge rodava a query mais pesada do app
 * (200 conversas + 3 includes) a cada 15s só para exibir um número.
 */
export async function countWhatsAppUnread(): Promise<number> {
  await requireTeamMember();
  const rows = await db.whatsAppConversation.findMany({
    where: { status: { not: 'closed' } },
    select: {
      lastMessageAt: true,
      lastReadAt: true,
      reads: { orderBy: { lastReadAt: 'desc' }, take: 1, select: { lastReadAt: true } },
    },
    take: 500,
  });
  return rows.filter((c) => {
    const anyReadAt = c.reads[0]?.lastReadAt ?? null;
    const effectiveReadAt = anyReadAt && c.lastReadAt
      ? (anyReadAt > c.lastReadAt ? anyReadAt : c.lastReadAt)
      : anyReadAt ?? c.lastReadAt;
    return !effectiveReadAt || c.lastMessageAt > effectiveReadAt;
  }).length;
}

/**
 * Total REAL de conversas (badge do topo da lista). A lista em si é limitada
 * a 200 (take) — o badge mostrava conversations.length e "estagnava" em 200.
 */
export async function countWhatsAppConversationsTotal(): Promise<number> {
  await requireTeamMember();
  return db.whatsAppConversation.count();
}

export interface WhatsAppConversationDTO {
  id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  status: string; // bot | queued | human | closed
  qualified: boolean | null; // só relevante quando status="closed"
  // Categoria do desfecho (só relevante quando status="closed"): qualificado |
  // nao_qualificado | nq_* (sub-motivo) | perguntas | novo_acidente | transferido.
  closeCategory: string | null;
  // Rótulo humano do desfecho, já resolvido no servidor (inclui os motivos
  // dinâmicos da tabela whatsapp_close_reasons) — ex.: "Não qualificada — sem
  // cobertura INSS". Vai no chip "Encerrada · {label}" e nos grupos da pasta.
  closeCategoryLabel: string | null;
  // Urgência detectada pela IA — some quando um atendente assume/encerra.
  urgent: boolean;
  assignedToId: string | null;
  assignedToName: string | null;
  lastMessageAt: string;
  lastReadAt: string | null;
  lastInboundAt: string | null; // controla a janela de 24h da Meta
  lastMessagePreview: string | null;
  // Quem falou por último (para o selinho de atendente na lista): nome do
  // atendente da última mensagem enviada, ou null se foi o cliente.
  lastMessageAuthorName: string | null;
  lastMessageFromBot: boolean;
  // A última mensagem foi do CLIENTE (direction "in") — usado pra destacar na
  // lista quem está esperando resposta da equipe.
  lastMessageFromClient: boolean;
  // Status da ÚLTIMA mensagem quando ela é nossa (sent/delivered/read) — o
  // "radar de vácuo": read + horas sem resposta = cliente viu e ignorou.
  lastMessageStatus: string | null;
  // Tipo de mídia da última mensagem (image/*, video/*, audio/*, application/*),
  // null quando é só texto — vira ícone na prévia da lista.
  lastMessageMediaType: string | null;
  // Última nota interna que o BOT deixou ao transferir pra fila (o "por que
  // caiu na fila" que hoje só aparecia dentro do Copiloto) — mostrado direto
  // na linha da Fila pra decidir quem atender primeiro sem abrir a conversa.
  handoffReason: string | null;
  // Ficha do cliente tem o básico preenchido (nome, CPF, endereço) — vira um
  // selo de alerta no avatar quando falta algo.
  fichaComplete: boolean;
  // Origem do lead (first-touch de Click-to-WhatsApp ads): facebook | instagram
  // | null (orgânico). Vira o logo no canto do avatar.
  adPlatform: string | null;
  // Quando a conversa começou — âncora da linha de jornada na thread.
  createdAt: string;
  // Resumo do caso pro card rico (direto da ficha, sem chamada de IA):
  caseLesoes: string | null;
  caseCidade: string | null;
  caseDataAcidente: string | null;
  // O que trava o CONTRATO (única pendência que aparece na tela): CPF e docs.
  hasCpf: boolean;
  docsCount: number;
  // Provocações do ciclo de recuperação já enviadas (0-5) — exibido quando
  // status="standby" como "1ª de 5".
  recoveryAttempts: number;
  unread: boolean;
  // Quantas mensagens RECEBIDAS desde a última leitura de qualquer atendente —
  // o badge verde de contagem (estilo WhatsApp) na lista.
  unreadCount: number;
  // Alguém usou "Marcar como não lida" (12/08/2026): o badge vira um marcador
  // próprio em vez da contagem (que seria o histórico inteiro, "99+").
  manualUnread: boolean;
  // Coluna do kanban do cliente vinculado (null quando a conversa ainda não
  // virou card) — filtro "Coluna do Kanban" do inbox.
  kanbanColumn: string | null;
  // Contato em opt-out (pediu pra parar ou foi bloqueado pela equipe).
  optedOut: boolean;
  // Número da empresa que atende esta conversa (multi-número): o inbox filtra
  // e etiqueta por ele. Null em conversa legada ainda não adotada.
  numberId: string | null;
  tags: { id: string; name: string; color: string }[];
}

interface DraftFichaShape {
  name?: string | null; cpf?: string | null; cep?: string | null; rua?: string | null; cidade?: string | null;
  lesoes?: string | null; data_acidente?: string | null;
}

function isFichaComplete(f: DraftFichaShape | null | undefined): boolean {
  if (!f) return false;
  const hasAddress = !!(f.cep?.trim() || f.rua?.trim() || f.cidade?.trim());
  return !!(f.name?.trim() && f.cpf?.trim() && hasAddress);
}

/** Rótulo de fallback quando a última mensagem é mídia sem legenda — o
 * client mostra um ícone do tipo na frente, então aqui só o nome curto. */
function mediaTypeLabel(mediaType: string): string {
  if (mediaType.startsWith('image/')) return 'Foto';
  if (mediaType.startsWith('video/')) return 'Vídeo';
  if (mediaType.startsWith('audio/')) return 'Áudio';
  return 'Documento';
}

export async function listWhatsAppConversations(): Promise<WhatsAppConversationDTO[]> {
  const me = await requireTeamMember();

  const conversations = await db.whatsAppConversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    // O dropdown de encerradas e o filtro por tag contam em cima DESTA lista:
    // com take menor que o total de conversas, encerradas antigas sumiam da
    // contagem (ex.: "Contratados" mostrava 19 de 26). 1000 cobre a base atual
    // (~450) com folga; quando chegar perto disso, paginar de verdade.
    take: 1000,
    include: {
      contact: {
        select: {
          id: true, name: true, phone: true, optedOut: true, userId: true,
          clientDraft: true, adPlatform: true, draftDocuments: true,
        },
      },
      tags: { include: { tag: true } },
      // Leitura GLOBAL: se QUALQUER atendente já abriu a conversa, ela deixa
      // de contar como não-lida para o resto da equipe.
      reads: { orderBy: { lastReadAt: 'desc' }, take: 1, select: { lastReadAt: true } },
    },
  });
  if (!conversations.length) return [];

  const contactIds = conversations.map((c) => c.contactId);

  // Última mensagem (preview), última mensagem RECEBIDA (janela de 24h) e
  // última nota interna do BOT (motivo do handoff) por contato — distinct +
  // orderBy desc devolve a primeira linha de cada grupo.
  const [lastMessages, lastInbound, assignees, handoffNotes] = await Promise.all([
    db.whatsAppMessage.findMany({
      where: { contactId: { in: contactIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['contactId'],
      select: { contactId: true, body: true, mediaType: true, direction: true, sentByBot: true, authorId: true, status: true },
    }),
    db.whatsAppMessage.findMany({
      where: { contactId: { in: contactIds }, direction: 'in' },
      orderBy: { createdAt: 'desc' },
      distinct: ['contactId'],
      select: { contactId: true, createdAt: true },
    }),
    db.user.findMany({
      where: { id: { in: conversations.map((c) => c.assignedToId).filter(Boolean) as string[] } },
      select: { id: true, name: true },
    }),
    db.whatsAppMessage.findMany({
      where: { contactId: { in: contactIds }, internal: true, sentByBot: true },
      orderBy: { createdAt: 'desc' },
      distinct: ['contactId'],
      select: { contactId: true, body: true },
    }),
  ]);

  // Autores das últimas mensagens (selinho "quem atendeu por último" na lista)
  // que não estejam já cobertos pela query de atendentes atribuídos.
  const knownIds = new Set(assignees.map((u) => u.id));
  const extraAuthorIds = [...new Set(
    lastMessages.map((m) => m.authorId).filter((id): id is string => !!id && !knownIds.has(id)),
  )];
  const extraAuthors = extraAuthorIds.length
    ? await db.user.findMany({ where: { id: { in: extraAuthorIds } }, select: { id: true, name: true } })
    : [];

  // Nome EXIBIDO: manda o nome do card quando o contato já está vinculado a um
  // cliente. O `whatsapp_contacts.name` nasce do perfil do WhatsApp (apelido,
  // "Askeladd") e nem sempre acompanha a correção feita no card — na lista quem
  // vale é o cadastro.
  const linkedUserIds = [...new Set(
    conversations.map((c) => c.contact.userId).filter((id): id is string => !!id),
  )];
  const linkedUsers = linkedUserIds.length
    ? await db.user.findMany({
        where: { id: { in: linkedUserIds } },
        select: { id: true, name: true, role: true, cpf: true, cep: true, rua: true, cidade: true, lesoes: true, data_acidente: true },
      })
    : [];
  const cardNameById = new Map(linkedUsers.map((u) => [u.id, u.name]));
  // Coluna do kanban do cliente vinculado (User.role guarda o nome da coluna)
  // — alimenta o filtro "Coluna do Kanban" do inbox (12/08/2026).
  const columnByUserId = new Map(linkedUsers.map((u) => [u.id, u.role]));
  // Ficha completa (nome+CPF+endereço) pra registrado vem do User; pra
  // rascunho (ainda sem cadastro) vem do clientDraft salvo no contato.
  const fichaByUserId = new Map(linkedUsers.map((u) => [u.id, u]));

  // Documentos pessoais por cliente vinculado (uma query agregada, não N+1);
  // pra rascunho a contagem sai do próprio draftDocuments no map abaixo.
  const docCounts = linkedUserIds.length
    ? await db.document.groupBy({
        by: ['userId'],
        where: { userId: { in: linkedUserIds }, processId: null },
        _count: { _all: true },
      })
    : [];
  const docsByUserId = new Map(docCounts.map((d) => [d.userId, d._count._all]));

  const previewByContact = new Map(lastMessages.map((m) => [m.contactId, m]));
  const inboundByContact = new Map(lastInbound.map((m) => [m.contactId, m.createdAt]));
  const handoffByContact = new Map(handoffNotes.map((m) => [m.contactId, m.body]));
  const nameById = new Map([...assignees, ...extraAuthors].map((u) => [u.id, u.name ?? 'Atendente']));

  // Contagem de não-lidas por conversa (badge verde estilo WhatsApp): mensagens
  // RECEBIDAS depois da leitura mais recente (global legado OU de qualquer
  // atendente). Uma query agregada pra lista inteira — sem N+1.
  const unreadRows = await db.$queryRaw<{ contactId: string; cnt: number }[]>`
    SELECT c."contactId" AS "contactId", COUNT(m.id)::int AS cnt
    FROM whatsapp_conversations c
    JOIN whatsapp_messages m
      ON m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false
    LEFT JOIN LATERAL (
      SELECT MAX(r."lastReadAt") AS read_at
      FROM whatsapp_conversation_reads r
      WHERE r."conversationId" = c.id
    ) rr ON true
    WHERE c."contactId" = ANY(${contactIds})
      AND m."createdAt" > COALESCE(GREATEST(c."lastReadAt", rr.read_at), to_timestamp(0))
    GROUP BY c."contactId"
  `;
  const unreadCountByContact = new Map(unreadRows.map((r) => [r.contactId, Number(r.cnt)]));

  // Rótulos dos motivos dinâmicos (nq_*) — uma query, cache pro map abaixo.
  const reasonRows = await db.whatsAppCloseReason.findMany({ select: { key: true, label: true } });
  const reasonLabelByKey = new Map(reasonRows.map((r) => [r.key, r.label]));
  const closeLabelOf = (cat: string | null): string | null => {
    if (!cat) return null;
    return CLOSE_CATEGORY_LABELS[cat] ?? reasonLabelByKey.get(cat) ?? cat;
  };

  return conversations.map((c) => {
    const last = previewByContact.get(c.contactId);
    const preview = last
      ? last.body ?? (last.mediaType ? mediaTypeLabel(last.mediaType) : null)
      : null;
    const inboundAt = inboundByContact.get(c.contactId) ?? null;
    // Leitura efetiva: a leitura mais recente de QUALQUER atendente, com o
    // lastReadAt global (legado) como fallback.
    const anyReadAt = c.reads[0]?.lastReadAt ?? null;
    const effectiveReadAt = anyReadAt && c.lastReadAt
      ? (anyReadAt > c.lastReadAt ? anyReadAt : c.lastReadAt)
      : anyReadAt ?? c.lastReadAt;
    // Ficha do caso: do User quando o contato já virou cliente, senão do
    // rascunho coletado no atendimento (clientDraft).
    const ficha: DraftFichaShape | null = c.contact.userId
      ? fichaByUserId.get(c.contact.userId) ?? null
      : (c.contact.clientDraft as unknown as DraftFichaShape | null);
    return {
      id: c.id,
      contactId: c.contactId,
      contactName:
        (c.contact.userId ? cardNameById.get(c.contact.userId)?.trim() : null) || c.contact.name,
      contactPhone: c.contact.phone,
      status: c.status,
      qualified: c.qualified,
      closeCategory: c.closeCategory,
      closeCategoryLabel: c.status === 'closed' ? closeLabelOf(c.closeCategory) : null,
      urgent: c.urgent,
      assignedToId: c.assignedToId,
      assignedToName: c.assignedToId ? nameById.get(c.assignedToId) ?? null : null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      lastReadAt: effectiveReadAt?.toISOString() ?? null,
      lastInboundAt: inboundAt?.toISOString() ?? null,
      lastMessagePreview: last?.direction === 'out' && preview ? `Você: ${preview}` : preview,
      lastMessageAuthorName:
        last?.direction === 'out' && !last.sentByBot && last.authorId
          ? nameById.get(last.authorId) ?? null
          : null,
      lastMessageFromBot: !!last?.sentByBot,
      lastMessageFromClient: last?.direction === 'in',
      lastMessageStatus: last?.direction === 'out' ? last.status ?? null : null,
      lastMessageMediaType: last?.mediaType ?? null,
      handoffReason: c.status === 'queued' ? handoffByContact.get(c.contactId) ?? null : null,
      fichaComplete: c.contact.userId
        ? isFichaComplete(fichaByUserId.get(c.contact.userId) ?? null)
        : isFichaComplete((c.contact.clientDraft as unknown as DraftFichaShape | null) ?? null),
      adPlatform: c.contact.adPlatform ?? null,
      createdAt: c.createdAt.toISOString(),
      caseLesoes: ficha?.lesoes?.trim() || null,
      caseCidade: ficha?.cidade?.trim() || null,
      caseDataAcidente: ficha?.data_acidente?.trim() || null,
      hasCpf: !!ficha?.cpf?.trim(),
      docsCount: c.contact.userId
        ? docsByUserId.get(c.contact.userId) ?? 0
        : ((c.contact.draftDocuments as unknown as unknown[] | null)?.length ?? 0),
      recoveryAttempts: c.recoveryAttempts,
      unread: !effectiveReadAt || c.lastMessageAt > effectiveReadAt,
      unreadCount: unreadCountByContact.get(c.contactId) ?? 0,
      // Sentinela da época (epoch) = "Marcar como não lida" — a UI mostra um
      // marcador próprio em vez da contagem do histórico inteiro.
      manualUnread: (effectiveReadAt?.getTime() ?? -1) === 0,
      kanbanColumn: c.contact.userId ? columnByUserId.get(c.contact.userId) ?? null : null,
      optedOut: c.contact.optedOut,
      numberId: c.numberId,
      tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    };
  });
}

export interface AttendantDTO {
  id: string;
  name: string;
}

/** Atendentes da equipe (role ADMIN*) — popula o filtro de "Com outros atendentes". */
export async function listWhatsAppAttendants(): Promise<AttendantDTO[]> {
  await requireTeamMember();
  const users = await db.user.findMany({
    where: { role: { in: TEAM_ROLES } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return users.map((u) => ({ id: u.id, name: u.name ?? 'Atendente' }));
}

/** Atendente assume a conversa (sai da fila / tira do bot / reabre se estava encerrada). */
export async function assumeConversation(conversationId: string): Promise<void> {
  const me = await requireTeamMember();
  const before = await convContact(conversationId);
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    // Assumiu: some o selo de urgência e zeram os marcadores de SLA da fila.
    // recoveryNextAt nulo: atendente assumiu → o ciclo de recuperação para.
    //
    // `qualified` é PRESERVADO (06/08/2026). Antes o assumir zerava o campo, e
    // com isso a conversa perdia a marca de lead qualificado: devolvida ao bot
    // e abandonada pelo cliente, o cron a tratava como triagem incompleta e
    // disparava o ciclo de recuperação em cima de quem já estava com a equipe
    // (caso Daniel). Quem reclassifica o desfecho é o encerramento.
    data: { status: 'human', assignedToId: me.id, urgent: false, queuedAt: null, queueAlertAt: null, recoveryNextAt: null },
  });
  if (before) {
    // "Assumir" reabre quando estava encerrada; senão é uma atribuição normal.
    const reopened = before.status === 'closed';
    await logWhatsAppEvent({
      action: reopened ? 'wa_reopen' : 'wa_assign',
      message: reopened
        ? `reabriu e assumiu o atendimento de ${before.contact?.name ?? before.contact?.phone}`
        : `assumiu o atendimento de ${before.contact?.name ?? before.contact?.phone}`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
    });
  }
}

/** Devolve a conversa pro bot responder. */
export async function returnConversationToBot(conversationId: string): Promise<void> {
  const me = await requireTeamMember();
  const before = await convContact(conversationId);
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    // botNudge30At zerado: um marcador de silêncio antigo (armado antes de o
    // atendente assumir) fazia o cron despachar DESPEDIDA logo após a
    // devolução ao bot, por cima das mensagens do atendente (caso Víctor,
    // 28/07 — 2ª despedida no mesmo dia). Devolveu ao bot = ciclo de silêncio
    // recomeça do zero.
    data: { status: 'bot', assignedToId: null, queuedAt: null, queueAlertAt: null, botNudge30At: null, botNudge24At: null },
  });
  if (before) {
    await logWhatsAppEvent({
      action: 'wa_return_bot',
      message: `devolveu ${before.contact?.name ?? before.contact?.phone} para o atendimento automático (bot)`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
    });
  }
}

/**
 * Encerra o atendimento marcando a CATEGORIA do desfecho (qualificado,
 * não qualificado, perguntas, novo acidente, transferido). Se o cliente mandar
 * mensagem depois, a conversa reabre pro bot automaticamente.
 *
 * Aceita também `true/false` (compat) → qualificado / não qualificado.
 */
export async function closeConversation(
  conversationId: string,
  category: string | boolean = 'nao_qualificado',
): Promise<void> {
  const me = await requireTeamMember();
  const before = await convContact(conversationId);

  const cat = typeof category === 'boolean' ? (category ? 'qualificado' : 'nao_qualificado') : category;
  // Motivos dinâmicos criados pela equipe têm prefixo "nq_" — todos contam
  // como não qualificado; o resto precisa estar no mapa estático.
  const closeCategory = cat in QUALIFIED_BY_CATEGORY || cat.startsWith('nq_') ? cat : 'nao_qualificado';
  const qualified = QUALIFIED_BY_CATEGORY[closeCategory] ?? (closeCategory.startsWith('nq_') ? false : null);
  const reasonRow = closeCategory.startsWith('nq_')
    ? await db.whatsAppCloseReason.findUnique({ where: { key: closeCategory } })
    : null;
  const label = CLOSE_CATEGORY_LABELS[closeCategory] ?? reasonRow?.label ?? closeCategory;

  // Cérebro: snapshot ANTES do update (que zera botMemory/botState abaixo).
  if (before) await captureConversation(before.contactId, 'manual', { closeCategory, qualified });

  await db.whatsAppConversation.update({
    where: { id: conversationId },
    // Ticket encerrado: zera a memória/estado do bot para que uma futura
    // conversa desse cliente comece do zero.
    // Desfecho real → ciclo de recuperação zerado por completo.
    data: { status: 'closed', assignedToId: null, qualified, closeCategory, botMemory: null, botState: null, botFailCount: 0, urgent: false, queuedAt: null, queueAlertAt: null, recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null },
  });

  // Tag automática = o próprio desfecho ("Não qualificada — sem cobertura
  // INSS"), pra tag e desfecho andarem SEMPRE juntos. Ao mudar o desfecho,
  // as tags de desfecho anteriores saem — as tags manuais ficam intactas.
  await syncCloseTag(conversationId, closeCategory, label);
  if (before) {
    await logWhatsAppEvent({
      action: 'wa_close',
      message: `encerrou o atendimento de ${before.contact?.name ?? before.contact?.phone} como ${label}`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
      metadata: { qualified, closeCategory, by: 'atendente' },
    });
    // Devolve pra Meta o desfecho decidido pelo atendente (qualificado /
    // não qualificado). Fire-and-forget; outras categorias são ignoradas.
    void reportLeadStageToMeta(before.contactId, closeCategory);
  }
}

// Cor da tag automática de desfecho, por família de categoria.
const CLOSE_TAG_COLORS: Record<string, string> = {
  qualificado: '#10b981',
  contratado_perdido: '#f43f5e',
  perguntas: '#3b82f6',
  novo_acidente: '#f59e0b',
  transferido: '#8b5cf6',
  sem_resposta: '#64748b',
  descartado: '#6b7280',
};

/**
 * Mantém a tag da conversa em sincronia com o desfecho: remove as tags de
 * desfecho anteriores (identificadas pelo conjunto de rótulos conhecidos —
 * estáticos + motivos da tabela) e aplica a tag com o rótulo completo atual.
 * Best-effort: falha de tag nunca impede o encerramento.
 */
async function syncCloseTag(conversationId: string, closeCategory: string, label: string): Promise<void> {
  try {
    // Todos os rótulos que já foram (ou podem ter sido) tag de desfecho.
    const reasonLabels = (await db.whatsAppCloseReason.findMany({ select: { label: true } })).map((r) => r.label);
    const knownLabels = new Set<string>([
      ...Object.values(CLOSE_CATEGORY_LABELS),
      ...CLOSE_CATEGORY_OPTIONS.map((o) => o.label),
      ...reasonLabels,
    ]);
    knownLabels.delete(label); // a atual fica

    const current = await db.whatsAppConversationTag.findMany({
      where: { conversationId },
      include: { tag: { select: { id: true, name: true } } },
    });
    const toRemove = current.filter((ct) => knownLabels.has(ct.tag.name)).map((ct) => ct.tagId);
    if (toRemove.length) {
      await db.whatsAppConversationTag.deleteMany({ where: { conversationId, tagId: { in: toRemove } } });
    }

    const color = CLOSE_TAG_COLORS[closeCategory]
      ?? (closeCategory.startsWith('nq_') || closeCategory === 'nao_qualificado' ? '#e05252' : '#6b7280');
    const tag = await db.whatsAppTag.upsert({
      where: { name: label },
      update: {},
      create: { name: label, color },
    });
    await db.whatsAppConversationTag.upsert({
      where: { conversationId_tagId: { conversationId, tagId: tag.id } },
      update: {},
      create: { conversationId, tagId: tag.id },
    });
  } catch (err) {
    console.error('[WA] Falha ao sincronizar a tag de desfecho:', err);
  }
}

/**
 * Marca a conversa como lida PARA A EQUIPE TODA: se um atendente já abriu o
 * chat, o não-lido e as notificações do sino somem para os demais conectados.
 * De quebra, marca a última mensagem recebida como lida na Meta — o cliente
 * vê o tique azul quando alguém da equipe realmente abriu a conversa.
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  const me = await requireTeamMember();
  const now = new Date();
  const conv = await db.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: { contactId: true },
  });
  await db.whatsAppConversationRead.upsert({
    where: { conversationId_userId: { conversationId, userId: me.id } },
    update: { lastReadAt: now },
    create: { conversationId, userId: me.id, lastReadAt: now },
  });
  // Leitura global (legado lastReadAt): garante que o badge some pra todo
  // mundo mesmo que a linha por-atendente acima seja só a minha.
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    data: { lastReadAt: now },
  });

  // Sino: alguém já viu o chat → apaga o alerta pendente desse contato para
  // TODOS os destinatários (não só quem abriu).
  if (conv) {
    await db.notification.updateMany({
      where: { contactId: conv.contactId, read: false },
      data: { read: true },
    });
  }

  // Tique azul no celular do cliente (best-effort; não bloqueia a leitura).
  if (conv) {
    db.whatsAppMessage.findFirst({
      where: { contactId: conv.contactId, direction: 'in', waMessageId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { waMessageId: true },
    }).then((last) => {
      if (last?.waMessageId) return markMessageRead(last.waMessageId);
    }).catch(() => {});
  }
}

/**
 * Marca a conversa como NÃO LIDA para a equipe toda — o caso clássico é abrir
 * sem querer a conversa que outra pessoa está atendendo: marcar como não lida
 * devolve o badge verde pra quem realmente vai atender. Apaga as linhas de
 * leitura por atendente e zera o legado global.
 */
export async function markConversationUnread(conversationId: string): Promise<void> {
  await requireTeamMember();
  await db.whatsAppConversationRead.deleteMany({ where: { conversationId } });
  // Sentinela da época (não null): marca "não lida MANUAL" — a lista mostra um
  // marcador próprio em vez de contar o histórico inteiro como não lido (99+).
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    data: { lastReadAt: new Date(0) },
  });
}
