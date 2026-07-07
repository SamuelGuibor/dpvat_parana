/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react';
import { Label } from '@/app/_shared/ui/label';
import { cn } from '@/app/_shared/lib/utils';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  id: string;
  label: string;
  value?: string;
  onChange: (field: string, value: string) => void;
}

export function HospitalCombobox({ id, label, value, onChange }: Props) {
  const { data, mutate } = useSWR<string[]>('/api/hospitals', fetcher);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(null);
      }
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQuery(''); setConfirmDelete(null); }
  }, [open]);

  const options = useMemo(() => {
    const base = data ?? [];
    const list = value && !base.includes(value) ? [value, ...base] : base;
    if (!query.trim()) return list;
    return list.filter((h) => h.toLowerCase().includes(query.toLowerCase()));
  }, [data, value, query]);

  const trimmed = query.trim();
  const exactMatch = options.some((h) => h.toLowerCase() === trimmed.toLowerCase());
  const canAdd = trimmed.length > 0 && !exactMatch;

  function select(v: string) {
    onChange(id, v);
    setOpen(false);
  }

  function addNew() {
    if (!canAdd) return;
    onChange(id, trimmed);
    mutate((prev) => {
      const next = new Set([...(prev ?? []), trimmed]);
      return Array.from(next).sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
      );
    }, { revalidate: false });
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(id, '');
  }

  return (
    <div ref={containerRef} className="space-y-2 relative">
      <Label htmlFor={id}>{label}</Label>

      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full h-10 px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded-md flex items-center justify-between gap-2 hover:border-gray-400 dark:hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <span className={cn('truncate flex-1 text-left', !value && 'text-gray-400 dark:text-zinc-500')}>
          {value || 'Selecione ou adicione um hospital'}
        </span>
        {value ? (
          <X
            className="w-3.5 h-3.5 text-gray-400 hover:text-red-500 shrink-0 transition-colors"
            onMouseDown={clear}
          />
        ) : (
          <ChevronsUpDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div
          className="absolute z-[9999] top-full left-0 w-full mt-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* busca */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-zinc-800">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canAdd) addNew();
                  else if (options.length === 1) select(options[0]);
                }
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Buscar hospital..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-zinc-100"
            />
          </div>

          {/* lista */}
          <div className="max-h-56 overflow-y-auto py-1">
            {options.length === 0 && !canAdd && (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">Nenhum hospital encontrado.</p>
            )}

            {options.map((h) => {
              const selected = h === value;
              const isConfirming = confirmDelete === h;

              return (
                <div key={h} className="group flex items-center">
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); if (!isConfirming) select(h); }}
                    className={cn(
                      'flex-1 px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-zinc-800',
                      selected && 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    )}
                  >
                    <Check className={cn('w-3.5 h-3.5 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{h}</span>
                  </button>

                  {/* confirmação inline
                  {isConfirming ? (
                    <div className="flex items-center gap-1 pr-2 shrink-0">
                      <span className="text-[10px] text-red-500 font-semibold">Remover?</span>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); deleteHospital(h); }}
                        className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-1.5 py-0.5 rounded"
                      >
                        Sim
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setConfirmDelete(null); }}
                        className="text-[10px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 px-1.5 py-0.5 rounded"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setConfirmDelete(h); }}
                      className="opacity-0 group-hover:opacity-100 mr-2 p-1 text-gray-300 hover:text-red-500 transition-all shrink-0"
                      title="Remover hospital"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )} */}
                </div>
              );
            })}

            {canAdd && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addNew(); }}
                className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 border-t border-gray-100 dark:border-zinc-800 mt-1"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Adicionar &quot;{trimmed}&quot;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
 