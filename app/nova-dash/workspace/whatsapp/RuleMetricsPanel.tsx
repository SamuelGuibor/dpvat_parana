'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, RefreshCw, BarChart3, ChevronDown, ChevronRight, Clock,
  MessageSquare, Users, Moon, BellRing, Lightbulb, AlertTriangle, Bot,
  LifeBuoy,
} from 'lucide-react';
import {
  getRuleMetrics,
  type RuleMetricsPayload, type RuleMetric, type RuleEventItem,
} from '@/app/_actions/whatsapp/rule-metrics';

// MÉTRICAS DAS REGRAS APRENDIDAS — a prova de que o cérebro trabalha.
//
// Cada linha responde três perguntas do supervisor:
//   1. Essa regra está sendo USADA? (aplicações, conversas distintas, última vez)
//   2. Em QUE situações? (etapas, ações, trechos reais de resposta)
//   3. De ONDE ela veio? (as revisões/lições que a originaram — rastreabilidade)
// Também mostra as decisões contextuais do cron (cutucar vs encerrar), que são
// a outra face do "a IA entendeu o contexto".

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const ACTION_LABELS: Record<string, string> = {
  continue: 'seguiu conversa',
  qualify: 'qualificou',
  disqualify: 'desqualificou',
  handoff: 'transferiu',
  lookup: 'consultou banco',
  send_flow: 'disparou fluxo',
  resolve: 'resolveu',
  nudge: 'cutucou',
  close: 'encerrou em silêncio',
  // Ciclo de recuperação (standby)
  'attempt T1': 'provocação 1',
  'attempt T2': 'provocação 2',
  'attempt T3': 'provocação 3 (última)',
  recovered: 'cliente voltou',
  exhausted: 'esgotou sem resposta',
  opt_out: 'pediu pra sair',
};

function StatCard({ icon: Icon, label, value, hint, tone = 'indigo' }: {
  icon: React.ElementType; label: string; value: string | number; hint?: string;
  tone?: 'indigo' | 'emerald' | 'amber' | 'rose';
}) {
  const tones = {
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
    amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
    rose: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40',
  } as const;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`rounded-xl p-2 ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-black leading-tight text-gray-900 dark:text-zinc-100">{value}</p>
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">{label}</p>
        {hint && <p className="truncate text-[10px] text-gray-400 dark:text-zinc-500">{hint}</p>}
      </div>
    </div>
  );
}

function EventRow({ e }: { e: RuleEventItem }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-zinc-800 dark:bg-zinc-800/60">
      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        <span className="font-bold text-gray-700 dark:text-zinc-200">{e.contactName ?? 'Sem nome'}</span>
        {e.botState && (
          <span className="rounded-full bg-white px-1.5 py-0.5 font-mono text-gray-500 dark:bg-zinc-900 dark:text-zinc-400">{e.botState}</span>
        )}
        {e.action && (
          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            {ACTION_LABELS[e.action] ?? e.action}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-gray-400"><Clock className="h-3 w-3" />{fmtDate(e.createdAt)}</span>
      </div>
      {e.detail && (
        <p className="mt-1 line-clamp-2 text-[11px] italic leading-snug text-gray-600 dark:text-zinc-400">“{e.detail}”</p>
      )}
    </div>
  );
}

function RuleCard({ r, maxUses }: { r: RuleMetric; maxUses: number }) {
  const [open, setOpen] = useState(false);
  const pct = maxUses > 0 ? Math.round((r.usesTotal / maxUses) * 100) : 0;
  const never = r.usesTotal === 0;
  return (
    <div className={`rounded-2xl border bg-white dark:bg-zinc-900 ${never ? 'border-dashed border-gray-200 opacity-70 dark:border-zinc-800' : 'border-gray-200 dark:border-zinc-800'}`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2 p-3 text-left">
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{r.ruleId}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">{r.section}</span>
            <span className="text-[10px] text-gray-400" title="Revisões que sustentam a regra">peso {r.weight}</span>
            {r.states.map((s) => (
              <span key={s} className="rounded-full bg-gray-50 px-1.5 py-0.5 font-mono text-[9px] text-gray-400 dark:bg-zinc-800/70 dark:text-zinc-500">{s}</span>
            ))}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-gray-800 dark:text-zinc-200">{r.text}</p>
          {/* Barra de uso relativo às demais regras */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-black text-gray-900 dark:text-zinc-100">{r.usesTotal}</p>
          <p className="text-[9px] font-semibold uppercase text-gray-400">aplicações</p>
          <p className="mt-0.5 text-[10px] text-gray-400">{r.uses7d} nos 7d</p>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-3 dark:border-zinc-800">
          <div className="mb-3 flex flex-wrap gap-3 text-[10px] text-gray-500 dark:text-zinc-400">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{r.distinctContacts} conversas distintas</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />última: {fmtDate(r.lastUsedAt)}</span>
            {Object.entries(r.actions).map(([a, n]) => (
              <span key={a} className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-zinc-800">{ACTION_LABELS[a] ?? a}: {n}</span>
            ))}
          </div>

          {/* Origem: as revisões/lições que geraram a regra */}
          {r.sources.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                <Lightbulb className="h-3 w-3" /> Origem — revisões que geraram esta regra
              </p>
              <div className="space-y-1.5">
                {r.sources.map((s) => (
                  <div key={s.reviewId} className="rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/30">
                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                      <span className="font-bold text-amber-900 dark:text-amber-200">{s.contactName ?? 'Sem nome'}</span>
                      {s.verdict && <span className="rounded-full bg-white px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-zinc-900 dark:text-amber-300">{s.verdict}</span>}
                      <span className="ml-auto text-amber-600/70">{fmtDate(s.reviewedAt)}</span>
                    </div>
                    {s.lesson && <p className="mt-1 text-[11px] leading-snug text-amber-900 dark:text-amber-100">{s.lesson}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {r.sources.length === 0 && (
            <p className="mb-3 flex items-center gap-1.5 text-[10px] text-gray-400">
              <AlertTriangle className="h-3 w-3" /> Regra de versão antiga do playbook — sem rastreio de origem (o rastreio passou a existir nas consolidações novas).
            </p>
          )}

          {/* Aplicações recentes */}
          {r.recentEvents.length > 0 ? (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
                <MessageSquare className="h-3 w-3" /> Aplicações recentes
              </p>
              <div className="space-y-1.5">
                {r.recentEvents.map((e, i) => <EventRow key={i} e={e} />)}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">Nenhuma aplicação registrada ainda.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function RuleMetricsPanel() {
  const [data, setData] = useState<RuleMetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getRuleMetrics());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui carregar as métricas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm text-rose-600">{error}</p>
        <button onClick={() => void load()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">Tentar de novo</button>
      </div>
    );
  }
  if (!data) return null;

  const maxUses = Math.max(1, ...data.rules.map((r) => r.usesTotal));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      {/* Cabeçalho */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-zinc-100">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
            Métricas das regras aprendidas
          </h3>
          <p className="text-[11px] text-gray-400 dark:text-zinc-500">
            {data.playbookVersion
              ? `Playbook v${data.playbookVersion} · ${data.rulesCount} regras · publicado em ${fmtDate(data.publishedAt)}`
              : 'Nenhum playbook publicado ainda.'}
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
          title="Atualizar"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {/* Cards-resumo */}
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard icon={Bot} label="Aplicações (7 dias)" value={data.events7d} hint={`${data.events30d} em 30d · ${data.eventsTotal} no total`} />
        <StatCard icon={BarChart3} label="Regras ativas (7d)" value={`${data.rulesUsed7d}/${data.rulesCount}`} tone="emerald"
          hint={data.rulesNeverUsed > 0 ? `${data.rulesNeverUsed} nunca usadas` : 'todas já usadas'} />
        <StatCard icon={Moon} label="Encerrou em silêncio" value={data.followup.closes} tone="amber" hint="cron entendeu o contexto" />
        <StatCard icon={BellRing} label="Cutucões contextuais" value={data.followup.nudges} tone="rose" hint={`${data.followup.last7d} decisões nos 7d`} />
      </div>

      {/* Regras */}
      <div className="space-y-2">
        {data.rules.map((r) => <RuleCard key={r.ruleId} r={r} maxUses={maxUses} />)}
        {data.rules.length === 0 && (
          <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400 dark:border-zinc-800">
            Publique um playbook para começar a medir as regras.
          </p>
        )}
      </div>

      {/* Decisões de follow-up do cron */}
      {data.followup.recent.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
            <Moon className="h-3 w-3" /> Decisões contextuais de silêncio (cron) — recentes
          </p>
          <div className="space-y-1.5">
            {data.followup.recent.map((e, i) => <EventRow key={i} e={e} />)}
          </div>
        </div>
      )}

      {/* Ciclo de RECUPERAÇÃO (standby): provocações pra resgatar quem sumiu */}
      {(data.recovery.attemptsSent > 0 || data.recovery.recent.length > 0) && (
        <div className="mt-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <LifeBuoy className="h-3 w-3" /> Recuperação de clientes (standby)
          </p>
          <p className="mb-2 text-[10px] text-gray-400 dark:text-zinc-500">
            Quem sumiu no meio da triagem recebe até 3 provocações em ~3 dias (janela de 24h aberta → texto da IA; fechada → template aprovado). Aqui: quantos foram provocados, quantos voltaram e quantos pediram pra sair.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatCard icon={BellRing} label="Clientes provocados" value={data.recovery.notified}
              hint={`${data.recovery.attemptsSent} envios · ${data.recovery.attempts7d} nos 7d`} />
            <StatCard icon={LifeBuoy} label="Recuperados" value={data.recovery.recovered} tone="emerald"
              hint={`${data.recovery.recoveredQualified} qualificaram`} />
            <StatCard icon={Moon} label="Sem resposta (esgotou)" value={data.recovery.exhausted} tone="amber" hint="3 tentativas sem retorno" />
            <StatCard icon={AlertTriangle} label="Pediram pra sair" value={data.recovery.optOut} tone="rose" hint="opt-out durante o ciclo" />
          </div>
          {/* Taxa por tentativa: qual provocação traz gente de volta */}
          <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-zinc-400">
            {data.recovery.byAttempt.map((a) => (
              <span key={a.attempt} className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-zinc-800">
                {a.attempt.replace('T', 'Tentativa ')}: {a.sent} enviadas · {a.recovered} voltaram
                {a.sent > 0 ? ` (${Math.round((a.recovered / a.sent) * 100)}%)` : ''}
              </span>
            ))}
          </div>
          {data.recovery.recent.length > 0 && (
            <div className="space-y-1.5">
              {data.recovery.recent.map((e, i) => <EventRow key={i} e={e} />)}
            </div>
          )}
        </div>
      )}

      {/* Travas de código que sobrescreveram a IA */}
      {data.code.recent.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
            <AlertTriangle className="h-3 w-3" /> Intervenções de código — a IA NÃO decidiu ({data.code.last7d} nos 7d, {data.code.total} no total)
          </p>
          <p className="mb-1.5 text-[10px] text-gray-400 dark:text-zinc-500">
            Travas do app que sobrescrevem a decisão da IA (ex.: &quot;não entendi 2x&quot; → especialista). Não contam como regra do playbook — se algo aqui parecer coincidir com uma regra sua, é o código agindo antes dela.
          </p>
          <div className="space-y-1.5">
            {data.code.recent.map((e, i) => <EventRow key={i} e={e} />)}
          </div>
        </div>
      )}
    </div>
  );
}
