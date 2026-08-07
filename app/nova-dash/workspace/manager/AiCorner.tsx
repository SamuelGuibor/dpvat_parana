'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, Bot, Brain, FileText, Headset, HelpCircle, IdCard,
  Loader2, MessageSquare, ScrollText, ShieldCheck, Sparkles, Timer,
} from 'lucide-react';
import { getAiCorner, type AiCorner as AiCornerData, type AiOperation } from '@/app/_actions/analytics/get-ai-corner';

/** Qualidade do bot no período do dashboard — vem do ChatbotDashboard. */
export interface AiQuality {
  doubts: number;
  errors: number;
  decisions: number;
  handoff: number;
  understoodRate: number;
  successRate: number;
  qualifyTime: string;
  periodDays: number;
}

// Canto da IA: quanto a inteligência artificial custou, por operação.
//
// Duas janelas SEMPRE visíveis (mês corrente e últimos 30 dias) porque elas
// divergem: o console da Anthropic mostra o mês corrente, e o painel antigo
// chamava de "mês" os últimos 30 dias corridos — era metade da confusão.

const ICONS: Record<string, React.ElementType> = {
  bot: Bot,
  message: MessageSquare,
  file: FileText,
  id: IdCard,
  shield: ShieldCheck,
  scroll: ScrollText,
  sparkles: Sparkles,
};

const BAR_COLORS = ['bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-rose-500', 'bg-teal-500'];

function usd(v: number, digits = 2) {
  return `US$ ${v.toFixed(digits)}`;
}

function tokens(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)} k`;
  return String(v);
}

/** Número grande do cabeçalho executivo. */
function BigStat({
  label, value, hint, tone = 'default',
}: { label: string; value: string; hint?: string; tone?: 'default' | 'accent' | 'warning' }) {
  const color = tone === 'accent'
    ? 'text-violet-600 dark:text-violet-400'
    : tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-900 dark:text-zinc-100';
  return (
    <div className="min-w-[9rem] flex-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-extrabold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

/** Uma linha do extrato. */
function OperationRow({ op, share, color }: { op: AiOperation; share: number; color: string }) {
  const Icon = ICONS[op.icon] ?? Sparkles;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-zinc-800 md:grid-cols-[minmax(0,1.6fr)_7rem_5rem_6rem_6rem]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">{op.label}</span>
        {op.estimated && (
          <span title="Algum modelo está fora da tabela de preços — custo estimado" className="shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
      </div>

      <div className="hidden text-xs text-gray-500 md:block">
        {op.models.length ? op.models.join(', ') : '—'}
      </div>
      <div className="hidden text-right text-xs tabular-nums text-gray-500 md:block">
        {op.runs.toLocaleString('pt-BR')}
      </div>
      <div className="hidden text-right text-xs tabular-nums text-gray-500 md:block">
        {tokens(op.tokens)}
      </div>

      <div className="text-right">
        <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-zinc-100">
          {usd(op.usd, op.usd < 1 ? 3 : 2)}
        </p>
        <p className="text-[10px] tabular-nums text-gray-400">{share.toFixed(1).replace('.', ',')}%</p>
      </div>

      <div className="col-span-2 md:col-span-5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(share, 0.5)}%` }} />
        </div>
        {/* No celular as colunas viram esta linha de apoio. */}
        <p className="mt-1 text-[10px] text-gray-400 md:hidden">
          {op.runs.toLocaleString('pt-BR')} execuções · {tokens(op.tokens)} tokens
          {op.models.length ? ` · ${op.models.join(', ')}` : ''}
        </p>
      </div>
    </div>
  );
}

export function AiCorner({ quality }: { quality?: AiQuality }) {
  const [data, setData] = useState<AiCornerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'month' | 'last30'>('month');

  useEffect(() => {
    let alive = true;
    getAiCorner()
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Falha ao carregar o Canto da IA.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const win = data ? (scope === 'month' ? data.month : data.last30) : null;

  const peak = useMemo(
    () => (data?.daily.length ? Math.max(...data.daily.map((d) => d.usd), 0.0001) : 1),
    [data],
  );

  if (loading) {
    return (
      <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </section>
    );
  }
  if (error || !data || !win) {
    return (
      <section className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-600 dark:border-rose-900/40 dark:bg-rose-900/10">
        {error ?? 'Sem dados de consumo.'}
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* ── Executivo ── */}
      <div className="border-b border-gray-100 p-5 dark:border-zinc-800 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-base font-extrabold text-gray-900 dark:text-zinc-100">Canto da IA</h3>
            <p className="text-[11px] text-gray-400">consumo da inteligência artificial, operação por operação</p>
          </div>
        </div>

        {/* As duas janelas lado a lado — sem seletor escondendo nada. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            { key: 'month' as const, w: data.month, extra: `projeção de fechamento: ${usd(data.monthProjectionUSD)}` },
            { key: 'last30' as const, w: data.last30, extra: 'janela corrida — o que o painel antigo chamava de "mês"' },
          ]).map(({ key, w, extra }) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              className={`rounded-xl border p-4 text-left transition-all ${
                scope === key
                  ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                  : 'border-gray-200 hover:border-violet-300 dark:border-zinc-800'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{w.label}</p>
              <p className="mt-0.5 text-3xl font-extrabold tabular-nums text-gray-900 dark:text-zinc-100">{usd(w.usd)}</p>
              <p className="text-[11px] text-gray-400">
                {w.runs.toLocaleString('pt-BR')} chamadas · {tokens(w.tokens)} tokens
              </p>
              <p className="mt-1 text-[11px] text-violet-600 dark:text-violet-400">{extra}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-gray-100 pt-4 dark:border-zinc-800">
          <BigStat label="Hoje" value={usd(data.today.usd)} hint={`${data.today.runs} chamadas`} />
          <BigStat
            label="Custo por decisão do bot"
            value={data.costPerBotDecision != null ? usd(data.costPerBotDecision, 4) : '—'}
            hint="mês corrente ÷ decisões"
            tone="accent"
          />
          <BigStat
            label="Operações medidas"
            value={String(win.operations.length)}
            hint="tudo que grava consumo entra sozinho"
          />
        </div>

        {/* Gasto por dia no mês */}
        {data.daily.length > 1 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              gasto por dia · mês corrente
            </p>
            <div className="flex h-16 items-end gap-1">
              {data.daily.map((d) => (
                <div key={d.date} className="group relative flex-1" title={`${d.label}: ${usd(d.usd)}`}>
                  <div
                    className="w-full rounded-t bg-violet-400 transition-colors group-hover:bg-violet-600 dark:bg-violet-600"
                    style={{ height: `${Math.max((d.usd / peak) * 100, 2)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>{data.daily[0]?.label}</span>
              <span>{data.daily[data.daily.length - 1]?.label}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Extrato ── */}
      <div className="hidden grid-cols-[minmax(0,1.6fr)_7rem_5rem_6rem_6rem] gap-4 border-b border-gray-200 bg-gray-50/80 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:border-zinc-800 dark:bg-zinc-800/50 md:grid">
        <span>operação</span>
        <span>modelo</span>
        <span className="text-right">execuções</span>
        <span className="text-right">tokens</span>
        <span className="text-right">custo</span>
      </div>

      {win.operations.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-400">
          Nenhuma chamada de IA registrada nesta janela.
        </p>
      ) : (
        win.operations.map((op, i) => (
          <OperationRow
            key={op.action}
            op={op}
            share={win.usd > 0 ? (op.usd / win.usd) * 100 : 0}
            color={BAR_COLORS[i % BAR_COLORS.length]}
          />
        ))
      )}

      {/* ── Qualidade do bot (período do dashboard) ── */}
      {quality && (
        <div className="border-t border-gray-100 bg-gray-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-800/30 md:px-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
            qualidade do bot · últimos {quality.periodDays} dias
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-7">
            <QualityStat icon={Brain} tone="text-violet-600 dark:text-violet-400" value={`${quality.understoodRate}%`} label="entendimento" />
            <QualityStat icon={BadgeCheck} tone="text-emerald-600 dark:text-emerald-400" value={`${quality.successRate}%`} label="sem erro" />
            <QualityStat icon={Timer} tone="text-amber-600 dark:text-amber-400" value={quality.qualifyTime} label="até qualificar" hint="mediana" />
            <QualityStat icon={Sparkles} tone="text-gray-700 dark:text-zinc-200" value={quality.decisions.toLocaleString('pt-BR')} label="decisões" />
            <QualityStat icon={HelpCircle} tone="text-sky-600 dark:text-sky-400" value={String(quality.doubts)} label="dúvidas" />
            <QualityStat icon={Headset} tone="text-blue-600 dark:text-blue-400" value={String(quality.handoff)} label="transferidos" />
            <QualityStat icon={AlertTriangle} tone="text-rose-600 dark:text-rose-400" value={String(quality.errors)} label="erros da IA" />
          </div>
        </div>
      )}
    </section>
  );
}

/** Número compacto da faixa de qualidade. */
function QualityStat({
  icon: Icon, tone, value, label, hint,
}: { icon: React.ElementType; tone: string; value: string; label: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xl font-extrabold tabular-nums">{value}</span>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-zinc-400">
        {label}{hint && <span className="text-gray-400"> · {hint}</span>}
      </p>
    </div>
  );
}
