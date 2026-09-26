'use server';

// Carga ÚNICA do dashboard estratégico (17/08/2026): antes cada bloco (KPIs,
// gráfico mensal, mini-kanban, funil, fluxo do kanban, meta do mês, chatbot)
// buscava seus dados por conta própria — eram 7+ idas ao servidor e a tela
// montava aos pedaços. Agora tudo sai numa chamada só, com as consultas
// rodando em paralelo, e a página só aparece com os dados completos.
//
// Sem o ramo do chatbot (auditoria de 25/09/2026): a carga única rodava
// getChatbotAnalytics a cada abertura e troca de período — a análise mais
// pesada do painel —, e a aba Chatbot rodava de novo ao ser aberta com um
// número escolhido. Agora a aba busca as próprias métricas só quando o gestor
// a abre; daqui sai só a permissão (canViewChatbot). O funil e os leads do
// Fluxo de Eventos Rápidos vêm de getBotFunnelAndLeads (bot-funnel.ts, uma
// coorte só) e as linhas da empresa, do cache SWR 'wa-number-options'.

import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { canViewChatbotDashboard } from '@/app/_shared/lib/chatbot-access';
import { fetchEventsCount, fetchEventsByMonth, fetchBotconversaAll } from '@/app/_shared/lib/db/botconversa';
import { getContratadosTagCount } from '@/app/_actions/whatsapp/tags';
import {
  getFunnelAnalytics, getKanbanFlowAnalytics, getMonthGoal,
  type FunnelAnalytics, type KanbanFlowAnalytics, type MonthGoal,
} from './get-funnel-analytics';

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

export interface StrategicDashboardData {
  counts: StrategicCounts;
  monthly: MonthlyRow[];
  kanban: DashboardKanbanItem[];
  /** Contratos fechados pelo bot (tag "Contratados" no WhatsApp). */
  contratadosBot: number;
  monthGoal: MonthGoal;
  funnel: FunnelAnalytics;
  kanbanFlow: KanbanFlowAnalytics;
  /**
   * Allowlist do painel do chatbot (canViewChatbotDashboard): mostra a aba
   * Chatbot e a Origem dos leads. A UI só esconde; o guard é o das actions.
   */
  canViewChatbot: boolean;
}

export async function getStrategicDashboardData(
  fromISO: string,
  toISO: string,
  monthKey: string,
): Promise<StrategicDashboardData> {
  const ctx = await requireTeam();

  const range = { from: new Date(fromISO), to: new Date(toISO) };
  // E-mail do banco (requireTeam), não do JWT: mesma régua das actions do painel.
  const canViewChatbot = canViewChatbotDashboard(ctx.email);

  const [counts, monthly, kanbanRows, contratadosBot, monthGoal, funnel, kanbanFlow] =
    await Promise.all([
      fetchEventsCount(range),
      fetchEventsByMonth(range.from.getFullYear(), range),
      fetchBotconversaAll(range),
      getContratadosTagCount(fromISO, toISO),
      getMonthGoal(monthKey),
      getFunnelAnalytics(fromISO, toISO),
      getKanbanFlowAnalytics(fromISO, toISO),
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
    canViewChatbot,
  };
}
