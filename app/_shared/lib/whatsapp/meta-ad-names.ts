// Nomes reais de campanha → conjunto → anúncio pela Graph API da Meta.
//
// O referral do Click-to-WhatsApp só traz o ID do anúncio e o headline (que é
// igual em quase todos) — no dashboard ficava impossível saber QUAL anúncio/
// conjunto/campanha trouxe o lead. Aqui buscamos os nomes na Marketing API.
//
// Token: precisa da permissão ads_read. O META_CONVERSIONS_TOKEN (Conversions
// API) NÃO tem — gere um token de System User com ads_read no Business
// Manager e configure META_ADS_TOKEN na Vercel. Sem token válido, tudo
// degrada pro comportamento antigo (headline + id).

const API_VERSION = "v21.0";

export interface AdNames {
  adName: string | null;
  adsetName: string | null;
  campaignName: string | null;
}

// Cache em memória do processo (serverless: sobrevive entre invocações mornas).
// Nomes de anúncio mudam raramente — 12h de validade é de sobra.
const CACHE_TTL_MS = 12 * 60 * 60_000;
const cache = new Map<string, { at: number; data: AdNames | null }>();

/**
 * Busca os nomes de um lote de anúncios (batch `?ids=`). IDs sem permissão ou
 * inexistentes voltam como null — o dashboard cai no headline. Nunca lança.
 */
export async function fetchAdNames(adIds: string[]): Promise<Map<string, AdNames>> {
  const out = new Map<string, AdNames>();
  const token = process.env.META_ADS_TOKEN ?? process.env.META_CONVERSIONS_TOKEN;
  if (!token) return out;

  const now = Date.now();
  const toFetch: string[] = [];
  for (const id of new Set(adIds)) {
    const hit = cache.get(id);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      if (hit.data) out.set(id, hit.data);
    } else {
      toFetch.push(id);
    }
  }

  // Lotes de 50 (limite prático do `?ids=`).
  for (let i = 0; i < toFetch.length; i += 50) {
    const batch = toFetch.slice(i, i + 50);
    try {
      const res = await fetch(
        `https://graph.facebook.com/${API_VERSION}/?ids=${batch.join(",")}` +
          `&fields=name,adset{name},campaign{name}&access_token=${token}`,
        { cache: "no-store", signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) {
        // Token sem ads_read / expirado: memoriza o vazio pra não re-tentar a
        // cada carregamento do dashboard dentro da mesma instância.
        for (const id of batch) cache.set(id, { at: now, data: null });
        continue;
      }
      const json = (await res.json()) as Record<
        string,
        { name?: string; adset?: { name?: string }; campaign?: { name?: string } }
      >;
      for (const id of batch) {
        const node = json[id];
        const data: AdNames | null = node
          ? {
              adName: node.name ?? null,
              adsetName: node.adset?.name ?? null,
              campaignName: node.campaign?.name ?? null,
            }
          : null;
        cache.set(id, { at: now, data });
        if (data) out.set(id, data);
      }
    } catch (err) {
      console.error("[META ADS] Falha ao buscar nomes de anúncios:", err);
    }
  }
  return out;
}
