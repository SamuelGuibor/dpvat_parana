'use client';

// Jornada esperada de um colaborador — definida por quem tem acesso ao
// Administrativo. Só muda a meta usada nos cálculos, nunca as batidas.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { WEEKDAY_LABEL, type WorkSchedule } from '@/app/_shared/lib/ponto';

interface Props {
  open: boolean;
  userId: string;
  userName: string;
  schedule: WorkSchedule;
  onClose: () => void;
  onSaved: () => void;
}

export function ScheduleDialog({ open, userId, userName, schedule, onClose, onSaved }: Props) {
  const [hours, setHours] = useState('8');
  const [mins, setMins] = useState('0');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHours(String(Math.floor(schedule.dailyMinutes / 60)));
    setMins(String(schedule.dailyMinutes % 60));
    setDays(schedule.days);
  }, [open, schedule]);

  async function save() {
    const total = (Number(hours) || 0) * 60 + (Number(mins) || 0);
    if (total <= 0 || total > 1440) { toast.error('Jornada diária inválida.'); return; }
    if (!days.length) { toast.error('Escolha ao menos um dia da semana.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/work-session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, schedule: { dailyMinutes: total, days: [...days].sort() } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Não foi possível salvar.');
        return;
      }
      toast.success('Jornada atualizada.');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const field = 'w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center outline-none focus:border-blue-400';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Jornada de {userName.split(' ')[0]}</DialogTitle>
          <DialogDescription>
            Carga diária e dias úteis usados nos cálculos do ponto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} className={field} />
            <span className="text-sm text-gray-500">h</span>
            <input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} className={field} />
            <span className="text-sm text-gray-500">min por dia útil</span>
          </div>

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
            Salvar jornada
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
