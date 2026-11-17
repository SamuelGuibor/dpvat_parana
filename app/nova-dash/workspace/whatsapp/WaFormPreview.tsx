'use client';

import { CheckSquare, ChevronRight, Image as ImageIcon, Link2, TextCursorInput, ListChecks } from 'lucide-react';
import { summarizeFlow, type FlowJson } from '@/app/_shared/utils/wa-forms';

// Prévia LEGÍVEL das telas do formulário (Meta Flow): o que o cliente vê, na
// ordem, com os campos obrigatórios marcados. Não é o render da Meta — para o
// visual exato há o link "prévia interativa da Meta" no modal.

export function WaFormPreview({ json, entryId }: { json: FlowJson; entryId?: string | null }) {
  const screens = summarizeFlow(json);
  return (
    <div className="space-y-3">
      {screens.map((s, i) => (
        <div key={s.id} className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-zinc-800 dark:text-zinc-400">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">{i + 1}</span>
            <span className="truncate">{s.title}</span>
            {s.id === entryId && <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">abre primeiro</span>}
            {s.terminal && <span className={`${s.id === entryId ? '' : 'ml-auto '}rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300`}>envia a resposta</span>}
          </div>
          <div className="space-y-1.5 px-3 py-2.5 text-sm text-gray-700 dark:text-zinc-200">
            {s.items.length === 0 && <p className="text-xs text-gray-400">Tela sem texto.</p>}
            {s.items.map((it, j) => {
              if (it.kind === 'heading') return <p key={j} className="text-base font-bold">{it.text}</p>;
              if (it.kind === 'subheading') return <p key={j} className="font-semibold">{it.text}</p>;
              if (it.kind === 'caption') return <p key={j} className="text-xs text-gray-500 dark:text-zinc-400">{it.text}</p>;
              if (it.kind === 'text') return <p key={j} className="line-clamp-6 whitespace-pre-wrap">{it.text.replace(/\*\*/g, '')}</p>;
              const Icon = it.kind === 'input' ? TextCursorInput : it.kind === 'choice' ? ListChecks : it.kind === 'optin' ? CheckSquare : it.kind === 'link' ? Link2 : it.kind === 'image' ? ImageIcon : ChevronRight;
              if (it.kind === 'button') {
                return (
                  <div key={j} className="mt-2 rounded-full bg-emerald-600 px-3 py-1.5 text-center text-sm font-semibold text-white">{it.text}</div>
                );
              }
              return (
                <div key={j} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${it.kind === 'link' || it.kind === 'image' ? 'text-sky-700 dark:text-sky-300' : 'border border-gray-200 dark:border-zinc-700'}`}>
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1 text-sm">{it.text}{it.required && <span className="ml-1 text-red-500">*</span>}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
