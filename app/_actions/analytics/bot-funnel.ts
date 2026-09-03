'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requireTeam, requirePermission } from '@/app/_shared/lib/permissions-server';
import { brStartOfDaysAgo, brStartOfMonth, brMonthIndex, brStartOfDay, brDayKey } from '@/app/_shared/utils/date-br';

// Funil do bot da IA (substitui o Funil de leads antigo, que contava pelo
// BotConversa). Tudo aqui sai do NOSSO banco — conversas, mensagens e tags do
// WhatsApp — respeitando o filtro de número do Desempenho do Chatbot.
//
// Unificação de 03/09/2026: o Funil e o Fluxo de Eventos Rápidos passaram a
// sair da MESMA classificação, por COORTE — conversas CRIADAS no período,
// cada uma em exatamente uma etapa (o estado atual dela). Antes o Funil
// contava eventos do período (tag, encerramento, última mensagem) em cima de
// conversas de qualquer idade e com sobreposição entre etapas, enquanto o
// Fluxo mostrava só as criadas no período — os dois nunca batiam.
//
// Etapas (uma por conversa, nesta ordem de prioridade):
// - Contratado: tem a tag "Contratados".
// - Não qualificado: encerrada como nao_qualificado / nq_*.
// - Não contratado: encerrada como sem_resposta (sumiu após a recuperação).
// - Lista docs: recebeu a lista de documentos, ou tem a tag "Qualificada".
// - Iniciado: aberta e a IA ainda não avançou nenhuma etapa (sem botState).
// - Em conversa: aberta, em qualquer status (bot, standby, fila, humano).
// - Outros: encerrada por outro motivo (perguntas, transferido, descartado...).
//
// No Funil: Iniciados = TODAS as conversas da coorte; Em conversa = Iniciado +
// Em conversa do Fluxo; Qualificados = tag "Qualificada" na coorte (marco que
// se sobrepõe às demais etapas — é o único KPI não exclusivo).

// Fingerprint da mensagem de coleta de documentos (bot e fluxo manual usam o
// mesmo texto). Se o texto do bot mudar, atualizar aqui junto.
const DOCS_FINGERPRINT = 'RG ou da sua CNH';

const QUALIFIED_TAG = 'Qualificada';
const HIRED_TAG = 'Contratados';

const GOAL_KEY = 'monthly_hired_goal';
const GOAL_DEFAULT = 60;

export type BotStage =
  | 'iniciado'
  | 'em_conversa'
  | 'enviou_documentos'
  | 'nao_contratado'
  | 'nao_qualificado'
  | 'contratado'
  | 'outros';

export interface BotFunnelData {
  started: number;
  inConversation: number;
  docsSent: number;
  notHired: number;
  disqualified: number;
  qualified: number;
  hired: number;
  /** Encerradas por outros motivos (perguntas, transferido, descartado...). */
  others: number;
  /** Contratados no mês corrente (Brasília) × meta configurada. */
  monthHired: number;
  monthGoal: number;
  // Parcelas do mês: tag "Contratados" (sistema) + evento contratado do
  // BotConversa (legado — zera sozinho quando o webhook antigo morrer).
  monthHiredBot: number;
  monthHiredLegacy: number;
  // Série do ano corrente pro gráfico "Mensal" (mesma leitura do antigo
  // Processos por Mês, agora contada pelo nosso banco): aprovados = tag
  // Contratados; indeferidos = encerradas nq_*/nao_qualificado/sem_resposta
  // (pela data real de encerramento); emAndamento = conversas AINDA abertas,
  // pelo mês de criação.
  monthly: { month: string; aprovados: number; indeferidos: number; emAndamento: number }[];
}

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export interface BotKanbanLead {
  id: string;
  nome: string;
  telefone: string;
  /** Mesmas chaves de etapa do MiniKanban legado (iniciado, em_conversa...). */
  evento: BotStage;
  createdAt: string | null;
  updatedAt: string | null;
  numberLabel: string | null;
}

const KANBAN_WINDOW_DAYS = 90;

function parseRange(fromISO?: string, toISO?: string): { from: Date; to: Date } | null {
  if (!fromISO || !toISO) return null;
  const f = new Date(fromISO);
  const t = new Date(toISO);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return null;
  return { from: f, to: t };
}

/**
 * Coorte do período: conversas criadas em [from, to], cada uma classificada
 * em UMA etapa. Base comum do Funil e do Fluxo de Eventos Rápidos.
 */
async function loadCohort(numberId: string | null, from: Date, to: Date | null) {
  const createdIn = to ? { gte: from, lte: to } : { gte: from };
  const byNumber = numberId ? { numberId } : {};

  const [convs, docsRows, numbers] = await Promise.all([
    // Sem teto: o kanban é virtualizado e o funil precisa da coorte inteira.
    db.whatsAppConversation.findMany({
      where: { ...byNumber, createdAt: createdIn },
      orderBy: { lastMessageAt: 'desc' },
      select: {
        id: true, status: true, closeCategory: true, botState: true, numberId: true,
        createdAt: true, updatedAt: true,
        contact: { select: { id: true, name: true, phone: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    }),
    // A lista de documentos pode ter saído DEPOIS do fim do período (coorte
    // antiga) — o que importa é ter saído desde a criação da conversa.
    db.whatsAppMessage.findMany({
      where: {
        ...byNumber,
        direction: 'out',
        internal: false,
        createdAt: { gte: from },
        body: { contains: DOCS_FINGERPRINT, mode: 'insensitive' },
      },
      select: { contactId: true },
      distinct: ['contactId'],
    }),
    db.whatsAppNumber.findMany({ select: { id: true, label: true } }),
  ]);

  const docsSet = new Set(docsRows.map((r) => r.contactId));
  const labelOf = new Map(numbers.map((n) => [n.id, n.label]));

  let qualified = 0;
  const leads = convs.map((c): BotKanbanLead => {
    const tagNames = c.tags.map((t) => t.tag.name);
    if (tagNames.includes(QUALIFIED_TAG)) qualified++;
    const closed = c.status === 'closed';
    let evento: BotStage;
    if (tagNames.includes(HIRED_TAG)) evento = 'contratado';
    else if (closed && (c.closeCategory === 'nao_qualificado' || c.closeCategory?.startsWith('nq_'))) evento = 'nao_qualificado';
    else if (closed && c.closeCategory === 'sem_resposta') evento = 'nao_contratado';
    else if (docsSet.has(c.contact.id) || tagNames.includes(QUALIFIED_TAG)) evento = 'enviou_documentos';
    else if (!closed && !c.botState) evento = 'iniciado';
    else if (!closed) evento = 'em_conversa';
    else evento = 'outros';
    return {
      id: c.id,
      nome: c.contact.name ?? c.contact.phone,
      telefone: c.contact.phone,
      evento,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      numberLabel: c.numberId ? labelOf.get(c.numberId) ?? null : null,
    };
  });

  return { leads, qualified };
}

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
  const range = parseRange(fromISO, toISO);
  const since = range?.from ?? brStartOfDaysAgo(days - 1);
  const until = range?.to ?? null;
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

  const [cohort, monthHiredBot, goalRow, monthHiredLegacy, yearHiredTags, yearRejected, yearOpen] =
    await Promise.all([
      loadCohort(numberId, since, until),
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
          closedAt: inRefYear,
          OR: [
            { closeCategory: 'nao_qualificado' },
            { closeCategory: { startsWith: 'nq_' } },
            { closeCategory: 'sem_resposta' },
          ],
        },
        select: { closedAt: true },
      }),
      db.whatsAppConversation.findMany({
        where: { ...byNumber, status: { not: 'closed' }, createdAt: inRefYear },
        select: { createdAt: true },
      }),
    ]);

  const monthly = MONTHS.map((month) => ({ month, aprovados: 0, indeferidos: 0, emAndamento: 0 }));
  for (const t of yearHiredTags) monthly[brMonthIndex(t.createdAt)].aprovados++;
  for (const c of yearRejected) if (c.closedAt) monthly[brMonthIndex(c.closedAt)].indeferidos++;
  for (const c of yearOpen) monthly[brMonthIndex(c.createdAt)].emAndamento++;

  const count: Record<BotStage, number> = {
    iniciado: 0, em_conversa: 0, enviou_documentos: 0, nao_contratado: 0,
    nao_qualificado: 0, contratado: 0, outros: 0,
  };
  for (const l of cohort.leads) count[l.evento]++;

  return {
    started: cohort.leads.length,
    inConversation: count.iniciado + count.em_conversa,
    docsSent: count.enviou_documentos,
    notHired: count.nao_contratado,
    disqualified: count.nao_qualificado,
    qualified: cohort.qualified,
    hired: count.contratado,
    others: count.outros,
    monthHired: monthHiredBot + monthHiredLegacy,
    monthHiredBot,
    monthHiredLegacy,
    monthGoal: Number(goalRow?.value) || GOAL_DEFAULT,
    monthly,
  };
}

// ---------------------------------------------------------------------------
// Leads do NOSSO sistema no "Fluxo de Eventos Rápidos" (MiniKanban): cada
// conversa da coorte vira um card na etapa derivada do estado real, com a
// etiqueta do número que atendeu (Principal, Paraná DPVAT...). Os cards do
// sistema são somente-leitura — a etapa muda sozinha conforme o atendimento
// anda. Mesma classificação do Funil (loadCohort) — os dois batem por
// construção.

/** from/to (ISO) seguem o calendário do dashboard; sem eles, 90 dias fixos. */
export async function getBotKanbanLeads(
  numberId: string | null,
  fromISO?: string,
  toISO?: string,
): Promise<BotKanbanLead[]> {
  await requireTeam();
  const range = parseRange(fromISO, toISO);
  const { leads } = await loadCohort(
    numberId,
    range?.from ?? brStartOfDaysAgo(KANBAN_WINDOW_DAYS - 1),
    range?.to ?? null,
  );
  return leads;
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
