// Endereço e leitura da rota dos avisos do cabeçalho (GET /api/team/badges) e
// as regras dos badges que o navegador aplica. Puro — sem React, sem banco —
// para o tests/header-badges.test.ts e para o cliente importar sem arrastar o
// servidor.

import type { DevAlertDTO, HeaderBadgesResponse } from '@/app/_shared/lib/header-badges-types';

/** Rota dos badges; também é a key do SWR (poll do cabeçalho + leitores). */
export const TEAM_BADGES_URL = '/api/team/badges';

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Contagem válida (inteiro ≥ 0); qualquer outra coisa vira 0 em vez de "NaN" no badge. */
function readCount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function readDevAlert(v: unknown): DevAlertDTO | null {
  if (!isObject(v) || typeof v.id !== 'string' || !v.id || typeof v.message !== 'string') return null;
  return {
    id: v.id,
    title: typeof v.title === 'string' && v.title.trim() ? v.title : null,
    message: v.message,
    authorName: typeof v.authorName === 'string' && v.authorName.trim() ? v.authorName : 'Dev',
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date(0).toISOString(),
  };
}

/**
 * Corpo 2xx da rota → badges. LANÇA quando o formato não é o esperado
 * (proxy, versão trocada no meio do deploy, `{ error }` com 200): o SWR guarda
 * o erro e mantém os últimos números na tela, em vez de zerar os badges.
 */
export function readHeaderBadges(body: unknown): HeaderBadgesResponse {
  if (!isObject(body) || !Array.isArray(body.devAlerts)) {
    throw new Error('Resposta inválida dos avisos do cabeçalho.');
  }
  return {
    whatsappUnread: readCount(body.whatsappUnread),
    mentionsPending: readCount(body.mentionsPending),
    devAlerts: body.devAlerts.map(readDevAlert).filter((a): a is DevAlertDTO => a !== null),
    eventsSoon: readCount(body.eventsSoon),
  };
}

/**
 * Quantas menções NOVAS apareceram entre duas leituras (toast + bolinha
 * piscando). `prev === null` = 1ª leitura da tela: o que já estava pendente
 * não é novidade. Queda (dei ciência/concluí) e contagem igual = 0, para o
 * badge não piscar à toa.
 */
export function mentionsIncrease(prev: number | null, next: number): number {
  if (prev === null || !Number.isFinite(prev) || !Number.isFinite(next)) return 0;
  return next > prev ? Math.floor(next - prev) : 0;
}

/** Pop-ups que ainda não foram fechados neste navegador, na ordem em que vieram. */
export function unseenDevAlerts(alerts: readonly DevAlertDTO[], seenIds: readonly string[]): DevAlertDTO[] {
  if (!seenIds.length) return [...alerts];
  const seen = new Set(seenIds);
  return alerts.filter((a) => !seen.has(a.id));
}
