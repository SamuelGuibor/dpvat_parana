'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, AlertTriangle, Facebook, Instagram, Megaphone } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { getBotconversaAdsData, type BotconversaAdsData, type CampaignInsight } from '@/app/_actions/botconversa';
import { brDayKey } from '@/app/_shared/utils/date-br';

// Sub-bloco da "Origem dos leads": campanhas da Meta (investimento e conversas
// iniciadas) separadas entre o bot da IA e o BotConversa, + leads/dia e
// qualificação do BotConversa vindos do webhook (/api/botconversa/contratado).
// A hierarquia campanha → conjunto → anúncio espelha o "Quais anúncios
// trouxeram leads" logo acima — aqui com os números da própria Meta.

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Cores por rede do breakdown publisher_platform (mesma identidade do bloco
// de referral acima; whatsapp = anúncio visto dentro do próprio WhatsApp).
const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; bar: string; text: string }> = {
  facebook: { label: 'Facebook', icon: Facebook, bar: 'bg-[#1877F2]', text: 'text-[#1877F2]' },
  instagram: { label: 'Instagram', icon: Instagram, bar: 'bg-[#E1306C]', text: 'text-[#E1306C]' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, bar: 'bg-[#25D366]', text: 'text-[#25D366]' },
  outro: { label: 'Outra rede', icon: Megaphone, bar: 'bg-violet-500', text: 'text-violet-500' },
};
const platMeta = (p: string) => PLATFORM_META[p] ?? PLATFORM_META.outro;

function CampaignGroup({ title, icon: Icon, accent, campaigns }: {
  title: string;
  icon: React.ElementType;
  accent: string;
  campaigns: CampaignInsight[];
}) {
  const totalConv = campaigns.reduce((s, c) => s + c.conversations, 0);
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);

  // Ranking dos anúncios do grupo inteiro (1º, 2º...), como no bloco de
  // referral: a posição segue o total de conversas, a exibição segue a
  // hierarquia campanha → conjunto.
  const rankOf = new Map<string, number>();
  campaigns
    .flatMap((c) => c.adsets.flatMap((s) => s.ads.map((a) => ({ key: `${c.id}|${s.name}|${a.id}`, n: a.conversations }))))
    .sort((a, b) => b.n - a.n)
    .forEach((e, i) => rankOf.set(e.key, i + 1));

  return (
    <div className="min-w-0 rounded-2xl border border-gray-100 p-4 dark:border-zinc-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-gray-800 dark:text-zinc-100">
          <Icon className={`h-4 w-4 ${accent}`} /> {title}
        </p>
        <p className="text-[11px] font-semibold tabular-nums text-gray-400">
          {totalConv.toLocaleString('pt-BR')} conversas · {brl(totalSpend)}
        </p>
      </div>

      {campaigns.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-400">Nenhuma campanha com dados no período.</p>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <div key={c.id}>
              {/* Campanha */}
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-extrabold text-gray-900 dark:text-zinc-100">{c.name}</p>
                <p className="text-xs tabular-nums text-gray-400">
                  <span className="font-bold text-gray-700 dark:text-zinc-200">{c.conversations.toLocaleString('pt-BR')} leads</span>
                  {c.costPerConversation !== null && ` · ${brl(c.costPerConversation)}/lead`}
                  {' · '}{brl(c.spend)}
                </p>
              </div>

              {c.adsets.map((s) => (
                <div key={s.name} className="mb-2 ml-1 border-l-2 border-gray-100 pl-3 dark:border-zinc-800">
                  {/* Conjunto */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 py-0.5">
                    <p className="text-xs font-bold text-gray-500 dark:text-zinc-400">{s.name}</p>
                    <p className="text-[11px] tabular-nums text-gray-400">
                      <span className="font-bold text-gray-600 dark:text-zinc-300">{s.conversations.toLocaleString('pt-BR')}</span>
                      {' · '}{brl(s.spend)}
                    </p>
                  </div>

                  {/* Anúncios do conjunto, ranqueados no grupo */}
                  {s.ads.map((a) => {
                    const share = totalConv ? a.conversations / totalConv : 0;
                    const plats = Object.entries(a.platforms).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
                    const sum = plats.reduce((acc, [, n]) => acc + n, 0) || 1;
                    return (
                      <div key={a.id} className="py-1">
                        <div className="mb-0.5 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="w-7 shrink-0 text-[10px] font-bold tabular-nums text-gray-400">
                              {rankOf.get(`${c.id}|${s.name}|${a.id}`)}º
                            </span>
                            <span className="truncate text-sm text-gray-700 dark:text-zinc-200">{a.name}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2.5 text-[11px] font-semibold tabular-nums">
                            {plats.map(([plat, n]) => {
                              const pm = platMeta(plat);
                              const PIcon = pm.icon;
                              return (
                                <span key={plat} title={`${pm.label}: ${n}`} className="flex items-center gap-1 text-gray-600 dark:text-zinc-300">
                                  <PIcon className={`h-3 w-3 ${pm.text}`} />
                                  {n}
                                </span>
                              );
                            })}
                            <span className="text-sm font-bold text-gray-800 dark:text-zinc-100">{a.conversations.toLocaleString('pt-BR')}</span>
                            <span className="w-9 text-right text-gray-400">{Math.round(share * 100)}%</span>
                          </span>
                        </div>
                        {/* Barra: largura = fatia do anúncio no grupo; segmentos = redes */}
                        <div className="ml-7 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                          <div className="flex h-full gap-px" style={{ width: `${Math.max(share * 100, 1.5)}%` }}>
                            {plats.length ? plats.map(([plat, n]) => (
                              <div
                                key={plat}
                                className={`h-full ${platMeta(plat).bar}`}
                                style={{ width: `${(n / sum) * 100}%` }}
                                title={`${platMeta(plat).label}: ${n}`}
                              />
                            )) : <div className="h-full w-full bg-gray-300 dark:bg-zinc-600" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Últimos N dias terminando hoje, como chaves "YYYY-MM-DD" de Brasília. */
function lastNDays(n: number): { since: string; until: string } {
  return {
    since: brDayKey(new Date(Date.now() - (n - 1) * 86_400_000)),
    until: brDayKey(new Date()),
  };
}

export function BotconversaOrigin({ period }: { period: number }) {
  const [data, setData] = useState<BotconversaAdsData | null>(null);
  const [error, setError] = useState(false);
  // Período próprio do bloco: nasce acompanhando o filtro do dashboard, mas
  // aceita qualquer intervalo (atalhos, "últimos N dias" ou datas livres).
  const [range, setRange] = useState(() => lastNDays(period));
  const [daysInput, setDaysInput] = useState('');

  // Trocar o 7/30/90 do dashboard re-ancora o bloco no mesmo período.
  useEffect(() => { setRange(lastNDays(period)); setDaysInput(''); }, [period]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    getBotconversaAdsData(range.since, range.until)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [range]);

  const todayKey = brDayKey(new Date());
  const monthRange = { since: `${todayKey.slice(0, 8)}01`, until: todayKey };
  const rangeDays = Math.round(
    (new Date(`${range.until}T12:00:00Z`).getTime() - new Date(`${range.since}T12:00:00Z`).getTime()) / 86_400_000,
  ) + 1;
  const isRange = (r: { since: string; until: string }) => r.since === range.since && r.until === range.until;

  const applyDaysInput = () => {
    const n = Math.round(Number(daysInput));
    if (Number.isFinite(n) && n >= 1 && n <= 366) setRange(lastNDays(n));
  };

  const chip = (active: boolean) =>
    `px-2.5 py-1.5 text-xs font-semibold transition-colors ${
      active ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-zinc-900 dark:text-zinc-300'
    }`;

  return (
    <div className="mt-6 border-t border-gray-100 pt-5 dark:border-zinc-800">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Campanhas da Meta · investimento e conversas</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Dados do Gerenciador de Anúncios (conta Paraná DPVAT) ·{' '}
            <span className="font-semibold text-gray-500 dark:text-zinc-300">
              {range.since.split('-').reverse().slice(0, 2).join('/')} – {range.until.split('-').reverse().slice(0, 2).join('/')} · {rangeDays} {rangeDays === 1 ? 'dia' : 'dias'}
            </span>
          </p>
        </div>

        {/* Período próprio do bloco: atalhos + N dias + datas livres */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-700">
            {([7, 30, 90] as const).map((n) => (
              <button key={n} onClick={() => { setRange(lastNDays(n)); setDaysInput(''); }} className={chip(isRange(lastNDays(n)))}>
                {n}d
              </button>
            ))}
            <button onClick={() => { setRange(monthRange); setDaysInput(''); }} className={chip(isRange(monthRange))}>
              Mês
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 px-2 py-1 dark:border-zinc-700">
            <input
              type="number"
              min={1}
              max={366}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              onBlur={applyDaysInput}
              onKeyDown={(e) => { if (e.key === 'Enter') applyDaysInput(); }}
              placeholder="N"
              className="w-12 bg-transparent text-center text-xs font-semibold text-gray-700 outline-none dark:text-zinc-200"
            />
            <span className="text-[11px] text-gray-400">dias</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 px-2 py-1 text-xs dark:border-zinc-700">
            <input
              type="date"
              value={range.since}
              max={range.until}
              onChange={(e) => { if (e.target.value) { setRange((r) => ({ ...r, since: e.target.value })); setDaysInput(''); } }}
              className="bg-transparent text-gray-700 outline-none dark:text-zinc-200"
            />
            <span className="text-gray-400">–</span>
            <input
              type="date"
              value={range.until}
              min={range.since}
              max={todayKey}
              onChange={(e) => { if (e.target.value) { setRange((r) => ({ ...r, until: e.target.value })); setDaysInput(''); } }}
              className="bg-transparent text-gray-700 outline-none dark:text-zinc-200"
            />
          </div>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">Não foi possível carregar os dados do BotConversa.</p>
      ) : !data ? (
        <div className="grid h-32 place-items-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          {!data.accountConfigured ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Configure <code className="rounded bg-amber-100 px-1 font-mono text-[12px] dark:bg-amber-900/40">META_ADS_ACCOUNT_BOTCONVERSA</code>{' '}
                e <code className="rounded bg-amber-100 px-1 font-mono text-[12px] dark:bg-amber-900/40">META_ADS_TOKEN_BOTCONVERSA</code> no ambiente.
              </span>
            </div>
          ) : data.iaCampaigns === null ? (
            <p className="mb-4 text-sm text-gray-400">
              Não consegui consultar a Marketing API — confira o acesso do usuário do sistema à conta de anúncios.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <CampaignGroup title="BotConversa" icon={MessageCircle} accent="text-sky-500" campaigns={data.botconversaCampaigns ?? []} />
            </div>
          )}

          {/* Leads por dia do BotConversa (webhook) — espelho do gráfico geral. */}
          {data.daily.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                Leads por dia · BotConversa
                <span className="ml-2 font-semibold normal-case tracking-normal text-gray-400">
                  média de {(Math.round((data.totalLeads / data.daily.length) * 10) / 10).toLocaleString('pt-BR')}/dia
                </span>
              </p>
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.daily} margin={{ top: 5, right: 5, left: -26, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bcOriginLeads" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.max(0, Math.floor(data.daily.length / 7) - 1)}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }}
                      formatter={(v: number) => [`${v} ${v === 1 ? 'lead' : 'leads'}`, 'BotConversa']}
                    />
                    <Area type="monotone" dataKey="total" stroke="#0ea5e9" strokeWidth={2} fill="url(#bcOriginLeads)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
