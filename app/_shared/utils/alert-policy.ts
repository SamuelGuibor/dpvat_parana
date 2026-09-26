// Política dos avisos do WhatsApp no sino (auditoria de 24/09/2026, EF-10 e
// LAT-4).
//
// Por quê: entre 09 e 24/09 o bot gerava ~1.890 notificações por dia para as 17
// pessoas da equipe (fila, transferência, falha de entrega), e o "LEAD
// QUALIFICADO" se perdia no meio. Em 16/08 já tinham sido 24.612 em 7 dias,
// quando o alerta da fila repetia de hora em hora (virou os degraus). Agora o
// aviso vai primeiro para quem responde pela conversa (o dono, senão o setor
// da Fila) e a equipe inteira só entra na escalada. O cron parava de avisar em
// 24 h; o degrau de 48 h leva o lead esquecido ao gestor.
//
// Regras puras (sem banco). Quem é o dono, o setor e os gestores sai do banco
// em app/_shared/lib/whatsapp/alert-recipients.ts.

import { brDayKey } from '@/app/_shared/utils/date-br';
import { WA_QUALIFIED_MARK } from '@/app/_shared/lib/whatsapp/close-categories';

/**
 * Para quem vai um aviso:
 * - `owner_or_sector`: o dono da conversa; sem dono, o setor da Fila;
 * - `owner_and_sector`: o dono e o setor da Fila juntos;
 * - `team`: a equipe inteira (ADMIN*);
 * - `managers`: quem tem a Visão do Gestor.
 */
export type AlertAudience = 'owner_or_sector' | 'owner_and_sector' | 'team' | 'managers';

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Degraus do SLA da fila, contados do `queuedAt`: um aviso por degrau
 * ultrapassado e nenhum re-alerta periódico (cron-tasks.ts, `dueAlertStep`). O
 * índice do degrau (1 = 10 min … 5 = 48 h) é o que `queueAlertAudience` lê:
 * degrau novo no meio muda a audiência dos seguintes.
 */
export const QUEUE_ALERT_STEPS_MS = [10 * MIN, HOUR, 4 * HOUR, 24 * HOUR, 48 * HOUR];

/**
 * Audiência do aviso de fila no degrau `stepIdx` (1 = 10 min, 2 = 1 h, 3 = 4 h,
 * 4 = 24 h, 5 = 48 h).
 * - com dono: 10 min só o dono, 1 h dono + setor, 4 h e 24 h a equipe, 48 h os gestores;
 * - sem dono: 10 min o setor, 1 h a 24 h a equipe, 48 h os gestores.
 * Os avisos de 4 h e 24 h continuam indo para todos: é o que impede lead parado
 * mais de um dia. Só o 1º degrau (e o 2º, com dono) ficou mais estreito.
 */
export function queueAlertAudience(stepIdx: number, hasOwner: boolean): AlertAudience {
  if (stepIdx >= QUEUE_ALERT_STEPS_MS.length) return 'managers';
  if (stepIdx <= 1) return 'owner_or_sector';
  if (stepIdx === 2 && hasOwner) return 'owner_and_sector';
  return 'team';
}

/**
 * Destinatários de `owner_or_sector`/`owner_and_sector` a partir do dono já
 * resolvido e dos membros do setor, sem repetir ninguém (o dono pode ser do
 * setor). O dono vem primeiro.
 */
export function ownerSectorRecipients(
  audience: 'owner_or_sector' | 'owner_and_sector',
  ownerId: string | null,
  sectorIds: string[],
): string[] {
  if (audience === 'owner_or_sector' && ownerId) return [ownerId];
  return Array.from(new Set([...(ownerId ? [ownerId] : []), ...sectorIds]));
}

/**
 * Mesmo dia no fuso de Brasília (a Vercel roda em UTC: sem isso o "dia" virava
 * às 21h). `a` null = nunca avisado.
 */
export function sameBrDay(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  return brDayKey(a) === brDayKey(b);
}

/** Espera da fila no texto do aviso: "45 min" até 2 h, depois "4 h", "48 h". */
export function queueWaitLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m < 120 ? `${m} min` : `${Math.floor(m / 60)} h`;
}

/** Janela em que o LEAD QUALIFICADO fica fixo no topo do sino. */
export const QUALIFIED_PIN_MS = 24 * HOUR;

/** A notificação é o aviso de lead qualificado pela IA (marca de close-categories.ts)? */
export function isQualifiedLeadAlert(message: string | null | undefined): boolean {
  return !!message && message.includes(WA_QUALIFIED_MARK);
}

function timeOf(value: Date | string): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Ordem do sino: LEAD QUALIFICADO das últimas 24 h no topo, lido ou não (o
 * sino marca tudo como lido no instante em que abre; ordenar por "não lida"
 * perdia o destaque ~200 ms depois), e o resto do mais novo para o mais antigo.
 */
export function orderBellNotifications<T extends { message: string; createdAt: Date | string }>(
  list: T[],
  nowMs: number,
): T[] {
  const pinned = (n: T) => isQualifiedLeadAlert(n.message) && nowMs - timeOf(n.createdAt) <= QUALIFIED_PIN_MS;
  return [...list].sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || timeOf(b.createdAt) - timeOf(a.createdAt));
}

/**
 * Junta as 50 mais novas do sino com os LEAD QUALIFICADO das últimas 24 h que
 * ficaram fora delas (sem repetir), da mais nova para a mais antiga.
 */
export function mergeBellNotifications<T extends { id: string; createdAt: Date | string }>(
  latest: T[],
  extra: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const n of [...latest, ...extra]) if (!byId.has(n.id)) byId.set(n.id, n);
  return Array.from(byId.values()).sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
}
