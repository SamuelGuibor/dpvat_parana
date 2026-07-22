/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, DollarSign, XCircle, Search, Loader2, Briefcase, User as UserIcon,
  RotateCcw, Eye, Phone, MapPin, IdCard, Mail, Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

import { Input } from '@/app/_shared/ui/input';
import { Button } from '@/app/_shared/ui/button';
import { cn } from '@/app/_shared/lib/utils';
import {
  getArchivedCards, setArchiveStatus, type ArchivedCard, type ArchiveStatus,
} from '@/app/_actions/cards/archive-card';
import { CardDialog } from './CardDialog';
import type { ExtendedKanbanCard } from './card-dialog/types';

// Configuração visual de cada categoria de arquivamento.
const STATUS_CONFIG: Record<ArchiveStatus, {
  label: string;
  icon: React.ElementType;
  bar: string;
  chipBg: string;
  chipText: string;
  ring: string;
  activeBg: string;
  iconBg: string;
}> = {
  pagos_ccs: {
    label: 'APTOS CCS',
    icon: DollarSign,
    bar: 'bg-emerald-500',
    chipBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    chipText: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-200 dark:ring-emerald-900',
    activeBg: 'bg-emerald-600 text-white border-emerald-600',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300',
  },

  pagos_uni: {
    label: 'APTOS UNI',
    icon: DollarSign,
    bar: 'bg-green-500',
    chipBg: 'bg-green-50 dark:bg-green-950/40',
    chipText: 'text-green-700 dark:text-green-300',
    ring: 'ring-green-200 dark:ring-green-900',
    activeBg: 'bg-green-600 text-white border-green-600',
    iconBg: 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-300',
  },

  enviados_taynara: {
    label: 'ENVIADOS TAYNARA',
    icon: Archive,
    bar: 'bg-blue-500',
    chipBg: 'bg-blue-50 dark:bg-blue-950/40',
    chipText: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-200 dark:ring-blue-900',
    activeBg: 'bg-blue-600 text-white border-blue-600',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300',
  },

  enviados_evelyn: {
    label: 'ENVIADOS EVELYN',
    icon: Archive,
    bar: 'bg-sky-500',
    chipBg: 'bg-sky-50 dark:bg-sky-950/40',
    chipText: 'text-sky-700 dark:text-sky-300',
    ring: 'ring-sky-200 dark:ring-sky-900',
    activeBg: 'bg-sky-600 text-white border-sky-600',
    iconBg: 'bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300',
  },

  enviados_joinville: {
    label: 'ENVIADOS JOINVILLE',
    icon: Archive,
    bar: 'bg-cyan-500',
    chipBg: 'bg-cyan-50 dark:bg-cyan-950/40',
    chipText: 'text-cyan-700 dark:text-cyan-300',
    ring: 'ring-cyan-200 dark:ring-cyan-900',
    activeBg: 'bg-cyan-600 text-white border-cyan-600',
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-300',
  },

  pastas_negadas_ccs: {
    label: 'PASTAS NEGADAS CCS',
    icon: XCircle,
    bar: 'bg-amber-500',
    chipBg: 'bg-amber-50 dark:bg-amber-950/40',
    chipText: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-200 dark:ring-amber-900',
    activeBg: 'bg-amber-500 text-white border-amber-500',
    iconBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300',
  },

  pastas_negadas_uni: {
    label: 'PASTAS NEGADAS UNI',
    icon: XCircle,
    bar: 'bg-orange-500',
    chipBg: 'bg-orange-50 dark:bg-orange-950/40',
    chipText: 'text-orange-700 dark:text-orange-300',
    ring: 'ring-orange-200 dark:ring-orange-900',
    activeBg: 'bg-orange-500 text-white border-orange-500',
    iconBg: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-300',
  },

  perdeu_contato_definitivo: {
    label: 'PERDEU CONTATO',
    icon: XCircle,
    bar: 'bg-red-500',
    chipBg: 'bg-red-50 dark:bg-red-950/40',
    chipText: 'text-red-700 dark:text-red-300',
    ring: 'ring-red-200 dark:ring-red-900',
    activeBg: 'bg-red-600 text-white border-red-600',
    iconBg: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300',
  },

  nao_assinaram_procuracao: {
    label: 'NÃO ASSINARAM PROCURAÇÃO',
    icon: XCircle,
    bar: 'bg-rose-500',
    chipBg: 'bg-rose-50 dark:bg-rose-950/40',
    chipText: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-200 dark:ring-rose-900',
    activeBg: 'bg-rose-600 text-white border-rose-600',
    iconBg: 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300',
  },

  descartados_analise_interna: {
    label: 'DESCARTADOS',
    icon: Archive,
    bar: 'bg-slate-500',
    chipBg: 'bg-slate-100 dark:bg-zinc-800',
    chipText: 'text-slate-700 dark:text-zinc-300',
    ring: 'ring-slate-200 dark:ring-zinc-700',
    activeBg: 'bg-slate-700 text-white border-slate-700',
    iconBg: 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300',
  },

  desistiram_expressamente: {
    label: 'DESISTIRAM',
    icon: XCircle,
    bar: 'bg-purple-500',
    chipBg: 'bg-purple-50 dark:bg-purple-950/40',
    chipText: 'text-purple-700 dark:text-purple-300',
    ring: 'ring-purple-200 dark:ring-purple-900',
    activeBg: 'bg-purple-600 text-white border-purple-600',
    iconBg: 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300',
  },

  voltar_um_dia: {
    label: 'VOLTAR UM DIA',
    icon: RotateCcw,
    bar: 'bg-indigo-500',
    chipBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    chipText: 'text-indigo-700 dark:text-indigo-300',
    ring: 'ring-indigo-200 dark:ring-indigo-900',
    activeBg: 'bg-indigo-600 text-white border-indigo-600',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300',
  },
};

type Filter = 'all' | ArchiveStatus;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Constrói um card mínimo pro CardDialog (que carrega o resto do servidor via cardId).
function toKanbanCard(a: ArchivedCard): ExtendedKanbanCard {
  return {
    id: a.id,
    title: a.name,
    description: a.obs ?? '',
    assignee: '',
    status: a.label?.name ?? '',
    timer: 0,
    comments: [],
    attachments: [],
    observations: a.obs ?? '',
    checklistItems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    statusStartedAt: null,
    service: a.service,
    isProcess: a.isProcess,
    ownerId: a.ownerId,
    labelId: a.labelId,
    label: a.label ? { ...a.label, timeLimitDays: null } : null,
    cardNumber: a.cardNumber,
    cpf: a.cpf,
    telefone: a.telefone,
    email: a.email,
    cidade: a.cidade,
    estado: a.estado,
  } as ExtendedKanbanCard;
}

const InfoRow: React.FC<{ icon: React.ElementType; value?: string }> = ({ icon: Icon, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-[12px] text-gray-600 dark:text-zinc-400 min-w-0">
      <Icon className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-zinc-500" />
      <span className="truncate">{value}</span>
    </div>
  );
};

export const ArchivedCards: React.FC = () => {
  const [cards, setCards] = useState<ArchivedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ArchivedCard | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getArchivedCards();
      setCards(data);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar arquivados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = {
      all: cards.length,
      pagos_ccs: 0,
      pagos_uni: 0,
      enviados_taynara: 0,
      enviados_evelyn: 0,
      enviados_joinville: 0,
      pastas_negadas_ccs: 0,
      pastas_negadas_uni: 0,
      perdeu_contato_definitivo: 0,
      nao_assinaram_procuracao: 0,
      descartados_analise_interna: 0,
      desistiram_expressamente: 0,
    } as Record<Filter, number>; for (const card of cards) c[card.archiveStatus] += 1;
    return c;
  }, [cards]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return cards.filter((c) => {
      if (filter !== 'all' && c.archiveStatus !== filter) return false;
      if (!q) return true;
      const nameHit = c.name.toLowerCase().includes(q);
      const cpfHit = qDigits.length > 0 && c.cpf.replace(/\D/g, '').includes(qDigits);
      const numHit = qDigits.length > 0 && c.cardNumber != null && String(c.cardNumber).includes(qDigits);
      return nameHit || cpfHit || numHit;
    });
  }, [cards, filter, query]);

  async function handleRestore(card: ArchivedCard) {
    setRestoringId(card.id);
    // remoção otimista
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    try {
      await setArchiveStatus({ id: card.id, isProcess: card.isProcess, status: null });
      toast.success(`${card.name} voltou para o board`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao desarquivar');
      load(); // recarrega para o card reaparecer
    } finally {
      setRestoringId(null);
    }
  }

  const filterTabs: {
    key: Filter;
    label: string;
    icon: React.ElementType | null;
  }[] = [
      { key: "all", label: "TODOS", icon: Inbox },

      { key: "pagos_ccs", label: STATUS_CONFIG.pagos_ccs.label, icon: DollarSign },
      { key: "pagos_uni", label: STATUS_CONFIG.pagos_uni.label, icon: DollarSign },

      { key: "enviados_taynara", label: STATUS_CONFIG.enviados_taynara.label, icon: Archive },
      { key: "enviados_evelyn", label: STATUS_CONFIG.enviados_evelyn.label, icon: Archive },
      { key: "enviados_joinville", label: STATUS_CONFIG.enviados_joinville.label, icon: Archive },

      { key: "pastas_negadas_ccs", label: STATUS_CONFIG.pastas_negadas_ccs.label, icon: XCircle },
      { key: "pastas_negadas_uni", label: STATUS_CONFIG.pastas_negadas_uni.label, icon: XCircle },

      { key: "perdeu_contato_definitivo", label: STATUS_CONFIG.perdeu_contato_definitivo.label, icon: XCircle },
      { key: "nao_assinaram_procuracao", label: STATUS_CONFIG.nao_assinaram_procuracao.label, icon: XCircle },

      { key: "descartados_analise_interna", label: STATUS_CONFIG.descartados_analise_interna.label, icon: Archive },

      { key: "desistiram_expressamente", label: STATUS_CONFIG.desistiram_expressamente.label, icon: XCircle },
    ];

  return (
    <div className="px-6 py-4 min-h-screen bg-[#f8fafc] dark:bg-zinc-950">
      {/* Cabeçalho + busca */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
            <Archive className="w-5 h-5 text-slate-500 dark:text-zinc-300" />
          </div>
          <div>
            <h2 className="font-black text-lg text-gray-900 dark:text-zinc-100 leading-tight">Arquivados</h2>
          </div>
        </div>
        <div className="relative flex items-center w-full lg:w-96">
          <Search className="absolute left-3 text-gray-400 dark:text-zinc-500 w-4 h-4" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, CPF ou nº do card..."
            className="pl-10 h-12 w-full rounded-2xl border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/50"
          />
        </div>
      </div>

      {/* Filtros por categoria */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filterTabs.map((tab) => {
          const active = filter === tab.key;
          const cfg = tab.key !== 'all' ? STATUS_CONFIG[tab.key] : null;
          const Icon = tab.icon!;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold border transition-all',
                active
                  ? cfg ? cfg.activeBg : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              <span className={cn(
                'ml-1 min-w-[22px] px-1.5 py-0.5 rounded-full text-[11px] font-black text-center',
                active ? 'bg-white/25' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300'
              )}>
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="font-black text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-widest">Carregando arquivados...</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] gap-3 text-center">
          <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-gray-300 dark:text-zinc-600" />
          </div>
          <p className="font-bold text-gray-500 dark:text-zinc-400">
            {query.trim() ? 'Nenhum card encontrado' : 'Nenhum card arquivado por aqui'}
          </p>
          <p className="text-sm text-gray-400 dark:text-zinc-500 max-w-sm">
            Use o menu de um card no Kanban para marcá-lo como pago, não qualificado ou arquivado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10">
          {visible.map((card) => {
            const cfg = STATUS_CONFIG[card.archiveStatus];
            const Icon = cfg.icon;
            return (
              <div
                key={`${card.isProcess ? 'p' : 'u'}-${card.id}`}
                className={cn(
                  'group relative bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden ring-1',
                  cfg.ring
                )}
              >
                <div className={cn('absolute top-0 left-0 h-full w-1.5', cfg.bar)} />
                <div className="p-4 pl-6">
                  {/* topo */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        {card.cardNumber != null && (
                          <span className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 text-[12px] font-mono font-bold">
                            #{card.cardNumber}
                          </span>
                        )}
                        {card.isProcess
                          ? <Briefcase className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          : <UserIcon className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 shrink-0" />}
                      </div>
                      <h3 className="font-bold text-sm text-gray-900 dark:text-zinc-100 leading-tight truncate" title={card.name}>
                        {card.name}
                      </h3>
                    </div>
                    <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0', cfg.iconBg)}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  {/* badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider', cfg.chipBg, cfg.chipText)}>
                      {cfg.label.replace(/s$/, '')}
                    </span>
                    {card.label && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
                        style={{ backgroundColor: `${card.label.color}22`, color: card.label.color }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: card.label.color }} />
                        {card.label.name}
                      </span>
                    )}
                  </div>

                  {/* infos */}
                  <div className="space-y-1.5 mb-4 min-h-[20px]">
                    <InfoRow icon={IdCard} value={card.cpf} />
                    <InfoRow icon={Phone} value={card.telefone} />
                    <InfoRow icon={Mail} value={card.email} />
                    <InfoRow
                      icon={MapPin}
                      value={[card.cidade, card.estado].filter(Boolean).join(' - ') || undefined}
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-50 dark:border-zinc-800 pt-3">
                    <span className="text-[11px] text-gray-400 dark:text-zinc-500">
                      Arquivado em {formatDate(card.archivedAt)}
                    </span>
                  </div>

                  {/* ações */}
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="secondary"
                      className="flex-1 h-9 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-zinc-950 hover:bg-gray-100 dark:hover:bg-zinc-800"
                      onClick={() => setSelected(card)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Ver dados
                    </Button>
                    <Button
                      className="flex-1 h-9 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleRestore(card)}
                      disabled={restoringId === card.id}
                    >
                      {restoringId === card.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Desarquivar</>}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <CardDialog
          card={toKanbanCard(selected)}
          open={!!selected}
          onClose={() => setSelected(null)}
          onUpdate={() => { /* refetch feito ao fechar */ }}
          onDelete={(id) => {
            setCards((prev) => prev.filter((c) => c.id !== id));
            setSelected(null);
          }}
          cardId={selected.id}
          ownerId={selected.ownerId}
          isProcess={selected.isProcess}
        />
      )}
    </div>
  );
};
