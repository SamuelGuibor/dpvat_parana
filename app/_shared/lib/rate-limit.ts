// Rate limiter em memória (janela deslizante). Por instância — na Vercel cada
// lambda tem o seu, então o limite real pode ser maior que o configurado, mas
// já corta força-bruta barata contra o login. Sem dependência externa.

const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

/**
 * Retorna true se a chamada está dentro do limite (e a registra);
 * false se estourou o limite na janela.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();

  if (buckets.size > MAX_KEYS) {
    for (const [k, times] of buckets) {
      if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}
