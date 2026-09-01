'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requireTeam, requirePermission } from '@/app/_shared/lib/permissions-server';
import { brStartOfDaysAgo, brStartOfMonth, brMonthIndex, brStartOfDay, brDayKey } from '@/app/_shared/utils/date-br';

// Funil do bot da IA (substitui o Funil de leads antigo, que contava pelo
// BotConversa). Tudo aqui sai do NOSSO banco — conversas, mensagens e tags do
// WhatsApp — respeitando o filtro de número do Desempenho do Chatbot.
//
// Etapas (acordadas em 17/08/2026):
// - Iniciados: contatos novos que mandaram mensagem no período.
// - Em conversa: IA qualificando (status bot) ou resgatando (standby).
// - Lista docs: a IA (ou o fluxo manual) mandou a lista de documentos.
// - Não contratados: sumiram após o ciclo completo de recuperação.
// - Não qualificados: encerradas como não qualificadas (qualquer motivo).
// - Qualificados/Contratados: pelas tags "Qualificada"/"Contratados" (a data
//   da tag delimita o período — ver WhatsAppConversationTag.createdAt).

// Fingerprint da mensagem de coleta de documentos (bot e fluxo manual usam o
// mesmo texto). Se o texto do bot mudar, atualizar aqui junto.
const DOCS_FINGERPRINT = 'RG ou da sua CNH';

const QUALIFIED_TAG = 'Qualificada';
const HIRED_TAG = 'Contratados';

const GOAL_KEY = 'monthly_hired_goal';
const GOAL_DEFAULT = 60;

export interface BotFunnelData {
  started: number;
  inConversation: number;
  docsSent: number;
  notHired: number;
  disqualified: number;
  qualified: number;
  hired: number;
  /** Contratados no mês corrente (Brasília) × meta configurada. */
  monthHired: number;
  monthGoal: number;
  // Parcelas do mês: tag "Contratados" (sistema) + evento contratado do
  // BotConversa (legado — zera sozinho quando o webhook antigo morrer).
  monthHiredBot: number;
  monthHiredLegacy: number;
  // Série do ano corrente pro gráfico "Mensal" (mesma leitura do antigo
  // Processos por Mês, agora contada pelo nosso banco): aprovados = tag
  // Contratados; indeferidos = encerradas nq_*/nao_qualificado/sem_resposta;
  // emAndamento = conversas AINDA abertas, pelo mês de criação.
  monthly: { month: string; aprovados: number; indeferidos: number; emAndamento: number }[];
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * from/to (ISO) têm prioridade sobre periodDays — o dashboard geral filtra por
 * intervalo livre; a aba do chatbot continua mandando 7/30/90 dias.
 */
export async function getBotFunnel(
  periodDays: number,
  numberId: string | null,
  fromISO?: string,
  toISO?: string,
): Promise<BotFunnelData> {
  await requireTeam();
  const days = Math.min(Math.max(Math.round(periodDays) || 7, 1), 365);
  let since = brStartOfDaysAgo(days - 1);
  let until: Date | null = null;
  if (fromISO && toISO) {
    const f = new Date(fromISO);
    const t = new Date(toISO);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime())) {
      since = f;
      until = t;
    }
  }
  const inRange = until ? { gte: since, lte: until } : { gte: since };
  const byNumber = numberId ? { numberId } : {};

  // "Meta do mês" e a série "Mensal" acompanham o calendário: a referência é
  // o FIM do período selecionado (antes eram sempre o mês/ano correntes,
  // ignorando o filtro). Selecionou março → meta de março + série do ano de
  // março.
  const ref = until ?? new Date();
  const monthStart = brStartOfMonth(ref);
  const monthEnd = brStartOfMonth(new Date(monthStart.getTime() + 40 * 86_400_000));
  const inGoalMonth = { gte: monthStart, lt: monthEnd };
  const refYear = Number(brDayKey(ref).slice(0, 4));
  const yearStart = brStartOfDay(new Date(Date.UTC(refYear, 0, 1, 12)));
  const yearEnd = brStartOfDay(new Date(Date.UTC(refYear + 1, 0, 1, 12)));
  const inRefYear = { gte: yearStart, lt: yearEnd };

  const [started, inConversation, docsSentRows, notHired, disqualified, tagCounts, monthHiredBot, goalRow,
    monthHiredLegacy, yearHiredTags, yearRejected, yearOpen] =
    await Promise.all([
      db.whatsAppContact.count({ where: { ...byNumber, createdAt: inRange } }),
      db.whatsAppConversation.count({
        where: { ...byNumber, status: { in: ['bot', 'standby'] }, lastMessageAt: inRange },
      }),
      // Conversas distintas em que a lista de documentos foi enviada no período.
      db.whatsAppMessage.findMany({
        where: {
          ...byNumber,
          direction: 'out',
          internal: false,
          createdAt: inRange,
          body: { contains: DOCS_FINGERPRINT, mode: 'insensitive' },
        },
        select: { contactId: true },
        distinct: ['contactId'],
      }),
      db.whatsAppConversation.count({
        where: { ...byNumber, status: 'closed', closeCategory: 'sem_resposta', updatedAt: inRange },
      }),
      db.whatsAppConversation.count({
        where: {
          ...byNumber,
          status: 'closed',
          updatedAt: inRange,
          OR: [{ closeCategory: 'nao_qualificado' }, { closeCategory: { startsWith: 'nq_' } }],
        },
      }),
      db.whatsAppConversationTag.groupBy({
        by: ['tagId'],
        _count: true,
        where: {
          createdAt: inRange,
          tag: { name: { in: [QUALIFIED_TAG, HIRED_TAG] } },
          ...(numberId ? { conversation: { numberId } } : {}),
        },
      }),
      db.whatsAppConversationTag.count({
        where: {
          createdAt: inGoalMonth,
          tag: { name: HIRED_TAG },
          ...(numberId ? { conversation: { numberId } } : {}),
        },
      }),
      db.appSetting.findUnique({ where: { key: GOAL_KEY } }),
      // Meta do mês (transição 08/2026): soma os contratados que AINDA
      // entraram pelo webhook do BotConversa neste mês. Com o número migrado,
      // o webhook antigo para de gravar e esta parcela zera sozinha. Só na
      // visão "todos os números" — filtro por número é só do sistema novo.
      numberId
        ? Promise.resolve(0)
        : db.botconversa.count({ where: { evento: 'contratado', updatedAt: inGoalMonth } }),
      db.whatsAppConversationTag.findMany({
        where: {
          createdAt: inRefYear,
          tag: { name: HIRED_TAG },
          ...(numberId ? { conversation: { numberId } } : {}),
        },
        select: { createdAt: true },
      }),
      db.whatsAppConversation.findMany({
        where: {
          ...byNumber,
          status: 'closed',
          updatedAt: inRefYear,
          OR: [
            { closeCategory: 'nao_qualificado' },
            { closeCategory: { startsWith: 'nq_' } },
            { closeCategory: 'sem_resposta' },
          ],
        },
        select: { updatedAt: true },
      }),
      db.whatsAppConversation.findMany({
        where: { ...byNumber, status: { not: 'closed' }, createdAt: inRefYear },
        select: { createdAt: true },
      }),
    ]);

  const monthly = MONTHS.map((month) => ({ month, aprovados: 0, indeferidos: 0, emAndamento: 0 }));
  for (const t of yearHiredTags) monthly[brMonthIndex(t.createdAt)].aprovados++;
  for (const c of yearRejected) monthly[brMonthIndex(c.updatedAt)].indeferidos++;
  for (const c of yearOpen) monthly[brMonthIndex(c.createdAt)].emAndamento++;

  // groupBy devolve por tagId — resolve os nomes para separar as duas tags.
  let qualified = 0;
  let hired = 0;
  if (tagCounts.length) {
    const tags = await db.whatsAppTag.findMany({
      where: { id: { in: tagCounts.map((t) => t.tagId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(tags.map((t) => [t.id, t.name]));
    for (const t of tagCounts) {
      if (nameOf.get(t.tagId) === QUALIFIED_TAG) qualified += t._count;
      if (nameOf.get(t.tagId) === HIRED_TAG) hired += t._count;
    }
  }

  return {
    started,
    inConversation,
    docsSent: docsSentRows.length,
    notHired,
    disqualified,
    qualified,
    hired,
    monthHired: monthHiredBot + monthHiredLegacy,
    monthHiredBot,
    monthHiredLegacy,
    monthGoal: Number(goalRow?.value) || GOAL_DEFAULT,
    monthly,
  };
}

// ---------------------------------------------------------------------------
// Leads do NOSSO sistema no "Fluxo de Eventos Rápidos" (MiniKanban): cada
// conversa vira um card na etapa derivada do estado real, com a etiqueta do
// número que atendeu (Principal, Paraná DPVAT...). Os cards do sistema são
// somente-leitura — a etapa muda sozinha conforme o atendimento anda.

export interface BotKanbanLead {
  id: string;
  nome: string;
  telefone: string;
  /** Mesmas chaves de etapa do MiniKanban legado (iniciado, em_conversa...). */
  evento: string;
  createdAt: string | null;
  updatedAt: string | null;
  numberLabel: string | null;
}

const KANBAN_WINDOW_DAYS = 90;

/** from/to (ISO) seguem o calendário do dashboard; sem eles, 90 dias fixos. */
export async function getBotKanbanLeads(
  numberId: string | null,
  fromISO?: string,
  toISO?: string,
): Promise<BotKanbanLead[]> {
  await requireTeam();
  let createdIn: { gte: Date; lte?: Date } = { gte: brStartOfDaysAgo(KANBAN_WINDOW_DAYS - 1) };
  if (fromISO && toISO) {
    const f = new Date(fromISO);
    const t = new Date(toISO);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime())) {
      createdIn = { gte: f, lte: t };
    }
  }
  const byNumber = numberId ? { numberId } : {};

  const [convs, docsRows, numbers] = await Promise.all([
    db.whatsAppConversation.findMany({
      where: { ...byNumber, createdAt: createdIn },
      orderBy: { lastMessageAt: 'desc' },
      take: 1000,
      select: {
        id: true, status: true, closeCategory: true, botState: true, numberId: true,
        createdAt: true, updatedAt: true,
        contact: { select: { id: true, name: true, phone: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    }),
    db.whatsAppMessage.findMany({
      where: {
        ...byNumber,
        direction: 'out',
        internal: false,
        createdAt: createdIn,
        body: { contains: DOCS_FINGERPRINT, mode: 'insensitive' },
      },
      select: { contactId: true },
      distinct: ['contactId'],
    }),
    db.whatsAppNumber.findMany({ select: { id: true, label: true } }),
  ]);

  const docsSet = new Set(docsRows.map((r) => r.contactId));
  const labelOf = new Map(numbers.map((n) => [n.id, n.label]));

  return convs.map((c): BotKanbanLead | null => {
    const tagNames = c.tags.map((t) => t.tag.name);
    let evento: string;
    if (tagNames.includes(HIRED_TAG)) evento = 'contratado';
    else if (c.status === 'closed' && (c.closeCategory === 'nao_qualificado' || c.closeCategory?.startsWith('nq_'))) evento = 'nao_qualificado';
    else if (c.status === 'closed' && c.closeCategory === 'sem_resposta') evento = 'nao_contratado';
    else if (docsSet.has(c.contact.id) || tagNames.includes(QUALIFIED_TAG)) evento = 'enviou_documentos';
    else if (c.status !== 'closed' && !c.botState) evento = 'iniciado';
    else if (c.status !== 'closed') evento = 'em_conversa';
    else return null; // encerradas por outros motivos (perguntas, transferido...) ficam fora
    return {
      id: c.id,
      nome: c.contact.name ?? c.contact.phone,
      telefone: c.contact.phone,
      evento,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      numberLabel: c.numberId ? labelOf.get(c.numberId) ?? null : null,
    };
  }).filter((x): x is BotKanbanLead => x !== null);
}

/** Ajusta a meta mensal de contratados (Visão do Gestor). */
export async function setMonthlyHiredGoal(goal: number): Promise<void> {
  await requirePermission('manager_dashboard');
  const value = Math.min(Math.max(Math.round(goal) || 0, 1), 100_000);
  await db.appSetting.upsert({
    where: { key: GOAL_KEY },
    update: { value: String(value) },
    create: { key: GOAL_KEY, value: String(value) },
  });
}
