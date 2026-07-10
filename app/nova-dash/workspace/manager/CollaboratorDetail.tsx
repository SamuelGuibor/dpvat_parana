'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { Badge } from '@/app/_shared/ui/badge';
import { Button } from '@/app/_shared/ui/button';
import { ArrowLeft, Loader2, Activity, TrendingUp, CalendarDays, PieChart, Clock, ShieldCheck } from 'lucide-react';
import { getCollaboratorDetail, type CollaboratorDetail as Detail } from '@/app/_actions/analytics/get-collaborator-detail';
import { metaFor } from '@/app/_shared/utils/action-meta';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'U';
}

function Kpi({ label, value, hint, tone = 'blue' }: { label: string; value: number | string; hint?: string; tone?: string }) {
  const tones: Record<string, string> = {
    blue: 'from-blue-500 to-indigo-600', violet: 'from-violet-500 to-purple-600',
    emerald: 'from-emerald-500 to-teal-600', amber: 'from-amber-500 to-orange-600', rose: 'from-orange-500 to-rose-600',
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-white/70">{hint}</p>}
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-zinc-100">
        <Icon className="h-4 w-4 text-blue-500" /> {title}
      </h3>
      {children}
    </section>
  );
}

export function CollaboratorDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCollaboratorDetail(userId, period)
      .then((d) => { if (alive) setData(d); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, period]);

  const actionRows = useMemo(() => {
    if (!data) return [];
    const total = Object.values(data.byAction).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(data.byAction)
      .map(([k, v]) => ({ key: k, ...metaFor(k), value: v, pct: Math.round((v / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const hourlyData = useMemo(() => (data?.hourly ?? []).map((c, h) => ({ h, label: `${h}h`, count: c })), [data]);
  const weekdayData = useMemo(() => (data?.weekday ?? []).map((c, d) => ({ label: WEEKDAYS[d], count: c })), [data]);
  const peakHour = useMemo(() => {
    if (!data) return null;
    let idx = -1; let max = 0;
    data.hourly.forEach((c, h) => { if (c > max) { max = c; idx = h; } });
    return idx >= 0 && max > 0 ? `${idx}h` : '—';
  }, [data]);

  return (
    <div className="mx-auto max-w-8xl px-6 py-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 gap-1.5 text-gray-500">
        <ArrowLeft className="h-4 w-4" /> Voltar à equipe
      </Button>

      {loading || !data ? (
        <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          {/* Cabeçalho do colaborador */}
          <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="relative">
              <Avatar className="h-16 w-16 border-2 border-white shadow-md dark:border-zinc-800">
                {data.profile.image && <AvatarImage src={data.profile.image} alt={data.profile.name} />}
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">{initials(data.profile.name)}</AvatarFallback>
              </Avatar>
              <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-white dark:ring-zinc-900 ${data.profile.online ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-600'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-zinc-100">{data.profile.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-zinc-400">
                <Badge variant="secondary" className="gap-1 text-[10px]"><ShieldCheck className="h-3 w-3" /> {data.profile.role}</Badge>
                {data.profile.email && <span className="text-xs">{data.profile.email}</span>}
                <span className="text-xs">
                  {data.profile.online ? 'online agora' : data.profile.lastSeenAt
                    ? `visto ${formatDistanceToNow(new Date(data.profile.lastSeenAt), { addSuffix: true, locale: ptBR })}` : 'sem registro'}
                </span>
              </div>
            </div>
            <div className="flex gap-1 rounded-lg border border-gray-200 p-1 dark:border-zinc-700">
              {([7, 30, 90] as const).map((p) => (
                <Button key={p} size="sm" variant={period === p ? 'default' : 'ghost'} onClick={() => setPeriod(p)} className="h-7 px-3 text-xs">{p}d</Button>
              ))}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Hoje" value={data.totals.today} tone="blue" />
            <Kpi label="Semana" value={data.totals.week} tone="violet" />
            <Kpi label="Mês" value={data.totals.month} tone="emerald" />
            <Kpi label={`Período (${period}d)`} value={data.totals.period} tone="amber" />
            <Kpi label="Ranking" value={`#${data.team.rank}`} hint={`de ${data.team.totalCollaborators}`} tone="rose" />
            <Kpi label="Fatia da equipe" value={`${data.team.sharePct}%`} hint={`${data.totals.allTime} nos últimos 90d`} tone="blue" />
          </div>

          {/* Gráficos: diário + por tipo */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Card title={`Atividade diária (${period} dias)`} icon={TrendingUp}>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.daily} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                      <defs>
                        <linearGradient id="collabAct" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={period > 30 ? 6 : Math.floor(period / 7)} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }} formatter={(v: number) => [`${v} ${v === 1 ? 'ação' : 'ações'}`, '']} />
                      <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} fill="url(#collabAct)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <div className="lg:col-span-2">
              <Card title="Por tipo de ação" icon={PieChart}>
                {actionRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">Sem atividade.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {actionRows.map((r) => {
                      const Icon = r.icon;
                      return (
                        <li key={r.key} className="flex items-center gap-3">
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${r.tint}`}><Icon className="h-4 w-4" /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 dark:text-zinc-300">{r.label}</span>
                              <span className="font-bold text-gray-900 tabular-nums dark:text-zinc-100">{r.value}</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                              <div className={`h-full rounded-full ${r.bar}`} style={{ width: `${r.pct}%` }} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          {/* Gráficos: hora + dia da semana */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Card title="Distribuição por hora (Brasília)" icon={Clock}>
                <p className="-mt-2 mb-2 text-xs text-gray-400">Pico às <span className="font-semibold text-gray-600 dark:text-zinc-300">{peakHour}</span></p>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -28, bottom: 0 }}>
                      <XAxis dataKey="h" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={2} />
                      <Tooltip cursor={{ fill: 'rgba(59,130,246,.08)' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }} formatter={(v: number) => [`${v} ações`, '']} labelFormatter={(l) => `${l}h`} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                        {hourlyData.map((d) => <Cell key={d.h} fill={d.count > 0 ? '#6366f1' : '#e5e7eb'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            <div className="lg:col-span-2">
              <Card title="Por dia da semana" icon={CalendarDays}>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekdayData} margin={{ top: 5, right: 5, left: -28, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(139,92,246,.08)' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }} formatter={(v: number) => [`${v} ações`, '']} />
                      <Bar dataKey="count" radius={[3, 3, 0, 0]} fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>

          {/* Feed — todos os logs do filtro ativo (7/30/90 dias), com rolagem */}
          <div className="mt-4">
            <Card title={`Atividade no período (${period} dias) — ${data.feed.length} ${data.feed.length === 1 ? 'ação' : 'ações'}`} icon={Activity}>
              {data.feed.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Nenhuma atividade.</p>
              ) : (
                <ol className="max-h-[32rem] space-y-1 overflow-y-auto pr-2">
                  {data.feed.map((item, idx) => {
                    const meta = metaFor(item.action);
                    const Icon = meta.icon;
                    const last = idx === data.feed.length - 1;
                    return (
                      <li key={item.id} className="relative flex gap-3 pb-3">
                        {!last && <span className="absolute left-[15px] top-8 h-full w-px bg-gray-100 dark:bg-zinc-800" />}
                        <span className={`z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white dark:ring-zinc-900 ${meta.tint}`}><Icon className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-sm text-gray-700 dark:text-zinc-200">
                            {item.message}
                            {item.targetName && <span className="font-semibold text-gray-900 dark:text-zinc-100"> · {item.targetName}</span>}
                          </p>
                          <p className="text-[11px] text-gray-400">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
