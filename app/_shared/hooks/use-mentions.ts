'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { countPendingMentions } from '@/app/_actions/mentions/mention-actions';

/** Disparado pelo painel quando algo muda, para o badge da aba acompanhar. */
export const MENTIONS_CHANGED_EVENT = 'mentions-changed';
/** Disparado pelo toast de menção nova ("Ver") para abrir a aba. */
export const OPEN_MENTIONS_TAB_EVENT = 'open-mentions-tab';

export function notifyMentionsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(MENTIONS_CHANGED_EVENT));
  }
}

/**
 * Contagem de menções pendentes do usuário logado (badge da aba).
 *
 * `fresh` fica true quando a contagem SOBE entre duas consultas — é a "bolinha
 * nova" piscando, igual ao WhatsApp. Junto sai um toast com atalho pra aba.
 * O painel limpa o estado ao ser aberto (clearFresh).
 */
export function usePendingMentions() {
  const [pending, setPending] = useState(0);
  const [fresh, setFresh] = useState(false);
  // null = ainda não carregou; a 1ª leitura não deve avisar (não é novidade).
  const previous = useRef<number | null>(null);

  const refresh = useCallback(() => {
    countPendingMentions()
      .then((n) => {
        setPending(n);
        const before = previous.current;
        previous.current = n;
        if (before === null || n <= before) return;
        setFresh(true);
        const novas = n - before;
        toast(novas === 1 ? 'Você foi marcado numa menção' : `${novas} novas menções pra você`, {
          description: 'Abra a aba Menções e Tarefas para dar ciência ou concluir.',
          action: {
            label: 'Ver',
            onClick: () => window.dispatchEvent(new Event(OPEN_MENTIONS_TAB_EVENT)),
          },
        });
      })
      .catch(() => {});
  }, []);

  const clearFresh = useCallback(() => setFresh(false), []);

  useEffect(() => {
    refresh();
    // Aba em background não consulta; ao voltar o foco, atualiza na hora.
    // 30s é o mesmo ritmo do badge do WhatsApp.
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, 30_000);
    const onWake = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener(MENTIONS_CHANGED_EVENT, refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener(MENTIONS_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return { pending, fresh, clearFresh, refresh };
}
