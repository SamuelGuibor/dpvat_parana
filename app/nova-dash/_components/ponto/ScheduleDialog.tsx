'use client';

// Escala/jornada esperada de um colaborador — definida por quem tem acesso ao
// Administrativo. Só muda a meta usada nos cálculos, nunca as batidas.
//
// 16/08/2026: além da carga em h/min, a escala aceita HORÁRIOS (entrada,
// saída e intervalo) — ex.: Luana 08:30–14:30 com 1h de intervalo = 5h/dia.
// Com horários preenchidos, a carga diária é calculada automaticamente.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { WEEKDAY_LABEL, fmtHm, type WorkSchedule } from '@/app/_shared/lib/ponto';

interface Props {
  open: boolean;
  userId: string;
  userName: string;
  schedule: WorkSchedule;
  onClose: () => void;
  onSaved: () => void;
}

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function ScheduleDialog({ open, userId, userName, schedule, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<'times' | 'load'>('times');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakH, setBreakH] = useState('1');
  const [breakM, setBreakM] = useState('0');
  const [hours, setHours] = useState('8');
  const [mins, setMins] = useState('0');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHours(String(Math.floor(schedule.dailyMinutes / 60)));
    setMins(String(schedule.dailyMinutes % 60));
    setDays(schedule.days);
    setStartTime(schedule.startTime ?? '');
    setEndTime(schedule.endTime ?? '');
    const bm = schedule.breakMinutes ?? 60;
    setBreakH(String(Math.floor(bm / 60)));
    setBreakM(String(bm % 60));
    setMode(schedule.startTime && schedule.endTime ? 'times' : schedule.dailyMinutes !== 480 ? 'load' : 'times');
  }, [open, schedule]);

  const timesValid = HHMM_RE.test(startTime) && HHMM_RE.test(endTime) && toMin(endTime) > toMin(startTime);
  const breakTotal = (Number(breakH) || 0) * 60 + (Number(breakM) || 0);
  const computedDaily = useMemo(
    () => (timesValid ? Math.max(0, toMin(endTime) - toMin(startTime) - breakTotal) : 0),
    [timesValid, startTime, endTime, breakTotal],
  );

  async function save() {
    const total = mode === 'times' ? computedDaily : (Number(hours) || 0) * 60 + (Number(mins) || 0);
    if (mode === 'times' && !timesValid) { toast.error('Preencha entrada e saída válidas (a saída depois da entrada).'); return; }
    if (total <= 0 || total > 1440) { toast.error('Jornada diária inválida.'); return; }
    if (!days.length) { toast.error('Escolha ao menos um dia da semana.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/work-session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          schedule: {
            dailyMinutes: total,
            days: [...days].sort(),
            startTime: mode === 'times' ? startTime : null,
            endTime: mode === 'times' ? endTime : null,
            breakMinutes: mode === 'times' ? breakTotal : null,
            // Preserva o ciclo do banco de horas ao editar a escala.
            bankStartKey: schedule.bankStartKey ?? null,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Não foi possível salvar.');
        return;
      }
      toast.success('Escala atualizada.');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center outline-none focus:border-blue-400';
  const timeField = 'w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center outline-none focus:border-blue-400';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Escala de {userName.split(' ')[0]}</DialogTitle>
          <DialogDescription>
            Horários e dias úteis usados nos cálculos do ponto e do banco de horas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-0.5 rounded-full bg-gray-100 p-0.5">
            {([['times', 'Por horários'], ['load', 'Por carga diária']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMode(v)}
                className={`flex-1 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  mode === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'times' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Entrada</span>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={timeField} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-500">Saída</span>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={timeField} />
                </label>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-500">Intervalo (almoço)</span>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={12} value={breakH} onChange={(e) => setBreakH(e.target.value)} className={field} />
                  <span className="text-sm text-gray-500">h</span>
                  <input type="number" min={0} max={59} value={breakM} onChange={(e) => setBreakM(e.target.value)} className={field} />
                  <span className="text-sm text-gray-500">min</span>
                </div>
              </div>
              <p className="rounded-lg bg-blue-50/60 px-3 py-2 text-sm text-blue-700">
                {timesValid
                  ? <>Jornada diária: <b className="font-mono">{fmtHm(computedDaily)}</b> por dia útil ({startTime}–{endTime}, {fmtHm(breakTotal)} de intervalo)</>
                  : 'Preencha entrada e saída para calcular a jornada.'}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} className={field} />
              <span className="text-sm text-gray-500">h</span>
              <input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} className={field} />
              <span className="text-sm text-gray-500">min por dia útil</span>
            </div>
          )}

          <div className="flex gap-1.5">
            {WEEKDAY_LABEL.map((label, i) => {
              const on = days.includes(i);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setDays((d) => (on ? d.filter((x) => x !== i) : [...d, i]))}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                    on ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {label[0]}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={save} disabled={saving}>
            Salvar escala
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
