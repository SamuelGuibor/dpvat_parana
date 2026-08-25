/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderOutput, DollarSign, XCircle, Loader2, Inbox, Briefcase, User as UserIcon,
  Clock, Hourglass, Search, Download,
} from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/app/_shared/ui/input';
import { cn } from '@/app/_shared/lib/utils';
import { getCaiqueFolders } from '@/app/_actions/cards/get-caique-folders';
import { getUniFolders } from '@/app/_actions/cards/get-uni-folders';
import type { FolderRow, FolderOutcome, FolderReportResult, FolderReportTotals } from '@/app/_shared/lib/folder-report';
import { brDayKey, brDateBR, brMonthNameExtenso, brYear } from '@/app/_shared/utils/date-br';
import { DateFilter, getDefaultDateRange, type DateRange } from './DateFilter';
import { CardDialog } from './CardDialog';
import type { ExtendedKanbanCard } from './card-dialog/types';

// Pasta sem desfecho depois disso deixa de ser "enviada" e vira "parada" —
// é o degrau em que vale cobrar a UNI/o Caique.
const DIAS_PARA_PARADA = 45;

// Configuração visual de cada desfecho da pasta (badge da coluna "Situação").
// "parada" não vem do servidor: é derivada do tempo sem desfecho.
type RowState = FolderOutcome | 'parada';

const STATE_CONFIG: Record<RowState, { label: string; badge: string; dot: string }> = {
  enviado: { label: 'Enviado', badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  parada: { label: 'Parada', badge: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  pago: { label: 'Pago', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  negado: { label: 'Negado', badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
};

// Cada destino tem seu próprio fetch e sua própria cópia; o resto da planilha
// é idêntico.
export type FolderKind = 'caique' | 'uni';

const KIND_CONFIG: Record<FolderKind, {
  fetch: (p: { from: string; to: string }) => Promise<FolderReportResult>;
  errorMsg: string;
  emptyHint: string;
  csvName: string;
}> = {
  caique: {
    fetch: getCaiqueFolders,
    errorMsg: 'Erro ao carregar as pastas do Caique',
    emptyHint: 'Cards que entram na coluna CAIQUE do Kanban aparecem aqui automaticamente.',
    csvName: 'pastas-caique',
  },
  uni: {
    fetch: getUniFolders,
    errorMsg: 'Erro ao carregar as pastas da UNI',
    emptyHint: 'Cards que entram nas colunas da UNI do Kanban aparecem aqui automaticamente.',
    csvName: 'pastas-uni',
  },
};

const EMPTY_TOTALS: FolderReportTotals = {
  enviadas: 0, pagas: 0, negadas: 0, emAnalise: 0, enviadasAnterior: 0, medianaDiasDesfecho: null,
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return brDateBR(d);
}

/** Dias entre o envio e o arquivamento — ou até hoje, se ainda está aberta. */
function diasDaPasta(r: FolderRow): number {
  const fim = r.arquivadoEm ? new Date(r.arquivadoEm).getTime() : Date.now();
  return Math.max(0, Math.round((fim - new Date(r.enviadoEm).getTime()) / 86_400_000));
}

function rowState(r: FolderRow): RowState {
  if (r.desfecho !== 'enviado') return r.desfecho;
  return diasDaPasta(r) >= DIAS_PARA_PARADA ? 'parada' : 'enviado';
}

function pct(part: number, total: number): string {
  if (!total) return '0%';
  return `${(part / total * 100).toFixed(1).replace('.', ',')}%`;
}

// Card mínimo pro CardDialog (o dialog carrega o resto do servidor via cardId),
// mesmo padrão do toKanbanCard da aba Arquivados.
function toKanbanCard(r: FolderRow): ExtendedKanbanCard {
  return {
    id: r.cardId,
    title: r.name,
    description: '',
    assignee: '',
    status: r.label?.name ?? '',
    timer: 0,
    comments: [],
    attachments: [],
    observations: '',
    checklistItems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    statusStartedAt: null,
    service: r.service,
    isProcess: r.isProcess,
    ownerId: r.ownerId,
    labelId: r.labelId,
    label: r.label ? { ...r.label, timeLimitDays: null } : null,
    telefone: r.telefone,
  } as ExtendedKanbanCard;
}

// ---------------------------------------------------------------------------
// Cartões de contagem do topo (o painel do layout A).
// ---------------------------------------------------------------------------

const KpiCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  iconBg: string;
  sub?: React.ReactNode;
  /** Barrinha de proporção embaixo do subtítulo (0–100). */
  bar?: { pct: number; color: string };
}> = ({ icon: Icon, label, value, valueClass, iconBg, sub, bar }) => (
  <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm px-5 py-4 flex flex-col gap-2">
    <div className="flex items-center gap-2.5">
      <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-[10px] font-black text-gray-400 dark:text-zinc-500 uppercase tracking-wider leading-tight">{label}</p>
    </div>
    <p className={cn('text-3xl font-black leading-none tabular-nums text-gray-900 dark:text-zinc-100', valueClass)}>{value}</p>
    {sub && <p className="text-[11px] text-gray-400 dark:text-zinc-500 leading-tight">{sub}</p>}
    {bar && (
      <div className="h-1 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden">
        <div className={cn('h-full rounded-full', bar.color)} style={{ width: `${Math.min(100, bar.pct)}%` }} />
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------

type OutcomeFilter = 'all' | 'pago' | 'negado' | 'aberto';

/**
 * Planilha de controle das pastas enviadas pro Caique ou pra UNI: quem entrou
 * na coluna correspondente no período, com o desfecho (pago/negado) vindo do
 * arquivamento. Vive como sub-visão da aba Arquivados.
 */
export const FolderReport: React.FC<{ kind: FolderKind }> = ({ kind }) => {
  const config = KIND_CONFIG[kind];
  const [range, setRange] = useState<DateRange>(getDefaultDateRange);
  const [rows, setRows] = useState<FolderRow[]>([]);
  const [totals, setTotals] = useState<FolderReportTotals>(EMPTY_TOTALS);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FolderRow | null>(null);
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    try {
      const data = await config.fetch({ from: r.from.toISOString(), to: r.to.toISOString() });
      setRows(data.rows);
      setTotals(data.totals);
    } catch (err) {
      console.error(err);
      toast.error(config.errorMsg);
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { load(range); }, [load, range]);

  const handleDateChange = useCallback((r: DateRange) => setRange(r), []);

  const selectedCard = useMemo(() => (selected ? toKanbanCard(selected) : null), [selected]);

  // Variação vs. período anterior (mesma duração) — só faz sentido com base.
  const delta = useMemo(() => {
    if (!totals.enviadasAnterior) return null;
    return Math.round((totals.enviadas - totals.enviadasAnterior) / totals.enviadasAnterior * 100);
  }, [totals]);

  // Filtro por desfecho + busca por nome/telefone/hospital.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === 'pago' && r.desfecho !== 'pago') return false;
      if (filter === 'negado' && r.desfecho !== 'negado') return false;
      if (filter === 'aberto' && r.desfecho !== 'enviado') return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.telefone.toLowerCase().includes(q) ||
        r.hospital.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  // Agrupamento por mês de ENVIO, com subtotal por grupo. As linhas já vêm
  // ordenadas do mais recente pro mais antigo, então basta quebrar na virada.
  const groups = useMemo(() => {
    const out: { key: string; label: string; rows: FolderRow[] }[] = [];
    for (const r of visible) {
      const d = new Date(r.enviadoEm);
      const key = brDayKey(d).slice(0, 7);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else out.push({ key, label: `${brMonthNameExtenso(d)} de ${brYear(d)}`, rows: [r] });
    }
    return out;
  }, [visible]);

  const exportCsv = useCallback(() => {
    const head = ['Cliente', 'Telefone', 'Hospital', 'Coluna de origem', 'Enviado em', 'Dias', 'Situação', 'Situação atual', 'Arquivado em'];
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const body = visible.map((r) => [
      r.name, r.telefone, r.hospital, r.colunaOrigem, formatDate(r.enviadoEm),
      String(diasDaPasta(r)), STATE_CONFIG[rowState(r)].label, r.situacaoAtual, formatDate(r.arquivadoEm),
    ].map(esc).join(';'));
    // BOM pro Excel abrir os acentos certos.
    const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...body].join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.csvName}-${brDayKey(range.from)}_a_${brDayKey(range.to)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visible, config.csvName, range]);

  const FilterChip: React.FC<{ value: OutcomeFilter; label: string; count: number }> = ({ value, label, count }) => (
    <button
      onClick={() => setFilter(value)}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
        filter === value
          ? 'bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-gray-900 dark:border-zinc-100'
          : 'bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-zinc-800 hover:text-gray-700 dark:hover:text-zinc-200',
      )}
    >
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );

  return (
    <div>
      {/* ---- Painel de contagens (layout A) ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
        <KpiCard
          icon={FolderOutput}
          label="Enviadas"
          value={totals.enviadas}
          iconBg="bg-blue-100 text-blue-600"
          sub={delta === null
            ? 'sem base de comparação'
            : <>
                <span className={cn('font-bold', delta >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {delta >= 0 ? '+' : ''}{delta}%
                </span>{' '}vs. período anterior
              </>}
        />
        <KpiCard
          icon={DollarSign}
          label="Pagas"
          value={totals.pagas}
          valueClass="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-100 text-emerald-600"
          sub={`${pct(totals.pagas, totals.enviadas)} das enviadas`}
          bar={{ pct: totals.enviadas ? totals.pagas / totals.enviadas * 100 : 0, color: 'bg-emerald-500' }}
        />
        <KpiCard
          icon={XCircle}
          label="Negadas"
          value={totals.negadas}
          valueClass="text-red-600 dark:text-red-400"
          iconBg="bg-red-100 text-red-600"
          sub={`${pct(totals.negadas, totals.enviadas)} das enviadas`}
          bar={{ pct: totals.enviadas ? totals.negadas / totals.enviadas * 100 : 0, color: 'bg-red-500' }}
        />
        <KpiCard
          icon={Hourglass}
          label="Em análise"
          value={totals.emAnalise}
          valueClass="text-amber-600 dark:text-amber-400"
          iconBg="bg-amber-100 text-amber-600"
          sub="ainda sem desfecho"
          bar={{ pct: totals.enviadas ? totals.emAnalise / totals.enviadas * 100 : 0, color: 'bg-amber-500' }}
        />
        <KpiCard
          icon={Clock}
          label="Tempo até o desfecho"
          value={totals.medianaDiasDesfecho === null
            ? '—'
            : <>{totals.medianaDiasDesfecho}<span className="text-base font-bold text-gray-400 dark:text-zinc-500">d</span></>}
          iconBg="bg-slate-100 text-slate-600"
          sub="mediana das resolvidas"
        />
      </div>

      {/* ---- Filtros, busca, período e exportação ---- */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip value="all" label="Todas" count={totals.enviadas} />
          <FilterChip value="pago" label="Pagas" count={totals.pagas} />
          <FilterChip value="negado" label="Negadas" count={totals.negadas} />
          <FilterChip value="aberto" label="Aguardando" count={totals.emAnalise} />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="relative flex items-center w-full lg:w-64">
            <Search className="absolute left-3 text-gray-400 dark:text-zinc-500 w-4 h-4" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente, telefone ou hospital..."
              className="pl-9 h-10 w-full rounded-xl border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
          <button
            onClick={exportCsv}
            disabled={visible.length === 0}
            className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-300 hover:text-gray-900 dark:hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <DateFilter value={range} onChange={handleDateChange} />
        </div>
      </div>

      {/* ---- Planilha agrupada por mês (layout C) ---- */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="font-black text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-widest">Carregando pastas...</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-3 text-center">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-gray-300 dark:text-zinc-600" />
          </div>
          <p className="font-bold text-gray-500 dark:text-zinc-400">
            {rows.length === 0 ? 'Nenhuma pasta enviada no período' : 'Nenhuma pasta com esses filtros'}
          </p>
          <p className="text-sm text-gray-400 dark:text-zinc-500 max-w-sm">
            {rows.length === 0 ? config.emptyHint : 'Ajuste a busca ou volte para "Todas".'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden mb-10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-950/50 text-left">
                  {['Cliente', 'Telefone', 'Hospital', 'Coluna de origem', 'Enviado em', 'Dias', 'Situação', 'Arquivado em'].map((h) => (
                    <th key={h} className="px-4 py-3 font-black text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const pagas = g.rows.filter((r) => r.desfecho === 'pago').length;
                  const negadas = g.rows.filter((r) => r.desfecho === 'negado').length;
                  return (
                    <React.Fragment key={g.key}>
                      {/* Cabeçalho do mês */}
                      <tr>
                        <td colSpan={8} className="px-4 py-2 bg-gray-50 dark:bg-zinc-950/50 border-y border-gray-100 dark:border-zinc-800">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-black text-[11px] uppercase tracking-wider text-gray-700 dark:text-zinc-200">{g.label}</span>
                            <span className="text-[11px] text-gray-400 dark:text-zinc-500 tabular-nums">
                              {g.rows.length} enviadas · {pagas} pagas · {negadas} negadas
                            </span>
                          </div>
                        </td>
                      </tr>

                      {g.rows.map((r, i) => {
                        const state = rowState(r);
                        const cfg = STATE_CONFIG[state];
                        return (
                          <tr
                            key={`${r.isProcess ? 'p' : 'u'}-${r.cardId}`}
                            onClick={() => setSelected(r)}
                            className={cn(
                              'cursor-pointer transition-colors hover:bg-blue-50/60 dark:hover:bg-zinc-800/60',
                              // Zebrado da planilha
                              i % 2 === 1 && 'bg-gray-50/60 dark:bg-zinc-950/30',
                            )}
                          >
                            <td className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
                              <div className="flex items-center gap-2 min-w-0">
                                {r.isProcess
                                  ? <Briefcase className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  : <UserIcon className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 shrink-0" />}
                                <span className="font-bold text-gray-900 dark:text-zinc-100 truncate" title={r.name}>{r.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 whitespace-nowrap tabular-nums">{r.telefone || '—'}</td>
                            <td className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 max-w-[200px] truncate" title={r.hospital || undefined}>
                              {r.hospital || '—'}
                            </td>
                            <td className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 text-gray-500 dark:text-zinc-500 max-w-[190px] truncate text-xs" title={r.colunaOrigem}>
                              {r.colunaOrigem}
                            </td>
                            <td className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 whitespace-nowrap tabular-nums">{formatDate(r.enviadoEm)}</td>
                            <td className={cn(
                              'px-4 py-3 border-b border-gray-100 dark:border-zinc-800 whitespace-nowrap tabular-nums font-bold',
                              state === 'parada' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-zinc-400',
                            )}>
                              {diasDaPasta(r)}
                            </td>
                            <td className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
                              <span className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ring-1',
                                cfg.badge,
                              )}>
                                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                                {cfg.label}
                              </span>
                              {/* Coluna/status atual como contexto embaixo da badge */}
                              {r.situacaoAtual && (
                                <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1 truncate max-w-[180px]" title={r.situacaoAtual}>
                                  {r.situacaoAtual}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 whitespace-nowrap tabular-nums">{formatDate(r.arquivadoEm)}</td>
                          </tr>
                        );
                      })}

                      {/* Subtotal do mês */}
                      <tr className="bg-gray-50 dark:bg-zinc-950/50">
                        <td colSpan={4} className="px-4 py-2 font-black text-[11px] uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                          Subtotal
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-400 dark:text-zinc-500 tabular-nums whitespace-nowrap">
                          {g.rows.length} pastas
                        </td>
                        <td className="px-4 py-2 text-[11px] text-gray-400 dark:text-zinc-500 tabular-nums whitespace-nowrap">
                          {Math.round(g.rows.reduce((s, r) => s + diasDaPasta(r), 0) / g.rows.length)} méd.
                        </td>
                        <td colSpan={2} className="px-4 py-2 text-[11px] font-bold text-gray-500 dark:text-zinc-400 whitespace-nowrap">
                          {pct(pagas, g.rows.length)} pagas · {pct(negadas, g.rows.length)} negadas
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && selectedCard && (
        <CardDialog
          card={selectedCard}
          open={!!selected}
          onClose={() => setSelected(null)}
          onUpdate={() => { /* refetch feito ao fechar, se necessário */ }}
          onDelete={() => {
            setRows((prev) => prev.filter((r) => r.cardId !== selected.cardId));
            setSelected(null);
          }}
          cardId={selected.cardId}
          ownerId={selected.ownerId}
          isProcess={selected.isProcess}
        />
      )}
    </div>
  );
};
