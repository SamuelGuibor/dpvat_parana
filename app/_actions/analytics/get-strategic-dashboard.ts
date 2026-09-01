'use server';

// Carga ÚNICA do dashboard estratégico (17/08/2026): antes cada bloco (KPIs,
// gráfico mensal, mini-kanban, funil, fluxo do kanban, meta do mês, chatbot)
// buscava seus dados por conta própria — eram 7+ idas ao servidor e a tela
// montava aos pedaços. Agora tudo sai numa chamada só, com as consultas
// rodando em paralelo, e a página só aparece com os dados completos.

import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { fetchEventsCount, fetchEventsByMonth, fetchBotconversaAll } from '@/app/_shared/lib/db/botconversa';
import { getContratadosTagCount } from '@/app/_actions/whatsapp/tags';
import { listWaNumberOptions } from '@/app/_actions/whatsapp/numbers';
import {
  getFunnelAnalytics, getKanbanFlowAnalytics, getMonthGoal,
  type FunnelAnalytics, type KanbanFlowAnalytics, type MonthGoal,
} from './get-funnel-analytics';
import {
  getChatbotAnalytics, getChatbotDashboardAccess, type ChatbotAnalytics,
} from './get-chatbot-analytics';

export interface StrategicCounts {
  contratado?: number;
  iniciado?: number;
  em_honorario?: number;
  em_conversa?: number;
  aguardando?: number;
  nao_contratado?: number;
  nao_qualificado?: number;
  enviou_documentos?: number;
}

export interface MonthlyRow {
  month: string;
  aprovados: number;
  indeferidos: number;
  emAndamento: number;
}

export interface DashboardKanbanItem {
  id: string;
  nome: string;
  telefone: string;
  evento: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WaNumberOption {
  id: string;
  label: string;
  displayPhone: string | null;
}

export interface StrategicDashboardData {
  counts: StrategicCounts;
  monthly: MonthlyRow[];
  kanban: DashboardKanbanItem[];
  /** Contratos fechados pelo bot (tag "Contratados" no WhatsApp). */
  contratadosBot: number;
  monthGoal: MonthGoal;
  funnel: FunnelAnalytics;
  kanbanFlow: KanbanFlowAnalytics;
  /** null = usuário fora da allowlist do dashboard do chatbot. */
  chatbot: { analytics: ChatbotAnalytics; numberOptions: WaNumberOption[] } | null;
}

export async function getStrategicDashboardData(
  fromISO: string,
  toISO: string,
  monthKey: string,
): Promise<StrategicDashboardData> {
  await requireTeam();

  const range = { from: new Date(fromISO), to: new Date(toISO) };
  const canViewChatbot = await getChatbotDashboardAccess();

  const [counts, monthly, kanbanRows, contratadosBot, monthGoal, funnel, kanbanFlow, chatbot] =
    await Promise.all([
      fetchEventsCount(range),
      fetchEventsByMonth(range.from.getFullYear(), range),
      fetchBotconversaAll(range),
      getContratadosTagCount(fromISO, toISO),
      getMonthGoal(monthKey),
      getFunnelAnalytics(fromISO, toISO),
      getKanbanFlowAnalytics(fromISO, toISO),
      canViewChatbot
        // A aba Chatbot nasce no MESMO período do calendário do dashboard
        // (antes era 7 dias fixos, ignorando o filtro).
        ? Promise.all([getChatbotAnalytics(7, null, fromISO, toISO), listWaNumberOptions()]).then(
            ([analytics, numberOptions]) => ({ analytics, numberOptions }),
          )
        : Promise.resolve(null),
    ]);

  return {
    counts: counts as StrategicCounts,
    monthly,
    kanban: kanbanRows.map((r) => ({
      id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      evento: r.evento,
      createdAt: r.createdAt?.toISOString() ?? null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    })),
    contratadosBot,
    monthGoal,
    funnel,
    kanbanFlow,
    chatbot,
  };
}
