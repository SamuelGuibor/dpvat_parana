// Dono pegajoso da conversa do WhatsApp (auditoria de 24/09/2026, EF-1).
//
// Antes, "Devolver ao bot" zerava o atendente: se o cliente voltasse e o bot
// transferisse, a conversa caía na Fila SEM DONO e outro atendente pegava em
// 56% dos casos (~19 retransferências por dia). Agora o último atendente
// continua dono enquanto a janela abaixo valer: devolver, reabrir e transferir
// levam a conversa de volta para ele. É só ROTEAMENTO: quem decide qualificar,
// transferir ou resolver continua sendo o cérebro.
//
// Regras puras (sem banco): a parte com banco fica em
// app/_shared/lib/whatsapp/ownership.ts.

import { isEnvSwitchOn } from '@/app/_shared/utils/wa-silence';

const DAY_MS = 24 * 60 * 60_000;
/** Janela padrão: a mesma de HUMAN_TOUCH_LOOKBACK_MS do cron de recuperação. */
export const DEFAULT_HUMAN_HOLD_DAYS = 7;
// Teto contra erro de digitação na env ("70" em vez de "7"): conversa parada
// no bot por meses esconderia o lead da Fila e das pastas de desfecho.
export const MAX_HUMAN_HOLD_DAYS = 30;

/**
 * Janela do dono pegajoso, em ms, a partir da env WA_HUMAN_HOLD_DAYS (dias).
 * Sem a env = 7 dias (comportamento novo ligado por padrão). `0`/`false`/`off`
 * (os mesmos de `isEnvSwitchOn`) desligam: devolver, reabrir e transferir
 * voltam a soltar o atendente e o cron volta ao fluxo antigo do silêncio.
 * Valor ilegível ou negativo cai no padrão; acima de 30 dias é cortado.
 */
export function humanHoldMs(raw: string | undefined): number {
  const v = (raw ?? '').trim();
  if (!v) return DEFAULT_HUMAN_HOLD_DAYS * DAY_MS;
  if (!isEnvSwitchOn(v)) return 0;
  const days = Number(v.replace(',', '.'));
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_HUMAN_HOLD_DAYS * DAY_MS;
  return Math.round(Math.min(days, MAX_HUMAN_HOLD_DAYS) * DAY_MS);
}

/** "7 dias", "1 dia", "1,5 dia" — texto da janela nos logs e eventos. */
export function holdDaysLabel(ms: number): string {
  const days = Math.round((ms / DAY_MS) * 10) / 10;
  return `${String(days).replace('.', ',')} ${days >= 2 ? 'dias' : 'dia'}`;
}

/**
 * Dono da conversa: o atendente atribuído, se ainda é da equipe; senão o autor
 * da última mensagem humana da janela, se ainda é da equipe; senão ninguém
 * (Fila sem dono). `teamIds` vem do banco (role ADMIN*), nunca do JWT: quem
 * saiu da equipe não recebe conversa.
 */
export function pickOwner(
  assignee: string | null,
  lastHumanAuthor: string | null,
  teamIds: ReadonlySet<string>,
): string | null {
  if (assignee && teamIds.has(assignee)) return assignee;
  if (lastHumanAuthor && teamIds.has(lastHumanAuthor)) return lastHumanAuthor;
  return null;
}

/**
 * O que o cron de silêncio faz com conversa em modo bot cuja última fala não
 * interna é de atendente (`human_last`):
 * - `legacy`: interruptor desligado, segue o fluxo antigo (standby/encerrada);
 * - `hold`: dentro da janela, não encerra nem vai para standby; o cron só
 *   volta a olhar em `untilMs` (o cliente pode estar respondendo ao atendente;
 *   antes ela era encerrada ~106 min depois da última mensagem dele);
 * - `close`: passou da janela, encerra direto, SEM standby. A janela de 24 h
 *   da Meta já fechou há dias, então a recuperação sairia pelo template
 *   MARKETING a contato frio, a causa nº 1 do aviso de spam (24/08).
 */
export type HumanLastVerdict =
  | { kind: 'legacy' }
  | { kind: 'hold'; untilMs: number }
  | { kind: 'close' };

export function humanLastVerdict(lastHumanAtMs: number, nowMs: number, holdMs: number): HumanLastVerdict {
  if (holdMs <= 0) return { kind: 'legacy' };
  const untilMs = lastHumanAtMs + holdMs;
  return untilMs > nowMs ? { kind: 'hold', untilMs } : { kind: 'close' };
}
