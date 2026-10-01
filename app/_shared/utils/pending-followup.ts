// COBRANÇA DO PEDIDO EM ABERTO (30/09/2026, decisão 2 do dono): quando a IA
// está recolhendo uma lista (collect-request.ts) e o cliente fica em silêncio,
// o cron (fase 0 do nudge, cron-tasks.ts) cobra de 6 em 6 h enquanto a janela
// de 24 h da Meta estiver aberta, e transfere ao dono, com o que falta, 2 h
// antes de ela fechar. Nada de "ainda está aí?"/despedida/standby com pedido
// aberto: o cliente que some no meio da coleta de documentos não é lead
// perdido, é cliente que ainda vai mandar.
//
// O texto da cobrança é do cérebro (/followup-decision, modo de pendência);
// aqui só fica QUANDO avaliar (regra pura, testável com relógio falso) e o
// motivo da transferência. Envio, cooldown de 6 h, opt-out, janela e marcapasso
// continuam no sendSystemWhatsApp/cron: nada aqui afrouxa o anti-spam.

import { brDateTimeParts } from "@/app/_shared/utils/date-br";

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Intervalo entre avaliações de cobrança (= cooldown das proativas, 6 h). */
export const PENDING_NUDGE_GAP_MS = 6 * HOUR;
/** Janela de mensagem livre da Meta, contada da última mensagem do cliente. */
export const META_WINDOW_MS = 24 * HOUR;
/**
 * Margem da transferência: 2 h antes de a janela fechar o atendente ainda
 * responde em texto livre (depois, só por template). Janela que fecha à noite
 * vai na 1ª rodada do cron depois da margem (a fase só roda das 7h às 21h).
 */
export const PENDING_HANDOFF_MARGIN_MS = 2 * HOUR;
/**
 * Não cobra se a transferência vem antes de o cliente ter tempo de responder:
 * cobrança às 7h com transferência às 8h só soma uma mensagem sem efeito.
 */
export const PENDING_MIN_ANSWER_MS = 2 * HOUR;
/** Nova tentativa depois de falha do cérebro ou de micro antigo (sem modo de pendência). */
export const PENDING_RETRY_MS = HOUR;
/** Silêncio mínimo para a conversa entrar na seleção da fase (igual ao nudge de 30 min). */
export const PENDING_MIN_SILENCE_MS = 30 * MIN;

export type PendingPlan =
  | { kind: "wait"; until: Date; why: "gap" | "retry" | "too_close" | "off_hours" | "awaiting_client" }
  | { kind: "nudge"; attempt: number; windowClosesAt: Date; handoffAt: Date }
  | { kind: "handoff"; windowClosed: boolean; windowClosesAt: Date | null };

export interface PendingPlanInput {
  now: number;
  /** Última mensagem do cliente (qualquer uma: é ela que abre a janela da Meta). */
  lastInboundAt: Date | null;
  /**
   * Quando o pedido abriu ou a conversa voltou ao bot (o mais recente entre
   * collectRequestAt e returnedToBotAt). Se nesse instante a hora da
   * transferência já tinha passado, a fase espera o cliente escrever em vez
   * de devolver a conversa à Fila (ver planPendingFollowup).
   */
  requestSince?: Date | null;
  /** lastMessageAt da conversa (entrada ou saída; a própria cobrança atualiza). */
  lastMessageAt: Date;
  /** Última avaliação que terminou em cobrança ou silêncio (backoff do "silent"). */
  collectNudgeAt: Date | null;
  /** Cobranças já enviadas neste pedido. */
  collectNudgeCount: number;
  /** Última tentativa que falhou (cérebro fora, micro antigo), para o backoff de 1 h. */
  lastFailedAt?: Date | null;
  /** Horário comercial (isBrBusinessHour; injetado para o teste). */
  // eslint-disable-next-line no-unused-vars
  isBusinessHour: (ts: number) => boolean;
}

/**
 * O que a fase 0 faz com esta conversa agora:
 * - wait "awaiting_client": o cliente nunca escreveu, ou a janela já tinha
 *   fechado (ou estava a menos de PENDING_HANDOFF_MARGIN_MS de fechar) quando
 *   o pedido abriu ou a conversa voltou ao bot (`requestSince`). Nada a cobrar
 *   e nada a transferir: o atendente acabou de devolver sabendo disso (o
 *   diálogo avisa), e a IA retoma quando o cliente escrever. O pedido vence em
 *   7 dias se ele nunca escrever. Antes, a conversa voltava à Fila 15 min
 *   depois do Devolver e o pedido era concluído;
 * - handoff: a janela fecha em menos de PENDING_HANDOFF_MARGIN_MS (ou já
 *   fechou) → Fila com o que falta;
 * - nudge: 6 h desde max(lastMessageAt, collectNudgeAt), janela aberta,
 *   horário comercial e ≥ 2 h até a transferência → o cérebro decide o texto;
 * - wait: nada a fazer nesta rodada.
 */
export function planPendingFollowup(input: PendingPlanInput): PendingPlan {
  const { now } = input;
  const awaitClient: PendingPlan = { kind: "wait", until: new Date(now + PENDING_NUDGE_GAP_MS), why: "awaiting_client" };
  if (!input.lastInboundAt) return awaitClient;
  const closesAt = input.lastInboundAt.getTime() + META_WINDOW_MS;
  const handoffAt = closesAt - PENDING_HANDOFF_MARGIN_MS;
  if (input.requestSince && input.requestSince.getTime() >= handoffAt) return awaitClient;
  if (now >= handoffAt) {
    return { kind: "handoff", windowClosed: now >= closesAt, windowClosesAt: new Date(closesAt) };
  }
  const base = Math.max(input.lastMessageAt.getTime(), input.collectNudgeAt?.getTime() ?? 0);
  const gapDue = base + PENDING_NUDGE_GAP_MS;
  const retryDue = (input.lastFailedAt?.getTime() ?? 0) + PENDING_RETRY_MS;
  const dueAt = Math.max(gapDue, retryDue);
  if (now < dueAt) {
    return { kind: "wait", until: new Date(Math.min(dueAt, handoffAt)), why: retryDue > gapDue ? "retry" : "gap" };
  }
  if (handoffAt - now < PENDING_MIN_ANSWER_MS) {
    return { kind: "wait", until: new Date(handoffAt), why: "too_close" };
  }
  if (!input.isBusinessHour(now)) {
    return { kind: "wait", until: new Date(handoffAt), why: "off_hours" };
  }
  return {
    kind: "nudge",
    attempt: Math.max(0, Math.round(input.collectNudgeCount || 0)) + 1,
    windowClosesAt: new Date(closesAt),
    handoffAt: new Date(handoffAt),
  };
}

/** "às 14:30" no mesmo dia de `now`, senão "em 01/10 às 14:30" (Brasília). */
export function brWhenLabel(at: Date, now: number = Date.now()): string {
  const p = brDateTimeParts(at);
  if (p.day === brDateTimeParts(now).day) return `às ${p.time}`;
  const [, month, day] = p.day.split("-");
  return `em ${day}/${month} às ${p.time}`;
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * Motivo da transferência do pedido em aberto (nota interna da Fila e aviso ao
 * dono). `window` = a janela da Meta está fechando (ou fechou) sem o cliente
 * completar; `ai` = o cérebro da cobrança decidiu transferir (nada mais
 * pendente, cliente não consegue um item, pergunta só da equipe).
 */
export function pendingHandoffReason(input: {
  trigger: "window" | "ai";
  /** Itens que faltam (resposta `missing` do /followup-decision, separados por "; "). */
  missing?: string | null;
  /** Cobranças automáticas já enviadas neste pedido. */
  nudges: number;
  windowClosed?: boolean;
  windowClosesAt?: Date | null;
  /** Motivo dado pelo cérebro (trigger "ai"). */
  aiReason?: string | null;
  now?: number;
}): string {
  const missing = input.missing?.trim() ? clip(input.missing, 300) : "";
  const nudges = Math.max(0, Math.round(input.nudges || 0));
  const nudgesLabel = `${nudges} cobrança${nudges === 1 ? "" : "s"} automática${nudges === 1 ? "" : "s"}`;
  if (input.trigger === "ai") {
    const why = input.aiReason?.trim() ? clip(input.aiReason, 200) : "a IA da cobrança encerrou a coleta";
    return missing
      ? `pedido em aberto: faltam ${missing} — ${why}`
      : `pedido em aberto: ${why} — conferir o que chegou`;
  }
  const window = input.windowClosed || !input.windowClosesAt
    ? "a janela de 24 h da Meta já fechou (só template)"
    : `a janela de 24 h da Meta fecha ${brWhenLabel(input.windowClosesAt, input.now)}`;
  return missing
    ? `pedido em aberto incompleto: faltam ${missing} — o cliente não respondeu (${nudgesLabel}) e ${window}`
    : `pedido em aberto sem resposta do cliente (${nudgesLabel}) — ${window}; conferir o que falta`;
}
