'use client';

// PÁGINA TEMPORÁRIA — só para conferir o visual do Controle de Ponto sem
// login no dev server. Apagar depois da verificação.

import { useState } from 'react';
import { MyPonto } from '@/app/nova-dash/_components/ponto/MyPonto';
import { MyHistory } from '@/app/nova-dash/_components/ponto/MyHistory';
import { DEFAULT_SCHEDULE, type PontoSession } from '@/app/_shared/lib/ponto';

const HOJE = '2026-08-15';

function iso(day: string, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, m)).toISOString();
}

function mk(date: string, start: string, end: string | null, pausas: [string, string | null][], extra: Partial<PontoSession> = {}): PontoSession {
  return {
    id: date, userId: 'u', discordId: 'u', date,
    startedAt: iso(date, start),
    pausedAt: null, resumedAt: null,
    finishedAt: end ? iso(date, end) : null,
    isActive: !end, isPaused: false,
    breaks: pausas.map(([a, b], i) => ({ start: iso(date, a), end: b ? iso(date, b) : null, kind: i === 0 ? 'almoco' : 'pausa' })),
    ...extra,
  };
}

const HISTORICO = [
  mk(HOJE, '08:12', null, [['12:05', '13:10'], ['15:30', '15:44']]),
  mk('2026-08-14', '08:02', '18:20', [['12:00', '13:00']]),
  mk('2026-08-13', '09:15', '17:30', [['12:30', '13:30']], { note: 'Consulta médica de manhã.' }),
  mk('2026-08-12', '08:00', '23:59', [['12:00', '13:00']], { autoClosed: true }),
  mk('2026-08-11', '08:00', '17:00', [['12:00', '13:00']], { editedById: 'x' }),
];

export default function PontoPreview() {
  const [session, setSession] = useState<PontoSession | null>(HISTORICO[0]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <MyPonto
          session={session}
          schedule={DEFAULT_SCHEDULE}
          today={HOJE}
          busy={false}
          onAction={async (a) => {
            if (a === 'finish') setSession((s) => s && { ...s, finishedAt: iso(HOJE, '18:03'), isActive: false });
          }}
        />
        <MyHistory
          sessions={HISTORICO}
          schedule={DEFAULT_SCHEDULE}
          month="2026-08"
          today={HOJE}
          onMonthChange={() => {}}
        />
      </div>
    </div>
  );
}
