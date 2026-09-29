// Cache em memória com prazo de validade, por instância da função.
//
// Serve para leituras que se repetem em toda ação e mudam pouco (setor do
// autor do log, lista de destinatários do relay): na Vercel cada instância
// quente guarda a própria cópia, e o prazo curto limita o tempo em que um
// dado trocado no banco continua servido. Guarda `null` também (cache
// negativo): "este autor não tem setor" é resposta válida e não deve ir ao
// banco de novo a cada log.

export interface TtlCache<K, V> {
  /** Valor ainda válido, ou `undefined` quando ausente/expirado. `null` guardado volta como `null`. */
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): void;
  clear(): void;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export function createTtlCache<K, V>({
  ttlMs,
  now = Date.now,
  // Teto de chaves: o setor é cacheado por autor e, sem limite, uma instância
  // de vida longa acumularia toda a equipe + ids de sistema para sempre.
  // Estourou → sai a entrada mais antiga (ordem de inserção do Map).
  maxEntries = 1000,
}: {
  ttlMs: number;
  now?: () => number;
  maxEntries?: number;
}): TtlCache<K, V> {
  const entries = new Map<K, Entry<V>>();

  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() >= hit.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      // delete antes do set: regravar move a chave para o fim da fila de despejo.
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}
