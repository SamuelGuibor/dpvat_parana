/* eslint-disable no-unused-vars */
'use client';

// Seletor de mês com setas — substitui o <input type="month"> nativo, cujo
// popup não acompanha o tema e destoava do resto da tela.

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  value: string;        // "YYYY-MM"
  max: string;          // mês atual — não navega para o futuro
  onChange: (month: string) => void;
}

function shift(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function MonthPicker({ value, max, onChange }: Props) {
  const [y, m] = value.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const atMax = value >= max;

  return (
    <div className="flex items-center gap-1 rounded-full bg-gray-100 px-1 py-0.5">
      <button
        type="button"
        onClick={() => onChange(shift(value, -1))}
        className="rounded-full p-1.5 text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm transition"
        title="Mês anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize text-gray-700 select-none">
        {label}
      </span>
      <button
        type="button"
        onClick={() => !atMax && onChange(shift(value, 1))}
        disabled={atMax}
        className="rounded-full p-1.5 text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm transition disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none"
        title="Próximo mês"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
