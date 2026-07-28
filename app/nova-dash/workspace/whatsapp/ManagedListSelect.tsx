/* eslint-disable no-unused-vars */
'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/_shared/ui/popover';

// Seletor em LISTA SUSPENSA para os gerenciadores do WhatsApp (fluxos,
// respostas rápidas): substitui as fileiras de chips que cresciam sem limite —
// ocupa 1 linha independente de quantos itens existirem. Item aberto no
// dropdown mostra título + subtítulo e a lixeira de excluir.

export interface ManagedListItem {
  id: string;
  title: string;
  subtitle?: string;
}

interface Props {
  items: ManagedListItem[];
  selectedId: string | null;
  loading?: boolean;
  /** Texto do gatilho quando nada está selecionado (ex.: "Novo fluxo..."). */
  placeholder: string;
  emptyText: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ManagedListSelect({ items, selectedId, loading, placeholder, emptyText, onSelect, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3.5 text-base font-semibold text-gray-700 outline-none transition-colors hover:border-gray-300 focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <span className="truncate">
              {selected ? (
                <>
                  {selected.title}
                  {selected.subtitle && <span className="font-normal text-gray-400"> · {selected.subtitle}</span>}
                </>
              ) : (
                <span className="font-normal text-gray-400">{placeholder}</span>
              )}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-md p-1">
        {items.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-gray-400">{emptyText}</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {items.map((item) => {
              const isActive = item.id === selectedId;
              return (
                <div
                  key={item.id}
                  className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 ${isActive ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-zinc-700'}`} />
                  <button
                    type="button"
                    onClick={() => { onSelect(item.id); setOpen(false); }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className={`block truncate text-base font-semibold ${isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-700 dark:text-zinc-200'}`}>
                      {item.title}
                    </span>
                    {item.subtitle && <span className="block truncate text-xs text-gray-400">{item.subtitle}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    title="Excluir"
                    className="shrink-0 rounded-md p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
