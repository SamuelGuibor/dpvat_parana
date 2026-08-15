'use client';

// Aba "Ponto". Um único fetch alimenta o cartão de hoje e o histórico do mês;
// o painel Administrativo só aparece para quem a API autoriza
// (`canManageTeam` → permissão manage_ponto). Tema claro — o modo escuro fica
// por conta do Dark Reader, como no resto da dashboard.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { brDayKey } from '@/app/_shared/utils/date-br';
import { DEFAULT_SCHEDULE, type PontoSession, type WorkSchedule } from '@/app/_shared/lib/ponto';
import { MyPonto, type PontoAction } from './MyPonto';
import { MyHistory } from './MyHistory';
import { TeamPonto } from './TeamPonto';

interface PersonalData {
  month: string;
  today: string;
  canManageTeam: boolean;
  schedule: WorkSchedule;
  todaySession: PontoSession | null;
  sessions: PontoSession[];
}

export function WorkSessionPanel() {
  const [view, setView] = useState<'punch' | 'admin'>('punch');
  const [month, setMonth] = useState(() => brDayKey().slice(0, 7));
  const [data, setData] = useState<PersonalData | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/work-session?month=${month}`);
    if (!res.ok) return;
    setData(await res.json());
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // Quem deixa a aba aberta o dia todo continua vendo o próprio estado real
  // (ex.: o turno fechado automaticamente na virada do dia).
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const act = useCallback(async (action: PontoAction, extra?: { kind?: string; note?: string }) => {
    setBusy(true);
    try {
      const res = await fetch('/api/work-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error || 'Erro ao registrar ponto'); return; }

      const labels: Record<PontoAction, string> = {
        start: 'Turno iniciado!',
        pause: 'Pausa registrada!',
        resume: 'De volta ao trabalho!',
        finish: 'Turno encerrado!',
        reopen: 'Turno reaberto.',
        note: 'Observação salva.',
      };
      toast.success(labels[action]);
      await load();
      setRefreshKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }, [load]);

  const today = data?.today ?? brDayKey();
  const schedule = data?.schedule ?? DEFAULT_SCHEDULE;
  const isAdmin = view === 'admin' && !!data?.canManageTeam;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isAdmin ? 'Painel Administrativo' : 'Controle de Ponto'}
          </h1>
          <p className="text-sm text-gray-400">
            {isAdmin ? 'Visão geral da equipe e horas registradas.' : 'Registre sua jornada de trabalho de hoje.'}
          </p>
        </div>

        {data?.canManageTeam && (
          <div className="flex gap-0.5 rounded-full bg-gray-100 p-0.5">
            {([['punch', 'Meu Ponto'], ['admin', 'Administrativo']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  view === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isAdmin ? (
        <TeamPonto month={month} today={today} onMonthChange={setMonth} refreshKey={refreshKey} />
      ) : (
        <div className="space-y-5">
          <MyPonto
            session={data?.todaySession ?? null}
            schedule={schedule}
            today={today}
            onAction={act}
            busy={busy}
          />
          <MyHistory
            sessions={data?.sessions ?? []}
            schedule={schedule}
            month={month}
            today={today}
            onMonthChange={setMonth}
          />
        </div>
      )}
    </div>
  );
}
