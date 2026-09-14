/* eslint-disable no-unused-vars */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, RefreshCw, Wallet, Pencil, Trash2, Receipt, ExternalLink,
  AlertTriangle, KeyRound, Coins, CalendarClock, Hourglass, Info,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  listProjectCosts, deleteProjectCost,
  type CostsSummary, type ProjectCostDTO,
} from '@/app/_actions/costs';
import {
  getCostOverview, syncCostsNow, setServiceCredit,
  type CostOverview, type ServiceCostCard,
} from '@/app/_actions/costs/overview';
import {
  costServiceColor, costServiceLabel, formatMoney, formatMonthLabel, parseMoneyToCents,
} from '@/app/_shared/lib/costs';
import { CostFormDialog } from './CostFormDialog';

// CUSTOS DO PROJETO (redesenho de 14/09/2026, pedido do escritório):
// 1. Visão do MÊS por serviço — consumo até hoje, média/dia, projeção do mês
//    e, nos pré-pagos, "o crédito dura ~X dias". Fonte: APIs dos provedores
//    (cost_snapshots) ou tokens dos logs de IA; a Vercel fica no manual.
// 2. Série diária (30 dias) empilhada por serviço.
// 3. Onde cada serviço é pago (link da fatura) e o que falta configurar.
// 4. Lançamentos manuais das faturas — continuam sendo o registro oficial do
//    que caiu no cartão.

type Period = 'mes' | '12m' | 'tudo';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'mes', label: 'Este mês' },
  { key: '12m', label: '12 meses' },
  { key: 'tudo', label: 'Tudo' },
];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function periodRange(p: Period): { from?: string; to?: string } {
  if (p === 'tudo') return {};
  const now = new Date();
  if (p === 'mes') {
    return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 11, 1)) };
}

const SOURCE_LABEL: Record<string, string> = {
  api: 'API do provedor',
  logs: 'estimado pelos logs',
  estimate: 'estimativa por uso',
  manual: 'só fatura manual',
  none: 'sem dados',
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Cartão de um serviço: números do mês + crédito + estado da integração. */
function ServiceCard({ s, onCredit }: { s: ServiceCostCard; onCredit: (s: ServiceCostCard) => void }) {
  const pct = s.projectedMonthCents > 0 ? Math.min(100, Math.round((s.mtdCents / s.projectedMonthCents) * 100)) : 0;
  const tone = s.error ? 'border-rose-200 dark:border-rose-900/60' : 'border-gray-200 dark:border-zinc-800';
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 dark:bg-zinc-900 ${tone}`}>
      <div className="flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-gray-900 dark:text-zinc-100">{s.label}</p>
          <p className="text-[11px] text-gray-400">{SOURCE_LABEL[s.source] ?? s.source}{s.lastDay ? ` · até ${s.lastDay.slice(8, 10)}/${s.lastDay.slice(5, 7)}` : ''}</p>
        </div>
        {s.billingUrl && (
          <a href={s.billingUrl} target="_blank" rel="noreferrer" title="Abrir fatura / cobrança" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Até hoje</p>
          <p className="text-base font-black tabular-nums text-gray-900 dark:text-zinc-100">{formatMoney(s.mtdCents)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Por dia</p>
          <p className="text-base font-black tabular-nums text-gray-700 dark:text-zinc-200">{formatMoney(s.avgDailyCents)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Fecha em</p>
          <p className="text-base font-black tabular-nums" style={{ color: s.color }}>{formatMoney(s.projectedMonthCents)}</p>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
      </div>
      <p className="text-[11px] text-gray-400">
        mês passado {formatMoney(s.prevMonthCents)}
        {s.manualMonthCents > 0 && s.source !== 'manual' && <> · fatura lançada {formatMoney(s.manualMonthCents)}</>}
      </p>

      {/* Crédito pré-pago */}
      <button
        onClick={() => onCredit(s)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 px-3 py-2 text-left text-xs hover:border-gray-300 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        title="Informar saldo pré-pago"
      >
        <Hourglass className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        {s.credit ? (
          <span className="min-w-0 flex-1">
            <span className="font-bold text-gray-800 dark:text-zinc-100">
              {s.credit.daysLeft === null ? 'sem consumo pra projetar' : `dura ~${s.credit.daysLeft} dia${s.credit.daysLeft === 1 ? '' : 's'}`}
            </span>
            <span className="text-gray-400"> · restam {formatMoney(s.credit.remainingCents, s.credit.currency)} de {formatMoney(s.credit.amountCents, s.credit.currency)} (desde {s.credit.setAt.slice(8, 10)}/{s.credit.setAt.slice(5, 7)})</span>
          </span>
        ) : (
          <span className="text-gray-400">Pré-pago? Informe o saldo pra ver quantos dias dura.</span>
        )}
      </button>

      {s.error ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span className="break-words">{s.error}</span>
        </p>
      ) : !s.configured && s.envVars.length > 0 ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <KeyRound className="mt-0.5 h-3 w-3 shrink-0" /> <span>Falta configurar {s.envVars.join(' e ')} na Vercel pra puxar pela API.</span>
        </p>
      ) : s.note ? (
        <p className="flex items-start gap-1.5 text-[11px] text-gray-400"><Info className="mt-0.5 h-3 w-3 shrink-0" /> <span>{s.note}</span></p>
      ) : null}
    </div>
  );
}

/** Diálogo simples de crédito pré-pago (saldo + moeda + desde quando). */
function CreditDialog({ target, onClose, onSaved }: { target: ServiceCostCard | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [setAt, setSetAt] = useState(isoDay(new Date()));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!target) return;
    setAmount(target.credit ? (target.credit.amountCents / 100).toFixed(2).replace('.', ',') : '');
    setCurrency(target.credit?.currency ?? (target.service === 'meta' ? 'BRL' : 'USD'));
    setSetAt(target.credit?.setAt ?? isoDay(new Date()));
    setNote(target.credit?.note ?? '');
  }, [target]);
  if (!target) return null;
  const save = async (clear = false) => {
    const cents = clear ? 0 : parseMoneyToCents(amount);
    if (!clear && (cents === null || cents <= 0)) { toast.error('Informe o valor do crédito.'); return; }
    setSaving(true);
    try {
      await setServiceCredit({ service: target.service, amountCents: cents ?? 0, currency, setAt, note });
      toast.success(clear ? 'Crédito removido.' : 'Crédito salvo.');
      onSaved(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 text-base font-black text-gray-900 dark:text-zinc-100"><Coins className="h-4 w-4 text-amber-500" /> Crédito de {target.label}</h3>
        <p className="mt-1 text-xs text-gray-400">Quanto foi pago adiantado e desde quando. O consumo a partir dessa data desconta do saldo, e a média dos últimos 14 dias projeta quantos dias ainda duram.</p>
        <div className="mt-4 grid grid-cols-[1fr_5rem] gap-2">
          <label className="text-xs font-semibold text-gray-600 dark:text-zinc-300">Valor
            <input id="credit-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ex.: 500,00" className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
          </label>
          <label className="text-xs font-semibold text-gray-600 dark:text-zinc-300">Moeda
            <select id="credit-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800">
              <option value="USD">US$</option><option value="BRL">R$</option>
            </select>
          </label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-gray-600 dark:text-zinc-300">Válido desde
          <input id="credit-since" type="date" value={setAt} onChange={(e) => setSetAt(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
        </label>
        <label className="mt-3 block text-xs font-semibold text-gray-600 dark:text-zinc-300">Observação
          <input id="credit-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: recarga de R$ 2.500 no cartão do escritório" className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
        </label>
        <div className="mt-4 flex justify-between gap-2">
          {target.credit ? (
            <Button variant="ghost" size="sm" onClick={() => save(true)} disabled={saving} className="text-rose-600">Remover</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={() => save(false)} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CostsPanel() {
  const [overview, setOverview] = useState<CostOverview | null>(null);
  const [ovLoading, setOvLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [creditTarget, setCreditTarget] = useState<ServiceCostCard | null>(null);

  const [period, setPeriod] = useState<Period>('12m');
  const [data, setData] = useState<CostsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectCostDTO | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const loadOverview = useCallback(async () => {
    setOvLoading(true);
    try { setOverview(await getCostOverview()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao carregar a visão do mês.'); }
    finally { setOvLoading(false); }
  }, []);

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

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      // Primeira carga (sem histórico) puxa 35 dias; depois só os 3 últimos.
      const first = !overview?.lastSyncAt;
      await syncCostsNow(first ? 35 : 3);
      toast.success('Custos atualizados.');
      await loadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao sincronizar.');
    } finally { setSyncing(false); }
  };

  const activeServices = useMemo(
    () => (overview?.services ?? []).filter((s) => s.source !== 'none'),
    [overview],
  );
  const chartServices = useMemo(
    () => activeServices.filter((s) => overview?.daily.some((d) => typeof d[s.service] === 'number')),
    [activeServices, overview],
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
      await loadOverview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  const monthChart = useMemo(
    () => (data?.byMonth ?? []).map((m) => ({ mes: formatMonthLabel(m.month), total: m.totalBrlCents / 100 })),
    [data],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-3 sm:p-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-black text-gray-900 dark:text-zinc-100">
            <Wallet className="h-5 w-5 text-indigo-600" /> Custos do Projeto
          </h2>
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            Consumo puxado dos provedores + faturas lançadas. Totais em real
            {overview ? ` · câmbio US$ 1 = R$ ${overview.fx.rate.toFixed(2).replace('.', ',')}` : ''}.
          </p>
        </div>
        <Button variant="outline" onClick={sync} disabled={syncing} title="Puxar o consumo mais recente das APIs">
          <RefreshCw className={`mr-1.5 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Atualizando…' : 'Atualizar agora'}
        </Button>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="mr-1.5 h-4 w-4" /> Lançar fatura
        </Button>
      </div>

      {/* ── 1. Mês atual ─────────────────────────────────────────────── */}
      {ovLoading && !overview ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : overview && (
        <>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{overview.monthLabel} · dia {overview.daysElapsed} de {overview.daysInMonth}</p>
                <p className="text-3xl font-black tabular-nums text-gray-900 dark:text-zinc-100">{formatMoney(overview.totals.projectedMonthCents)}</p>
                <p className="text-xs text-gray-400">projeção de fechamento · {formatMoney(overview.totals.mtdCents)} consumidos até hoje</p>
              </div>
              <div className="flex flex-wrap gap-6 text-right">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Mês passado</p>
                  <p className="text-lg font-black tabular-nums text-gray-700 dark:text-zinc-200">{formatMoney(overview.totals.prevMonthCents)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Faturas lançadas</p>
                  <p className="text-lg font-black tabular-nums text-gray-700 dark:text-zinc-200">{formatMoney(overview.totals.manualMonthCents)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Última sincronização</p>
                  <p className="flex items-center justify-end gap-1 text-sm font-semibold text-gray-600 dark:text-zinc-300"><CalendarClock className="h-3.5 w-3.5" /> {fmtDate(overview.lastSyncAt)}</p>
                </div>
              </div>
            </div>
            {!overview.lastSyncAt && (
              <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                Ainda não há consumo sincronizado. Clique em <b>Atualizar agora</b> para puxar os últimos 35 dias das APIs configuradas.
              </p>
            )}
          </div>

          {/* Cartões por serviço */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeServices.map((s) => <ServiceCard key={s.service} s={s} onCredit={setCreditTarget} />)}
          </div>

          {/* ── 2. Série diária ────────────────────────────────────────── */}
          {chartServices.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Consumo por dia · últimos 30 dias</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview.daily} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9ca3af" interval={4} />
                    <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatMoney(Math.round(v * 100)), costServiceLabel(name)]}
                      labelStyle={{ fontWeight: 700 }}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ fontSize: 11, color: '#64748b' }}>{costServiceLabel(v)}</span>} />
                    {chartServices.map((s, i) => (
                      <Bar key={s.service} dataKey={s.service} stackId="a" fill={s.color} radius={i === chartServices.length - 1 ? [4, 4, 0, 0] : undefined} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── 3. Onde cada um é pago ─────────────────────────────────── */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Onde cada serviço é cobrado</p>
            <p className="mb-3 text-xs text-gray-400">Pra qualquer pessoa do escritório achar a fatura numa urgência. Senhas não ficam aqui: use o cofre de senhas compartilhado e cadastre o e-mail do escritório como membro de cobrança em cada conta.</p>
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {overview.services.map((s) => (
                <div key={s.service} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="w-40 font-semibold text-gray-800 dark:text-zinc-100">{s.label}</span>
                  <span className="min-w-0 flex-1 text-gray-500 dark:text-zinc-400">{s.how ?? 'Lançamento manual.'}</span>
                  {s.billingUrl && (
                    <a href={s.billingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">
                      fatura <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── 4. Faturas lançadas (manual) ─────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex items-center gap-2 text-sm font-black text-gray-800 dark:text-zinc-100"><Receipt className="h-4 w-4 text-gray-400" /> Faturas lançadas</h3>
          <div className="ml-auto flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  period === p.key ? 'bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : !data || data.entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-xs text-gray-400 dark:border-zinc-800">
            Nenhuma fatura lançada neste período.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr]">
            {monthChart.length > 1 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Faturado por mês · {formatMoney(data.totalBrlCents)} no período</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthChart} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip formatter={(v: number) => formatMoney(Math.round(v * 100))} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
                      <Bar dataKey="total" name="Total" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Total no período</p>
                <p className="text-2xl font-black tabular-nums text-gray-900 dark:text-zinc-100">{formatMoney(data.totalBrlCents)}</p>
                <p className="text-xs text-gray-400">{data.entries.length} lançamento(s)</p>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto dark:divide-zinc-800">
                {data.entries.map((c) => (
                  <div key={c.id} className="group flex items-center gap-3 px-4 py-2.5">
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: costServiceColor(c.service) }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">
                        {costServiceLabel(c.service)}
                        {c.description && <span className="font-normal text-gray-400"> · {c.description}</span>}
                      </p>
                      <p className="text-[11px] text-gray-400">{new Date(c.chargedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black text-gray-900 dark:text-zinc-100">{formatMoney(c.amountBrlCents)}</p>
                      {c.currency !== 'BRL' && <p className="text-[11px] text-gray-400">{formatMoney(c.amountCents, c.currency)}</p>}
                    </div>
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={() => { setEditing(c); setFormOpen(true); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800" title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(c)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <CostFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={async () => { await load(); await loadOverview(); }} />
      <CreditDialog target={creditTarget} onClose={() => setCreditTarget(null)} onSaved={loadOverview} />
      {confirmDialog}
    </div>
  );
}
