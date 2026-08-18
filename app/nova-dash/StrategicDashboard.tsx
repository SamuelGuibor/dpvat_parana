/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import React, { useEffect, useState, useCallback } from 'react';
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
import { getBotKanbanLeads, type BotKanbanLead } from '@/app/_actions/analytics/bot-funnel';
import { listWaNumberOptions } from '@/app/_actions/whatsapp/numbers';
import { KanbanFlowPanel } from './KanbanFlowPanel';
import { ChatbotPanel } from './workspace/chatbot/ChatbotPanel';
import { BotFunnelSection } from './workspace/manager/BotFunnelSection';
import { LeadOriginSection } from './workspace/manager/LeadOriginSection';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Reforma de 17/08/2026 (pós-migração BotConversa): os KPIs antigos (tabela
// botconversa) deram lugar ao Funil do bot, contado 100% pelo nosso banco, e o
// seletor de NÚMERO subiu para o topo — filtra o funil, a Origem dos leads, o
// Fluxo de Eventos Rápidos e a aba Chatbot inteira. Os dados históricos do
// BotConversa continuam no banco (e os cards legados aparecem no Fluxo de
// Eventos Rápidos com a etiqueta própria).
export const StrategicDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [data, setData] = useState<StrategicDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Seletor GLOBAL de número (null = todos) — vale para a página inteira.
  const [numberId, setNumberId] = useState<string | null>(null);
  const [numberOptions, setNumberOptions] = useState<{ id: string; label: string; displayPhone: string | null }[]>([]);
  useEffect(() => {
    listWaNumberOptions().then(setNumberOptions).catch(() => setNumberOptions([]));
  }, []);

  // Leads do NOSSO sistema no Fluxo de Eventos Rápidos (segue o número).
  const [systemLeads, setSystemLeads] = useState<BotKanbanLead[]>([]);
  useEffect(() => {
    let alive = true;
    getBotKanbanLeads(numberId)
      .then((rows) => { if (alive) setSystemLeads(rows); })
      .catch(() => { if (alive) setSystemLeads([]); });
    return () => { alive = false; };
  }, [numberId]);

  const fetchAllData = useCallback(async (range: DateRange) => {
    setLoading(true);
    setLoadError(false);
    try {
      const payload = await getStrategicDashboardData(
        range.from.toISOString(),
        range.to.toISOString(),
        currentMonthKey(),
      );
      setData(payload);
    } catch (err) {
      // Uma falha aqui nunca vira KPI zerado "de verdade" — a página mostra o
      // erro com opção de tentar de novo.
      console.error('[DASHBOARD] Falha ao carregar métricas:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
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

  // Tudo ou nada: enquanto a carga única não termina, só o cabeçalho + spinner.
  if (loading || !data) {
    return (
      <div className="p-6 space-y-6">
        {header}
        {loadError ? (
          <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-sm text-gray-500">
            <p>Não foi possível carregar as métricas do dashboard.</p>
            <Button size="sm" variant="outline" onClick={() => fetchAllData(dateRange)}>
              <RotateCcw className="mr-1 h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="flex h-[50vh] flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Carregando todos os dados do dashboard…</p>
          </div>
        )}
      </div>
    );
  }

  const { kanban, kanbanFlow, chatbot } = data;

  return (
    <div className="p-6 space-y-6">
      {header}

      {/* Funil do bot (substituiu os KPIs da era BotConversa): 8 KPIs + gráfico
          com Barras/Pizza/Mensal, seguindo o filtro de data e de número. */}
      <BotFunnelSection
        numberId={numberId}
        range={{ from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }}
      />

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo do Kanban</TabsTrigger>
          {chatbot && <TabsTrigger value="chatbot">Chatbot</TabsTrigger>}
          <TabsTrigger value="form-leads">Leads</TabsTrigger>
          {/* <TabsTrigger value="calendario">Calendário</TabsTrigger> */}
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          <MiniKanban data={kanban} systemItems={systemLeads} />
          <LeadOriginSection numberId={numberId} />

        </TabsContent>

        <TabsContent value="fluxo" className="space-y-4">
          <KanbanFlowPanel
            data={kanbanFlow}
            from={dateRange.from.toISOString()}
            to={dateRange.to.toISOString()}
          />
        </TabsContent>

        {chatbot && (
          <TabsContent value="chatbot">
            <ChatbotPanel initialAnalytics={chatbot.analytics} numberOptions={chatbot.numberOptions} numberId={numberId} />
          </TabsContent>
        )}

        <TabsContent value="form-leads" className="space-y-4">
          <LeadsTable />
        </TabsContent>

        <TabsContent value="calendario">
          <CalendarTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
