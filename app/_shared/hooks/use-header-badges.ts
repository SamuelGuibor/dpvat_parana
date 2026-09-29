'use client';

import { useCallback } from 'react';
import useSWR, { type SWRConfiguration } from 'swr';
// SÓ tipos (`import type`): header-badges.ts, ao lado, importa o Prisma e não
// pode entrar no bundle do navegador.
import type { HeaderBadgesResponse } from '@/app/_shared/lib/header-badges-types';
import { jsonFetcher, pollRetryDelayMs } from '@/app/_shared/utils/fetch-json';
import { TEAM_BADGES_URL, readHeaderBadges } from '@/app/_shared/utils/header-badges';

// Avisos do cabeçalho da nova-dash (não lidas do WhatsApp, menções pendentes,
// pop-ups do dev e eventos próximos) numa rota GET só, fora da fila serial de
// server actions (auditoria de 24/09/2026: eram 4 actions com polls próprios,
// e o foco da aba as enfileirava na frente do clique do atendente).

/** Ritmo do poll dos badges (o mesmo das antigas contagens de WhatsApp e menções). */
const BADGES_POLL_MS = 30_000;

const fetchHeaderBadges = (url: string) => jsonFetcher<unknown>(url).then(readHeaderBadges);

// Nova tentativa depois de erro: 5 s, 10 s, 20 s, depois a cada 30 s; 401 =
// sessão vencida, para. Fora do componente para ser a MESMA função em todas as
// instâncias (ver a política de eventos em useHeaderBadges).
const retryHeaderBadges: NonNullable<SWRConfiguration['onErrorRetry']> = (err, _key, _config, revalidate, opts) => {
  const delay = pollRetryDelayMs(err, opts.retryCount);
  if (delay !== null) setTimeout(() => { void revalidate(opts); }, delay);
};

interface Options {
  /**
   * `true` só no DONO do poll — o cabeçalho (app/nova-dash/page.tsx). No SWR
   * 2.3 cada instância com refreshInterval arma o PRÓPRIO timer; o dedupe é de
   * 2 s, então uma instância montada alguns segundos depois (ex.: o UserMenu,
   * que só aparece com a sessão resolvida) virava uma 2ª ida a cada 30 s. Os
   * outros (menções, pop-up do dev) só leem a mesma key.
   */
  poll?: boolean;
  /** `false` = não busca (key null): ex.: sessão ainda carregando ou quem não é da equipe. */
  enabled?: boolean;
}

/**
 * Badges do cabeçalho pela key `/api/team/badges` (uma entrada no cache do
 * SWR, dividida por todos os leitores).
 *
 * Erro (403 da trava de IP, 500, rede): o SWR MANTÉM os últimos números na
 * tela. Com erro guardado o refreshInterval não busca (swr 2.3.8), então quem
 * traz os badges de volta é a nova tentativa (`retryHeaderBadges`) ou o foco
 * da aba.
 */
export function useHeaderBadges({ poll = false, enabled = true }: Options = {}) {
  const { data, error, mutate } = useSWR<HeaderBadgesResponse>(
    enabled ? TEAM_BADGES_URL : null,
    fetchHeaderBadges,
    {
      // SÓ o dono arma o timer; os leitores não têm poll próprio.
      refreshInterval: poll ? BADGES_POLL_MS : 0,
      // Leitor montado com o número já em cache (ex.: o UserMenu, que aparece
      // depois) não busca de novo; sem cache, busca UMA vez, deduplicada com a
      // do dono.
      revalidateIfStale: poll,
      // POLÍTICA DE EVENTOS IGUAL EM TODAS AS INSTÂNCIAS, dono ou leitor. No
      // swr 2.3.8 o foco, a reconexão e a nova tentativa depois de erro vão só
      // para o PRIMEIRO hook inscrito na key (`revalidators[key][0]`), rodando
      // na configuração DELE. O 1º inscrito é o DevAlertPopup (leitor, mais
      // fundo na árvore: o layout effect do filho roda antes do do pai). Com
      // leitor em `revalidateOnFocus:false`/`shouldRetryOnError:false`, o foco
      // não buscava e a 1ª falha congelava os 4 badges até F5 (revisão do
      // PR41, 26/09/2026). Igualando a política, não importa quem monta
      // primeiro; continua saindo UMA ida por foco/tentativa, porque só o [0]
      // recebe o evento e o dedupe/focusThrottle seguram as repetidas.
      // Voltar à aba traz os números na hora (é UMA ida barata, por GET: não
      // entra mais na frente do clique).
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: true,
      onErrorRetry: retryHeaderBadges,
    },
  );

  // Recontagem na hora (menção resolvida, evento criado/apagado): atualiza
  // todos os leitores da key de uma vez.
  const refresh = useCallback(() => { void mutate(); }, [mutate]);

  return { badges: data, error: error as unknown, refresh };
}
