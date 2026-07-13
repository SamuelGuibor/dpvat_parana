/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { Button } from '@/app/_shared/ui/button';
import { BarChart3, Users, Activity, Flame, Loader2, Trophy, ChevronRight, Building2 } from 'lucide-react';
import { getTeamAnalytics, type TeamAnalytics } from '@/app/_actions/analytics/get-team-analytics';
import { getChatbotDashboardAccess } from '@/app/_actions/analytics/get-chatbot-analytics';
import { metaFor } from '@/app/_shared/utils/action-meta';
import { CollaboratorDetail } from './CollaboratorDetail';
import { ChatbotDashboard } from './ChatbotDashboard';
import { SectorDashboard } from '../SectorDashboard';
import { DateFilter, getDefaultDateRange, type DateRange } from '../../DateFilter';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'U';
}

function StatCard({ icon: Icon, label, value, gradient }: { icon: React.ElementType; label: string; value: number | string; gradient: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-lg ${gradient}`}>
      <div className="absolute -right-3 -top-3 opacity-20"><Icon className="h-16 w-16" /></div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

export function ManagerDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [tab, setTab] = useState<'equipe' | 'setores'>('equipe');
  const [data, setData] = useState<TeamAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Desempenho do Chatbot só aparece para e-mails autorizados (allowlist própria).
  const [chatbotAccess, setChatbotAccess] = useState(false);

  useEffect(() => {
    getChatbotDashboardAccess().then(setChatbotAccess).catch(() => setChatbotAccess(false));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getTeamAnalytics({ from: dateRange.from.toISOString(), to: dateRange.to.toISOString() })
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e?.message ?? 'Erro ao carregar.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dateRange]);

  const maxTotal = useMemo(() => Math.max(1, ...(data?.ranking.map((r) => r.total) ?? [1])), [data]);
  const heatMax = useMemo(() => Math.max(1, ...((data?.heatmap ?? []).flat())), [data]);
  if (selected) {
    return <CollaboratorDetail userId={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="mx-auto max-w-8xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-zinc-100">
            <BarChart3 className="h-6 w-6 text-blue-500" /> Visão do Gestor
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {tab === 'equipe'
              ? 'Produtividade e ritmo da equipe · clique num colaborador para ver o detalhe.'
              : 'Rendimento por setor, ranking interno e gestão das funções da equipe.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Abas: Equipe | Setores */}
          <div className="flex gap-1 rounded-lg border border-gray-200 p-1 dark:border-zinc-700">
            <Button size="sm" variant={tab === 'equipe' ? 'default' : 'ghost'} onClick={() => setTab('equipe')} className="h-7 px-3 text-xs">
              <Users className="mr-1.5 h-3.5 w-3.5" /> Equipe
            </Button>
            <Button size="sm" variant={tab === 'setores' ? 'default' : 'ghost'} onClick={() => setTab('setores')} className="h-7 px-3 text-xs">
              <Building2 className="mr-1.5 h-3.5 w-3.5" /> Setores
            </Button>
          </div>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {tab === 'setores' ? (
        <SectorDashboard range={dateRange} />
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/10">{error}</div>
      ) : loading || !data ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard icon={Activity} label="Ações no período" value={data.totals.logs} gradient="bg-gradient-to-br from-blue-500 to-indigo-600" />
            <StatCard icon={Users} label="Colaboradores ativos" value={data.totals.activeCollaborators} gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
            <StatCard icon={Flame} label="Online agora" value={data.totals.onlineNow} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
            <StatCard icon={Trophy} label={`Líder do período: ${data.ranking[0]?.name ?? ''}`} value={data.ranking[0]?.total ?? 0} gradient="bg-gradient-to-br from-orange-500 to-rose-600" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Ranking clicável */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                <Trophy className="h-4 w-4 text-amber-500" /> Ranking de produtividade
              </h2>
              {data.ranking.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Sem atividade no período.</p>
              ) : (
                <ol className="space-y-1">
                  {data.ranking.map((r, i) => (
                    <li key={r.id}>
                      <button
                        onClick={() => setSelected(r.id)}
                        className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800"
                      >
                        <span className="w-5 shrink-0 text-center text-sm font-bold text-gray-400 tabular-nums">{i + 1}</span>
                        <Avatar className="h-9 w-9 border border-gray-100 dark:border-zinc-800">
                          {r.image && <AvatarImage src={r.image} alt={r.name} />}
                          <AvatarFallback className="bg-blue-100 text-[10px] font-bold text-blue-700">{initials(r.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">{r.name}</p>
                            <span className="text-sm font-bold text-gray-900 tabular-nums dark:text-zinc-100">{r.total}</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600" style={{ width: `${(r.total / maxTotal) * 100}%` }} />
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Heatmap */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-3">
              <h2 className="mb-1 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                <Activity className="h-4 w-4 text-violet-500" /> Atividade por horário
              </h2>
              <p className="mb-4 text-xs text-gray-400">Picos e ociosidade por dia da semana e hora (horário de Brasília).</p>
              <div className="overflow-x-auto">
                <div className="min-w-[560px]">
                  <div className="mb-1 flex pl-8 text-[9px] text-gray-400">
                    {Array.from({ length: 24 }).map((_, h) => (
                      <div key={h} className="flex-1 text-center">{h % 3 === 0 ? h : ''}</div>
                    ))}
                  </div>
                  {data.heatmap.map((row, day) => (
                    <div key={day} className="mb-0.5 flex items-center">
                      <span className="w-8 shrink-0 text-[10px] font-semibold text-gray-400">{WEEKDAYS[day]}</span>
                      <div className="flex flex-1 gap-0.5">
                        {row.map((count, h) => {
                          const intensity = count === 0 ? 0 : 0.15 + 0.85 * (count / heatMax);
                          return (
                            <div
                              key={h}
                              title={`${WEEKDAYS[day]} ${h}h — ${count} ${count === 1 ? 'ação' : 'ações'}`}
                              className="aspect-square flex-1 rounded-[3px] border border-gray-100 dark:border-zinc-800"
                              style={{ backgroundColor: count === 0 ? undefined : `rgba(99,102,241,${intensity})` }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Dashboard do chatbot (métricas da IA + gasto da API) — só para autorizados. */}
          {chatbotAccess && (
            <div className="mt-10">
              <ChatbotDashboard />
            </div>
          )}
        </>
      )}
    </div>
  );
}
