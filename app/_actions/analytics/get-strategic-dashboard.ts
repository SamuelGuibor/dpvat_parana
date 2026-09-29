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
//
// Sem ramos mortos (auditoria de 25/09/2026): a carga ainda buscava contagens
// e série mensal do BotConversa, contagem da tag Contratados, meta legada
// (Goal) e o funil antigo por logs `move` — nada disso era lido pela tela. E o
// legado inteiro do período ia ao navegador (~1,3 MB em "Tudo") só para o
// cliente filtrar os contratados. Sobram o Fluxo do Kanban, os contratados do
// legado (filtrados aqui) e a permissão da aba Chatbot.

import { db } from '@/app/_shared/lib/prisma';
import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { canViewChatbotDashboard } from '@/app/_shared/lib/chatbot-access';
import { getKanbanFlowAnalytics, type KanbanFlowAnalytics } from './get-funnel-analytics';

export interface DashboardKanbanItem {
  id: string;
  nome: string;
  telefone: string;
  evento: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StrategicDashboardData {
  /**
   * Legado BotConversa: só os CONTRATADOS que entraram no período (createdAt,
   * 14/09/2026) — são a parcela que a meta e o card "Contratados" somam. As outras etapas legadas
   * não existem no Funil e só inflavam as colunas do Fluxo de Eventos Rápidos.
   */
  kanban: DashboardKanbanItem[];
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
): Promise<StrategicDashboardData> {
  const ctx = await requireTeam();

  const from = new Date(fromISO);
  const to = new Date(toISO);
  // E-mail do banco (requireTeam), não do JWT: mesma régua das actions do painel.
  const canViewChatbot = canViewChatbotDashboard(ctx.email);

  const [legacyHired, kanbanFlow] = await Promise.all([
    // Só as colunas que o MiniKanban mostra; mesma ordem do fetchBotconversaAll
    // (mais recente primeiro), que continua servindo /api/botconversa/get-kanban.
    db.botconversa.findMany({
      where: { evento: 'contratado', createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, nome: true, telefone: true, evento: true, createdAt: true, updatedAt: true },
    }),
    getKanbanFlowAnalytics(fromISO, toISO),
  ]);

  return {
    kanban: legacyHired.map((r) => ({
      id: r.id,
      nome: r.nome,
      telefone: r.telefone,
      evento: r.evento,
      createdAt: r.createdAt?.toISOString() ?? null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    })),
    kanbanFlow,
    canViewChatbot,
  };
}
