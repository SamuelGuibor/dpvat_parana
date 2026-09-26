/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { Loader2, RotateCcw, Phone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_shared/ui/tabs';
import { MiniKanban } from '@/app/nova-dash/minikanban'
import { LeadsTable } from './form-leads';
import { CalendarTab } from './CalendarTab';
import { DateFilter, getDefaultDateRange, type DateRange } from './DateFilter';
import {
  getStrategicDashboardData,
  type StrategicDashboardData,
} from '@/app/_actions/analytics/get-strategic-dashboard';
import {
  getBotFunnelAndLeads, setMonthlyHiredGoal,
  type BotFunnelData, type BotKanbanLead,
} from '@/app/_actions/analytics/bot-funnel';
import { useWaNumberOptions, type WaNumberOption } from '@/app/_shared/hooks/use-whatsapp';
import { KanbanFlowPanel } from './KanbanFlowPanel';
import { ChatbotPanel } from './workspace/chatbot/ChatbotPanel';
import { BotFunnelSection } from './workspace/manager/BotFunnelSection';
import { LeadOriginSection } from './workspace/manager/LeadOriginSection';

const NO_NUMBERS: WaNumberOption[] = [];
const NO_LEADS: BotKanbanLead[] = [];

// Reforma de 17/08/2026 (pós-migração BotConversa): os KPIs antigos (tabela
// botconversa) deram lugar ao Funil do bot, contado 100% pelo nosso banco, e o
// seletor de NÚMERO subiu para o topo — filtra o funil, a Origem dos leads, o
// Fluxo de Eventos Rápidos e a aba Chatbot inteira. Os dados históricos do
// BotConversa continuam no banco (e os cards legados aparecem no Fluxo de
// Eventos Rápidos com a etiqueta própria).
//
// Sem chamadas duplicadas (auditoria de 25/09/2026): abrir a tela rodava a
// análise do chatbot 2 vezes (3 ao trocar o período) e a coorte do funil 2 a
// 3 vezes, tudo na fila serial de server actions do navegador. Agora são três
// cargas: o funil + leads (uma coorte só, por número e período), a única
// (Analytics/Fluxo do Kanban + permissão da aba Chatbot) e, para a allowlist,
// a Origem dos leads. A aba Chatbot busca as próprias métricas só ao ser aberta.
export const StrategicDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [data, setData] = useState<StrategicDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Seletor GLOBAL de número (null = todos) — vale para a página inteira. As
  // linhas vêm do cache SWR 'wa-number-options', o mesmo do inbox: voltar a
  // esta tela não põe a action de novo na fila, e o seletor não espera a
  // carga pesada.
  const [numberId, setNumberId] = useState<string | null>(null);
  const numberOptions = useWaNumberOptions() ?? NO_NUMBERS;

  // Funil do bot + leads do NOSSO sistema no Fluxo de Eventos Rápidos: uma
  // chamada por (número, período), com a MESMA coorte — as barras do Funil e
  // as colunas do Fluxo batem por construção.
  const [funnel, setFunnel] = useState<BotFunnelData | null>(null);
  const [systemLeads, setSystemLeads] = useState<BotKanbanLead[]>(NO_LEADS);
  const [funnelLoading, setFunnelLoading] = useState(true);
  const [funnelError, setFunnelError] = useState(false);
  // "Tentar novamente" do funil só incrementa isto para o efeito rodar de novo.
  const [funnelReload, setFunnelReload] = useState(0);
  // Efeito declarado ANTES da carga única: as actions saem em fila, e o funil
  // é o primeiro bloco da tela.
  useEffect(() => {
    let alive = true;
    setFunnelLoading(true);
    setFunnelError(false);
    getBotFunnelAndLeads(numberId, dateRange.from.toISOString(), dateRange.to.toISOString())
      .then((r) => {
        if (!alive) return;
        setFunnel(r.funnel);
        setSystemLeads(r.leads);
      })
      .catch((err) => {
        // Erro de server action chega mascarado em produção: o texto real
        // fica no console e o bloco mostra a própria mensagem.
        console.error('[DASHBOARD] Falha ao carregar o funil:', err);
        if (!alive) return;
        setFunnel(null);
        setSystemLeads(NO_LEADS);
        setFunnelError(true);
      })
      .finally(() => { if (alive) setFunnelLoading(false); });
    return () => { alive = false; };
  }, [numberId, dateRange, funnelReload]);

  // Meta do mês: aparece na hora; se o servidor recusar (sem
  // manager_dashboard, rede), volta ao valor anterior com aviso.
  const handleGoalChange = async (goal: number) => {
    const prev = funnel?.monthGoal;
    if (prev == null) return;
    setFunnel((f) => (f ? { ...f, monthGoal: goal } : f));
    try {
      await setMonthlyHiredGoal(goal);
    } catch (err) {
      console.error('[DASHBOARD] Falha ao salvar a meta do mês:', err);
      // Só desfaz se a meta na tela ainda é a desta tentativa.
      setFunnel((f) => (f && f.monthGoal === goal ? { ...f, monthGoal: prev } : f));
      toast.error('Não foi possível salvar a meta do mês.');
    }
  };

  // Resposta de um período antigo (troca rápida no calendário) é descartada.
  const loadSeq = useRef(0);
  const fetchAllData = useCallback(async (range: DateRange) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(false);
    try {
      const payload = await getStrategicDashboardData(
        range.from.toISOString(),
        range.to.toISOString(),
      );
      if (seq === loadSeq.current) setData(payload);
    } catch (err) {
      // Uma falha aqui nunca vira KPI zerado "de verdade" — a página mostra o
      // erro com opção de tentar de novo.
      console.error('[DASHBOARD] Falha ao carregar métricas:', err);
      if (seq === loadSeq.current) setLoadError(true);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData(dateRange);
  }, [dateRange, fetchAllData]);

  const handleDateChange = useCallback((range: DateRange) => {
    setDateRange(range);
  }, []);

  const header = (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-3xl">Gestão Estratégica</h2>
        <p className="text-gray-500 dark:text-zinc-400">Visão completa de processos, funil e metas</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Número da empresa: filtra TUDO na página (funil, origem, chatbot). */}
        {numberOptions.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-900">
            <Phone className="h-4 w-4 text-gray-400" />
            <select
              value={numberId ?? ''}
              onChange={(e) => setNumberId(e.target.value || null)}
              className="bg-transparent py-1 text-sm font-medium text-gray-700 outline-none dark:text-zinc-200"
            >
              <option value="">Todos os números</option>
              {numberOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}{o.displayPhone ? ` (+${o.displayPhone})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <DateFilter value={dateRange} onChange={handleDateChange} />
      </div>
    </div>
  );

  const rangeISO = { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() };

  return (
    <div className="p-6 space-y-6">
      {header}

      {/* Funil do bot (substituiu os KPIs da era BotConversa): 8 KPIs + gráfico
          com Barras/Pizza/Mensal, seguindo o filtro de data e de número. Não
          espera a carga única: tem a própria chamada e o próprio spinner. */}
      <BotFunnelSection
        data={funnel}
        loading={funnelLoading}
        error={funnelError}
        onRetry={() => setFunnelReload((k) => k + 1)}
        onGoalChange={handleGoalChange}
      />

      {/* Abas: enquanto a carga única não termina, só o spinner. */}
      {loading || !data ? (
        loadError ? (
          <div className="flex h-[40vh] flex-col items-center justify-center gap-4 text-sm text-gray-500">
            <p>Não foi possível carregar as métricas do dashboard.</p>
            <Button size="sm" variant="outline" onClick={() => fetchAllData(dateRange)}>
              <RotateCcw className="mr-1 h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Carregando os dados do dashboard…</p>
          </div>
        )
      ) : (
      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo do Kanban</TabsTrigger>
          {data.canViewChatbot && <TabsTrigger value="chatbot">Chatbot</TabsTrigger>}
          <TabsTrigger value="form-leads">Leads</TabsTrigger>
          {/* <TabsTrigger value="calendario">Calendário</TabsTrigger> */}
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          {/* Legado BotConversa: o servidor já manda só os contratados do
              período (a parcela que a meta e o card "Contratados" somam). A
              referência só muda com `data` novo, e o MiniKanban recopia a
              lista a cada troca dela. */}
          <MiniKanban data={data.kanban} systemItems={systemLeads} />
          {/* Origem dos leads usa getLeadOrigins (allowlist do painel do
              chatbot). Fora da allowlist a seção nem monta, em vez de mostrar
              a caixa de erro na aba padrão. A UI só esconde: o guard continua
              no servidor. */}
          {data.canViewChatbot && (
            <LeadOriginSection numberId={numberId} range={rangeISO} />
          )}

        </TabsContent>

        <TabsContent value="fluxo" className="space-y-4">
          <KanbanFlowPanel
            data={data.kanbanFlow}
            from={rangeISO.from}
            to={rangeISO.to}
          />
        </TabsContent>

        {/* Radix só monta a aba ativa: getChatbotAnalytics roda quando o
            gestor abre a aba, já com o número e o período do topo. */}
        {data.canViewChatbot && (
          <TabsContent value="chatbot">
            <ChatbotPanel numberId={numberId} range={rangeISO} />
          </TabsContent>
        )}

        <TabsContent value="form-leads" className="space-y-4">
          <LeadsTable />
        </TabsContent>

        <TabsContent value="calendario">
          <CalendarTab />
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
};
