/* eslint-disable no-unused-vars */ // a regra base confunde nome de parâmetro em tipo de callback
'use client';

// "Meu Ponto": um cartão único e compacto — relógio ao vivo, tempo
// trabalhado, linha do tempo, batidas do dia e os 4 botões. Tudo cabe na
// janela sem rolagem; o histórico do mês fica logo abaixo.

import { useEffect, useMemo, useState } from 'react';
import { LogIn, LogOut, Coffee, Pencil, AlertTriangle } from 'lucide-react';
import {
  BREAK_LABEL, STATUS_LABEL,
  breakMinutes, fmtClock, fmtHm, fmtHms, openBreak, parseBreaks,
  statusOf, targetMinutes, workedMs,
  type PontoSession, type PontoStatus, type WorkSchedule,
} from '@/app/_shared/lib/ponto';
import { DayTimeline } from './DayTimeline';

export type PontoAction = 'start' | 'pause' | 'resume' | 'finish' | 'reopen' | 'note';

interface Props {
  session: PontoSession | null;
  schedule: WorkSchedule;
  today: string;
  onAction: (action: PontoAction, extra?: { kind?: string; note?: string }) => Promise<void>;
  busy: boolean;
}

const STATUS_PILL: Record<PontoStatus, string> = {
  nao_iniciado: 'bg-gray-100 text-gray-500',
  trabalhando: 'bg-emerald-50 text-emerald-600',
  pausa: 'bg-amber-50 text-amber-600',
  encerrado: 'bg-gray-100 text-gray-500',
};

const STATUS_DOT: Record<PontoStatus, string> = {
  nao_iniciado: 'bg-gray-400',
  trabalhando: 'bg-emerald-500 animate-pulse',
  pausa: 'bg-amber-400 animate-pulse',
  encerrado: 'bg-gray-400',
};

function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="font-mono text-4xl font-semibold tracking-tight text-gray-900 tabular-nums">
      {time.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
    </p>
  );
}

export function MyPonto({ session, schedule, today, onAction, busy }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const status = statusOf(session);
  const live = status === 'trabalhando' || status === 'pausa';

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const target = targetMinutes(today, schedule);
  const worked = session ? workedMs(session, now) : 0;
  const workedMin = Math.floor(worked / 60_000);
  const pauseTotal = session ? breakMinutes(session, now) : 0;
  const paused = session ? openBreak(session) : null;
  const breaks = useMemo(() => (session ? parseBreaks(session) : []), [session]);
  const remaining = target - workedMin;

  const dateLabel = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  }, [today]);

  // Batidas do dia como uma sequência legível: entrada, pausas com duração, saída.
  const events = useMemo(() => {
    if (!session?.startedAt) return [];
    const list: { icon: 'in' | 'out' | 'coffee'; label: string; detail: string; tone: string }[] = [
      { icon: 'in', label: 'Entrada', detail: fmtClock(session.startedAt), tone: 'text-emerald-600 bg-emerald-50' },
    ];
    for (const b of breaks) {
      const dur = b.end
        ? Math.max(0, Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000))
        : Math.max(0, Math.round((now - new Date(b.start).getTime()) / 60_000));
      list.push({
        icon: 'coffee',
        label: BREAK_LABEL[b.kind],
        detail: `${fmtClock(b.start)}–${b.end ? fmtClock(b.end) : 'agora'} · ${fmtHm(dur)}`,
        tone: 'text-amber-600 bg-amber-50',
      });
    }
    if (session.finishedAt) {
      list.push({ icon: 'out', label: 'Saída', detail: fmtClock(session.finishedAt), tone: 'text-red-500 bg-red-50' });
    }
    return list;
  }, [session, breaks, now]);

  async function saveNote() {
    await onAction('note', { note: noteDraft });
    setNoteOpen(false);
  }

  const btn = 'rounded-xl py-3 text-sm font-semibold transition disabled:cursor-not-allowed';

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        {/* Relógio + status */}
        <div className="flex flex-col items-center gap-2 lg:w-56 lg:shrink-0">
          <p className="text-sm capitalize text-gray-400">{dateLabel}</p>
          <LiveClock />
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${STATUS_PILL[status]}`}>
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            {STATUS_LABEL[status]}
            {paused && ` · desde ${fmtClock(paused.start)}`}
          </span>
        </div>

        {/* Tempo trabalhado + linha do tempo + batidas */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs uppercase tracking-wider text-gray-400">Trabalhado hoje</span>
            <span className="font-mono text-2xl font-semibold text-gray-900 tabular-nums">
              {session?.startedAt ? (live ? fmtHms(worked) : fmtHm(workedMin)) : '—'}
            </span>
            {target > 0 && session?.startedAt && remaining > 0 && (
              <span className="text-xs text-gray-400">faltam {fmtHm(remaining)}</span>
            )}
            {pauseTotal > 0 && (
              <span className="text-xs text-gray-400">· {fmtHm(pauseTotal)} em pausa</span>
            )}
          </div>

          {session?.startedAt ? (
            <DayTimeline session={session} now={now} />
          ) : (
            <p className="text-sm text-gray-400">Nenhuma batida hoje. Clique em Iniciar para começar a contar.</p>
          )}

          {events.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {events.map((e, i) => (
                <span key={i} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${e.tone}`}>
                  {e.icon === 'in' && <LogIn className="h-3 w-3" />}
                  {e.icon === 'out' && <LogOut className="h-3 w-3" />}
                  {e.icon === 'coffee' && <Coffee className="h-3 w-3" />}
                  {e.label}
                  <span className="font-mono font-normal opacity-80">{e.detail}</span>
                </span>
              ))}
              <button
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                onClick={() => { setNoteDraft(session?.note ?? ''); setNoteOpen((v) => !v); }}
              >
                <Pencil className="h-3 w-3" /> {session?.note ? 'obs.' : 'observação'}
              </button>
            </div>
          )}

          {session?.note && !noteOpen && (
            <p className="text-xs italic text-gray-400">“{session.note}”</p>
          )}

          {noteOpen && (
            <div className="flex gap-2">
              <input
                autoFocus
                value={noteDraft}
                maxLength={500}
                placeholder="Ex.: saída antecipada para consulta médica"
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
              <button onClick={saveNote} disabled={busy} className="rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">Salvar</button>
              <button onClick={() => setNoteOpen(false)} className="text-sm text-gray-400">Cancelar</button>
            </div>
          )}

          {session?.autoClosed && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-600">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>Turno encerrado automaticamente na virada do dia — peça correção a quem cuida do ponto.</span>
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="grid w-full grid-cols-4 gap-2 lg:w-52 lg:shrink-0 lg:grid-cols-2">
          <button
            className={`${btn} ${status === 'nao_iniciado' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-50 text-gray-300'}`}
            disabled={busy || status !== 'nao_iniciado'}
            onClick={() => onAction('start')}
          >
            Iniciar
          </button>
          <button
            className={`${btn} ${status === 'trabalhando' ? 'bg-amber-400 text-white hover:bg-amber-500' : 'bg-gray-50 text-gray-300'}`}
            disabled={busy || status !== 'trabalhando'}
            onClick={() => onAction('pause', { kind: breaks.length === 0 ? 'almoco' : 'pausa' })}
          >
            Pausa
          </button>
          <button
            className={`${btn} ${status === 'pausa' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-50 text-gray-300'}`}
            disabled={busy || status !== 'pausa'}
            onClick={() => onAction('resume')}
          >
            Retorno
          </button>
          <button
            className={`${btn} ${live ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-50 text-gray-300'}`}
            disabled={busy || !live}
            onClick={() => onAction('finish')}
          >
            Encerrar
          </button>
        </div>
      </div>
    </div>
  );
}
