import { brDateTimeParts, brDayLabel } from "@/app/_shared/utils/date-br";

// Texto do lote do cliente que vai ao cérebro (bot.ts, "Lote da rajada").
//
// O lote junta TODAS as mensagens do cliente desde a nossa última resposta, e
// isso pode atravessar dias: em 01/10/2026 (caso José Roberto) um "entendi" de
// 29/09, que ficou sem resposta depois da fala do atendente, entrou colado no
// "bom dia" de hoje. A IA leu "entendi, bom dia" como confirmação ao atendente
// e ficou em silêncio. Mensagem velha do lote agora vai marcada com data e
// hora, e as novas com "agora", para o cérebro separar o que é retomada.

/** Mensagem do lote mais antiga que isto em relação à mais nova vira "antiga". */
export const STALE_BURST_GAP_MS = 2 * 60 * 60_000;

export interface BurstItem {
  body: string | null;
  createdAt: Date;
}

function brWhen(date: Date): string {
  return `${brDayLabel(date)} às ${brDateTimeParts(date).time}`;
}

/**
 * Junta os textos do lote (ordem cronológica) numa mensagem só. Sem mensagem
 * antiga, é o texto puro de sempre, uma linha por mensagem. A régua de
 * "antiga" é a mensagem mais nova do lote, com ou sem texto: áudio ou foto
 * de agora também tornam velho o texto de dias atrás.
 */
export function burstClientText(items: BurstItem[]): string {
  const lines = items
    .map((i) => ({ text: i.body?.trim() ?? "", at: i.createdAt }))
    .filter((i) => i.text);
  if (!lines.length) return "";

  const newest = Math.max(...items.map((i) => i.createdAt.getTime()));
  const isOld = (at: Date) => newest - at.getTime() > STALE_BURST_GAP_MS;
  if (!lines.some((l) => isOld(l.at))) return lines.map((l) => l.text).join("\n");

  // Marca numa linha própria, nunca na frente do texto: a máscara de senha
  // (mask-secrets.ts, regra 4) só reconhece a senha mandada sozinha quando ela
  // é a linha inteira.
  return lines
    .map((l) => isOld(l.at)
      ? `[mensagem antiga do cliente, de ${brWhen(l.at)}, que ficou sem resposta]\n${l.text}`
      : `[mensagem de agora, ${brWhen(l.at)}]\n${l.text}`)
    .join("\n");
}
