'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, AlertTriangle, Undo2, Trash2, Timer, Clock, ArrowRight, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/_shared/ui/card';
import { Button } from '@/app/_shared/ui/button';
import {
  getKanbanFlowAnalytics,
  type KanbanFlowAnalytics,
  type ColumnDestinations,
} from '@/app/_actions/analytics/get-funnel-analytics';
import type { DateRange } from './DateFilter';

// Aba "Fluxo do Kanban" (11-12/08/2026) — segue à risca as 5 métricas pedidas:
// 1. Tempo médio por coluna   2. Para onde os cards vão   3. Retorno/retrabalho
// 4. Descarte (Nikolas Analisar)   5. Tempo total no board.
// Uma seção numerada por métrica, sempre em tabela — nada de chips espalhados.

function fmtDays(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1) return `${Math.max(1, Math.round(n * 24))} h`;
  return `${n} dias`;
}

/** Cabeçalho padrão das seções: número + título + explicação de uma linha. */
function SectionHeader({ num, title, desc, icon: Icon, tone }: {
  num: number; title: string; desc: string; icon: React.ElementType; tone: string;
}) {
  return (
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2.5 text-base">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${tone}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span><span className="mr-1.5 text-gray-400">{num}.</span>{title}</span>
      </CardTitle>
      <CardDescription>{desc}</CardDescription>
    </CardHeader>
  );
}

const th = 'py-2 pr-3 text-[11px] font-bold uppercase tracking-wide text-gray-400';
const td = 'py-2 pr-3 text-sm text-gray-700 dark:text-zinc-200';

/** Barra horizontal de percentual usada nas tabelas. */
function PctBar({ pct, danger }: { pct: number; danger?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
        <span
          className={`block h-2 rounded-full ${danger ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </span>
      <span className={`text-sm font-bold tabular-nums ${danger ? 'text-red-600' : 'text-gray-700 dark:text-zinc-200'}`}>{pct}%</span>
    </span>
  );
}

export function KanbanFlowPanel({ range }: { range: DateRange }) {
  const [data, setData] = useState<KanbanFlowAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getKanbanFlowAnalytics(range.from.toISOString(), range.to.toISOString())
      .then(setData)
      .catch((err) => {
        console.error('[KANBAN FLOW]', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-3 text-sm text-gray-500">
        <p>Não foi possível carregar a análise de fluxo.</p>
        <Button size="sm" variant="outline" onClick={load}>
          <RotateCcw className="mr-1 h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    );
  }
  if (data.totalMoves === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        Nenhuma movimentação de card registrada no período selecionado.
      </p>
    );
  }

  const mapped = data.destinations.filter((c) => c.mapped);
  const unmapped = data.destinations.filter((c) => !c.mapped);
  const offPattern = mapped.flatMap((c) =>
    c.destinations.filter((d) => !d.expected).map((d) => ({ from: c.column, ...d })),
  );

  return (
    <div className="space-y-5">
      {/* ============ 1. Tempo médio por coluna ============ */}
      <Card>
        <SectionHeader
          num={1} icon={Clock} tone="bg-blue-600"
          title="Tempo médio por coluna"
          desc="Quanto tempo um card fica em cada coluna antes de avançar — média, maior e menor tempo, com os cards que mais demoraram."
        />
        <CardContent className="overflow-x-auto pt-0">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-700">
                <th className={th}>Coluna</th>
                <th className={`${th} text-right`}>Saídas</th>
                <th className={`${th} text-right`}>Tempo médio</th>
                <th className={`${th} text-right`}>Maior</th>
                <th className={`${th} text-right`}>Menor</th>
              </tr>
            </thead>
            <tbody>
              {data.dwell.map((c) => (
                <SlowestRow key={c.column} c={c} />
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-400">
            Clique numa linha para ver os cards que mais demoraram naquela coluna.
          </p>
        </CardContent>
      </Card>

      {/* ============ 2. Para onde os cards vão ============ */}
      <Card>
        <SectionHeader
          num={2} icon={ArrowRight} tone="bg-indigo-600"
          title="Para onde os cards vão"
          desc="Destinos de cada coluna, com quantidade e percentual. O que saiu do fluxo esperado aparece primeiro, em destaque."
        />
        <CardContent className="space-y-5 pt-0">
          {/* Fora do padrão SEMPRE separado e no topo — nunca ignorado. */}
          <div className={`rounded-xl border p-4 ${offPattern.length
            ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
            : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'}`}
          >
            <p className={`flex items-center gap-2 text-sm font-bold ${offPattern.length ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
              <AlertTriangle className="h-4 w-4" />
              {offPattern.length
                ? `${offPattern.length} destino(s) fora do fluxo esperado — sinal de algo fora do padrão`
                : 'Nenhum movimento fora do fluxo esperado no período ✓'}
            </p>
            {offPattern.length > 0 && (
              <table className="mt-3 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-red-200 dark:border-red-900">
                    <th className={th}>Saiu de</th>
                    <th className={th}>Foi para</th>
                    <th className={`${th} text-right`}>Cards</th>
                    <th className={th}>% das saídas</th>
                  </tr>
                </thead>
                <tbody>
                  {offPattern.map((d, i) => (
                    <tr key={i} className="border-b border-red-100 last:border-0 dark:border-red-950">
                      <td className={td}>{d.from}</td>
                      <td className={`${td} font-semibold text-red-700 dark:text-red-300`}>{d.to}</td>
                      <td className={`${td} text-right font-bold tabular-nums`}>{d.count}</td>
                      <td className={td}><PctBar pct={d.pct} danger /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Colunas com fluxo mapeado: um bloco por coluna, em tabela. */}
          {mapped.map((c) => (
            <DestinationBlock key={c.column} c={c} />
          ))}

          {/* Demais colunas escondidas num expansor pra não poluir. */}
          {unmapped.length > 0 && (
            <details className="group rounded-xl border border-gray-200 dark:border-zinc-700">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold text-gray-600 dark:text-zinc-300">
                Outras colunas sem fluxo mapeado ({unmapped.length})
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-5 border-t border-gray-100 p-4 dark:border-zinc-800">
                {unmapped.map((c) => (
                  <DestinationBlock key={c.column} c={c} />
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ============ 3. Retorno e retrabalho ============ */}
      <Card>
        <SectionHeader
          num={3} icon={Undo2} tone="bg-amber-500"
          title="Retorno e retrabalho"
          desc="Cards que voltaram para uma coluna onde já tinham passado — e quais colunas mais recebem cards de volta (onde a triagem está falhando)."
        />
        <CardContent className="pt-0">
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="rounded-xl border-2 border-amber-200 px-5 py-3 text-center dark:border-amber-800">
              <p className="text-3xl font-extrabold tabular-nums text-amber-600">{data.rework.totalReturns}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">retornos no período</p>
            </div>
            <div className="rounded-xl border-2 border-gray-200 px-5 py-3 text-center dark:border-zinc-700">
              <p className="text-3xl font-extrabold tabular-nums text-gray-700 dark:text-zinc-200">{data.rework.cardsWithReturn}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">cards que voltaram</p>
            </div>
          </div>

          {data.rework.totalReturns === 0 ? (
            <p className="text-sm text-gray-500">Nenhum card voltou de etapa no período. ✓</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Colunas que mais recebem de volta</p>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-zinc-700">
                      <th className={th}>Coluna</th>
                      <th className={`${th} text-right`}>Retornos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rework.byColumn.map((c) => (
                      <tr key={c.column} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
                        <td className={td}>{c.column}</td>
                        <td className={`${td} text-right font-bold tabular-nums text-amber-600`}>{c.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Quem voltou, de onde → para onde</p>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 dark:border-zinc-800">
                  <table className="w-full border-collapse text-left">
                    <tbody>
                      {data.rework.samples.map((s, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
                          <td className="px-3 py-2 text-sm font-semibold text-gray-700 dark:text-zinc-200">{s.card}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 dark:text-zinc-400">
                            {s.from} <ArrowRight className="inline h-3 w-3" /> {s.backTo}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-400">
            O motivo do retorno (documento faltante, assinatura pendente…) ainda não é registrado ao mover o card —
            quando for, esta seção cruza &quot;de qual coluna saiu → por que voltou&quot;.
          </p>
        </CardContent>
      </Card>

      {/* ============ 4. Descarte ============ */}
      <Card>
        <SectionHeader
          num={4} icon={Trash2} tone="bg-red-600"
          title="Descarte — cards enviados para &quot;Nikolas Analisar&quot;"
          desc="Ranking das colunas pelo PERCENTUAL de cards que saíram dela rumo ao descarte (não volume absoluto)."
        />
        <CardContent className="pt-0">
          {data.discard.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum card foi para a coluna de descarte no período. ✓</p>
          ) : (
            <table className="w-full min-w-[480px] border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 dark:border-zinc-700">
                  <th className={th}>#</th>
                  <th className={th}>Coluna de origem</th>
                  <th className={`${th} text-right`}>Saíram dela</th>
                  <th className={`${th} text-right`}>Descartados</th>
                  <th className={th}>% de descarte</th>
                </tr>
              </thead>
              <tbody>
                {data.discard.map((c, i) => (
                  <tr key={c.column} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
                    <td className={`${td} text-gray-400`}>{i + 1}º</td>
                    <td className={`${td} font-semibold`}>{c.column}</td>
                    <td className={`${td} text-right tabular-nums`}>{c.passed}</td>
                    <td className={`${td} text-right tabular-nums`}>{c.discarded}</td>
                    <td className={td}><PctBar pct={c.pct} danger={c.pct >= 20} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ============ 5. Tempo total no Kanban ============ */}
      <Card>
        <SectionHeader
          num={5} icon={Timer} tone="bg-emerald-600"
          title="Tempo total no Kanban"
          desc="Do primeiro ao último movimento do card no período — média geral, os 10 mais lentos e os 10 mais rápidos."
        />
        <CardContent className="pt-0">
          <div className="mb-4 inline-block rounded-xl border-2 border-emerald-200 px-6 py-3 text-center dark:border-emerald-800">
            <p className="text-3xl font-extrabold tabular-nums text-emerald-600">{fmtDays(data.totalTime.avgDays)}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              tempo médio ({data.totalTime.count} cards)
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <RankTable title="Os 10 mais lentos" rows={data.totalTime.slowest} valueClass="text-red-600" />
            <RankTable title="Os 10 mais rápidos" rows={data.totalTime.fastest} valueClass="text-emerald-600" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Linha da tabela de tempo por coluna, expansível pros cards mais lentos. */
function SlowestRow({ c }: { c: KanbanFlowAnalytics['dwell'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
      >
        <td className={`${td} font-semibold`}>
          <ChevronDown className={`mr-1.5 inline h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          {c.column}
        </td>
        <td className={`${td} text-right tabular-nums`}>{c.n}</td>
        <td className={`${td} text-right font-bold tabular-nums text-blue-600`}>{fmtDays(c.avgDays)}</td>
        <td className={`${td} text-right tabular-nums text-red-600`}>{fmtDays(c.maxDays)}</td>
        <td className={`${td} text-right tabular-nums text-emerald-600`}>{fmtDays(c.minDays)}</td>
      </tr>
      {open && (
        <tr className="border-b border-gray-100 bg-gray-50/60 dark:border-zinc-800 dark:bg-zinc-800/40">
          <td colSpan={5} className="px-4 py-2">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Cards que mais demoraram aqui</p>
            {c.slowest.map((s, i) => (
              <p key={i} className="flex justify-between text-xs text-gray-600 dark:text-zinc-300">
                <span className="truncate pr-3">{s.card}</span>
                <span className="shrink-0 font-semibold tabular-nums text-red-600">{fmtDays(s.days)}</span>
              </p>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

/** Bloco de destinos de UMA coluna (seção 2) — tabela destino/qtd/%. */
function DestinationBlock({ c }: { c: ColumnDestinations }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-gray-800 dark:text-zinc-100">
        {c.column}
        <span className="ml-2 text-xs font-semibold text-gray-400">{c.total} saída(s)</span>
      </p>
      <table className="w-full border-collapse text-left">
        <tbody>
          {c.destinations.map((d) => (
            <tr key={d.to} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
              <td className={`${td} w-1/2`}>
                <ArrowRight className="mr-1.5 inline h-3.5 w-3.5 text-gray-300" />
                {d.to}
                {!d.expected && (
                  <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                    fora do padrão
                  </span>
                )}
              </td>
              <td className={`${td} w-16 text-right font-bold tabular-nums`}>{d.count}</td>
              <td className={td}><PctBar pct={d.pct} danger={!d.expected} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tabela de ranking (10 mais lentos / mais rápidos). */
function RankTable({ title, rows, valueClass }: {
  title: string; rows: { card: string; days: number }[]; valueClass: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Sem dados suficientes no período.</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <tbody>
            {rows.map((c, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0 dark:border-zinc-800">
                <td className="w-8 py-1.5 text-xs text-gray-400">{i + 1}º</td>
                <td className={`${td} truncate`}>{c.card}</td>
                <td className={`py-1.5 text-right text-sm font-bold tabular-nums ${valueClass}`}>{fmtDays(c.days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
