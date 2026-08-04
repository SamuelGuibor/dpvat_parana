/* eslint-disable no-unused-vars */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, RefreshCw, Wallet, CalendarDays, TrendingUp, Layers,
  Pencil, Trash2, Receipt,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  listProjectCosts, deleteProjectCost,
  type CostsSummary, type ProjectCostDTO,
} from '@/app/_actions/costs';
import {
  costServiceColor, costServiceLabel, formatMoney, formatMonthLabel,
} from '@/app/_shared/lib/costs';
import { CostFormDialog } from './CostFormDialog';

// CUSTOS DO PROJETO — controle manual do que cada serviço de infraestrutura
// cobrou (Vercel, Neon, Claude, Railway, AWS...). Nada é integrado com as
// faturas: a pessoa lança valor + dia, e aqui a gente soma.
//
// Todos os totais são em REAL, porque é a moeda em que a fatura do cartão
// chega. O valor original em dólar aparece ao lado, na tabela.

type Period = 'mes' | '12m' | 'tudo';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'mes', label: 'Este mês' },
  { key: '12m', label: '12 meses' },
  { key: 'tudo', label: 'Tudo' },
];

/** "YYYY-MM-DD" de uma data local, sem escorregar de fuso. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function periodRange(p: Period): { from?: string; to?: string } {
  if (p === 'tudo') return {};
  const now = new Date();
  if (p === 'mes') {
    return {
      from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  // 12 meses: começa no dia 1 do mês, 11 meses atrás.
  return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 11, 1)) };
}

function StatCard({ icon: Icon, label, value, hint, tone = 'indigo' }: {
  icon: React.ElementType; label: string; value: string; hint?: string;
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
  const tones = {
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
    rose: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40',
  } as const;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`shrink-0 rounded-xl p-2 ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-lg font-black leading-tight text-gray-900 dark:text-zinc-100">{value}</p>
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</p>
        {hint && <p className="truncate text-[10px] text-gray-400 dark:text-zinc-500">{hint}</p>}
      </div>
    </div>
  );
}

export function CostsPanel() {
  const [period, setPeriod] = useState<Period>('12m');
  const [data, setData] = useState<CostsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectCostDTO | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = periodRange(period);
      setData(await listProjectCosts(from, to));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar os custos.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    if (!data) return null;
    const meses = data.byMonth.length;
    const media = meses > 0 ? Math.round(data.totalBrlCents / meses) : 0;
    const maior = data.byService[0] ?? null;
    return { media, meses, maior };
  }, [data]);

  const chart = useMemo(
    () => (data?.byMonth ?? []).map((m) => ({
      mes: formatMonthLabel(m.month),
      total: m.totalBrlCents / 100,
    })),
    [data],
  );

  async function handleDelete(c: ProjectCostDTO) {
    const ok = await confirm({
      title: 'Excluir lançamento?',
      description: `${costServiceLabel(c.service)} — ${formatMoney(c.amountBrlCents)} em ${new Date(c.chargedAt).toLocaleDateString('pt-BR')}.`,
    });
    if (!ok) return;
    try {
      await deleteProjectCost(c.id);
      toast.success('Lançamento excluído.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  const maxService = data?.byService[0]?.totalBrlCents ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-black text-gray-900 dark:text-zinc-100">
            <Wallet className="h-5 w-5 text-indigo-600" /> Custos do Projeto
          </h2>
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            Lançamento manual do que cada serviço cobrou. Totais sempre em real.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === p.key
                  ? 'bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Recarregar">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <Button
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="mr-1.5 h-4 w-4" /> Novo lançamento
        </Button>
      </div>

      {loading && !data ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !data || data.entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 py-16 text-center dark:border-zinc-800">
          <Receipt className="h-8 w-8 text-gray-300" />
          <div>
            <p className="font-semibold text-gray-600 dark:text-zinc-300">Nenhum custo lançado neste período</p>
            <p className="text-xs text-gray-400">Registre a primeira cobrança para começar o controle.</p>
          </div>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="mr-1.5 h-4 w-4" /> Novo lançamento
          </Button>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={Wallet}
              label="Total no período"
              value={formatMoney(data.totalBrlCents)}
              hint={`${data.entries.length} lançamento(s)`}
            />
            <StatCard
              icon={CalendarDays}
              tone="emerald"
              label="Média por mês"
              value={formatMoney(stats?.media ?? 0)}
              hint={`${stats?.meses ?? 0} mês(es) com custo`}
            />
            <StatCard
              icon={TrendingUp}
              tone="amber"
              label="Maior gasto"
              value={stats?.maior ? costServiceLabel(stats.maior.service) : '—'}
              hint={stats?.maior ? formatMoney(stats.maior.totalBrlCents) : undefined}
            />
            <StatCard
              icon={Layers}
              tone="rose"
              label="Serviços"
              value={String(data.byService.length)}
              hint="com cobrança no período"
            />
          </div>

          {/* Gasto por mês */}
          {chart.length > 1 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Gasto por mês</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip
                      formatter={(v: number) => formatMoney(Math.round(v * 100))}
                      labelStyle={{ fontWeight: 700 }}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Bar dataKey="total" name="Total" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Por serviço */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Por serviço</p>
            <div className="space-y-2.5">
              {data.byService.map((s) => {
                const pct = maxService > 0 ? Math.round((s.totalBrlCents / maxService) * 100) : 0;
                const share = data.totalBrlCents > 0
                  ? Math.round((s.totalBrlCents / data.totalBrlCents) * 100)
                  : 0;
                return (
                  <div key={s.service}>
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: costServiceColor(s.service) }}
                      />
                      <span className="font-semibold text-gray-700 dark:text-zinc-200">{costServiceLabel(s.service)}</span>
                      <span className="text-gray-400">· {s.count}x</span>
                      <span className="ml-auto font-black text-gray-900 dark:text-zinc-100">{formatMoney(s.totalBrlCents)}</span>
                      <span className="w-9 text-right text-gray-400">{share}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: costServiceColor(s.service) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lançamentos */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <p className="border-b border-gray-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 dark:border-zinc-800">
              Lançamentos
            </p>
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {data.entries.map((c) => (
                <div key={c.id} className="group flex items-center gap-3 px-4 py-2.5">
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: costServiceColor(c.service) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">
                      {costServiceLabel(c.service)}
                      {c.description && <span className="font-normal text-gray-400"> · {c.description}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {new Date(c.chargedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black text-gray-900 dark:text-zinc-100">{formatMoney(c.amountBrlCents)}</p>
                    {c.currency !== 'BRL' && (
                      <p className="text-[11px] text-gray-400">{formatMoney(c.amountCents, c.currency)}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => { setEditing(c); setFormOpen(true); }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <CostFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={load}
      />
      {confirmDialog}
    </div>
  );
}
