/* eslint-disable no-unused-vars */ // a regra base confunde nome de parâmetro em tipo de callback
'use client';

// Painel Administrativo: quem está trabalhando agora, horas por período e a
// tabela de colaboradores. Clicar na linha abre o histórico do mês com a
// correção manual; o botão de jornada define a carga esperada de cada um.
// O acesso é validado no servidor (permissão `manage_ponto`).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, RefreshCw, ChevronDown, CalendarCog, Search, AlertTriangle } from 'lucide-react';
import {
  STATUS_LABEL, fmtClock, fmtHm, fmtSigned, monthSummary, statusOf, workedMinutes,
  type BankSummary, type PontoSession, type PontoStatus, type WorkSchedule,
} from '@/app/_shared/lib/ponto';
import { MyHistory } from './MyHistory';
import { EditSessionDialog } from './EditSessionDialog';
import { ScheduleDialog } from './ScheduleDialog';
import { MonthPicker } from './MonthPicker';
import { BankPanel } from './BankPanel';

interface Member {
  user: { id: string; name: string | null; role: string; image: string | null };
  schedule: WorkSchedule;
  sessions: PontoSession[];
  bank: BankSummary;
}

interface Props {
  month: string;
  today: string;
  onMonthChange: (month: string) => void;
  /** Bump para forçar recarga quando o próprio usuário bate o ponto. */
  refreshKey: number;
}

type Filter = 'daily' | 'weekly' | 'monthly';

const STATUS_DOT: Record<PontoStatus, string> = {
  nao_iniciado: 'bg-gray-300',
  trabalhando: 'bg-emerald-500 animate-pulse',
  pausa: 'bg-amber-400 animate-pulse',
  encerrado: 'bg-gray-400',
};

const STATUS_TEXT: Record<PontoStatus, string> = {
  nao_iniciado: 'text-gray-400',
  trabalhando: 'text-emerald-600',
  pausa: 'text-amber-600',
  encerrado: 'text-gray-500',
};

function initials(name: string | null) {
  return (name || 'U').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

/** Chaves dos últimos 7 dias terminando em `today`. */
function lastWeekKeys(today: string): Set<string> {
  const [y, m, d] = today.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const keys = new Set<string>();
  for (let i = 0; i < 7; i++) {
    keys.add(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  }
  return keys;
}

export function TeamPonto({ month, today, onMonthChange, refreshKey }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('daily');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ member: Member; session: PontoSession | null; date: string } | null>(null);
  const [schedFor, setSchedFor] = useState<Member | null>(null);
  const now = Date.now();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-session?all=true&month=${month}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Falha ao carregar.'); setMembers([]); return; }
      setError(null);
      setMembers(data.members ?? []);
    } catch {
      setError('Falha ao carregar o ponto da equipe.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // A visão "agora" acompanha o dia sem depender de recarregar a aba.
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const weekKeys = useMemo(() => lastWeekKeys(today), [today]);

  const rows = useMemo(() => members.map((m) => {
    const todaySession = m.sessions.find((s) => s.date === today) ?? null;
    const summary = monthSummary(m.sessions, m.schedule, month, today, true, now);
    const daily = todaySession ? workedMinutes(todaySession, now) : 0;
    const weekly = m.sessions
      .filter((s) => weekKeys.has(s.date))
      .reduce((acc, s) => acc + workedMinutes(s, now), 0);
    const workDays = m.schedule.days.length || 5;

    return {
      m,
      todaySession,
      status: statusOf(todaySession),
      monthBalance: summary.balance,
      hours: { daily, weekly, monthly: summary.worked },
      max: {
        daily: m.schedule.dailyMinutes,
        weekly: m.schedule.dailyMinutes * workDays,
        monthly: Math.max(summary.expected, m.schedule.dailyMinutes),
      },
    };
  }), [members, today, month, now, weekKeys]);

  const filtered = rows.filter(({ m }) =>
    (m.user.name ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const totals = {
    working: rows.filter((r) => r.status === 'trabalhando').length,
    paused: rows.filter((r) => r.status === 'pausa').length,
    finished: rows.filter((r) => r.status === 'encerrado').length,
    idle: rows.filter((r) => r.status === 'nao_iniciado').length,
    daily: rows.reduce((a, r) => a + r.hours.daily, 0),
    weekly: rows.reduce((a, r) => a + r.hours.weekly, 0),
    monthly: rows.reduce((a, r) => a + r.hours.monthly, 0),
  };

  function exportCsv() {
    window.location.href = `/api/work-session?all=true&month=${month}&format=csv`;
    toast.success('Exportando a folha do mês…');
  }

  const hoursHeader = { daily: 'Hoje', weekly: 'Semana', monthly: 'Mês' }[filter];

  return (
    <div className="flex flex-col gap-5">
      {/* Resumo do momento + horas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Trabalhando', value: totals.working, dot: 'bg-emerald-500' },
          { label: 'Em pausa', value: totals.paused, dot: 'bg-amber-400' },
          { label: 'Encerrado', value: totals.finished, dot: 'bg-gray-400' },
          { label: 'Não iniciado', value: totals.idle, dot: 'bg-gray-200' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${c.dot}`} />
              <span className="text-xs text-gray-400">{c.label}</span>
            </div>
            <span className="text-2xl font-semibold text-gray-900">{c.value}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total hoje', value: fmtHm(totals.daily) },
          { label: 'Total na semana', value: fmtHm(totals.weekly) },
          { label: 'Total no mês', value: fmtHm(totals.monthly) },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-blue-50/60 p-4">
            <span className="text-xs text-gray-400">{c.label}</span>
            <p className="font-mono text-xl font-semibold text-blue-600 tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Alerta CLT: ciclos de banco de horas com 5+ meses (fecha em 6). */}
      {rows.some((r) => r.m.bank?.alert) && (
        <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-600 ring-1 ring-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>Banco de horas com 5+ meses de ciclo:</b>{' '}
            {rows.filter((r) => r.m.bank?.alert).map((r) => r.m.user.name).join(', ')}.
            A CLT exige compensar em até 6 meses — programe as compensações ou reinicie o ciclo (na linha do colaborador).
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-[260px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            type="text"
            placeholder="Buscar colaborador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-full bg-white py-2 pl-9 pr-4 text-sm shadow-sm ring-1 ring-gray-100 outline-none placeholder:text-gray-300 focus:ring-blue-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-full bg-gray-100 p-0.5">
            {(['daily', 'weekly', 'monthly'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  filter === f ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {{ daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' }[f]}
              </button>
            ))}
          </div>
          <MonthPicker value={month} max={today.slice(0, 7)} onChange={onMonthChange} />
          <button
            onClick={load}
            disabled={loading}
            title="Atualizar"
            className="rounded-full bg-white p-2 text-gray-400 shadow-sm ring-1 ring-gray-100 hover:text-gray-600"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-100 hover:text-gray-800"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
        {error ? (
          <p className="py-8 text-center text-sm text-red-400">{error}</p>
        ) : loading && !members.length ? (
          <p className="py-8 text-center text-sm text-gray-300">Carregando…</p>
        ) : !filtered.length ? (
          <p className="py-8 text-center text-sm text-gray-300">Nenhum colaborador encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-3 font-medium">Colaborador</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">{hoursHeader}</th>
                  <th className="px-5 py-3 font-medium">Banco</th>
                  <th className="px-5 py-3 font-medium">Progresso</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const { m, todaySession, status } = row;
                  const hours = row.hours[filter];
                  const maxH = row.max[filter];
                  const pct = Math.min((hours / Math.max(maxH, 1)) * 100, 100);
                  const isOver = hours > maxH;
                  const open = expanded === m.user.id;

                  return [
                    <tr
                      key={m.user.id}
                      onClick={() => setExpanded(open ? null : m.user.id)}
                      className={`cursor-pointer border-t border-gray-50 transition-colors ${open ? 'bg-gray-50/60' : 'hover:bg-gray-50/60'}`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {m.user.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.user.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-xs font-semibold text-white">
                              {initials(m.user.name)}
                            </div>
                          )}
                          <div className="leading-tight">
                            <p className="text-sm font-medium text-gray-800">{m.user.name}</p>
                            <p className="text-[11px] text-gray-400">
                              {m.schedule.startTime && m.schedule.endTime
                                ? `Escala ${m.schedule.startTime}–${m.schedule.endTime} · ${fmtHm(m.schedule.dailyMinutes)}/dia`
                                : `Jornada ${fmtHm(m.schedule.dailyMinutes)}/dia`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${STATUS_TEXT[status]}`}>
                          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                          {STATUS_LABEL[status]}
                          {todaySession?.startedAt && (
                            <span className="font-mono text-gray-400">{fmtClock(todaySession.startedAt)}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`font-mono text-sm tabular-nums ${isOver ? 'text-amber-500' : 'text-gray-800'}`}>
                          {fmtHm(hours)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className={`font-mono text-sm tabular-nums ${
                            m.bank.accumulated > 0 ? 'text-emerald-600' : m.bank.accumulated < 0 ? 'text-red-500' : 'text-gray-400'
                          }`}>
                            {fmtSigned(m.bank.accumulated)}
                          </span>
                          {m.bank.alert && (
                            <span title={`Ciclo com ${m.bank.monthsOld} meses — compensar em até 6 (CLT)`}>
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="min-w-[130px] px-5 py-3.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={`h-full rounded-full transition-all ${isOver ? 'bg-amber-400' : pct > 85 ? 'bg-emerald-400' : 'bg-blue-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="mt-1 block text-[10px] text-gray-300">{Math.round(pct)}%</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="rounded-lg p-1.5 text-gray-300 hover:bg-white hover:text-gray-600 hover:shadow-sm"
                            title="Configurar jornada"
                            onClick={(e) => { e.stopPropagation(); setSchedFor(m); }}
                          >
                            <CalendarCog className="h-4 w-4" />
                          </button>
                          <ChevronDown className={`h-4 w-4 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </div>
                      </td>
                    </tr>,
                    open ? (
                      <tr key={`${m.user.id}-hist`}>
                        <td colSpan={6} className="border-t border-gray-50 bg-gray-50/40 px-5 py-4">
                          <div className="space-y-4">
                            <BankPanel
                              userId={m.user.id}
                              userName={m.user.name ?? ''}
                              bank={m.bank}
                              monthBalance={row.monthBalance}
                              schedule={m.schedule}
                              today={today}
                              onChanged={load}
                            />
                            <MyHistory
                              embedded
                              sessions={m.sessions}
                              schedule={m.schedule}
                              month={month}
                              today={today}
                              onMonthChange={onMonthChange}
                              onEdit={(session, date) => setEditing({ member: m, session, date })}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditSessionDialog
          open
          userId={editing.member.user.id}
          userName={editing.member.user.name ?? ''}
          dateKey={editing.date}
          session={editing.session}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      {schedFor && (
        <ScheduleDialog
          open
          userId={schedFor.user.id}
          userName={schedFor.user.name ?? ''}
          schedule={schedFor.schedule}
          onClose={() => setSchedFor(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
