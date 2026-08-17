/* eslint-disable no-unused-vars */ // a regra base confunde nome de parâmetro em tipo de callback
'use client';

// Cartão de ponto do COLABORADOR COMUM (16/08/2026): só os botões de bater
// ponto — Entrada, Almoço, Retorno e Saída. Sem horários, sem tempo
// trabalhado, sem histórico: isso fica restrito a quem tem `manage_ponto`.

import { useEffect, useMemo, useState } from 'react';
import { LogIn, LogOut, Coffee, Play, Pencil, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { STATUS_LABEL, type PontoStatus } from '@/app/_shared/lib/ponto';
import type { PontoAction } from './MyPonto';

export interface LimitedTodayState {
  status: PontoStatus;
  breaksCount: number;
  autoClosed: boolean;
  note: string | null;
}

interface Props {
  state: LimitedTodayState | null;
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
    <p className="font-mono text-5xl font-semibold tracking-tight text-gray-900 tabular-nums">
      {time.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
    </p>
  );
}

export function SimplePunch({ state, onAction, busy }: Props) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const status = state?.status ?? 'nao_iniciado';
  const live = status === 'trabalhando' || status === 'pausa';

  const dateLabel = useMemo(
    () => new Date().toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long',
    }),
    [],
  );

  async function saveNote() {
    await onAction('note', { note: noteDraft });
    setNoteOpen(false);
  }

  const btnBase = 'flex flex-col items-center justify-center gap-2 rounded-2xl py-6 text-sm font-semibold transition disabled:cursor-not-allowed';

  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm capitalize text-gray-400">{dateLabel}</p>
        <LiveClock />
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${STATUS_PILL[status]}`}>
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
          {STATUS_LABEL[status]}
        </span>
        {status === 'encerrado' && (
          <p className="flex items-center gap-1.5 text-xs text-gray-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Ponto de hoje registrado. Bom descanso!
          </p>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          className={`${btnBase} ${status === 'nao_iniciado' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-50 text-gray-300'}`}
          disabled={busy || status !== 'nao_iniciado'}
          onClick={() => onAction('start')}
        >
          <LogIn className="h-6 w-6" /> Entrada
        </button>
        <button
          className={`${btnBase} ${status === 'trabalhando' ? 'bg-amber-400 text-white hover:bg-amber-500' : 'bg-gray-50 text-gray-300'}`}
          disabled={busy || status !== 'trabalhando'}
          onClick={() => onAction('pause', { kind: (state?.breaksCount ?? 0) === 0 ? 'almoco' : 'pausa' })}
        >
          <Coffee className="h-6 w-6" /> {(state?.breaksCount ?? 0) === 0 ? 'Almoço' : 'Pausa'}
        </button>
        <button
          className={`${btnBase} ${status === 'pausa' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-50 text-gray-300'}`}
          disabled={busy || status !== 'pausa'}
          onClick={() => onAction('resume')}
        >
          <Play className="h-6 w-6" /> Retorno
        </button>
        <button
          className={`${btnBase} ${live ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-50 text-gray-300'}`}
          disabled={busy || !live}
          onClick={() => onAction('finish')}
        >
          <LogOut className="h-6 w-6" /> Saída
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {state?.note && !noteOpen && (
          <p className="text-center text-xs italic text-gray-400">“{state.note}”</p>
        )}
        <div className="flex justify-center">
          <button
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            onClick={() => { setNoteDraft(state?.note ?? ''); setNoteOpen((v) => !v); }}
          >
            <Pencil className="h-3 w-3" /> {state?.note ? 'Editar observação' : 'Deixar observação'}
          </button>
        </div>
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
        {state?.autoClosed && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-600">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Seu turno de ontem foi encerrado automaticamente — avise quem cuida do ponto para corrigir.</span>
          </div>
        )}
      </div>
    </div>
  );
}
