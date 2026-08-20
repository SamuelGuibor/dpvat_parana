/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOutput, DollarSign, XCircle, Loader2, Inbox, Briefcase, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/app/_shared/lib/utils';
import {
  getCaiqueFolders, type CaiqueFolderRow, type CaiqueOutcome,
} from '@/app/_actions/cards/get-caique-folders';
import { DateFilter, getDefaultDateRange, type DateRange } from './DateFilter';
import { CardDialog } from './CardDialog';
import type { ExtendedKanbanCard } from './card-dialog/types';

// Configuração visual de cada desfecho da pasta (badge da coluna "Situação").
const OUTCOME_CONFIG: Record<CaiqueOutcome, { label: string; badge: string; dot: string }> = {
  enviado: { label: 'Enviado', badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  pago: { label: 'Pago', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  negado: { label: 'Negado', badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Card mínimo pro CardDialog (o dialog carrega o resto do servidor via cardId),
// mesmo padrão do toKanbanCard da aba Arquivados.
function toKanbanCard(r: CaiqueFolderRow): ExtendedKanbanCard {
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

// Cartãozinho de contagem no topo da planilha (Enviadas / Pagas / Negadas).
const CountCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number;
  iconBg: string;
}> = ({ icon: Icon, label, value, iconBg }) => (
  <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm px-5 py-4">
    <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-2xl font-black text-gray-900 dark:text-zinc-100 leading-none">{value}</p>
      <p className="text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mt-1">{label}</p>
    </div>
  </div>
);

/**
 * Planilha de controle das pastas enviadas pro Caique: quem entrou na coluna
 * CAIQUE no período, com o desfecho (pago/negado) vindo do arquivamento.
 * Vive como sub-visão da aba Arquivados.
 */
export const CaiqueFolders: React.FC = () => {
  const [range, setRange] = useState<DateRange>(getDefaultDateRange);
  const [rows, setRows] = useState<CaiqueFolderRow[]>([]);
  const [totals, setTotals] = useState({ enviadas: 0, pagas: 0, negadas: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CaiqueFolderRow | null>(null);

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    try {
      const data = await getCaiqueFolders({ from: r.from.toISOString(), to: r.to.toISOString() });
      setRows(data.rows);
      setTotals(data.totals);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar as pastas do Caique');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [load, range]);

  const handleDateChange = useCallback((r: DateRange) => setRange(r), []);

  const selectedCard = useMemo(() => (selected ? toKanbanCard(selected) : null), [selected]);

  return (
    <div>
      {/* Contadores + filtro de período */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 max-w-2xl">
          <CountCard
            icon={FolderOutput}
            label="Enviadas"
            value={totals.enviadas}
            iconBg="bg-blue-100 text-blue-600"
          />
          <CountCard
            icon={DollarSign}
            label="Pagas"
            value={totals.pagas}
            iconBg="bg-emerald-100 text-emerald-600"
          />
          <CountCard
            icon={XCircle}
            label="Negadas"
            value={totals.negadas}
            iconBg="bg-red-100 text-red-600"
          />
        </div>
        <DateFilter value={range} onChange={handleDateChange} />
      </div>

      {/* Tabela estilo planilha */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="font-black text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-widest">Carregando pastas...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-3 text-center">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-gray-300 dark:text-zinc-600" />
          </div>
          <p className="font-bold text-gray-500 dark:text-zinc-400">Nenhuma pasta enviada no período</p>
          <p className="text-sm text-gray-400 dark:text-zinc-500 max-w-sm">
            Cards que entram na coluna CAIQUE do Kanban aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden mb-10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-950/50 text-left">
                  <th className="px-4 py-3 font-black text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-4 py-3 font-black text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Telefone</th>
                  <th className="px-4 py-3 font-black text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Hospital</th>
                  <th className="px-4 py-3 font-black text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Enviado em</th>
                  <th className="px-4 py-3 font-black text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Situação</th>
                  <th className="px-4 py-3 font-black text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider">Arquivado em</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cfg = OUTCOME_CONFIG[r.desfecho];
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {r.isProcess
                            ? <Briefcase className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            : <UserIcon className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 shrink-0" />}
                          <span className="font-bold text-gray-900 dark:text-zinc-100 truncate" title={r.name}>{r.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 whitespace-nowrap">{r.telefone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 max-w-[200px] truncate" title={r.hospital || undefined}>
                        {r.hospital || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(r.enviadoEm)}</td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-gray-600 dark:text-zinc-400 whitespace-nowrap">{formatDate(r.arquivadoEm)}</td>
                    </tr>
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
