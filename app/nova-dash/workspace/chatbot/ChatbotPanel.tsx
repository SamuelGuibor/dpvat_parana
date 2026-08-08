'use client';

import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { ChatbotDashboard } from '../manager/ChatbotDashboard';
import { listWaNumberOptions } from '@/app/_actions/whatsapp/numbers';

// "Desempenho do Chatbot" como seção própria da sidebar do workspace, com
// seletor de número no topo (multi-tenant): uma tela só, N números — a
// sidebar não cresce quando um número novo é cadastrado.
// "Todos os números" (null) mantém a visão agregada de sempre.

export function ChatbotPanel() {
  const [options, setOptions] = useState<{ id: string; label: string; displayPhone: string | null }[]>([]);
  const [numberId, setNumberId] = useState<string | null>(null);

  useEffect(() => {
    listWaNumberOptions().then(setOptions).catch(() => setOptions([]));
  }, []);

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-zinc-100">
          <Bot className="h-5 w-5 text-indigo-600" /> Desempenho do Chatbot
        </h2>
        {options.length > 0 && (
          <select
            value={numberId ?? ''}
            onChange={(e) => setNumberId(e.target.value || null)}
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
      <ChatbotDashboard numberId={numberId} />
    </div>
  );
}
