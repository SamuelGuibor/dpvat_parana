'use client';

import { useCallback } from 'react';
import useSWR, { useSWRConfig, type SWRConfiguration } from 'swr';
// SÓ tipos (`import type`): copilot-data.ts, ao lado, importa o Prisma e não
// pode entrar no bundle do navegador.
import type { ClientDocumentDTO, ClientInfoResult, CopilotResponse } from '@/app/_shared/lib/whatsapp/copilot-types';
import { HttpError, jsonFetcher, pollRetryDelayMs } from '@/app/_shared/utils/fetch-json';
import { copilotUrl, patchCopilot, readCopilot } from '@/app/_shared/utils/copilot-api';

// Ficha do cliente + documentos da conversa aberta, numa ida só por GET
// (/api/whatsapp/inbox/copilot/<contactId>), fora da fila serial de server
// actions. Antes eram 2 actions em série a cada abertura (auditoria de
// 24/09/2026, THR-9), e o clique do atendente esperava as duas.
//
// Dois leitores da MESMA key: o inbox (atalho "Card #N" do cabeçalho e
// CardDialog) e o CopilotPanel (abas Copiloto, Ficha e Arquivos). O SWR
// deduplica a ida; as mutações trocam a entrada no cache por key explícita.

const fetchCopilot = (url: string) => jsonFetcher<unknown>(url).then(readCopilot);

/** Tentativas depois de erro (403 da trava de IP, 500, rede): 5 s, 10 s e 20 s, e para. */
const COPILOT_MAX_RETRIES = 3;

// Fora do componente para ser a MESMA função nos dois leitores (ver a
// política em COPILOT_SWR).
const retryCopilot: NonNullable<SWRConfiguration['onErrorRetry']> = (err, _key, _config, revalidate, opts) => {
  // 404 = contato excluído em outra aba: tentar de novo não resolve. O 401
  // (sessão vencida) já para em pollRetryDelayMs.
  if (err instanceof HttpError && err.status === 404) return;
  if (opts.retryCount > COPILOT_MAX_RETRIES) return;
  const delay = pollRetryDelayMs(err, opts.retryCount);
  if (delay !== null) setTimeout(() => { void revalidate(opts); }, delay);
};

// A MESMA configuração nos dois leitores: no swr 2.3.8 o foco, a reconexão e a
// nova tentativa depois de erro vão só para o PRIMEIRO hook inscrito na key,
// rodando na configuração DELE (achado da revisão do PR41). Com políticas
// iguais não importa quem monta primeiro.
const COPILOT_SWR: SWRConfiguration<CopilotResponse> = {
  // Voltar à aba não relê a ficha (como antes): ela muda por ação da própria
  // tela, que já troca o cache. Quem traz dado externo é a troca de conversa.
  revalidateOnFocus: false,
  onErrorRetry: retryCopilot,
};

/**
 * Ficha + documentos de `contactId` (`null` = nenhuma conversa aberta).
 *
 * As funções de escrita recebem o contactId EXPLÍCITO, não usam o `mutate`
 * ligado ao hook: aquele mira a key ATUAL, e se o atendente trocou de
 * conversa enquanto a action rodava, a ficha ou a lista de documentos de um
 * cliente cairia no cache de outro.
 *
 * Erro (403 da trava de IP, 500, rede): o SWR MANTÉM a ficha que já estava na
 * tela; `error` diz o motivo para a aba Ficha avisar em vez de ficar em
 * "Carregando ficha…" para sempre.
 */
export function useCopilot(contactId: string | null) {
  const { data, error, isLoading } = useSWR<CopilotResponse>(
    contactId ? copilotUrl(contactId) : null,
    fetchCopilot,
    COPILOT_SWR,
  );
  const { cache, mutate } = useSWRConfig();

  /** Busca de novo (card editado no CardDialog, ficha preenchida pela IA, "Tentar de novo"). */
  const reloadCopilot = useCallback((cid: string) => mutate(copilotUrl(cid)), [mutate]);

  const patch = useCallback((cid: string, next: Partial<CopilotResponse>, revalidate: boolean) => {
    const key = copilotUrl(cid);
    const patched = patchCopilot(cache.get(key)?.data as CopilotResponse | undefined, next);
    // Nada no cache ainda (a 1ª busca em voo): um mutate com dado faria o SWR
    // descartar essa busca e a ficha ficaria em "Carregando…" até trocar de
    // conversa. Busca de novo, que já traz o que a action gravou.
    if (!patched) return mutate(key);
    return mutate(key, patched, { revalidate });
  }, [cache, mutate]);

  /** Mutação de documento que já devolve a lista nova (anexar, subir, renomear, excluir): troca sem buscar. */
  const setCopilotDocuments = useCallback(
    (cid: string, documents: ClientDocumentDTO[]) => patch(cid, { documents }, false),
    [patch],
  );

  /**
   * Ficha que a action devolveu (salvar, "Adicionar cliente"): aparece na
   * hora. `revalidate: true` busca de novo depois (o "Adicionar cliente" move
   * os rascunhos de documento para o card).
   */
  const setCopilotClientInfo = useCallback(
    (cid: string, clientInfo: ClientInfoResult, opts?: { revalidate?: boolean }) =>
      patch(cid, { clientInfo }, opts?.revalidate ?? false),
    [patch],
  );

  return {
    clientInfo: data?.clientInfo ?? null,
    documents: data?.documents,
    error: error as unknown,
    isLoading,
    reloadCopilot,
    setCopilotDocuments,
    setCopilotClientInfo,
  };
}
