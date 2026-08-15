'use client';

// Linha do tempo do dia: uma barra recortada na janela útil, com o tempo
// trabalhado em verde e as pausas em âmbar. Serve tanto no cartão de hoje
// (com o marcador de "agora") quanto nas linhas do histórico.

import {
  dayStartMs,
  effectiveEndMs,
  minutesIntoDay,
  parseBreaks,
  BREAK_LABEL,
  fmtClock,
  type PontoSession,
} from '@/app/_shared/lib/ponto';

interface Props {
  session: PontoSession;
  now: number;
  /** Versão fina, sem réguas de hora — usada nas listas. */
  compact?: boolean;
}

// Janela mínima exibida: 07h–19h. Se o turno extrapolar, a barra acompanha.
const MIN_START = 7 * 60;
const MIN_END = 19 * 60;

export function DayTimeline({ session, now, compact }: Props) {
  if (!session.startedAt) return null;

  const startMin = minutesIntoDay(session.startedAt, session.date);
  const endMin = Math.round((effectiveEndMs(session, now) - dayStartMs(session.date)) / 60_000);

  const from = Math.max(0, Math.min(MIN_START, Math.floor(startMin / 60) * 60));
  const to = Math.min(24 * 60, Math.max(MIN_END, Math.ceil(endMin / 60) * 60));
  const span = Math.max(60, to - from);

  const pct = (min: number) => ((Math.max(from, Math.min(to, min)) - from) / span) * 100;

  const breaks = parseBreaks(session).map((b) => {
    const bs = minutesIntoDay(b.start, session.date);
    const be = b.end ? minutesIntoDay(b.end, session.date) : endMin;
    return { ...b, left: pct(bs), width: Math.max(0.6, pct(be) - pct(bs)) };
  });

  const hourTicks: number[] = [];
  const step = span > 14 * 60 ? 180 : 120;
  for (let h = Math.ceil(from / step) * step; h <= to; h += step) hourTicks.push(h);

  const nowMin = Math.round((now - dayStartMs(session.date)) / 60_000);
  const showNow = !session.finishedAt && nowMin >= from && nowMin <= to;

  return (
    <div className={compact ? '' : 'space-y-1'}>
      <div className={`relative w-full overflow-hidden rounded-full bg-gray-100 ${compact ? 'h-1.5' : 'h-2.5'}`}>
        {/* Jornada bruta */}
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-400"
          style={{ left: `${pct(startMin)}%`, width: `${Math.max(0.8, pct(endMin) - pct(startMin))}%` }}
          title={`${fmtClock(session.startedAt)} → ${session.finishedAt ? fmtClock(session.finishedAt) : 'agora'}`}
        />
        {/* Pausas recortadas por cima */}
        {breaks.map((b, i) => (
          <div
            key={`${b.start}-${i}`}
            className={`absolute inset-y-0 bg-amber-300 ${b.end ? '' : 'animate-pulse'}`}
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
            title={`${BREAK_LABEL[b.kind]}: ${fmtClock(b.start)} → ${b.end ? fmtClock(b.end) : 'em curso'}`}
          />
        ))}
        {showNow && (
          <div className="absolute inset-y-0 w-0.5 bg-blue-500" style={{ left: `${pct(nowMin)}%` }} title="agora" />
        )}
      </div>

      {!compact && (
        <div className="relative h-4 text-[10px] text-gray-400">
          {hourTicks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pct(t)}%` }}>
              {String(Math.floor(t / 60)).padStart(2, '0')}h
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
