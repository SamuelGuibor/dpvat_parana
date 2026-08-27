/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/app/_shared/lib/utils';

export interface SoftOption {
  value: string;
  label: string;
  /** Cor hex opcional — vira a bolinha ao lado da opção (ex.: cor da coluna). */
  color?: string;
}

interface Props {
  id: string;
  label: string;
  value?: string | null;
  options: SoftOption[];
  placeholder?: string;
  onSelect: (value: string, option?: SoftOption) => void;
  /** Ícone opcional à esquerda do valor (quando a opção não tem cor). */
  icon?: React.ReactNode;
}

/**
 * Select "suave": mesmo comportamento de um <select>, mas com visual de pílula
 * clara, bolinha de cor por opção e lista flutuante com destaque do item ativo.
 * O <select> nativo do sistema não deixa colorir opção nem controlar o painel —
 * por isso aqui é botão + lista própria, com teclado replicado na mão.
 */
export function SoftSelect({ id, label, value, options, placeholder, onSelect, icon }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Ao abrir, o item ativo começa no que já está selecionado.
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setActive(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  // Mantém o item ativo visível durante a navegação por teclado.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function choose(opt: SoftOption) {
    onSelect(opt.value, opt);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) choose(o); }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
        {label}
      </label>

      <div ref={boxRef} className="relative">
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onKeyDown}
          className={cn(
            'group flex h-10 w-full items-center gap-2.5 rounded-xl border px-3 text-sm transition-all duration-150',
            'bg-gradient-to-b from-white to-gray-50 dark:from-zinc-900 dark:to-zinc-900/60',
            'border-gray-200/90 dark:border-zinc-800 shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
            'hover:border-gray-300 hover:shadow-[0_2px_6px_rgba(16,24,40,0.07)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 focus-visible:border-blue-400',
            open && 'border-blue-400 ring-2 ring-blue-400/30'
          )}
        >
          {selected?.color ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white dark:ring-zinc-900"
              style={{ backgroundColor: selected.color, boxShadow: `0 0 0 3px ${selected.color}22` }}
            />
          ) : (
            icon && (
              <span className={cn('shrink-0 text-gray-400', selected && 'text-blue-500')}>{icon}</span>
            )
          )}

          <span className={cn('flex-1 truncate text-left', selected ? 'font-medium text-gray-800 dark:text-zinc-100' : 'text-gray-400 dark:text-zinc-500')}>
            {selected?.label ?? placeholder ?? 'Selecione'}
          </span>

          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200',
              open && 'rotate-180 text-blue-500'
            )}
          />
        </button>

        {open && (
          <div
            id={`${id}-listbox`}
            role="listbox"
            ref={listRef}
            className="absolute left-0 top-full z-[9999] mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200/80 bg-white/95 p-1 shadow-[0_12px_28px_-8px_rgba(16,24,40,0.22)] backdrop-blur-sm animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {options.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-gray-400">Nenhuma opção disponível.</p>
            )}

            {options.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    i === active ? 'bg-gray-100/90 dark:bg-zinc-800' : 'bg-transparent',
                    isSelected ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-zinc-200'
                  )}
                >
                  {o.color ? (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: o.color, boxShadow: `0 0 0 3px ${o.color}22` }}
                    />
                  ) : (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gray-300 dark:bg-zinc-600" />
                  )}
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
