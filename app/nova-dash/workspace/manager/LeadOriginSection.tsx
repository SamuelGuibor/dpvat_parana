'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, Facebook, Instagram, Megaphone, Globe, CheckCircle2, XCircle, Timer,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Button } from '@/app/_shared/ui/button';
import {
  getChatbotAnalytics, getAdLeadOutcomes,
  type ChatbotAnalytics, type AdLeadOutcome,
} from '@/app/_actions/analytics/get-chatbot-analytics';

// "Origem dos leads" — extraída do Desempenho do Chatbot para a aba Analytics
// do dashboard (17/08/2026). Mesmo conteúdo: placar de desfechos, ranking
// Campanha › Conjunto › Anúncio pelo referral real, leads por dia e o modal de
// drill-down. Período próprio (7/30/90) + número vindo do seletor global.

const PLATFORM_META: Record<string, {
  label: string; icon: React.ElementType; chip: string; bar: string;
  text: string; hex: string;
}> = {
  facebook: {
    label: 'Facebook', icon: Facebook,
    chip: 'bg-[#1877F2] text-white', bar: 'bg-[#1877F2]', text: 'text-[#1877F2]', hex: '#1877F2',
  },
  instagram: {
    label: 'Instagram', icon: Instagram,
    chip: 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
    bar: 'bg-[#E1306C]', text: 'text-[#E1306C]', hex: '#E1306C',
  },
  meta: {
    label: 'Meta (outro)', icon: Megaphone,
    chip: 'bg-violet-500 text-white', bar: 'bg-violet-500', text: 'text-violet-500', hex: '#8b5cf6',
  },
  organic: {
    label: 'Orgânico', icon: Globe,
    chip: 'bg-slate-400 text-white dark:bg-zinc-600', bar: 'bg-slate-400 dark:bg-zinc-600',
    text: 'text-slate-400', hex: '#94a3b8',
  },
};
// Ordem FIXA dos segmentos (nunca reordenar por valor: o gestor compara
// períodos e o segmento não pode "andar" de lugar).
const PLATFORM_ORDER = ['facebook', 'instagram', 'meta', 'organic'] as const;

export function LeadOriginSection({
  numberId,
  range,
}: {
  numberId: string | null;
  /** Calendário do dashboard (ISO). Presente → modo "Calendário" por padrão. */
  range?: { from: string; to: string };
}) {
  // 'range' = segue o calendário do topo do dashboard; 7/30/90 são atalhos.
  const [period, setPeriod] = useState<7 | 30 | 90 | 'range'>(range ? 'range' : 7);
  const [data, setData] = useState<ChatbotAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const useRange = period === 'range' && !!range;
  const periodDays = period === 'range' ? 30 : period;
  const rangeFrom = useRange ? range!.from : undefined;
  const rangeTo = useRange ? range!.to : undefined;

  // Drill-down da campanha: clicar num anúncio (ou no Orgânico) abre o modal
  // com cada lead, seu desfecho e o motivo do não qualificado.
  const [leadModal, setLeadModal] = useState<{ title: string; sourceKey: string | null } | null>(null);
  const [leadRows, setLeadRows] = useState<AdLeadOutcome[] | null>(null);
  useEffect(() => {
    if (!leadModal) return;
    let alive = true;
    setLeadRows(null);
    getAdLeadOutcomes(leadModal.sourceKey, periodDays, numberId, rangeFrom, rangeTo)
      .then((rows) => { if (alive) setLeadRows(rows); })
      .catch(() => { if (alive) setLeadRows([]); });
    return () => { alive = false; };
  }, [leadModal, periodDays, numberId, rangeFrom, rangeTo]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getChatbotAnalytics(periodDays, numberId, rangeFrom, rangeTo)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e?.message ?? 'Erro ao carregar.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [periodDays, numberId, rangeFrom, rangeTo]);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-gray-900 dark:text-zinc-100">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-500 to-violet-500 text-white">
              <Megaphone className="h-5 w-5" />
            </span>
            Origem dos leads
          </h2>
          <p className="mt-1 text-xs text-gray-400">
            De onde vieram os leads que chamaram no WhatsApp — por plataforma de anúncio e por anúncio individual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data && !loading && (() => {
            // Placar geral do período: quanto do funil virou cliente.
            const totals = Object.values(data.adOrigins.outcomesByPlatform ?? {}).reduce(
              (acc, o) => ({
                qualified: acc.qualified + o.qualified,
                disqualified: acc.disqualified + o.disqualified,
                pending: acc.pending + o.pending,
              }),
              { qualified: 0, disqualified: 0, pending: 0 },
            );
            return (
              <div className="flex items-stretch gap-2">
                <div className="rounded-2xl border-2 border-emerald-300 px-4 py-2 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
                  <p className="text-3xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">{totals.qualified}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600/70 dark:text-emerald-400/70">qualificados</p>
                </div>
                <div className="rounded-2xl border-2 border-rose-300 px-4 py-2 text-center dark:border-rose-800 dark:bg-rose-950/30">
                  <p className="text-3xl font-extrabold tabular-nums text-rose-700 dark:text-rose-300">{totals.disqualified}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600/70 dark:text-rose-400/70">não qualif.</p>
                </div>
                <div className="rounded-2xl border-2 border-gray-300 px-4 py-2 text-center dark:border-zinc-700">
                  <p className="text-3xl font-extrabold tabular-nums text-gray-700 dark:text-zinc-300">{data.adOrigins.totalNewContacts}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    leads · {useRange ? 'período do calendário' : `${period} dias`}
                  </p>
                </div>
              </div>
            );
          })()}
          <div className="flex gap-1 rounded-lg border border-gray-200 p-1 dark:border-zinc-700">
            {range && (
              <Button size="sm" variant={period === 'range' ? 'default' : 'ghost'} onClick={() => setPeriod('range')} className="h-7 px-3 text-xs">Calendário</Button>
            )}
            {([7, 30, 90] as const).map((p) => (
              <Button key={p} size="sm" variant={period === p ? 'default' : 'ghost'} onClick={() => setPeriod(p)} className="h-7 px-3 text-xs">{p} dias</Button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/10">{error}</div>
      ) : loading || !data ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          {/* Orgânico também tem desfecho — clicável como os anúncios. */}
          {(data.adOrigins.outcomesByPlatform?.organic?.qualified
            || data.adOrigins.outcomesByPlatform?.organic?.disqualified
            || data.adOrigins.outcomesByPlatform?.organic?.pending) ? (
            <button
              type="button"
              onClick={() => setLeadModal({ title: 'Leads orgânicos (sem anúncio)', sourceKey: null })}
              className="mb-4 flex w-full items-center justify-between rounded-xl border border-gray-100 px-3.5 py-2 text-left transition-colors hover:bg-gray-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
            >
              <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-zinc-200">
                <Globe className="h-3.5 w-3.5 text-slate-400" /> Orgânico (sem anúncio)
              </span>
              <span className="flex items-center gap-2 text-[11px] font-bold tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">✓{data.adOrigins.outcomesByPlatform.organic.qualified}</span>
                <span className="text-rose-600 dark:text-rose-400">✗{data.adOrigins.outcomesByPlatform.organic.disqualified}</span>
                {data.adOrigins.outcomesByPlatform.organic.pending > 0 && (
                  <span className="text-gray-400">…{data.adOrigins.outcomesByPlatform.organic.pending}</span>
                )}
              </span>
            </button>
          ) : null}

          {data.adOrigins.totalNewContacts === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 py-10 text-center dark:border-zinc-700">
              <Megaphone className="h-8 w-8 text-gray-300 dark:text-zinc-600" />
              <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Nenhum lead novo iniciou conversa no período.</p>
              <p className="max-w-md text-xs text-gray-400">
                Quando alguém clicar num anúncio &quot;Clique para WhatsApp&quot; do Facebook ou Instagram e mandar mensagem, a origem aparece aqui automaticamente.
              </p>
            </div>
          ) : (
            <div>
              {/* Ranking de anúncios (largura total — o resumo por
                  plataforma virou a legenda do gráfico diário abaixo). */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Quais anúncios trouxeram leads</p>
                {data.adOrigins.byAd.length === 0 ? (
                  <div className="flex h-[calc(100%-2rem)] min-h-[10rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 px-6 text-center dark:border-zinc-700">
                    <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Nenhum lead do período veio de anúncio rastreado.</p>
                    <p className="max-w-sm text-xs text-gray-400">
                      O rastreamento de origem está ativo desde 21/07/2026 — leads anteriores a essa data aparecem como &quot;Orgânico&quot;.
                    </p>
                  </div>
                ) : (
                  (() => {
                    const ads = data.adOrigins.byAd;
                    const total = data.adOrigins.totalNewContacts;
                    const hasNames = ads.some((a) => a.campaignName);

                    const platsOf = (ad: (typeof ads)[number]) =>
                      Object.entries(ad.platforms ?? { [ad.platform]: ad.count })
                        .filter(([, n]) => n > 0)
                        .sort((a, b) => b[1] - a[1]);

                    /**
                     * Barra empilhada por plataforma: a largura total é a
                     * fatia do anúncio/conjunto no período, e cada segmento é
                     * uma rede. Substitui os chips numéricos soltos.
                     */
                    const StackedBar = ({
                      entries, share, thick,
                    }: { entries: [string, number][]; share: number; thick?: boolean }) => {
                      const sum = entries.reduce((s, [, n]) => s + n, 0) || 1;
                      return (
                        <div className={`overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800 ${thick ? 'h-2' : 'h-1.5'}`}>
                          <div className="flex h-full gap-px" style={{ width: `${Math.max(share * 100, 1.5)}%` }}>
                            {entries.map(([plat, n]) => {
                              const pm = PLATFORM_META[plat] ?? PLATFORM_META.meta;
                              return (
                                <div
                                  key={plat}
                                  className={`h-full ${pm.bar}`}
                                  style={{ width: `${(n / sum) * 100}%` }}
                                  title={`${pm.label}: ${n}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    };

                    /** Legenda compacta: ícone da rede + número de leads. */
                    const PlatLegend = ({ entries, big }: { entries: [string, number][]; big?: boolean }) => (
                      <span className="flex shrink-0 items-center gap-2.5">
                        {entries.map(([plat, n]) => {
                          const pm = PLATFORM_META[plat] ?? PLATFORM_META.meta;
                          const PIcon = pm.icon;
                          return (
                            <span key={plat} title={`${pm.label}: ${n}`} className={`flex items-center gap-1 font-semibold tabular-nums text-gray-600 dark:text-zinc-300 ${big ? 'text-xs' : 'text-[11px]'}`}>
                              <PIcon className={`${big ? 'h-3.5 w-3.5' : 'h-3 w-3'} ${pm.text}`} />
                              {n}
                            </span>
                          );
                        })}
                      </span>
                    );

                    const AdRow = ({ ad, rank }: { ad: (typeof ads)[number]; rank: number }) => {
                      const entries = platsOf(ad);
                      const pct = Math.round((ad.count / total) * 100);
                      const adTitle = ad.adName ?? ad.headline ?? (ad.sourceId ? `Anúncio ${ad.sourceId}` : 'Anúncio sem título');
                      return (
                        <button
                          type="button"
                          onClick={() => setLeadModal({
                            title: adTitle,
                            sourceKey: ad.sourceId ?? ad.headline ?? ad.sourceUrl ?? 'desconhecido',
                          })}
                          title="Clique para ver cada lead e o desfecho"
                          className="-mx-2 block w-[calc(100%+16px)] rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                        >
                          <div className="mb-1 flex items-baseline gap-2">
                            <span className="w-5 shrink-0 text-[10px] font-bold text-gray-300 dark:text-zinc-600">{rank}º</span>
                            <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-zinc-200">
                              {adTitle}
                              {/* Sem nome da campanha, o id curto diferencia anúncios de headline igual. */}
                              {!ad.adName && ad.sourceId && (
                                <span className="ml-1.5 text-[10px] tabular-nums text-gray-400">…{ad.sourceId.slice(-6)}</span>
                              )}
                            </span>
                            {/* Desfecho: verde qualificou, vermelho não, cinza em andamento. */}
                            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold tabular-nums">
                              <span title={`${ad.qualified} qualificado(s)`} className="text-emerald-600 dark:text-emerald-400">✓{ad.qualified}</span>
                              <span title={`${ad.disqualified} não qualificado(s)`} className="text-rose-600 dark:text-rose-400">✗{ad.disqualified}</span>
                              {ad.pending > 0 && (
                                <span title={`${ad.pending} em andamento`} className="text-gray-400">…{ad.pending}</span>
                              )}
                            </span>
                            <PlatLegend entries={entries} />
                            <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-gray-900 dark:text-zinc-100">{ad.count}</span>
                            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-gray-400">{pct}%</span>
                          </div>
                          <div className="ml-7">
                            <StackedBar entries={entries} share={ad.count / total} />
                          </div>
                        </button>
                      );
                    };

                    if (!hasNames) {
                      // Sem META_ADS_TOKEN (ads_read): lista plana, sem a
                      // hierarquia campanha › conjunto.
                      return (
                        <div className="rounded-2xl border border-gray-100 px-3.5 py-2 dark:border-zinc-800">
                          {ads.slice(0, 8).map((ad, i) => <AdRow key={ad.sourceId ?? ad.headline ?? i} ad={ad} rank={i + 1} />)}
                          {ads.length > 8 && (
                            <p className="py-1.5 text-center text-xs text-gray-400">+ {ads.length - 8} outros anúncios com menos leads</p>
                          )}
                        </div>
                      );
                    }

                    // Agrupa Campanha › Conjunto, na ordem do total de leads —
                    // mesma hierarquia do Gerenciador de Anúncios da Meta.
                    const campaigns = new Map<string, {
                      count: number;
                      adsets: Map<string, { count: number; platforms: Record<string, number>; ads: typeof ads }>;
                    }>();
                    for (const ad of ads) {
                      const cKey = ad.campaignName ?? 'Sem campanha (orgânico ou sem permissão)';
                      const sKey = ad.adsetName ?? '—';
                      let c = campaigns.get(cKey);
                      if (!c) { c = { count: 0, adsets: new Map() }; campaigns.set(cKey, c); }
                      c.count += ad.count;
                      let s = c.adsets.get(sKey);
                      if (!s) { s = { count: 0, platforms: {}, ads: [] as typeof ads }; c.adsets.set(sKey, s); }
                      s.count += ad.count;
                      s.ads.push(ad);
                      for (const [plat, n] of Object.entries(ad.platforms ?? { [ad.platform]: ad.count })) {
                        s.platforms[plat] = (s.platforms[plat] ?? 0) + n;
                      }
                    }
                    let rank = 0;
                    return (
                      <div className="space-y-5">
                        {[...campaigns.entries()].sort((a, b) => b[1].count - a[1].count).map(([cName, c]) => (
                          <div key={cName}>
                            <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <Megaphone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                <span className="truncate text-xs font-extrabold uppercase tracking-wide text-gray-500 dark:text-zinc-300">{cName}</span>
                              </span>
                              <span className="shrink-0 text-xs font-bold tabular-nums text-gray-400">{c.count} leads</span>
                            </div>

                            {/* Um card por CONJUNTO (região): total + mix de
                                rede no topo, anúncios do conjunto dentro. */}
                            <div className="space-y-2.5">
                              {[...c.adsets.entries()].sort((a, b) => b[1].count - a[1].count).map(([sName, s]) => {
                                const sEntries = Object.entries(s.platforms).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
                                return (
                                  <div key={sName} className="rounded-xl border border-gray-100 px-3.5 py-3 dark:border-zinc-800">
                                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                                      <span className="truncate text-sm font-bold text-gray-800 dark:text-zinc-100">{sName}</span>
                                      <span className="flex shrink-0 items-center gap-3">
                                        <PlatLegend entries={sEntries} big />
                                        <span className="text-xl font-extrabold tabular-nums text-gray-900 dark:text-zinc-100">{s.count}</span>
                                      </span>
                                    </div>
                                    <StackedBar entries={sEntries} share={s.count / total} thick />
                                    <div className="mt-2 divide-y divide-gray-100 border-t border-gray-100 pt-1 dark:divide-zinc-800 dark:border-zinc-800">
                                      {s.ads.sort((a, b) => b.count - a.count).map((ad, i) => {
                                        rank += 1;
                                        return <AdRow key={ad.sourceId ?? ad.headline ?? i} ad={ad} rank={rank} />;
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Leads por dia: a campanha está crescendo ou caindo? */}
              {(() => {
                const daily = data.adOrigins.daily ?? [];
                if (daily.length < 2) return null;
                const platEntries = PLATFORM_ORDER
                  .map((k) => ({ key: k, ...PLATFORM_META[k], value: data.adOrigins.byPlatform[k] ?? 0 }))
                  .filter((e) => e.value > 0);
                // Tendência: média da 2ª metade do período contra a 1ª.
                const half = Math.floor(daily.length / 2);
                const avg = (arr: typeof daily) => (arr.reduce((s, d) => s + d.total, 0) / Math.max(1, arr.length));
                const first = avg(daily.slice(0, half));
                const last = avg(daily.slice(half));
                const trend = first > 0 ? Math.round(((last - first) / first) * 100) : null;
                const perDay = Math.round((data.adOrigins.totalNewContacts / daily.length) * 10) / 10;

                return (
                  <div className="mt-6 border-t border-gray-100 pt-5 dark:border-zinc-800">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Leads por dia</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          Média de <span className="font-bold text-gray-600 dark:text-zinc-300">{perDay.toLocaleString('pt-BR')} por dia</span>
                          {trend !== null && (
                            <>
                              {' · '}
                              <span className={trend > 0 ? 'font-bold text-emerald-600 dark:text-emerald-400' : trend < 0 ? 'font-bold text-rose-600 dark:text-rose-400' : 'font-bold'}>
                                {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}%
                              </span>
                              {' na 2ª metade do período'}
                            </>
                          )}
                        </p>
                      </div>
                      {/* Legenda = totais por plataforma (substitui a coluna removida). */}
                      <div className="flex flex-wrap items-center gap-3">
                        {platEntries.map((e) => {
                          const Icon = e.icon;
                          return (
                            <span key={e.key} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-zinc-300">
                              <Icon className={`h-4 w-4 ${e.text}`} />
                              {e.label}
                              <span className="tabular-nums text-gray-900 dark:text-zinc-100">{e.value}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={daily} margin={{ top: 5, right: 5, left: -26, bottom: 0 }}>
                          <defs>
                            {PLATFORM_ORDER.map((k) => (
                              <linearGradient key={k} id={`leadOrigin-${k}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={PLATFORM_META[k].hex} stopOpacity={0.45} />
                                <stop offset="95%" stopColor={PLATFORM_META[k].hex} stopOpacity={0.03} />
                              </linearGradient>
                            ))}
                          </defs>
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            tickLine={false}
                            axisLine={false}
                            interval={Math.max(0, Math.floor(daily.length / 7) - 1)}
                          />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                          <Tooltip
                            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }}
                            formatter={(v: number, name: string) => [`${v} ${v === 1 ? 'lead' : 'leads'}`, PLATFORM_META[name]?.label ?? name]}
                            // Ao lado da data, o total do dia somando todas as plataformas.
                            labelFormatter={(label: string, payload: readonly { payload?: { total?: number } }[]) => {
                              const total = payload?.[0]?.payload?.total ?? 0;
                              return `${label} · ${total} ${total === 1 ? 'lead' : 'leads'}`;
                            }}
                          />
                          {/* Empilhado: a altura total é o total do dia e
                              cada faixa é uma rede — mesma leitura das barras. */}
                          {platEntries.map((e) => (
                            <Area
                              key={e.key}
                              type="monotone"
                              dataKey={e.key}
                              stackId="leads"
                              stroke={e.hex}
                              strokeWidth={2}
                              fill={`url(#leadOrigin-${e.key})`}
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* Modal do drill-down: cada lead da campanha, com desfecho e motivo. */}
      {leadModal && (
        <LeadOutcomesDialog
          title={leadModal.title}
          periodDays={useRange ? null : periodDays}
          rows={leadRows}
          onClose={() => setLeadModal(null)}
        />
      )}
    </section>
  );
}

/* ── Modal de desfecho da campanha ─────────────────────────────────────────
   Qualificados e não qualificados em colunas SEPARADAS (verde × vermelho),
   cada uma com o próprio placar e motivo por lead; "em andamento" numa faixa
   discreta embaixo. */

function LeadOutcomesDialog({
  title, periodDays, rows, onClose,
}: {
  title: string;
  /** null = período livre do calendário (o texto vira "do período"). */
  periodDays: number | null;
  rows: AdLeadOutcome[] | null;
  onClose: () => void;
}) {
  const qualified = (rows ?? []).filter((l) => l.outcome === 'qualified');
  const disqualified = (rows ?? []).filter((l) => l.outcome === 'disqualified');
  const pending = (rows ?? []).filter((l) => l.outcome === 'pending');
  const conversion = rows?.length
    ? Math.round((qualified.length / (qualified.length + disqualified.length || 1)) * 100)
    : 0;

  const LeadItem = ({ lead, tone }: { lead: AdLeadOutcome; tone: 'emerald' | 'rose' | 'gray' }) => (
    <li className="px-4 py-2.5">
      <p className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">
        {lead.name ?? `+${lead.phone}`}
        {lead.cardNumber != null && (
          <span className="ml-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">#{lead.cardNumber}</span>
        )}
      </p>
      <p className={`mt-0.5 text-[11px] ${
        tone === 'rose' ? 'font-medium text-rose-500 dark:text-rose-400' : 'text-gray-400'
      }`}>
        {tone === 'gray'
          ? `em andamento · chegou em ${new Date(lead.createdAt).toLocaleDateString('pt-BR')}`
          : `${lead.reason ?? (tone === 'emerald' ? 'Qualificado' : 'Não qualificado')} · ${new Date(lead.createdAt).toLocaleDateString('pt-BR')}`}
      </p>
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho com o placar grande */}
        <div className="border-b border-gray-100 px-6 py-5 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-extrabold tracking-tight text-gray-900 dark:text-zinc-100">{title}</h3>
              <p className="text-xs text-gray-400">
                {periodDays === null
                  ? 'leads do período selecionado no calendário e o desfecho de cada um'
                  : `leads dos últimos ${periodDays} dias e o desfecho de cada um`}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>

          {rows && rows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-stretch gap-2.5">
              <div className="rounded-xl border-2 border-emerald-300 px-4 py-1.5 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">{qualified.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600/70">qualificados</p>
              </div>
              <div className="rounded-xl border-2 border-rose-300 px-4 py-1.5 text-center dark:border-rose-800 dark:bg-rose-950/30">
                <p className="text-2xl font-extrabold tabular-nums text-rose-700 dark:text-rose-300">{disqualified.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600/70">não qualif.</p>
              </div>
              <div className="rounded-xl border-2 border-gray-200 px-4 py-1.5 text-center dark:border-zinc-700">
                <p className="text-2xl font-extrabold tabular-nums text-gray-600 dark:text-zinc-300">{pending.length}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">em andamento</p>
              </div>
              <div className="ml-auto rounded-xl bg-blue-600 px-4 py-1.5 text-center text-white">
                <p className="text-2xl font-extrabold tabular-nums">{conversion}%</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">conversão</p>
              </div>
            </div>
          )}
        </div>

        {/* Corpo: duas colunas — verde e vermelha */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows === null ? (
            <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm text-gray-400">Nenhum lead deste anúncio no período.</p>
          ) : (
            <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5">
              {/* Coluna dos qualificados */}
              <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/50">
                <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">Qualificados</span>
                  <span className="ml-auto rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{qualified.length}</span>
                </div>
                {qualified.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-gray-400">Nenhum lead qualificado ainda.</p>
                ) : (
                  <ul className="divide-y divide-emerald-100/70 dark:divide-emerald-900/30">
                    {qualified.map((lead) => <LeadItem key={lead.contactId} lead={lead} tone="emerald" />)}
                  </ul>
                )}
              </div>

              {/* Coluna dos não qualificados (com o motivo em destaque) */}
              <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-rose-200 dark:border-rose-900/50">
                <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2.5 dark:border-rose-900/50 dark:bg-rose-950/30">
                  <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  <span className="text-sm font-extrabold text-rose-700 dark:text-rose-300">Não qualificados</span>
                  <span className="ml-auto rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{disqualified.length}</span>
                </div>
                {disqualified.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-gray-400">Nenhum lead descartado. 🎉</p>
                ) : (
                  <ul className="divide-y divide-rose-100/70 dark:divide-rose-900/30">
                    {disqualified.map((lead) => <LeadItem key={lead.contactId} lead={lead} tone="rose" />)}
                  </ul>
                )}
              </div>

              {/* Em andamento: faixa discreta de largura total */}
              {pending.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-zinc-800 md:col-span-2">
                  <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <Timer className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-extrabold text-gray-600 dark:text-zinc-300">Em andamento</span>
                    <span className="ml-auto rounded-full bg-gray-400 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white dark:bg-zinc-600">{pending.length}</span>
                  </div>
                  <ul className="grid divide-y divide-gray-100 dark:divide-zinc-800 md:grid-cols-2 md:divide-y-0">
                    {pending.map((lead) => <LeadItem key={lead.contactId} lead={lead} tone="gray" />)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
