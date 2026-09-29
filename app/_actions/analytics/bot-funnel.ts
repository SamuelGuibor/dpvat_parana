'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requireTeam, requirePermission } from '@/app/_shared/lib/permissions-server';
import { brStartOfMonth, brMonthIndex, brStartOfDay, brDayKey } from '@/app/_shared/utils/date-br';
import { HIRED_TAG_NAME, QUALIFIED_TAG_NAME } from '@/app/_shared/lib/whatsapp/close-categories';

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
// Contratado conta no mês em que o lead ENTROU (29/09/2026): lead que chegou
// em 29/09 e só recebeu a etiqueta em 01/10 é contratado de setembro. Antes
// (14/09) a régua era a data em que a etiqueta foi aplicada, e o card dava 222
// enquanto o filtro do inbox (data de entrada + tag) dava 181 no mesmo mês.
// Consequência aceita: o número de um mês fechado ainda sobe enquanto os
// leads dele vão sendo contratados.
//
// Etapas (uma por conversa, nesta ordem de prioridade):
// - Contratado: tem a tag "Contratados" (aplicada em qualquer data).
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
  /** Abertas em que a IA ainda não avançou etapa (sem botState). */
  initiated: number;
  /** Abertas com a triagem em andamento (bot, standby, fila, humano). */
  inConversation: number;
  docsSent: number;
  notHired: number;
  disqualified: number;
  qualified: number;
  /**
   * Contratados no período = conversas CRIADAS no período que têm a etiqueta
   * "Contratados", aplicada em qualquer data (+ legado BotConversa, pela data
   * de entrada do lead, na visão "todos os números"). Mesma régua da Meta do
   * mês, do gráfico Mensal e do filtro do inbox (data de entrada + tag).
   */
  hired: number;
  hiredBot: number;
  hiredLegacy: number;
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
  // Contratados, pelo mês de entrada do lead; indeferidos = encerradas nq_*/nao_qualificado/sem_resposta
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

  const [convs, numbers] = await Promise.all([
    // Sem teto: o kanban é virtualizado e o funil precisa da coorte inteira.
    // Só conversas CRIADAS no período (29/09/2026): a que nasceu antes e foi
    // etiquetada Contratados agora conta no mês de entrada dela, não neste.
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
    db.whatsAppNumber.findMany({ select: { id: true, label: true } }),
  ]);

  // "Lista docs" só dos contatos da coorte (auditoria de 25/09/2026): antes o
  // ILIKE varria as mensagens de saída de TODOS os contatos desde `from` (seq
  // scan em whatsapp_messages) e o `distinct` do Prisma deduplicava em
  // memória. Com a coorte em mãos, o índice [contactId, createdAt] restringe
  // às mensagens dela. O filtro por número fica implícito no conjunto de
  // contatos — por isso um contato legado adotado por outra linha (mensagens
  // antigas com numberId NULL) agora entra, como deveria.
  // A lista pode ter saído DEPOIS do fim do período (coorte antiga): o que
  // importa é ter saído desde o início dele.
  const contactIds = Array.from(new Set(convs.map((c) => c.contact.id)));
  const docsRows = contactIds.length
    ? await db.$queryRaw<{ contactId: string }[]>`
        SELECT DISTINCT m."contactId"
        FROM whatsapp_messages m
        WHERE m."contactId" = ANY(${contactIds}::text[])
          AND m.direction = 'out'
          AND m.internal = false
          AND m."createdAt" >= ${from}
          AND m.body ILIKE ${'%' + DOCS_FINGERPRINT + '%'}`
    : [];

  const docsSet = new Set(docsRows.map((r) => r.contactId));
  const labelOf = new Map(numbers.map((n) => [n.id, n.label]));

  let qualified = 0;
  const leads = convs.map((c): BotKanbanLead => {
    const tagNames = c.tags.map((t) => t.tag.name);
    if (tagNames.includes(QUALIFIED_TAG_NAME)) qualified++;
    const closed = c.status === 'closed';
    let evento: BotStage;
    if (tagNames.includes(HIRED_TAG_NAME)) evento = 'contratado';
    else if (closed && (c.closeCategory === 'nao_qualificado' || c.closeCategory?.startsWith('nq_'))) evento = 'nao_qualificado';
    else if (closed && c.closeCategory === 'sem_resposta') evento = 'nao_contratado';
    else if (docsSet.has(c.contact.id) || tagNames.includes(QUALIFIED_TAG_NAME)) evento = 'enviou_documentos';
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

type Cohort = Awaited<ReturnType<typeof loadCohort>>;

/** O que o Funil soma além da coorte: meta e série "Mensal" + legado do período. */
interface FunnelTotals {
  monthHiredBot: number;
  monthHiredLegacy: number;
  monthGoal: number;
  hiredLegacy: number;
  yearHiredAt: Date[];
  yearRejectedAt: Date[];
  yearOpenAt: Date[];
}

async function loadFunnelTotals(numberId: string | null, since: Date, until: Date): Promise<FunnelTotals> {
  const byNumber = numberId ? { numberId } : {};

  // "Meta do mês" e a série "Mensal" acompanham o calendário: a referência é
  // o FIM do período selecionado (antes eram sempre o mês/ano correntes,
  // ignorando o filtro). Selecionou março → meta de março + série do ano de
  // março.
  const ref = until;
  const monthStart = brStartOfMonth(ref);
  const monthEnd = brStartOfMonth(new Date(monthStart.getTime() + 40 * 86_400_000));
  const inGoalMonth = { gte: monthStart, lt: monthEnd };
  const refYear = Number(brDayKey(ref).slice(0, 4));
  const yearStart = brStartOfDay(new Date(Date.UTC(refYear, 0, 1, 12)));
  const yearEnd = brStartOfDay(new Date(Date.UTC(refYear + 1, 0, 1, 12)));
  const inRefYear = { gte: yearStart, lt: yearEnd };

  const periodRange = { gte: since, lte: until };
  // Contratado = conversa com a etiqueta, datada pela ENTRADA do lead
  // (createdAt da conversa), não pelo dia em que a etiqueta foi aplicada.
  const hasHiredTag = { tags: { some: { tag: { name: HIRED_TAG_NAME } } } };
  const [monthHiredBot, goalRow, monthHiredLegacy, yearHiredConvs, yearRejected, yearOpen, hiredLegacy] =
    await Promise.all([
      db.whatsAppConversation.count({
        where: { ...byNumber, createdAt: inGoalMonth, ...hasHiredTag },
      }),
      db.appSetting.findUnique({ where: { key: GOAL_KEY } }),
      // Meta do mês (transição 08/2026): soma os contratados que AINDA
      // entraram pelo webhook do BotConversa neste mês. Com o número migrado,
      // o webhook antigo para de gravar e esta parcela zera sozinha. Só na
      // visão "todos os números" — filtro por número é só do sistema novo.
      // Pelo createdAt da linha (1º evento do telefone = entrada do lead), a
      // mesma régua do sistema e do legado no MiniKanban.
      numberId
        ? Promise.resolve(0)
        : db.botconversa.count({ where: { evento: 'contratado', createdAt: inGoalMonth } }),
      db.whatsAppConversation.findMany({
        where: { ...byNumber, createdAt: inRefYear, ...hasHiredTag },
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
      // Legado BotConversa no PERÍODO (mesma parcela que entra na meta).
      numberId
        ? Promise.resolve(0)
        : db.botconversa.count({ where: { evento: 'contratado', createdAt: periodRange } }),
    ]);

  return {
    monthHiredBot,
    monthHiredLegacy,
    monthGoal: Number(goalRow?.value) || GOAL_DEFAULT,
    hiredLegacy,
    yearHiredAt: yearHiredConvs.map((c) => c.createdAt),
    yearRejectedAt: yearRejected.flatMap((c) => (c.closedAt ? [c.closedAt] : [])),
    yearOpenAt: yearOpen.map((c) => c.createdAt),
  };
}

/** Parte pura do Funil: etapas da coorte + totais já buscados. */
function computeFunnel(cohort: Cohort, totals: FunnelTotals): BotFunnelData {
  const monthly = MONTHS.map((month) => ({ month, aprovados: 0, indeferidos: 0, emAndamento: 0 }));
  for (const at of totals.yearHiredAt) monthly[brMonthIndex(at)].aprovados++;
  for (const at of totals.yearRejectedAt) monthly[brMonthIndex(at)].indeferidos++;
  for (const at of totals.yearOpenAt) monthly[brMonthIndex(at)].emAndamento++;

  const count: Record<BotStage, number> = {
    iniciado: 0, em_conversa: 0, enviou_documentos: 0, nao_contratado: 0,
    nao_qualificado: 0, contratado: 0, outros: 0,
  };
  for (const l of cohort.leads) count[l.evento]++;

  return {
    // "Total no período" = a coorte inteira (só conversas criadas no período).
    started: cohort.leads.length,
    // Iniciado e Em conversa separados (14/09/2026): o card somava os dois e
    // dava 302 enquanto a coluna "Em Conversa" do Fluxo mostrava 297.
    initiated: count.iniciado,
    inConversation: count.em_conversa,
    docsSent: count.enviou_documentos,
    notHired: count.nao_contratado,
    disqualified: count.nao_qualificado,
    qualified: cohort.qualified,
    hired: count.contratado + totals.hiredLegacy,
    hiredBot: count.contratado,
    hiredLegacy: totals.hiredLegacy,
    others: count.outros,
    monthHired: totals.monthHiredBot + totals.monthHiredLegacy,
    monthHiredBot: totals.monthHiredBot,
    monthHiredLegacy: totals.monthHiredLegacy,
    monthGoal: totals.monthGoal,
    monthly,
  };
}

// ---------------------------------------------------------------------------
// Funil + leads do NOSSO sistema no "Fluxo de Eventos Rápidos" (MiniKanban)
// numa chamada só: cada conversa da coorte vira um card na etapa derivada do
// estado real, com a etiqueta do número que atendeu (Principal, Paraná
// DPVAT...). Os cards do sistema são somente-leitura — a etapa muda sozinha
// conforme o atendimento anda.
//
// Uma coorte só (auditoria de 25/09/2026): antes o Funil (getBotFunnel) e o
// MiniKanban (getBotKanbanLeads) chamavam loadCohort cada um, e a Gestão
// Estratégica rodava a coorte 2 a 3 vezes por abertura — duas actions pesadas
// na fila serial do navegador. Agora os dois leem a MESMA classificação e
// batem por construção.

/** from/to (ISO) = calendário do dashboard (DateFilter). */
export async function getBotFunnelAndLeads(
  numberId: string | null,
  fromISO: string,
  toISO: string,
): Promise<{ funnel: BotFunnelData; leads: BotKanbanLead[] }> {
  await requireTeam();
  const range = parseRange(fromISO, toISO);
  if (!range) throw new Error('Período inválido.');
  const [cohort, totals] = await Promise.all([
    loadCohort(numberId, range.from, range.to),
    loadFunnelTotals(numberId, range.from, range.to),
  ]);
  return { funnel: computeFunnel(cohort, totals), leads: cohort.leads };
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
