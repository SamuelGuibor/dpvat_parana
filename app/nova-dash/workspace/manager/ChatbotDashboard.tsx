/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bot, Loader2, BadgeCheck, XCircle, AlertTriangle,
  Timer, Activity, MessageSquare, FileText, Workflow, FileBadge,
  UserRound, Undo2, StickyNote, ShieldAlert, ShieldCheck,
  Info, Facebook, Instagram, Megaphone, Globe, Send, CheckCircle2, BellRing,
  Tag as TagIcon, Users,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Button } from '@/app/_shared/ui/button';
import { getChatbotAnalytics, type ChatbotAnalytics } from '@/app/_actions/analytics/get-chatbot-analytics';
// import { SystemMap } from './SystemMap';
import { AiCorner } from './AiCorner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Minutos → "42 min" / "3 h 10" — 1416 min não diz nada a ninguém. */
function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
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

export function ChatbotDashboard({ numberId = null, initialData = null, range }: {
  numberId?: string | null;
  /** Analytics do período inicial, vindo da carga única do dashboard —
   *  evita refetch na primeira renderização. */
  initialData?: ChatbotAnalytics | null;
  /** Calendário do dashboard (ISO). Presente → modo "Calendário" por padrão. */
  range?: { from: string; to: string };
} = {}) {
  // 'range' = segue o calendário do topo do dashboard; 7/30/90 são atalhos.
  const [period, setPeriod] = useState<7 | 30 | 90 | 'range'>(range ? 'range' : 7);
  const [data, setData] = useState<ChatbotAnalytics | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  const useRange = period === 'range' && !!range;
  const periodDays = period === 'range' ? 30 : period;
  const rangeFrom = useRange ? range!.from : undefined;
  const rangeTo = useRange ? range!.to : undefined;

  // Com initialData (carga única do dashboard), o primeiro fetch é pulado —
  // ele só volta a rodar quando o usuário troca o período, o número ou o
  // calendário.
  const skipFirstFetch = useRef(Boolean(initialData));
  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    let alive = true;
    setLoading(true);
    getChatbotAnalytics(periodDays, numberId, rangeFrom, rangeTo)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e?.message ?? 'Erro ao carregar.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [periodDays, numberId, rangeFrom, rangeTo]);

  return (
    <div className="mx-auto max-w-8xl px-3 pb-12 md:px-6">
      <div className="mb-6 flex items-center justify-between border-t border-gray-200 pt-8 dark:border-zinc-800">
        <div>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 p-1 dark:border-zinc-700">
          {range && (
            <Button size="sm" variant={period === 'range' ? 'default' : 'ghost'} onClick={() => setPeriod('range')} className="h-7 px-3 text-xs">Calendário</Button>
          )}
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
          {/* Canto da IA: custo por operação + qualidade do bot num bloco só.
              (Qualificados/Não qualificados moraram aqui; agora vivem na
              Origem dos leads, por campanha — onde a pergunta é feita.) */}
          <AiCorner
            quality={{
              doubts: data.bot.doubts,
              errors: data.bot.error,
              decisions: data.bot.totalDecisions,
              handoff: data.bot.handoff,
              understoodRate: data.bot.understoodRate,
              successRate: data.bot.successRate,
              qualifyTime: formatDuration(data.bot.avgQualifyMinutes),
              periodDays: data.periodDays,
            }}
          />

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
          {/* {data.team.attendants.length > 0 && (
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
          )} */}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-6">
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
      {/* <SystemMap /> */}
    </div>
  );
}

