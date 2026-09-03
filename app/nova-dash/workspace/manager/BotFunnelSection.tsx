'use client';

import { useEffect, useState } from 'react';
import { Loader2, Filter as FunnelIcon, Pencil, Check, X } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend, CartesianGrid,
} from 'recharts';
import { getBotFunnel, setMonthlyHiredGoal, type BotFunnelData } from '@/app/_actions/analytics/bot-funnel';

// Funil do bot da IA — layout 50/50 aprovado em 17/08/2026: à esquerda os 8
// KPIs compactos, à direita o mesmo funil como gráfico com toggle
// Barras/Pizza. Tudo contado pelo nosso banco (nada do BotConversa

function Kpi({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <p className={`text-[11px] font-semibold ${className ?? 'text-gray-400'}`}>{label}</p>
      <p className="text-xl font-extrabold tabular-nums text-gray-800 dark:text-zinc-100">
        {value.toLocaleString('pt-BR')}
      </p>
    </div>
  );
}

export function BotFunnelSection({ period = 30, numberId, range }: {
  period?: number;
  numberId: string | null;
  /** Intervalo livre (dashboard geral) — tem prioridade sobre `period`. */
  range?: { from: string; to: string };
}) {
  const [data, setData] = useState<BotFunnelData | null>(null);
  const [error, setError] = useState(false);
  const [chart, setChart] = useState<'bar' | 'pie' | 'month'>('bar');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    getBotFunnel(period, numberId, range?.from, range?.to)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [period, numberId, range?.from, range?.to]);

  const saveGoal = async () => {
    const n = Math.round(Number(goalDraft));
    setEditingGoal(false);
    if (!data || !Number.isFinite(n) || n < 1) return;
    const prev = data.monthGoal;
    setData({ ...data, monthGoal: n });
    try {
      await setMonthlyHiredGoal(n);
    } catch {
      setData((d) => (d ? { ...d, monthGoal: prev } : d));
    }
  };

  // Etapas EXCLUSIVAS da coorte (cada conversa em uma só) — somam exatamente
  // "Iniciados". Alimentam as Barras (funil do período) e a Pizza. Antes a
  // pizza tirava "Iniciado" por subtração de contagens sobrepostas e a fatia
  // dava negativo (sumia sempre).
  const stages = data
    ? [
        { name: 'Em conversa', value: data.inConversation, color: '#3b82f6' },
        { name: 'Lista docs', value: data.docsSent, color: '#6366f1' },
        { name: 'Não contratado', value: data.notHired, color: '#f59e0b' },
        { name: 'Não qualificado', value: data.disqualified, color: '#ef4444' },
        { name: 'Contratado', value: data.hired, color: '#10b981' },
        { name: 'Outros', value: data.others, color: '#9ca3af' },
      ]
    : [];
  const distribution = stages.filter((d) => d.value > 0);

  return (
    <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold tracking-tight text-gray-900 dark:text-zinc-100">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-500 text-white">
          <FunnelIcon className="h-5 w-5" />
        </span>
        Funil do bot
        <span className="text-xs font-semibold text-gray-400">
          conversas criadas no período{range ? '' : ` · ${period} dias`}
        </span>
      </h2>

      {error ? (
        <p className="text-sm text-red-600">Não foi possível carregar o funil.</p>
      ) : !data ? (
        <div className="grid h-56 place-items-center text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Esquerda: 8 KPIs compactos */}
          <div className="grid grid-cols-2 content-start gap-2">
            <Kpi label="Iniciados" value={data.started} />
            <Kpi label="Em conversa" value={data.inConversation} className="text-blue-600" />
            <Kpi label="Lista docs" value={data.docsSent} className="text-indigo-500" />
            <Kpi label="Não contratados" value={data.notHired} />
            <Kpi label="Não qualificados" value={data.disqualified} className="text-rose-600" />
            <Kpi label="Qualificados" value={data.qualified} className="text-teal-600" />
            <Kpi label="Contratados" value={data.hired} className="text-emerald-600" />
            <Kpi label="Outros desfechos" value={data.others} />
            {/* Meta do mês com barra embutida (clique no lápis para editar) */}
            <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="flex items-center justify-between text-[11px] font-semibold text-gray-400">
                Meta do mês
                {!editingGoal && (
                  <button
                    onClick={() => { setGoalDraft(String(data.monthGoal)); setEditingGoal(true); }}
                    className="text-gray-300 transition-colors hover:text-gray-500"
                    title="Editar meta"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </p>
              {editingGoal ? (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={goalDraft}
                    onChange={(e) => setGoalDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
                    autoFocus
                    className="w-16 rounded-md border border-gray-200 px-1.5 py-0.5 text-sm font-bold outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <button onClick={saveGoal} className="text-emerald-600"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setEditingGoal(false)} className="text-gray-400"><X className="h-4 w-4" /></button>
                </span>
              ) : (
                <>
                  <p className="text-base font-extrabold tabular-nums text-gray-800 dark:text-zinc-100">
                    {data.monthHired.toLocaleString('pt-BR')} / {data.monthGoal.toLocaleString('pt-BR')}
                  </p>
                  {data.monthHiredLegacy > 0 && (
                    <p className="text-[10px] text-gray-400">
                      {data.monthHiredBot} do sistema + {data.monthHiredLegacy} do BotConversa
                    </p>
                  )}
                </>
              )}
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, data.monthGoal ? Math.round((data.monthHired / data.monthGoal) * 100) : 0)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Direita: gráfico com toggle Barras/Pizza */}
          <div className="flex min-h-[260px] flex-col rounded-xl border border-gray-100 p-3 dark:border-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                {chart === 'bar' ? 'Funil do período' : chart === 'pie' ? 'Distribuição de status' : 'Processos por mês (ano do período)'}
              </p>
              <div className="flex overflow-hidden rounded-full border border-gray-200 text-[11px] font-semibold dark:border-zinc-700">
                {([['bar', 'Barras'], ['pie', 'Pizza'], ['month', 'Mensal']] as const).map(([c, label]) => (
                  <button
                    key={c}
                    onClick={() => setChart(c)}
                    className={`px-3 py-1 transition-colors ${
                      chart === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 dark:bg-zinc-900 dark:text-zinc-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                {chart === 'bar' ? (
                  <BarChart data={stages} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.35} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }}
                      formatter={(v: number) => [v.toLocaleString('pt-BR'), 'conversas']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#64748b' }}>
                      {stages.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                ) : chart === 'month' ? (
                  <BarChart data={data.monthly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.35} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => <span style={{ fontSize: 11, color: '#64748b' }}>{value}</span>}
                    />
                    <Bar dataKey="aprovados" fill="#10b981" name="Aprovados" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="indeferidos" fill="#ef4444" name="Indeferidos" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="emAndamento" fill="#3b82f6" name="Em andamento" radius={[3, 3, 0, 0]} />
                  </BarChart>
                ) : (
                <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="40%"
                      outerRadius="72%"
                      paddingAngle={2}
                      strokeWidth={0}
                      label={({ percent }: { percent: number }) => `${Math.round(percent * 100)}%`}
                    >
                      {distribution.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }}
                      formatter={(v: number) => [v.toLocaleString('pt-BR'), '']}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => <span style={{ fontSize: 11, color: '#64748b' }}>{value}</span>}
                    />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
