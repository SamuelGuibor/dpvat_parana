'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Copy, Check } from 'lucide-react';
import { listContratados, type Contratado } from '@/app/_actions/botconversa';
import { formatPhone } from '@/app/_shared/utils/format';
import { brDateBR, BR_TZ } from '@/app/_shared/utils/date-br';

// Lista de fechamentos: todo lead que fechou ("contratado" no BotConversa)
// aparece aqui, agrupado por mês. Cada fechamento também vira tarefa na Caixa
// de Menções e Tarefas do setor responsável (sector-tasks.ts).

interface MonthGroup {
  label: string;
  items: Contratado[];
}

function monthLabel(iso: string): string {
  const label = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BR_TZ, month: 'long', year: 'numeric',
  }).format(new Date(iso));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function ContratadosPanel() {
  const [rows, setRows] = useState<Contratado[] | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listContratados().then(setRows).catch(() => setError(true));
  }, []);

  const groups = useMemo<MonthGroup[]>(() => {
    if (!rows) return [];
    const out: MonthGroup[] = [];
    for (const r of rows) {
      const label = r.createdAt ? monthLabel(r.createdAt) : 'Sem data';
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(r);
      else out.push({ label, items: [r] });
    }
    return out;
  }, [rows]);

  const copyAll = async () => {
    if (!rows) return;
    const text = groups
      .map((g) =>
        `${g.label} — ${g.items.length} contratado${g.items.length === 1 ? '' : 's'}\n` +
        g.items
          .map((c) => `• ${c.nome || 'Sem nome'} — ${formatPhone(c.telefone)}${c.createdAt ? ` — ${brDateBR(c.createdAt)}` : ''}`)
          .join('\n'),
      )
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard indisponível (http/permissão) — sem drama */ }
  };

  if (error) {
    return <p className="p-6 text-sm text-red-600">Não foi possível carregar os contratados.</p>;
  }
  if (!rows) {
    return (
      <div className="grid h-full place-items-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-zinc-100">🎉 Contratados</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {rows.length.toLocaleString('pt-BR')} fechamentos — cada um também vira tarefa na aba Menções.
          </p>
        </div>
        <button
          onClick={copyAll}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado!' : 'Copiar tudo'}
        </button>
      </div>

      {rows.length === 0 && (
        <p className="rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400 dark:border-zinc-800">
          Nenhum contratado registrado ainda.
        </p>
      )}

      {groups.map((g) => (
        <div key={g.label} className="rounded-2xl border border-gray-100 p-4 dark:border-zinc-800">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
            {g.label} · {g.items.length} contratado{g.items.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-1 font-mono text-[13px] leading-relaxed text-gray-700 dark:text-zinc-200">
            {g.items.map((c) => (
              <p key={c.id} className="truncate">
                • <span className="font-semibold">{c.nome || 'Sem nome'}</span>
                {' — '}{formatPhone(c.telefone)}
                {c.createdAt && <span className="text-gray-400"> — {brDateBR(c.createdAt)}</span>}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
