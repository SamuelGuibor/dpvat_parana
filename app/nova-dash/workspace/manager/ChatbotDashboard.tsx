/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bot, Loader2, BadgeCheck, XCircle, Headset, HelpCircle, AlertTriangle,
  Brain, Timer, Activity, MessageSquare, FileText, Workflow, FileBadge,
  UserRound, Undo2, DollarSign, StickyNote, Users,
} from 'lucide-react';
import { Button } from '@/app/_shared/ui/button';
import { getChatbotAnalytics, type ChatbotAnalytics } from '@/app/_actions/analytics/get-chatbot-analytics';
import { CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';
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
    <div className="mx-auto max-w-8xl px-6 pb-12">
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

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Intenções */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
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
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:col-span-2">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                <BadgeCheck className="h-4 w-4 text-blue-500" /> Encerramentos por categoria
              </h2>
              {Object.keys(data.closeCategories).length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Sem encerramentos no período.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(data.closeCategories)
                    .sort((a, b) => b[1] - a[1])
                    .map(([key, value]) => (
                      <Bar
                        key={key}
                        label={CLOSE_CATEGORY_LABELS[key] ?? key}
                        value={value}
                        max={closeMax}
                        color="bg-gradient-to-r from-blue-500 to-indigo-600"
                      />
                    ))}
                </div>
              )}
            </section>

            {/* Atividade recente dos atendentes (quem fez o quê) */}
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
    </div>
  );
}
