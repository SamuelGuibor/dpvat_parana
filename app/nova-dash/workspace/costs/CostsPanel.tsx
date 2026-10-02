'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarDays, ChevronDown, Loader2, Pencil, Plus, RefreshCw, Trash2, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import { deleteProjectCost, type ProjectCostDTO } from '@/app/_actions/costs';
import {
  getCostBreakdown, syncCostsNow, type CostBreakdown, type CostServiceRow,
} from '@/app/_actions/costs/overview';
import { costServiceLabel, formatMoney } from '@/app/_shared/lib/costs';
import { brDayKey, brStartOfDaysAgo } from '@/app/_shared/utils/date-br';
import { CostFormDialog } from './CostFormDialog';
import { PaymentCalendar } from './PaymentCalendar';

// Calendário de pagamentos em construção (24/09/2026): o código e a tabela
// payment_schedules já estão no ar, mas a aba só aparece quando isto virar true.
const SHOW_PAYMENT_CALENDAR = false;

// CUSTOS DO PROJETO (redesenho de 01/10/2026, pedido do escritório): só as
// linhas — uma por serviço, com a barra do tamanho da fatia do gasto no
// período. Claude enche a linha, Gemini mal aparece: é a leitura que importa.
//
// "Consumido" (padrão) = medido pelas APIs e pelos tokens dos logs de IA;
// "Pago" = faturas lançadas à mão. Os dois nunca batem no centavo (crédito
// pré-pago, Plano Claude, fatura que fecha depois) — por isso o seletor.

type PeriodKey = 'mes' | 'mes_passado' | '30d' | '90d' | '12m' | 'tudo' | 'custom';
type Mode = 'cons' | 'pago';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'mes', label: 'Este mês' },
  { key: 'mes_passado', label: 'Mês passado' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: '12m', label: '12 meses' },
  { key: 'tudo', label: 'Tudo' },
  { key: 'custom', label: 'Personalizado' },
];

const SOURCE_LABEL: Record<string, string> = {
  api: 'API do provedor',
  logs: 'tokens dos logs de IA',
  estimate: 'estimativa por uso',
};

const PREFS_KEY = 'costs-panel-prefs';

/** Período em chaves de dia de Brasília (o servidor recorta pelo mesmo fuso). */
function periodRange(p: PeriodKey, custom: { from: string; to: string }): { from: string; to: string } {
  const today = brDayKey();
  const [y, m] = today.split('-').map(Number);
  const monthKey = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}`;
  switch (p) {
    case 'mes': return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'mes_passado': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
      return { from: `${monthKey(py, pm)}-01`, to: `${monthKey(py, pm)}-${String(last).padStart(2, '0')}` };
    }
    case '30d': return { from: brDayKey(brStartOfDaysAgo(29)), to: today };
    case '90d': return { from: brDayKey(brStartOfDaysAgo(89)), to: today };
    case '12m': {
      const total = y * 12 + (m - 1) - 11;
      return { from: `${monthKey(Math.floor(total / 12), (total % 12) + 1)}-01`, to: today };
    }
    case 'tudo': return { from: '2024-01-01', to: today };
    case 'custom': return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
  }
}

function dayBR(key: string) {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

function pctLabel(pct: number) {
  if (pct > 0 && pct < 0.1) return '<0,1%';
  return `${pct.toFixed(1).replace('.', ',')}%`;
}

/** Uma linha do painel: nome, valor, % e a barra; clique abre o detalhe. */
function CostRow({
  row, mode, total, open, onToggle, onEdit, onDelete, periodDays,
}: {
  row: CostServiceRow;
  mode: Mode;
  total: number;
  open: boolean;
  onToggle: () => void;
  onEdit: (c: ProjectCostDTO) => void;
  onDelete: (c: ProjectCostDTO) => void;
  periodDays: number;
}) {
  const value = mode === 'cons' ? row.consumedCents : row.paidCents;
  const pct = total > 0 ? (value / total) * 100 : 0;
  const hasDetail = mode === 'cons' ? row.consumedDetail.length > 0 : row.paidEntries.length > 0;
  // Serviço medido por snapshot com dias faltando = número menor que o real.
  const missing = mode === 'cons' && row.snapshotDays !== null && row.snapshotDays < periodDays - 1
    ? periodDays - row.snapshotDays : 0;
  const sub = mode === 'cons'
    ? [row.consumedSource ? SOURCE_LABEL[row.consumedSource] ?? row.consumedSource : null,
      row.paidCents > 0 ? `pago no período ${formatMoney(row.paidCents)}` : null].filter(Boolean).join(' · ')
    : [`${row.paidEntries.length} fatura${row.paidEntries.length === 1 ? '' : 's'}`,
      row.consumedCents > 0 ? `consumido ${formatMoney(row.consumedCents)}` : null].filter(Boolean).join(' · ');

  return (
    <div className="border-b border-gray-100 last:border-b-0 dark:border-zinc-800">
      <button
        type="button"
        onClick={hasDetail ? onToggle : undefined}
        className={`w-full px-4 py-3 text-left ${hasDetail ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="min-w-0 truncate text-sm font-bold text-gray-900 dark:text-zinc-100">{row.label}</span>
          {hasDetail && (
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
          {(row.error || missing > 0) && (
            <span title={row.error ?? `faltam ${missing} dia(s) sincronizados neste período — clique em Atualizar agora`}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            </span>
          )}
          <span className="flex-1" />
          <span className="shrink-0 text-sm font-black tabular-nums text-gray-900 dark:text-zinc-100">{formatMoney(value)}</span>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-gray-400">{pctLabel(pct)}</span>
        </div>
        {sub && <p className="mt-0.5 pl-[18px] text-[11px] text-gray-400">{sub}</p>}
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${Math.max(pct, value > 0 ? 0.6 : 0)}%`, backgroundColor: row.color }}
          />
        </div>
      </button>

      {open && hasDetail && (
        <div className="space-y-0.5 px-4 pb-3 pl-[34px]">
          {mode === 'cons'
            ? row.consumedDetail.map((d) => (
              <div key={d.label} className="flex justify-between gap-3 text-xs text-gray-500 dark:text-zinc-400">
                <span className="truncate">{d.label}</span>
                <span className="shrink-0 tabular-nums">{formatMoney(d.cents)}</span>
              </div>
            ))
            : row.paidEntries.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 text-xs text-gray-500 dark:text-zinc-400">
                <span className="w-20 shrink-0 tabular-nums">{new Date(c.chargedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                <span className="min-w-0 flex-1 truncate">{c.description || costServiceLabel(c.service)}</span>
                <span className="shrink-0 text-right tabular-nums">
                  {formatMoney(c.amountBrlCents)}
                  {c.currency !== 'BRL' && <span className="text-gray-400"> · {formatMoney(c.amountCents, c.currency)}</span>}
                </span>
                <span className="flex shrink-0 gap-0.5">
                  <button onClick={() => onEdit(c)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800" title="Editar">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => onDelete(c)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" title="Excluir">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function CostsPanel() {
  const [tab, setTab] = useState<'consumo' | 'calendario'>('consumo');
  const [period, setPeriod] = useState<PeriodKey>('mes');
  const [custom, setCustom] = useState(() => ({ from: `${brDayKey().slice(0, 7)}-01`, to: brDayKey() }));
  const [mode, setMode] = useState<Mode>('cons');
  const [withAds, setWithAds] = useState(true);
  const [data, setData] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectCostDTO | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  // Preferências do visualizador (período, modo, anúncios) — só conveniência.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { period?: PeriodKey; mode?: Mode; withAds?: boolean };
      if (p.period && p.period !== 'custom' && PERIODS.some((x) => x.key === p.period)) setPeriod(p.period);
      if (p.mode === 'cons' || p.mode === 'pago') setMode(p.mode);
      if (typeof p.withAds === 'boolean') setWithAds(p.withAds);
    } catch { /* sem storage: fica no padrão */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ period, mode, withAds })); } catch { /* ignora */ }
  }, [period, mode, withAds]);

  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getCostBreakdown(range.from, range.to));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar os custos.');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      // Refaz desde o início do período (até 35 dias) para tapar buracos.
      const back = Math.round((Date.parse(brDayKey()) - Date.parse(range.from)) / 86_400_000) + 1;
      await syncCostsNow(Math.min(Math.max(back, 3), 35));
      toast.success('Custos atualizados.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao sincronizar.');
    } finally { setSyncing(false); }
  };

  async function handleDelete(c: ProjectCostDTO) {
    const ok = await confirm({
      title: 'Excluir lançamento?',
      description: `${costServiceLabel(c.service)} — ${formatMoney(c.amountBrlCents)} em ${new Date(c.chargedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`,
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

  const rows = useMemo(() => {
    const list = (data?.services ?? [])
      .filter((s) => withAds || s.service !== 'meta')
      .filter((s) => (mode === 'cons' ? s.consumedCents : s.paidCents) > 0);
    return list.sort((a, b) => (mode === 'cons' ? b.consumedCents - a.consumedCents : b.paidCents - a.paidCents));
  }, [data, withAds, mode]);
  const total = rows.reduce((a, s) => a + (mode === 'cons' ? s.consumedCents : s.paidCents), 0);
  const hasAds = (data?.services ?? []).some((s) => s.service === 'meta');

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-xl font-black text-gray-900 dark:text-zinc-100">
            <Wallet className="h-5 w-5 text-indigo-600" /> Custos do Projeto
          </h2>
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            Quanto cada serviço pesa no gasto do período. Totais em real
            {data ? ` · câmbio US$ 1 = R$ ${data.fx.rate.toFixed(2).replace('.', ',')}${data.fx.source === 'fallback' ? ' (padrão — cotação indisponível)' : ''}` : ''}.
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

      {/* Abas: consumo × calendário de pagamentos (escondido até
          SHOW_PAYMENT_CALENDAR virar true). */}
      {SHOW_PAYMENT_CALENDAR && (
        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
          {([['consumo', 'Consumo e faturas', Wallet], ['calendario', 'Calendário de pagamentos', CalendarDays]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition ${tab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}

      {SHOW_PAYMENT_CALENDAR && tab === 'calendario' ? (
        <PaymentCalendar onPaidChange={() => { void load(); }} />
      ) : (<>
      {/* Período + modo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800">
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
        <div className="ml-auto flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-zinc-800">
          {([['cons', 'Consumido'], ['pago', 'Pago (faturas)']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === k ? 'bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-zinc-300">
          <label className="flex items-center gap-1.5">de
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800" />
          </label>
          <label className="flex items-center gap-1.5">até
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="rounded-lg border border-gray-200 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800" />
          </label>
        </div>
      )}

      {/* Total */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <p className="text-3xl font-black tabular-nums text-gray-900 dark:text-zinc-100">{formatMoney(total)}</p>
        <p className="pb-1 text-xs text-gray-400">
          {mode === 'cons' ? 'consumido' : 'pago'} de {dayBR(range.from)} a {dayBR(range.to)} · {rows.length} serviço{rows.length === 1 ? '' : 's'}
        </p>
        {loading && <Loader2 className="mb-1.5 h-4 w-4 animate-spin text-gray-400" />}
        {hasAds && (
          <label className="mb-1 ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400">
            <input type="checkbox" checked={withAds} onChange={(e) => setWithAds(e.target.checked)} />
            incluir Meta Ads (anúncios)
          </label>
        )}
      </div>

      {/* Linhas */}
      <div className={`overflow-hidden rounded-2xl border border-gray-200 bg-white transition-opacity dark:border-zinc-800 dark:bg-zinc-900 ${loading && data ? 'opacity-60' : ''}`}>
        {!data && loading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-gray-400">
            {mode === 'pago' ? 'Nenhuma fatura lançada neste período.' : 'Nenhum consumo medido neste período.'}
          </p>
        ) : (
          rows.map((r) => (
            <CostRow
              key={r.service}
              row={r}
              mode={mode}
              total={total}
              periodDays={data?.days ?? 0}
              open={!!openRows[`${mode}:${r.service}`]}
              onToggle={() => setOpenRows((o) => ({ ...o, [`${mode}:${r.service}`]: !o[`${mode}:${r.service}`] }))}
              onEdit={(c) => { setEditing(c); setFormOpen(true); }}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        {mode === 'cons'
          ? 'Consumido = APIs dos provedores (sincronizadas uma vez por dia) + Claude e Gemini pelos tokens de cada chamada. A Vercel só aparece em Pago.'
          : 'Pago = faturas lançadas. Clique numa linha para ver, editar ou excluir os lançamentos.'}
        {data?.lastSyncAt && ` Última sincronização: ${new Date(data.lastSyncAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}.`}
      </p>
      </>)}

      <CostFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={load} />
      {confirmDialog}
    </div>
  );
}
