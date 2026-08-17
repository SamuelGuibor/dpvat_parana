'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { brStartOfDay, brStartOfDaysAgo, brDayKey, brDayKeySeries, brLabelFromKey } from '@/app/_shared/utils/date-br';

// BotConversa no CRM: aba "Contratados" do Espaço de Trabalho (lista de
// fechamentos) + bloco "Campanhas da Meta" dentro da Origem dos leads do
// dashboard do chatbot (leads/dia e qualificação vêm da tabela botconversa,
// alimentada pelo webhook /api/botconversa/contratado).

export interface Contratado {
  id: string;
  nome: string;
  telefone: string;
  createdAt: string | null;
}

/** Todos os leads fechados como "contratado" no BotConversa. */
export async function listContratados(): Promise<Contratado[]> {
  await requireTeam();
  const rows = await db.botconversa.findMany({
    where: { evento: 'contratado' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, nome: true, telefone: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt?.toISOString() ?? null }));
}

// ---------------------------------------------------------------------------
// Campanhas da Meta (conta act_6242597975853314 "Paraná DPVAT") + leads do
// webhook do BotConversa. Token dedicado META_ADS_TOKEN_BOTCONVERSA com
// fallback no META_ADS_TOKEN (BotSamuel já tem o ativo atribuído).

export interface AdInsight {
  id: string;
  name: string;
  /** Conversas por mensagem iniciadas (o "resultado" das campanhas de WhatsApp). */
  conversations: number;
  spend: number;
  /** Conversas por plataforma (facebook/instagram/whatsapp/...). */
  platforms: Record<string, number>;
}

export interface AdsetInsight {
  name: string;
  conversations: number;
  spend: number;
  ads: AdInsight[];
}

export interface CampaignInsight {
  id: string;
  name: string;
  conversations: number;
  spend: number;
  costPerConversation: number | null;
  adsets: AdsetInsight[];
}

export interface BotconversaAdsData {
  /** Leads recebidos via webhook do BotConversa, por dia (fuso de Brasília). */
  daily: { label: string; total: number }[];
  totalLeads: number;
  // Qualificação mapeada dos eventos do webhook (mesma semântica do
  // EVENT_MAP de _shared/lib/db/botconversa.ts):
  // qualificado = contratado/em_honorario/enviou_documentos;
  // não qualificado = nao_qualificado/nao_contratado; resto = em andamento.
  qualified: number;
  disqualified: number;
  pending: number;
  /** null = token/conta não configurados ou Marketing API falhou. */
  iaCampaigns: CampaignInsight[] | null;
  botconversaCampaigns: CampaignInsight[] | null;
  accountConfigured: boolean;
}

const API_VERSION = 'v21.0';

// Todas as campanhas moram na MESMA conta de anúncios. A primeira campanha do
// bot da IA é a Campanha_Bot_Samuel — os IDs da Meta crescem com o tempo, então
// tudo a partir dela é do bot da IA e tudo antes é da era BotConversa.
// (Comparação numérica via string: um ID mais longo é sempre maior.)
const FIRST_IA_CAMPAIGN_ID = '120249194281680084';
function isIaCampaignId(id: string): boolean {
  if (!/^\d+$/.test(id)) return false;
  if (id.length !== FIRST_IA_CAMPAIGN_ID.length) return id.length > FIRST_IA_CAMPAIGN_ID.length;
  return id >= FIRST_IA_CAMPAIGN_ID;
}

const QUALIFIED_EVENTS = ['contratado', 'em_honorario', 'enviou_documentos'];
const DISQUALIFIED_EVENTS = ['nao_qualificado', 'nao_contratado'];

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Período livre: recebe dias "YYYY-MM-DD" (fuso de Brasília) de início e fim,
 * ambos inclusivos. Datas inválidas caem nos últimos 30 dias; fim no futuro é
 * puxado para hoje; intervalo é limitado a 366 dias.
 */
export async function getBotconversaAdsData(sinceKey: string, untilKey: string): Promise<BotconversaAdsData> {
  await requireTeam();

  const todayKey = brDayKey(new Date());
  if (!DAY_KEY_RE.test(sinceKey) || !DAY_KEY_RE.test(untilKey)) {
    sinceKey = brDayKey(brStartOfDaysAgo(29));
    untilKey = todayKey;
  }
  if (untilKey > todayKey) untilKey = todayKey;
  if (sinceKey > untilKey) [sinceKey, untilKey] = [untilKey, sinceKey];

  // Meio-dia UTC = manhã em Brasília: ancora no dia certo sem risco de fuso.
  const untilAnchor = new Date(`${untilKey}T12:00:00Z`);
  const untilExclusive = new Date(brStartOfDay(untilAnchor).getTime() + 86_400_000);
  let since = brStartOfDay(new Date(`${sinceKey}T12:00:00Z`));
  let safeDays = Math.round((untilExclusive.getTime() - since.getTime()) / 86_400_000);
  if (safeDays > 366) {
    safeDays = 366;
    sinceKey = brDayKey(brStartOfDaysAgo(365, untilAnchor));
    since = brStartOfDay(new Date(`${sinceKey}T12:00:00Z`));
  }

  const rows = await db.botconversa.findMany({
    where: { createdAt: { gte: since, lt: untilExclusive } },
    select: { createdAt: true, evento: true },
  });
  const byDay = new Map<string, number>(brDayKeySeries(safeDays, untilAnchor).map((k) => [k, 0]));
  let qualified = 0;
  let disqualified = 0;
  for (const r of rows) {
    if (QUALIFIED_EVENTS.includes(r.evento)) qualified++;
    else if (DISQUALIFIED_EVENTS.includes(r.evento)) disqualified++;
    if (!r.createdAt) continue;
    const key = brDayKey(r.createdAt);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const daily = [...byDay.entries()].map(([key, total]) => ({ label: brLabelFromKey(key), total }));

  // Tenta o token dedicado primeiro; se a Meta negar (ativo ainda não
  // atribuído ao system user "lead botconversa"), cai no META_ADS_TOKEN.
  const tokens = [process.env.META_ADS_TOKEN_BOTCONVERSA, process.env.META_ADS_TOKEN].filter(
    (t): t is string => Boolean(t),
  );
  // Aceita com ou sem o prefixo act_ (a URL do Gerenciador traz só o número).
  const rawAccount = process.env.META_ADS_ACCOUNT_BOTCONVERSA?.trim();
  const account = rawAccount ? (rawAccount.startsWith('act_') ? rawAccount : `act_${rawAccount}`) : undefined;
  const accountConfigured = Boolean(tokens.length && account);

  let iaCampaigns: CampaignInsight[] | null = null;
  let botconversaCampaigns: CampaignInsight[] | null = null;
  if (account) {
    const sinceStr = sinceKey;
    const untilStr = untilKey;
    interface InsightRow {
      campaign_id?: string; campaign_name?: string; adset_name?: string;
      ad_id?: string; ad_name?: string; publisher_platform?: string;
      spend?: string; actions?: { action_type: string; value: string }[];
    }

    for (const token of tokens) {
      try {
        // level=ad + breakdown por plataforma: uma linha por anúncio×rede, com
        // campanha e conjunto juntos — a hierarquia inteira numa chamada só.
        let url: string | null =
          `https://graph.facebook.com/${API_VERSION}/${account}/insights` +
          `?level=ad&fields=campaign_id,campaign_name,adset_name,ad_id,ad_name,spend,actions` +
          `&breakdowns=publisher_platform` +
          `&time_range={"since":"${sinceStr}","until":"${untilStr}"}` +
          `&limit=500&access_token=${token}`;
        const insightRows: InsightRow[] = [];
        let failed = false;
        // Log de depuração SEM o token (a URL completa vazaria a credencial).
        console.log('[BOTCONVERSA ADS]', url.replace(/access_token=[^&]+/, 'access_token=***'));
        for (let page = 0; url && page < 6; page++) {
          const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
          if (!res.ok) {
            console.error('[BOTCONVERSA ADS] insights falhou:', res.status, await res.text());
            failed = true;
            break;
          }
          const json = (await res.json()) as { data?: InsightRow[]; paging?: { next?: string } };
          insightRows.push(...(json.data ?? []));
          url = json.paging?.next ?? null;
        }
        if (failed) continue;

        const byCampaign = new Map<string, CampaignInsight & { adsetMap: Map<string, AdsetInsight & { adMap: Map<string, AdInsight> }> }>();
        for (const row of insightRows) {
          const conversations = Number(
            row.actions?.find((a) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value ?? 0,
          );
          const spend = Number(row.spend ?? 0);
          if (!conversations && !spend) continue;

          const campId = row.campaign_id ?? '?';
          let camp = byCampaign.get(campId);
          if (!camp) {
            camp = {
              id: campId, name: row.campaign_name ?? 'Sem nome',
              conversations: 0, spend: 0, costPerConversation: null,
              adsets: [], adsetMap: new Map(),
            };
            byCampaign.set(campId, camp);
          }
          camp.conversations += conversations;
          camp.spend += spend;

          const adsetName = row.adset_name ?? 'Sem nome';
          let adset = camp.adsetMap.get(adsetName);
          if (!adset) {
            adset = { name: adsetName, conversations: 0, spend: 0, ads: [], adMap: new Map() };
            camp.adsetMap.set(adsetName, adset);
          }
          adset.conversations += conversations;
          adset.spend += spend;

          const adId = row.ad_id ?? row.ad_name ?? '?';
          let ad = adset.adMap.get(adId);
          if (!ad) {
            ad = { id: adId, name: row.ad_name ?? 'Sem nome', conversations: 0, spend: 0, platforms: {} };
            adset.adMap.set(adId, ad);
          }
          ad.conversations += conversations;
          ad.spend += spend;
          if (conversations) {
            const plat = row.publisher_platform ?? 'outro';
            ad.platforms[plat] = (ad.platforms[plat] ?? 0) + conversations;
          }
        }

        const all: CampaignInsight[] = [...byCampaign.values()].map(({ adsetMap, ...c }) => ({
          ...c,
          costPerConversation: c.conversations > 0 ? c.spend / c.conversations : null,
          adsets: [...adsetMap.values()]
            .map(({ adMap, ...s }) => ({
              ...s,
              ads: [...adMap.values()].sort((a, b) => b.conversations - a.conversations || b.spend - a.spend),
            }))
            .sort((a, b) => b.conversations - a.conversations || b.spend - a.spend),
        }));
        all.sort((a, b) => b.conversations - a.conversations || b.spend - a.spend);

        iaCampaigns = all.filter((c) => isIaCampaignId(c.id));
        botconversaCampaigns = all.filter((c) => !isIaCampaignId(c.id));
        break;
      } catch (err) {
        console.error('[BOTCONVERSA ADS] erro ao buscar insights:', err);
      }
    }
  }

  return {
    daily,
    totalLeads: rows.length,
    qualified,
    disqualified,
    pending: rows.length - qualified - disqualified,
    iaCampaigns,
    botconversaCampaigns,
    accountConfigured,
  };
}
