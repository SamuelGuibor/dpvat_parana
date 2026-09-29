'use client';

import useSWR, { type Key, type KeyedMutator } from 'swr';

// Cache curto dos painéis de gestão (Gestão Estratégica, funil, Origem dos
// leads, aba Chatbot, Canto da IA). Auditoria de 25/09/2026 (PAINEL-4):
// - trocar o período trocava a tela inteira por um spinner (e desmontava as
//   abas); com keepPreviousData os números antigos ficam, sob um véu;
// - sair para o Kanban e voltar refazia todas as consultas na fila serial de
//   server actions; pelo cache global do SWR o painel aparece na hora e,
//   passado o dedupingInterval, revalida em segundo plano (sem véu).
// Chave SEMPRE com strings/números (ISO, nunca Date): objeto recriado a cada
// render muda a chave e faz refetch em loop.
export const PANEL_SWR_OPTIONS = {
  keepPreviousData: true,
  revalidateOnFocus: false,
  dedupingInterval: 60_000,
  // Erro de permissão (allowlist) ou de rede não vira retentativa em loop na
  // fila de actions: o painel mostra "Tentar novamente".
  shouldRetryOnError: false,
} as const;

export interface PanelData<T> {
  /** Dados da chave atual ou, enquanto ela carrega, os da chave anterior (ver `stale`). */
  data: T | undefined;
  error: unknown;
  /**
   * Na tela estão os dados de OUTRA chave (período/número anterior) enquanto a
   * nova carrega → véu por cima. É `data && isLoading`: com keepPreviousData,
   * isLoading só fica true enquanto a chave atual não tem dado no cache.
   * NUNCA isValidating, que também é true na revalidação de fundo do MESMO
   * período (remontar depois de 60 s) e cobriria número certo com véu.
   */
  stale: boolean;
  /** Há uma busca em andamento (só para o botão "Tentar novamente"). */
  busy: boolean;
  /** Refaz a busca da chave atual (ignora o deduping). */
  retry: () => void;
  mutate: KeyedMutator<T>;
}

/**
 * `logLabel` vai no console.error de cada falha: erro de server action chega
 * mascarado em produção, e o texto real só fica no console (a tela mostra a
 * própria mensagem).
 */
export function usePanelSWR<T>(key: Key, fetcher: () => Promise<T>, logLabel: string): PanelData<T> {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(key, fetcher, {
    ...PANEL_SWR_OPTIONS,
    onError: (err) => console.error(`[${logLabel}] Falha ao carregar:`, err),
  });
  return {
    data,
    error,
    stale: data !== undefined && isLoading,
    busy: isValidating,
    retry: () => { void mutate(); },
    mutate,
  };
}
