'use client';

import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { ChatbotDashboard } from '../manager/ChatbotDashboard';
import { listWaNumberOptions } from '@/app/_actions/whatsapp/numbers';
import type { ChatbotAnalytics } from '@/app/_actions/analytics/get-chatbot-analytics';

// "Desempenho do Chatbot" como aba do dashboard, com seletor de número no
// topo (multi-tenant): uma tela só, N números — a sidebar não cresce quando
// um número novo é cadastrado. "Todos os números" (null) mantém a visão
// agregada de sempre.
// initialAnalytics/numberOptions chegam da carga única do dashboard
// (get-strategic-dashboard) — só há fetch novo quando o usuário troca o
// período ou o número.

interface NumberOption { id: string; label: string; displayPhone: string | null }

export function ChatbotPanel({ initialAnalytics = null, numberOptions, numberId: controlledNumberId, range }: {
  initialAnalytics?: ChatbotAnalytics | null;
  numberOptions?: NumberOption[];
  /** Número CONTROLADO pelo seletor global do dashboard (17/08/2026). Quando
   *  presente (mesmo null = "todos"), o seletor próprio desta aba some. */
  numberId?: string | null;
  /** Calendário do dashboard (ISO) — vira o período padrão da aba. */
  range?: { from: string; to: string };
}) {
  const isControlled = controlledNumberId !== undefined;
  const [options, setOptions] = useState<NumberOption[]>(numberOptions ?? []);
  const [localNumberId, setLocalNumberId] = useState<string | null>(null);
  const numberId = isControlled ? controlledNumberId : localNumberId;

  useEffect(() => {
    if (numberOptions || isControlled) return;
    listWaNumberOptions().then(setOptions).catch(() => setOptions([]));
  }, [numberOptions, isControlled]);

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-zinc-100">
          <Bot className="h-5 w-5 text-indigo-600" /> Desempenho do Chatbot
        </h2>
        {!isControlled && options.length > 0 && (
          <select
            value={localNumberId ?? ''}
            onChange={(e) => setLocalNumberId(e.target.value || null)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            <option value="">Todos os números</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}{o.displayPhone ? ` (+${o.displayPhone})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>
      <ChatbotDashboard numberId={numberId} initialData={initialAnalytics} range={range} />
    </div>
  );
}
