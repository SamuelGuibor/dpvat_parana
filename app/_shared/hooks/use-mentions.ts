'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useHeaderBadges } from '@/app/_shared/hooks/use-header-badges';
import { mentionsIncrease } from '@/app/_shared/utils/header-badges';

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
 * Lê `mentionsPending` dos badges do cabeçalho (GET /api/team/badges, poll de
 * 30 s do dono em page.tsx): sem timer nem server action próprios — antes era
 * uma action a cada 30 s e mais uma a cada volta de foco, na fila serial da
 * aba, na frente do clique do atendente.
 *
 * `fresh` fica true quando a contagem SOBE entre duas leituras — é a "bolinha
 * nova" piscando, igual ao WhatsApp. Junto sai um toast com atalho pra aba.
 * A 1ª leitura da tela não avisa, e a queda não pisca (`mentionsIncrease`).
 * O painel limpa o estado ao ser aberto (clearFresh).
 *
 * `enabled = false` enquanto a sessão carrega ou para quem não é da equipe.
 */
export function usePendingMentions(enabled = true) {
  const { badges, refresh } = useHeaderBadges({ enabled });
  // undefined = ainda não chegou (ou falhou antes da 1ª leitura).
  const count = badges?.mentionsPending;
  const pending = count ?? 0;
  const [fresh, setFresh] = useState(false);
  // null = ainda não leu nesta tela; a 1ª leitura não é novidade.
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (count === undefined) return;
    const novas = mentionsIncrease(previous.current, count);
    previous.current = count;
    if (novas <= 0) return;
    setFresh(true);
    toast(novas === 1 ? 'Você foi marcado numa menção' : `${novas} novas menções pra você`, {
      description: 'Abra a aba Menções e Tarefas para dar ciência ou concluir.',
      action: {
        label: 'Ver',
        onClick: () => window.dispatchEvent(new Event(OPEN_MENTIONS_TAB_EVENT)),
      },
    });
  }, [count]);

  const clearFresh = useCallback(() => setFresh(false), []);

  // O painel mudou uma menção: recontagem na hora (a mesma ida traz os outros
  // badges; é uma rota GET, não entra na fila das actions).
  useEffect(() => {
    window.addEventListener(MENTIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(MENTIONS_CHANGED_EVENT, refresh);
  }, [refresh]);

  return { pending, fresh, clearFresh, refresh };
}
