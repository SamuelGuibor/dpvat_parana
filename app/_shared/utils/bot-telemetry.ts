// Telemetria do bot do WhatsApp (whatsapp/bot.ts e painel do chatbot): regras
// puras de latência, desfecho efetivo, respostas descartadas e soma de usage.
//
// Até 26/09/2026 não existia número de "quanto a IA demora": o único tempo do
// log wa_bot era o `durationMs`, que na verdade é a IDADE da conversa (desde a
// criação dela). A transferência real também sumia (o log dizia "continue" e o
// código jogava para a Fila), e a resposta descartada por corrida não deixava
// rastro, nem do gasto.

import { maskSecrets } from "./mask-secrets";

/** Uso de tokens de uma chamada de IA (mesmo formato de metadata.usage). */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Onde a conversa ficou por causa DESTE turno do bot:
 * - `bot`: segue com o bot (respondeu, ficou calado de propósito ou o fluxo saiu);
 * - `queued`: o bot transferiu de fato para a Fila (handoff, qualify ou rede de
 *   segurança do código);
 * - `closed`: o bot encerrou (disqualify, resolve, possível descadastro);
 * - `signature`: qualificou e ficou esperando a confirmação da assinatura;
 * - `skipped`: o bot quis transferir, mas a conversa já tinha saído do modo bot
 *   (atendente assumiu no meio) e ficou como estava.
 */
export type EffectiveStatus = "bot" | "queued" | "closed" | "signature" | "skipped";

export interface EffectiveOutcome {
  status: EffectiveStatus;
  reason?: string;
}

/** Desfecho de uma ida condicional à Fila (handoffToQueue/qualifyToQueue). */
export function queueEffective(moved: boolean, reason: string): EffectiveOutcome {
  return { status: moved ? "queued" : "skipped", reason };
}

/**
 * Resposta do cérebro jogada fora antes de a ação rodar. Vai num log próprio
 * (`wa_bot_discarded`), não no `wa_bot`: nenhuma métrica de decisão, nem o
 * critério de órfã do cron, conta esses turnos.
 * - `discarded_race`: o cliente escreveu de novo (a invocação nova responde o
 *   lote inteiro);
 * - `discarded_status`: a conversa saiu do modo bot (atendente assumiu/encerrou).
 */
export type DiscardOutcome = "discarded_race" | "discarded_status";

export function isDiscardedOutcome(outcome: unknown): boolean {
  return typeof outcome === "string" && outcome.startsWith("discarded_");
}

/** Motivo do descarte no laço de envio: status fora do bot vence a mensagem nova. */
export function discardOutcomeOf(input: { stillBot: boolean }): DiscardOutcome {
  return input.stillBot ? "discarded_race" : "discarded_status";
}

/**
 * Tempos do turno, em ms, gravados no log do bot:
 * - `botLatencyMs`: do início do handleIncomingWhatsApp (antes do debounce de
 *   8 s, que é proposital e entra na conta) até a 1ª mensagem do bot sair;
 * - `sinceInboundMs`: da mensagem do cliente gravada no banco até a 1ª
 *   mensagem do bot (inclui o download de mídia do webhook);
 * - `brainMs`: soma das chamadas ao cérebro (lookup e retry inclusos);
 * - `totalMs`: do início do turno até o log (turno calado não tem latência,
 *   mas tem duração).
 * Sem mensagem enviada, as duas latências ficam de fora (undefined some do JSON).
 */
export function turnTimings(input: {
  startedAt: number;
  inboundAt: number | null;
  firstSentAt: number | null;
  brainMs: number;
  now: number;
}): { botLatencyMs?: number; sinceInboundMs?: number; brainMs: number; totalMs: number } {
  const { startedAt, inboundAt, firstSentAt, brainMs, now } = input;
  const sent = firstSentAt !== null && Number.isFinite(firstSentAt);
  const inboundOk = inboundAt !== null && Number.isFinite(inboundAt);
  return {
    ...(sent ? { botLatencyMs: Math.max(0, firstSentAt - startedAt) } : {}),
    ...(sent && inboundOk ? { sinceInboundMs: Math.max(0, firstSentAt - inboundAt) } : {}),
    brainMs: Math.max(0, Math.round(brainMs)),
    totalMs: Math.max(0, now - startedAt),
  };
}

/**
 * Idade da conversa num log wa_bot: `conversationAgeMs` (nome atual) ou
 * `durationMs` (logs até 26/09/2026, que continuam valendo pelos 180 dias da
 * retenção). Só número finito conta. É a mesma régua do CASE da mediana de
 * "tempo até qualificar" em getChatbotAnalytics (SQL): mudou aqui, mude lá.
 */
export function conversationAgeOf(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  for (const key of ["conversationAgeMs", "durationMs"] as const) {
    const v = m[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function tokenOf(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Junta uma lista de usages por modelo (um item por modelo, na ordem em que o
 * modelo apareceu). Nunca mistura modelos: o preço é por modelo (MODEL_PRICING),
 * e somar a transcrição do Gemini no usage do Claude cobraria o áudio a preço
 * de Sonnet. Item sem modelo ou que não é objeto é ignorado.
 */
export function sumUsageByModel(usages: readonly unknown[] | null | undefined): AiUsage[] {
  const byModel = new Map<string, AiUsage>();
  for (const raw of usages ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const u = raw as Record<string, unknown>;
    const model = typeof u.model === "string" ? u.model.trim() : "";
    if (!model) continue;
    const acc = byModel.get(model) ?? {
      model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    };
    acc.inputTokens += tokenOf(u.inputTokens);
    acc.outputTokens += tokenOf(u.outputTokens);
    acc.cacheReadTokens += tokenOf(u.cacheReadTokens);
    acc.cacheWriteTokens += tokenOf(u.cacheWriteTokens);
    byModel.set(model, acc);
  }
  return [...byModel.values()];
}

// ---------------------------------------------------------------------------
// Raciocínio e fatos no log wa_bot (30/09/2026). Até aqui o `rationale` do
// cérebro só ia para o console do micro e não dava para saber pelo banco qual
// caminho a IA seguiu em cada handoff. Ele entra no metadata do log, mas o log
// fica 180 dias na tabela `logs`: corta o tamanho e tira dado pessoal.
// ---------------------------------------------------------------------------

/** Teto do raciocínio no log (o micro já corta em 600). */
export const RATIONALE_LOG_MAX = 500;
/** Teto de cada texto dentro de `facts` no log (o pedido do atendente vai inteiro ao cérebro). */
export const FACT_TEXT_LOG_MAX = 200;

// Dígitos em sequência, com ou sem ". - /" e espaço no meio: CPF, telefone,
// CEP, número de benefício ("630.015.983-7"). Com 6 dígitos ou mais vira
// "•••"; "R$ 1.234,56" (4 dígitos antes da vírgula) e "45 dias" ficam.
const DIGIT_RUN_RE = /\d(?:[\d.\-/ ]*\d)?/g;

function clipText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Raciocínio do cérebro pronto para o log: senha/código mascarados
 * (mask-secrets.ts), sequência de 6+ dígitos trocada por "•••" e corte em
 * `max` caracteres com "…". Vazio ou não-string devolve undefined (a chave
 * some do JSON, como no micro antigo, que não manda o campo).
 */
export function clipRationale(text: unknown, max = RATIONALE_LOG_MAX): string | undefined {
  if (typeof text !== "string") return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const masked = maskSecrets(trimmed).replace(DIGIT_RUN_RE, (run) =>
    run.replace(/\D/g, "").length >= 6 ? "•••" : run,
  );
  return clipText(masked, max);
}

/**
 * `conversationFacts` enxuto para o log: número e booleano passam como estão;
 * texto longo (solto ou no campo `text` de um objeto, como o pedido do
 * atendente) é cortado em FACT_TEXT_LOG_MAX. O cérebro recebe os fatos
 * inteiros; o log só precisa conferir a decisão, e grava um por turno.
 */
export function compactFactsForLog(facts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (typeof value === "string") {
      out[key] = clipText(value, FACT_TEXT_LOG_MAX);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      out[key] = typeof obj.text === "string" ? { ...obj, text: clipText(obj.text, FACT_TEXT_LOG_MAX) } : obj;
    } else {
      out[key] = value;
    }
  }
  return out;
}
