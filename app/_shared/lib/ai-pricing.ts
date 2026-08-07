// Preço dos modelos e cálculo de custo de uma chamada à IA.
//
// Fonte única: o Canto da IA e o dashboard do chatbot precisam bater no
// centavo. Preço por 1M de tokens (USD), tabela oficial da Anthropic.
//
// Cache: leitura ≈ 0,1× o input; escrita ≈ 1,25× o input com TTL de 5 min
// (o padrão do `cache_control: ephemeral`, que é o que o bot usa) e 2× com
// TTL de 1 h. Se algum dia alguém ligar o cache de 1 h, o custo de escrita
// aqui passa a subestimar — por isso o multiplicador é uma constante nomeada.

export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

export interface ModelPrice {
  input: number;
  output: number;
  label: string;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  "claude-fable-5": { input: 10, output: 50, label: "Fable 5" },
  "claude-opus-5": { input: 5, output: 25, label: "Opus 5" },
  "claude-opus-4-8": { input: 5, output: 25, label: "Opus 4.8" },
  "claude-opus-4-7": { input: 5, output: 25, label: "Opus 4.7" },
  "claude-opus-4-6": { input: 5, output: 25, label: "Opus 4.6" },
  "claude-opus-4-5": { input: 5, output: 25, label: "Opus 4.5" },
  "claude-sonnet-5": { input: 3, output: 15, label: "Sonnet 5" },
  "claude-sonnet-4-6": { input: 3, output: 15, label: "Sonnet 4.6" },
  "claude-sonnet-4-5": { input: 3, output: 15, label: "Sonnet 4.5" },
  "claude-haiku-4-5": { input: 1, output: 5, label: "Haiku 4.5" },
};

/** Modelo assumido quando o log não diz qual foi (o mais usado pelo bot). */
const FALLBACK_MODEL = "claude-sonnet-5";

export interface AiUsageRecord {
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
}

/**
 * Preço do modelo. `known: false` quando o id não está na tabela — o custo sai
 * estimado pelo fallback e a UI avisa, em vez de fingir precisão.
 */
export function priceFor(model?: string | null): { price: ModelPrice; known: boolean } {
  const id = model ?? "";
  const key = Object.keys(MODEL_PRICING).find((k) => id.startsWith(k));
  if (key) return { price: MODEL_PRICING[key], known: true };
  return { price: MODEL_PRICING[FALLBACK_MODEL], known: false };
}

/** Nome curto do modelo para a tabela ("Sonnet 5"). */
export function modelLabel(model?: string | null): string {
  const id = model ?? "";
  const key = Object.keys(MODEL_PRICING).find((k) => id.startsWith(k));
  return key ? MODEL_PRICING[key].label : id || "desconhecido";
}

/** Custo em USD de uma chamada, somando input, output e os dois tipos de cache. */
export function usageCostUSD(u: AiUsageRecord): number {
  const { price } = priceFor(u.model);
  return (
    ((u.inputTokens ?? 0) * price.input
      + (u.outputTokens ?? 0) * price.output
      + (u.cacheReadTokens ?? 0) * price.input * CACHE_READ_MULTIPLIER
      + (u.cacheWriteTokens ?? 0) * price.input * CACHE_WRITE_MULTIPLIER)
    / 1_000_000
  );
}

/** Total de tokens de uma chamada (input + output + cache). */
export function usageTokens(u: AiUsageRecord): number {
  return (
    (u.inputTokens ?? 0) + (u.outputTokens ?? 0)
    + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
  );
}
