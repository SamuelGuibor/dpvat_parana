/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/_shared/ui/card';
import { Button } from '@/app/_shared/ui/button';
import {
  Loader2, RotateCcw, Square, Target, Pencil, Check,
  PlayCircle, MessageCircleQuestion, Files, UserX, UserMinus, UserCheck,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_shared/ui/tabs';
import { toast } from 'sonner';
import { MiniKanban } from '@/app/nova-dash/minikanban'
import { LeadsTable } from './form-leads';
import { CalendarTab } from './CalendarTab';
import { DateFilter, getDefaultDateRange, type DateRange } from './DateFilter';
import {
  getFunnelAnalytics, getMonthGoal, setMonthGoal,
  type FunnelAnalytics,
} from '@/app/_actions/analytics/get-funnel-analytics';
import { usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';

type Counts = {
  contratado?: number;
  iniciado?: number;
  em_honorario?: number;
  em_conversa?: number;
  aguardando?: number;
  nao_contratado?: number;
  nao_qualificado?: number;
  enviou_documentos?: number
};

function buildDateParams(range: DateRange): string {
  return `from=${range.from.toISOString()}&to=${range.to.toISOString()}`;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Card "Meta do mês": contratos fechados vs meta definida pelo gestor (model
// Goal no banco) — substitui o antigo alerta mock "Meta mensal atingida em 85%".
function MonthGoalCard({ contratado, loading }: { contratado: number; loading: boolean }) {
  const { perms } = usePermissions();
  const month = currentMonthKey();
  const [target, setTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMonthGoal(month).then((g) => setTarget(g.target)).catch(() => { });
  }, [month]);

  async function save() {
    const value = parseInt(draft, 10);
    if (Number.isNaN(value) || value < 0) {
      toast.error('Informe um número válido.');
      return;
    }
    setSaving(true);
    try {
      const g = await setMonthGoal(month, value);
      setTarget(g.target);
      setEditing(false);
      toast.success('Meta do mês atualizada!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar a meta');
    } finally {
      setSaving(false);
    }
  }

  const pct = target && target > 0 ? Math.min(100, Math.round((contratado / target) * 100)) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-md">Meta do mês (contratos)</CardTitle>
        <Target className="text-purple-600" size={28} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[60px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-zinc-500" />
          </div>
        ) : editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-24 rounded-md border border-gray-300 dark:border-zinc-700 px-2 py-1.5 text-sm"
              placeholder="Meta"
              autoFocus
            />
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <div className="text-4xl font-bold text-purple-600">
                {contratado}
                <span className="text-lg text-gray-400 font-semibold"> / {target ?? '—'}</span>
              </div>
              {perms.manager_dashboard && (
                <button
                  onClick={() => { setDraft(String(target ?? '')); setEditing(true); }}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                  title="Definir meta do mês"
                >
                  <Pencil className="w-3.5 h-3.5" /> {target == null ? 'Definir meta' : 'Editar'}
                </button>
              )}
            </div>
            {pct != null ? (
              <div>
                <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-zinc-800">
                  <div
                    className={`h-2 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-purple-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">{pct}% da meta do mês</p>
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Nenhuma meta definida para este mês.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Funil real do kanban: entradas por coluna + tempo médio na etapa, calculado
// dos logs de movimentação — nada de dados fictícios.
function KanbanFunnel({ range }: { range: DateRange }) {
  const [data, setData] = useState<FunnelAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getFunnelAnalytics(range.from.toISOString(), range.to.toISOString())
      .then(setData)
      .catch((err) => {
        console.error('[FUNNEL]', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fluxo do Kanban no período</CardTitle>
        <CardDescription>
          Quantos cards entraram em cada coluna e quanto tempo (médio) ficam na etapa — calculado
          dos registros reais de movimentação.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[300px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 text-sm text-gray-500">
            <p>Não foi possível carregar o fluxo do kanban.</p>
            <Button size="sm" variant="outline" onClick={load}>
              <RotateCcw className="mr-1 h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        ) : !data || data.stages.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">
            Nenhuma movimentação de card registrada no período selecionado.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(220, data.stages.length * 34)}>
              <BarChart data={data.stages} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis dataKey="column" type="category" width={220} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any, name: any) => [value, name === 'entries' ? 'Cards que entraram' : name]}
                />
                <Bar dataKey="entries" fill="#3b82f6" name="Cards que entraram" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {data.stages.filter((s) => s.avgDaysBeforeLeaving != null).slice(0, 8).map((s) => (
                <p key={s.column} className="text-xs text-gray-500 dark:text-zinc-400">
                  <span className="font-semibold text-gray-700 dark:text-zinc-200">{s.column}:</span>{' '}
                  {s.avgDaysBeforeLeaving} dia(s) em média na etapa
                </p>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const StrategicDashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [kanbanItems, setKanbanItems] = useState([])

  const fetchAllData = useCallback(async (range: DateRange) => {
    setLoading(true);
    try {
      setLoadError(false);
      const params = buildDateParams(range);

      const [countsRes, monthRes, kanbanRes] = await Promise.all([
        fetch(`/api/botconversa/counts?${params}`, { cache: 'no-store' }),
        fetch(`/api/botconversa/monthly?${params}`, { cache: 'no-store' }),
        fetch(`/api/botconversa/get-kanban?${params}`, { cache: 'no-store' }),
      ]);
      if (!countsRes.ok || !monthRes.ok || !kanbanRes.ok) {
        throw new Error('Falha ao buscar métricas');
      }

      const [countsData, monthData, kanbanData] = await Promise.all([
        countsRes.json(),
        monthRes.json(),
        kanbanRes.json(),
      ]);

      setCounts(countsData);
      setMonthlyData(monthData);
      setKanbanItems(kanbanData);
    } catch (err) {
      // Antes uma falha aqui deixava os KPIs em ZERO como se fosse dado real —
      // o gestor podia tomar decisão com base em zero falso.
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

  const currentMonthIndex = new Date().getMonth();
  const contratadoMesAtual = monthlyData[currentMonthIndex]?.aprovados ?? 0;

  const soma_indeferidos = (counts.nao_contratado ?? 0) + (counts.nao_qualificado ?? 0);
  const soma_analise = (counts.em_conversa ?? 0) + (counts.em_honorario ?? 0) + (counts.enviou_documentos ?? 0)
  const soma_aguardando = (counts.aguardando ?? 0) + (counts.iniciado ?? 0)

  const statusDistribution = [
    { name: 'Aprovados', value: counts.contratado ?? 0, color: '#10b981' },
    { name: 'Indeferidos', value: soma_indeferidos, color: '#ef4444' },
    { name: 'Em Análise', value: soma_analise, color: '#3b82f6' },
    { name: 'Aguardando', value: soma_aguardando, color: '#f59e0b' },
  ];

  const renderLabel = ({
    name,
    percent,
    value,
  }: {
    name: string;
    percent: number;
    value: number;
  }) => {
    if (value === 0) return null;

    return `${name}: ${(percent * 100).toFixed(0)}%`;
  };

  const kpis: { title: string; value: number | undefined; color: string; icon: React.ReactNode }[] = [
    { title: 'Iniciados', value: counts.iniciado, color: 'text-gray-900 dark:text-zinc-100', icon: <PlayCircle className="text-gray-700 dark:text-zinc-300" size={28} /> },
    { title: 'Em conversa - Explicação', value: counts.em_conversa, color: 'text-blue-600', icon: <MessageCircleQuestion className="text-blue-600" size={28} /> },
    { title: 'Enviada Lista Documentos', value: counts.enviou_documentos, color: 'text-blue-600', icon: <Files className="text-blue-600" size={28} /> },
    { title: 'Não Contratado', value: counts.nao_contratado, color: 'text-red-600', icon: <UserX className="text-red-600" size={28} /> },
    { title: 'Não Qualificado', value: counts.nao_qualificado, color: 'text-[#8a0303]', icon: <UserMinus className="text-[#8a0303]" size={28} /> },
    { title: 'Contratado', value: counts.contratado, color: 'text-green-600', icon: <UserCheck className="text-green-600" size={28} /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl">Gestão Estratégica</h2>
          <p className="text-gray-500 dark:text-zinc-400">Visão completa de processos, funil e metas</p>
        </div>
        <DateFilter value={dateRange} onChange={handleDateChange} />
      </div>

      {loadError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <span>Não foi possível carregar as métricas — os números abaixo podem estar incompletos.</span>
          <Button size="sm" variant="outline" onClick={() => fetchAllData(dateRange)}>
            <RotateCcw className="mr-1 h-4 w-4" /> Tentar novamente
          </Button>
        </div>
      )}

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-md">{kpi.title}</CardTitle>
              {kpi.icon}
            </CardHeader>
            <CardContent className="h-[60px] flex items-center justify-center">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-zinc-500" />
              ) : (
                <div className={`text-6xl font-bold ${kpi.color}`}>{kpi.value ?? 0}</div>
              )}
            </CardContent>
          </Card>
        ))}

        <MonthGoalCard contratado={contratadoMesAtual} loading={loading} />
      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="form-leads">Leads</TabsTrigger>
          <TabsTrigger value="calendario">Calendário</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gráfico de Processos por Mês */}
            <Card>
              <CardHeader>
                <CardTitle>Processos por Mês</CardTitle>
                <CardDescription>Comparativo de aprovados, indeferidos e em andamento</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="aprovados" fill="#10b981" name="Aprovados" />
                    <Bar dataKey="indeferidos" fill="#ef4444" name="Indeferidos" />
                    <Bar dataKey="emAndamento" fill="#3b82f6" name="Em Andamento" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráfico de Pizza - Distribuição */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Status</CardTitle>
                <CardDescription>Visão geral do pipeline atual</CardDescription>
              </CardHeader>
              <div className="relative space-y-1 text-sm left-5">
                <div className="flex items-center gap-2">
                  <Square className="h-3 w-3 fill-[#f59e0b] text-[#f59e0b]" />
                  <span>Iniciado</span>
                </div>

                <div className="flex items-center gap-2">
                  <Square className="h-3 w-3 fill-[#3b82f6] text-[#3b82f6]" />
                  <span>Em conversa | Envio Documentos</span>
                </div>

                <div className="flex items-center gap-2">
                  <Square className="h-3 w-3 fill-[#ef4444] text-[#ef4444]" />
                  <span>Não Qualificado | Não contratado</span>
                </div>

                <div className="flex items-center gap-2">
                  <Square className="h-3 w-3 fill-[#10b981] text-[#10b981]" />
                  <span>Contratado</span>
                </div>
              </div>

              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderLabel}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <KanbanFunnel range={dateRange} />

          <MiniKanban data={kanbanItems} />
        </TabsContent>

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
