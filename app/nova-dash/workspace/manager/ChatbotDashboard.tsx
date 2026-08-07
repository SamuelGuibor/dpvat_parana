/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bot, Loader2, BadgeCheck, XCircle, Headset, HelpCircle, AlertTriangle,
  Brain, Timer, Activity, MessageSquare, FileText, Workflow, FileBadge,
  UserRound, Undo2, DollarSign, StickyNote, Users, ShieldAlert, ShieldCheck,
  Info, Facebook, Instagram, Megaphone, Globe, Send, CheckCircle2, BellRing,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Button } from '@/app/_shared/ui/button';
import { getChatbotAnalytics, type ChatbotAnalytics } from '@/app/_actions/analytics/get-chatbot-analytics';
import { CLOSE_CATEGORY_LABELS, NON_QUALIFIED_CATEGORIES } from '@/app/_shared/lib/whatsapp/close-categories';
import { SystemMap } from './SystemMap';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Card de métrica com contorno colorido (não preenchido) no modo claro — o
// preenchimento sólido volta no modo escuro via a paleta padrão do app.
function Metric({
  icon: Icon, label, value, hint, tone,
}: {
  icon: React.ElementType; label: string; value: string | number; hint?: string;
  tone: 'emerald' | 'rose' | 'blue' | 'amber' | 'violet' | 'slate';
}) {
  const tones: Record<string, string> = {
    emerald: 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    rose: 'border-rose-300 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
    blue: 'border-blue-300 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
    amber: 'border-amber-300 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    violet: 'border-violet-300 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
    slate: 'border-gray-300 text-gray-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  };
  return (
    <div className={`rounded-2xl border-2 bg-white/60 p-4 dark:bg-transparent ${tones[tone]}`}>
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-5 w-5" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="text-3xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs opacity-70">{hint}</p>}
    </div>
  );
}

// Avisos da Meta (Saúde da conta): cor/ícone por gravidade + rótulo por campo
// do webhook. A gravidade vem pronta do servidor (metadata do log wa_account).
const EVENT_SEVERITY_META: Record<string, { icon: React.ElementType; circle: string; label: string }> = {
  critical: {
    icon: ShieldAlert,
    circle: 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400',
    label: 'Crítico',
  },
  warning: {
    icon: AlertTriangle,
    circle: 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400',
    label: 'Atenção',
  },
  ok: {
    icon: ShieldCheck,
    circle: 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400',
    label: 'Positivo',
  },
  info: {
    icon: Info,
    circle: 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400',
    label: 'Informativo',
  },
};

const EVENT_FIELD_LABELS: Record<string, string> = {
  account_update: 'Conta',
  account_alerts: 'Alerta',
  account_review_update: 'Revisão da conta',
  phone_number_quality_update: 'Qualidade do número',
  phone_number_name_update: 'Nome de exibição',
  message_template_status_update: 'Template',
  message_template_quality_update: 'Qualidade de template',
  security: 'Segurança',
  flows: 'Flows',
};

const ACTION_META: Record<string, { icon: React.ElementType; label: string }> = {
  wa_assign: { icon: UserRound, label: 'Assumiu' },
  wa_reopen: { icon: Undo2, label: 'Reabriu' },
  wa_return_bot: { icon: Bot, label: 'Devolveu ao bot' },
  wa_close: { icon: BadgeCheck, label: 'Encerrou' },
  wa_text: { icon: MessageSquare, label: 'Texto' },
  wa_document: { icon: FileText, label: 'Documento' },
  wa_media: { icon: FileText, label: 'Mídia' },
  wa_flow: { icon: Workflow, label: 'Fluxo' },
  wa_template: { icon: FileBadge, label: 'Template' },
  wa_note: { icon: StickyNote, label: 'Nota interna' },
};

// Identidade visual fixa por plataforma de origem do lead (cor segue a
// entidade, nunca o ranking). Ícone + rótulo garantem que a cor nunca é o
// único código. Paleta FB/IG/Meta validada p/ daltonismo; "Orgânico" é o
// slot neutro proposital (não é marca).
const PLATFORM_META: Record<string, {
  label: string; icon: React.ElementType; chip: string; bar: string;
  // text = cor do ícone quando ele aparece solto (legendas); hex = mesma cor
  // para o SVG do gráfico, que não lê classe do Tailwind.
  text: string; hex: string;
}> = {
  facebook: {
    label: 'Facebook',
    icon: Facebook,
    chip: 'bg-[#1877F2] text-white',
    bar: 'bg-[#1877F2]',
    text: 'text-[#1877F2]',
    hex: '#1877F2',
  },
  instagram: {
    label: 'Instagram',
    icon: Instagram,
    chip: 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
    bar: 'bg-[#E1306C]',
    text: 'text-[#E1306C]',
    hex: '#E1306C',
  },
  meta: {
    label: 'Meta (outro)',
    icon: Megaphone,
    chip: 'bg-violet-500 text-white',
    bar: 'bg-violet-500',
    text: 'text-violet-500',
    hex: '#8b5cf6',
  },
  organic: {
    label: 'Orgânico',
    icon: Globe,
    chip: 'bg-slate-400 text-white dark:bg-zinc-600',
    bar: 'bg-slate-400 dark:bg-zinc-600',
    text: 'text-slate-400',
    hex: '#94a3b8',
  },
};
// Ordem FIXA dos segmentos (nunca reordenar por valor: o gestor compara
// períodos e o segmento não pode "andar" de lugar).
const PLATFORM_ORDER = ['facebook', 'instagram', 'meta', 'organic'] as const;

// Motivos de falha dos avisos automáticos, em linguagem de gente.
const FAIL_REASON_LABELS: Record<string, string> = {
  'sem-opt-in': 'Cliente nunca chamou no WhatsApp (sem opt-in)',
  'cooldown': 'Intervalo anti-spam (aviso recente demais)',
  'sem-template': 'Fora da janela de 24h, sem template aprovado',
  'opt-out': 'Cliente pediu para não receber mensagens',
  'meta-rejeitou': 'A Meta rejeitou o envio',
  'outro': 'Outros motivos',
};
const FAIL_REASON_SHORT: Record<string, string> = {
  'sem-opt-in': 'sem opt-in',
  'cooldown': 'anti-spam',
  'sem-template': 'sem template',
  'opt-out': 'opt-out',
  'meta-rejeitou': 'rejeitado',
  'outro': 'outro',
};

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-zinc-300">{label}</span>
        <span className="font-bold tabular-nums text-gray-800 dark:text-zinc-100">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

export function ChatbotDashboard() {
  const [period, setPeriod] = useState<7 | 30 | 90>(7);
  const [data, setData] = useState<ChatbotAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getChatbotAnalytics(period)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e?.message ?? 'Erro ao carregar.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [period]);

  const intentMax = useMemo(
    () => Math.max(1, ...Object.values(data?.bot.intents ?? {})),
    [data],
  );

  const closeMax = useMemo(
    () => Math.max(1, ...Object.values(data?.closeCategories ?? {})),
    [data],
  );

  return (
    <div className="mx-auto max-w-8xl px-3 pb-12 md:px-6">
      <div className="mb-6 flex items-center justify-between border-t border-gray-200 pt-8 dark:border-zinc-800">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-gray-900 dark:text-zinc-100">
            <Bot className="h-6 w-6 text-emerald-500" /> Desempenho do Chatbot
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Como a IA está triando os clientes — qualificações, dúvidas, erros e tempo de atendimento.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 p-1 dark:border-zinc-700">
          {([7, 30, 90] as const).map((p) => (
            <Button key={p} size="sm" variant={period === p ? 'default' : 'ghost'} onClick={() => setPeriod(p)} className="h-7 px-3 text-xs">{p} dias</Button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/10">{error}</div>
      ) : loading || !data ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          {/* Métricas principais */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Metric icon={BadgeCheck} tone="emerald" label="Qualificados" value={data.bot.qualify} />
            <Metric icon={XCircle} tone="rose" label="Não qualificados" value={data.bot.disqualify} />
            <Metric icon={Headset} tone="blue" label="Transferidos" value={data.bot.handoff} hint="para atendente" />
            <Metric icon={HelpCircle} tone="amber" label="Dúvidas" value={data.bot.doubts} />
            <Metric icon={AlertTriangle} tone="rose" label="Erros da IA" value={data.bot.error} />
            <Metric icon={Activity} tone="slate" label="Decisões" value={data.bot.totalDecisions} hint="mensagens tratadas" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric icon={Brain} tone="violet" label="% de entendimento" value={`${data.bot.understoodRate}%`} hint="mensagens compreendidas" />
            <Metric icon={BadgeCheck} tone="emerald" label="Taxa de acerto" value={`${data.bot.successRate}%`} hint="decisões sem erro" />
            <Metric icon={Brain} tone="blue" label="Confiança média" value={`${data.bot.avgConfidence}%`} />
            <Metric icon={Timer} tone="amber" label="Tempo médio p/ qualificar" value={data.bot.avgQualifyMinutes != null ? `${data.bot.avgQualifyMinutes} min` : '—'} />
          </div>

          {/* Gasto com a API do Claude (janelas fixas: semana e mês) */}
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric
              icon={DollarSign} tone="emerald" label="Gasto na semana (API Claude)"
              value={`US$ ${data.cost.weekUSD.toFixed(2)}`}
              hint={`${data.cost.weekTokens.toLocaleString('pt-BR')} tokens · últimos 7 dias`}
            />
            <Metric
              icon={DollarSign} tone="blue" label="Gasto no mês (API Claude)"
              value={`US$ ${data.cost.monthUSD.toFixed(2)}`}
              hint={`${data.cost.monthTokens.toLocaleString('pt-BR')} tokens · últimos 30 dias`}
            />
            <Metric
              icon={Bot} tone="slate" label="Modelo da IA"
              value={data.cost.model ? data.cost.model.replace('claude-', '') : '—'}
              hint="preço por token varia por modelo"
            />
            <Metric
              icon={Activity} tone="violet" label="Custo médio por decisão"
              value={data.bot.totalDecisions + data.bot.error > 0 && data.cost.monthUSD > 0
                ? `US$ ${(data.cost.monthUSD / Math.max(1, data.bot.totalDecisions + data.bot.error)).toFixed(3)}`
                : '—'}
              hint="mês ÷ decisões do período"
            />
          </div>

          {/* Origem dos leads: de qual anúncio/plataforma cada lead veio */}
          <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
              <div className="rounded-2xl border-2 border-emerald-300 px-5 py-2 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-3xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">{data.adOrigins.totalNewContacts}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600/70 dark:text-emerald-400/70">novos leads · {period} dias</p>
              </div>
            </div>

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
                        return (
                          <div className="py-1.5" title={ad.sourceUrl ?? undefined}>
                            <div className="mb-1 flex items-baseline gap-2">
                              <span className="w-5 shrink-0 text-[10px] font-bold text-gray-300 dark:text-zinc-600">{rank}º</span>
                              <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-zinc-200">
                                {ad.adName ?? ad.headline ?? (ad.sourceId ? `Anúncio ${ad.sourceId}` : 'Anúncio sem título')}
                                {/* Sem nome da campanha, o id curto diferencia anúncios de headline igual. */}
                                {!ad.adName && ad.sourceId && (
                                  <span className="ml-1.5 text-[10px] tabular-nums text-gray-400">…{ad.sourceId.slice(-6)}</span>
                                )}
                              </span>
                              <PlatLegend entries={entries} />
                              <span className="w-9 shrink-0 text-right text-sm font-bold tabular-nums text-gray-900 dark:text-zinc-100">{ad.count}</span>
                              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-gray-400">{pct}%</span>
                            </div>
                            <div className="ml-7">
                              <StackedBar entries={entries} share={ad.count / total} />
                            </div>
                          </div>
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
          </section>

          {/* Saúde da conta WhatsApp: avisos oficiais da Meta (webhook) */}
          <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-1 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Saúde da conta WhatsApp
            </h2>
            <p className="mb-4 text-xs text-gray-400">
              Avisos oficiais da Meta: violações de política, restrições, qualidade do número e status de templates.
            </p>
            {data.accountEvents.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Nenhum aviso da Meta no período — conta em dia.
              </div>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {data.accountEvents.map((e) => {
                  const sev = EVENT_SEVERITY_META[e.severity] ?? EVENT_SEVERITY_META.info;
                  const Icon = sev.icon;
                  return (
                    <li key={e.id} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 dark:border-zinc-800">
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${sev.circle}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {EVENT_FIELD_LABELS[e.field] ?? e.field}
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{sev.label}</span>
                        </div>
                        <p className="break-words text-sm text-gray-700 dark:text-zinc-200">{e.message}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {formatDistanceToNow(new Date(e.at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Desempenho do atendimento humano */}
          {data.team.attendants.length > 0 && (
            <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-1 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                <Users className="h-4 w-4 text-emerald-500" /> Desempenho da equipe
              </h2>
              <p className="mb-4 text-xs text-gray-400">
                Conversas assumidas, encerradas, mensagens enviadas e tempo médio até a primeira resposta após assumir.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400 dark:border-zinc-800">
                      <th className="pb-2 pr-4 font-semibold">Atendente</th>
                      <th className="pb-2 pr-4 font-semibold">Assumidas</th>
                      <th className="pb-2 pr-4 font-semibold">Encerradas</th>
                      <th className="pb-2 pr-4 font-semibold">Mensagens</th>
                      <th className="pb-2 font-semibold">1ª resposta (média)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.team.attendants.map((a) => (
                      <tr key={a.name} className="border-b border-gray-50 last:border-0 dark:border-zinc-800/50">
                        <td className="py-2 pr-4 font-semibold text-gray-800 dark:text-zinc-100">{a.name}</td>
                        <td className="py-2 pr-4 tabular-nums text-gray-600 dark:text-zinc-300">{a.assumed}</td>
                        <td className="py-2 pr-4 tabular-nums text-gray-600 dark:text-zinc-300">{a.closed}</td>
                        <td className="py-2 pr-4 tabular-nums text-gray-600 dark:text-zinc-300">{a.messages}</td>
                        <td className="py-2 tabular-nums text-gray-600 dark:text-zinc-300">
                          {a.avgFirstResponseMin != null ? `${a.avgFirstResponseMin} min` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-6">
            {/* Intenções */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-3">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                <MessageSquare className="h-4 w-4 text-emerald-500" /> Intenções detectadas
              </h2>
              {Object.keys(data.bot.intents).length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Sem dados no período.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(data.bot.intents)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, value]) => (
                      <Bar key={label} label={label} value={value} max={intentMax} color="bg-gradient-to-r from-emerald-500 to-teal-600" />
                    ))}
                </div>
              )}
            </section>

            {/* Como os assuntos foram encerrados (categorias) */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-3">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                <BadgeCheck className="h-4 w-4 text-blue-500" /> Encerramentos por categoria
              </h2>
              {Object.keys(data.closeCategories).length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Sem encerramentos no período.</p>
              ) : (
                <>
                  {/* Não qualificados (por motivo) em rosa; churn pós-contrato em âmbar. */}
                  <div className="space-y-3">
                    {Object.entries(data.closeCategories)
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, value]) => (
                        <Bar
                          key={key}
                          label={CLOSE_CATEGORY_LABELS[key] ?? key}
                          value={value}
                          max={closeMax}
                          color={
                            NON_QUALIFIED_CATEGORIES.includes(key)
                              ? 'bg-gradient-to-r from-rose-500 to-red-600'
                              : key === 'contratado_perdido'
                                ? 'bg-gradient-to-r from-amber-500 to-orange-600'
                                : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                          }
                        />
                      ))}
                  </div>
                  {(() => {
                    const nqTotal = NON_QUALIFIED_CATEGORIES.reduce((s, k) => s + (data.closeCategories[k] ?? 0), 0);
                    const churn = data.closeCategories['contratado_perdido'] ?? 0;
                    if (!nqTotal && !churn) return null;
                    return (
                      <p className="mt-4 border-t border-gray-100 pt-3 text-xs font-semibold text-gray-500 dark:border-zinc-800 dark:text-zinc-400">
                        <span className="text-rose-600 dark:text-rose-400">Não qualificados (todos os motivos): {nqTotal}</span>
                        {churn > 0 && (
                          <span className="ml-3 text-amber-600 dark:text-amber-400">Contratados e perdidos: {churn}</span>
                        )}
                      </p>
                    );
                  })()}
                </>
              )}
            </section>

            {/* Avisos automáticos ao cliente: entregas × falhas (auditoria) */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-3">
              <h2 className="mb-1 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                <Send className="h-4 w-4 text-blue-500" /> Avisos automáticos ao cliente
              </h2>
              <p className="mb-4 text-xs text-gray-400">
                Mensagens de progresso e automações do kanban — o que foi entregue e o que falhou (e por quê).
              </p>

              {data.autoNotify.sent + data.autoNotify.failed === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Nenhum aviso automático disparado no período.</p>
              ) : (
                <>
                  {/* Resumo: entregues × não entregues × taxa */}
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl border-2 border-emerald-300 p-3 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
                      <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
                      <p className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">{data.autoNotify.sent}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600/70 dark:text-emerald-400/70">entregues</p>
                    </div>
                    <div className="rounded-xl border-2 border-rose-300 p-3 text-center dark:border-rose-800 dark:bg-rose-950/30">
                      <XCircle className="mx-auto mb-1 h-4 w-4 text-rose-500" />
                      <p className="text-2xl font-extrabold tabular-nums text-rose-700 dark:text-rose-300">{data.autoNotify.failed}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600/70 dark:text-rose-400/70">não entregues</p>
                    </div>
                    <div className="rounded-xl border-2 border-blue-300 p-3 text-center dark:border-blue-800 dark:bg-blue-950/30">
                      <Activity className="mx-auto mb-1 h-4 w-4 text-blue-500" />
                      <p className="text-2xl font-extrabold tabular-nums text-blue-700 dark:text-blue-300">
                        {Math.round((data.autoNotify.sent / Math.max(1, data.autoNotify.sent + data.autoNotify.failed)) * 100)}%
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600/70 dark:text-blue-400/70">taxa de entrega</p>
                    </div>
                  </div>

                  {data.autoNotify.silenceAlerts > 0 && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                      <BellRing className="h-3.5 w-3.5 shrink-0" />
                      {data.autoNotify.silenceAlerts} {data.autoNotify.silenceAlerts === 1 ? 'cliente recebeu' : 'clientes receberam'} vários avisos seguidos sem responder nenhum — vale tentar outro canal.
                    </div>
                  )}

                  {/* Por que as mensagens não saíram */}
                  {data.autoNotify.failed > 0 && (
                    <div className="mb-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Motivos das falhas</p>
                      {Object.entries(data.autoNotify.byReason)
                        .sort((a, b) => b[1] - a[1])
                        .map(([reason, count]) => (
                          <Bar
                            key={reason}
                            label={FAIL_REASON_LABELS[reason] ?? reason}
                            value={count}
                            max={Math.max(1, ...Object.values(data.autoNotify.byReason))}
                            color="bg-gradient-to-r from-rose-400 to-rose-600"
                          />
                        ))}
                    </div>
                  )}

                  {/* Falhas recentes, uma a uma */}
                  {data.autoNotify.failures.length > 0 && (
                    <>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Falhas recentes</p>
                      <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                        {data.autoNotify.failures.map((f) => (
                          <li key={f.id} className="flex items-start gap-2.5 rounded-xl border border-rose-100 bg-rose-50/40 p-2.5 dark:border-rose-900/30 dark:bg-rose-950/20">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-semibold text-gray-800 dark:text-zinc-100">{f.contactName ?? 'Contato sem nome'}</span>
                                <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-900/40 dark:text-rose-300">
                                  {FAIL_REASON_SHORT[f.reason] ?? f.reason}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] text-gray-400">
                                {f.source === 'progress' ? 'aviso de progresso' : 'automação'} · card movido por {f.authorName} ·{' '}
                                {formatDistanceToNow(new Date(f.at), { addSuffix: true, locale: ptBR })}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {data.autoNotify.failed === 0 && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Todos os avisos automáticos do período foram entregues.
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-3">
              <h2 className="mb-1 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                <Activity className="h-4 w-4 text-violet-500" /> Atividade da equipe no atendimento
              </h2>
              <p className="mb-4 text-xs text-gray-400">Quem atribuiu, encerrou e enviou documentos, fluxos e mensagens.</p>
              {data.activity.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Nenhuma ação registrada no período.</p>
              ) : (
                <ul className="max-h-[26rem] space-y-1 overflow-y-auto pr-1">
                  {data.activity.map((a) => {
                    const meta = ACTION_META[a.action] ?? { icon: Activity, label: a.action };
                    const Icon = meta.icon;
                    return (
                      <li key={a.id} className="flex items-start gap-3 rounded-xl p-2 hover:bg-gray-50 dark:hover:bg-zinc-800/60">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-700 dark:text-zinc-200">
                            <span className="font-semibold">{a.authorName}</span> {a.message}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {formatDistanceToNow(new Date(a.at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
      <SystemMap />
    </div>
  );
}
