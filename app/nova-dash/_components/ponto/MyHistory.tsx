/* eslint-disable no-unused-vars */ // a regra base confunde nome de parâmetro em tipo de callback
'use client';

// Histórico do mês: resumo (trabalhado, dias, média, pausas) e o dia a dia
// com a linha do tempo de cada jornada.

import { useMemo } from 'react';
import { Coffee, Pencil } from 'lucide-react';
import {
  daysOfMonth, fmtClock, fmtDayLabel, fmtHm, monthSummary,
  parseBreaks, statusOf, targetMinutes, weekdayOf, workedMinutes, WEEKDAY_LABEL,
  type PontoSession, type WorkSchedule,
} from '@/app/_shared/lib/ponto';
import { DayTimeline } from './DayTimeline';
import { MonthPicker } from './MonthPicker';

interface Props {
  sessions: PontoSession[];
  schedule: WorkSchedule;
  month: string;
  today: string;
  onMonthChange: (month: string) => void;
  /** Quando presente, cada dia ganha o botão de correção (visão do gestor). */
  onEdit?: (session: PontoSession | null, dateKey: string) => void;
  /** Dentro da tabela da equipe: sem moldura própria e sem seletor de mês. */
  embedded?: boolean;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="font-mono text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-gray-300">{hint}</p>}
    </div>
  );
}

export function MyHistory({ sessions, schedule, month, today, onMonthChange, onEdit, embedded }: Props) {
  const now = Date.now();

  const summary = useMemo(
    () => monthSummary(sessions, schedule, month, today, true, now),
    [sessions, schedule, month, today, now],
  );

  // Um item por dia decorrido: com registro, ou dia útil em branco.
  const rows = useMemo(() => {
    const byDate = new Map(sessions.map((s) => [s.date, s]));
    return daysOfMonth(month)
      .filter((d) => d <= today)
      .filter((d) => byDate.has(d) || targetMinutes(d, schedule) > 0)
      .reverse()
      .map((d) => ({ date: d, session: byDate.get(d) ?? null }));
  }, [sessions, month, today, schedule]);

  const body = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <Stat label="Trabalhado no mês" value={fmtHm(summary.worked)} />
        <Stat label="Dias registrados" value={String(summary.daysWorked)} />
        <Stat label="Média por dia" value={fmtHm(summary.avgPerDay)} />
        <Stat label="Em pausa" value={fmtHm(summary.breakTotal)} />
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-300">Nenhum registro neste mês.</p>
      ) : (
        <div className="max-h-[24rem] space-y-0.5 overflow-y-auto pr-1">
          {rows.map(({ date, session }) => {
            const worked = session ? workedMinutes(session, now) : 0;
            const breaks = session ? parseBreaks(session) : [];
            const open = session ? statusOf(session) !== 'encerrado' && !!session.startedAt : false;
            const isToday = date === today;

            return (
              <div
                key={date}
                className={`grid grid-cols-[3.4rem_1fr] items-center gap-x-4 gap-y-0.5 rounded-xl px-3 py-2 text-xs sm:grid-cols-[3.4rem_9rem_1fr_7.5rem] ${
                  isToday ? 'bg-blue-50/60' : 'hover:bg-gray-50'
                }`}
              >
                <div className="leading-tight">
                  <p className="font-mono font-semibold text-gray-700 tabular-nums">{fmtDayLabel(date)}</p>
                  <p className="text-[10px] text-gray-400">{WEEKDAY_LABEL[weekdayOf(date)]}</p>
                </div>

                <div className="font-mono tabular-nums">
                  {session?.startedAt ? (
                    // Dia corrigido manualmente fica em VERMELHO — pedido de
                    // 16/08/2026: toda correção precisa saltar aos olhos.
                    session.editedById ? (
                      <span>
                        <span className="font-semibold text-red-500">{fmtClock(session.startedAt)}</span>
                        <span className="text-red-300"> → </span>
                        <span className="font-semibold text-red-500">
                          {session.finishedAt ? fmtClock(session.finishedAt) : 'agora'}
                        </span>
                      </span>
                    ) : (
                      <span>
                        <span className="text-emerald-600">{fmtClock(session.startedAt)}</span>
                        <span className="text-gray-300"> → </span>
                        <span className={open ? 'text-blue-500' : 'text-gray-600'}>
                          {session.finishedAt ? fmtClock(session.finishedAt) : 'agora'}
                        </span>
                      </span>
                    )
                  ) : (
                    <span className="text-gray-300">sem registro</span>
                  )}
                  {breaks.length > 0 && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-gray-400">
                      <Coffee className="h-3 w-3" />{breaks.length}
                    </span>
                  )}
                </div>

                <div className="col-span-2 sm:col-span-1">
                  {session?.startedAt
                    ? <DayTimeline session={session} now={now} compact />
                    : <div className="h-1.5 rounded-full bg-gray-50" />}
                </div>

                <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                  {(session?.autoClosed || session?.editedById) && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        session.editedById ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'
                      }`}
                      title={session.editedById ? 'Corrigido manualmente' : 'Encerrado automaticamente na virada do dia'}
                    >
                      {session.editedById ? 'corrigido' : 'auto'}
                    </span>
                  )}
                  <span className="font-mono font-semibold text-gray-800 tabular-nums">
                    {session?.startedAt ? fmtHm(worked) : '—'}
                  </span>
                  {onEdit && (
                    <button
                      className="rounded-md p-1 text-gray-300 hover:bg-white hover:text-gray-600 hover:shadow-sm"
                      onClick={() => onEdit(session, date)}
                      title="Corrigir"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {session?.note && (
                  <p className="col-span-2 text-[11px] italic text-gray-400 sm:col-span-4">“{session.note}”</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Histórico</p>
        <MonthPicker value={month} max={today.slice(0, 7)} onChange={onMonthChange} />
      </div>
      {body}
    </div>
  );
}
