/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback } from 'react';
// import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Clock, Play, Coffee, RotateCcw, Square, Users, TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/app/_components/ui/button';
import { Badge } from '@/app/_components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/_components/ui/card';

interface WorkSession {
  id: string;
  userId: string;
  discordId: string;
  date: string;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  finishedAt: string | null;
  isActive: boolean;
  isPaused: boolean;
  user?: { id: string; name: string; role: string } | null;
}

function calcWorkedMinutes(ws: WorkSession): number {
  if (!ws.startedAt) return 0;
  const start = new Date(ws.startedAt).getTime();
  const end = ws.finishedAt ? new Date(ws.finishedAt).getTime() : Date.now();
  let total = end - start;

  if (ws.pausedAt) {
    const pauseEnd = ws.resumedAt ? new Date(ws.resumedAt).getTime() : (ws.finishedAt ? new Date(ws.finishedAt).getTime() : Date.now());
    total -= pauseEnd - new Date(ws.pausedAt).getTime();
  }

  return Math.max(0, Math.floor(total / 60000));
}

function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m.toString().padStart(2, '0')}m`;
}

function fmtTime(dt: string | null): string {
  if (!dt) return '--:--';
  return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function PersonalPonto({ isDark }: { isDark: boolean }) {
  const [session, setSession] = useState<WorkSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const fetchSession = useCallback(async () => {
    const res = await fetch('/api/work-session');
    const data = await res.json();
    setSession(data);
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  useEffect(() => {
    if (!session) { setElapsed(0); return; }
    if (!session.isActive || session.isPaused) { setElapsed(calcWorkedMinutes(session)); return; }
    const interval = setInterval(() => setElapsed(calcWorkedMinutes(session)), 30000);
    setElapsed(calcWorkedMinutes(session));
    return () => clearInterval(interval);
  }, [session]);

  async function act(action: 'start' | 'pause' | 'resume' | 'finish') {
    setLoading(true);
    try {
      const res = await fetch('/api/work-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erro ao registrar ponto');
        return;
      }
      const data = await res.json();
      setSession(data);
      const labels: Record<string, string> = { start: 'Turno iniciado!', pause: 'Pausa registrada!', resume: 'Retorno registrado!', finish: 'Turno encerrado!' };
      toast.success(labels[action]);
    } finally {
      setLoading(false);
    }
  }

  const noSession = !session;
  const active = session?.isActive && !session?.isPaused;
  const paused = session?.isActive && session?.isPaused;
  const finished = !session?.isActive && !!session?.finishedAt;

  return (
    <Card className={`border-2 ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-blue-200 bg-white'}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5 text-blue-500" />
          Meu Ponto de Hoje
          <span className={`text-sm font-normal ml-auto ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status bar */}
        <div className={`flex items-center gap-3 p-3 rounded-xl ${isDark ? 'bg-zinc-800' : 'bg-gray-50'}`}>
          <div className={`w-3 h-3 rounded-full ${finished ? 'bg-gray-400' : active ? 'bg-green-400 animate-pulse' : paused ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'}`} />
          <span className="font-medium text-sm">
            {finished ? 'Turno encerrado' : active ? 'Trabalhando' : paused ? 'Em pausa' : 'Não iniciado'}
          </span>
          {session && (
            <span className="ml-auto font-mono font-bold text-blue-500">{fmtMinutes(elapsed)}</span>
          )}
        </div>

        {/* Timestamps */}
        {session && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: 'Início', value: fmtTime(session.startedAt), color: 'text-green-600' },
              { label: 'Pausa', value: fmtTime(session.pausedAt), color: 'text-yellow-600' },
              { label: 'Retorno', value: fmtTime(session.resumedAt), color: 'text-blue-600' },
              { label: 'Fim', value: fmtTime(session.finishedAt), color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`flex justify-between p-2 rounded-lg ${isDark ? 'bg-zinc-800' : 'bg-gray-50'}`}>
                <span className={isDark ? 'text-zinc-400' : 'text-gray-500'}>{label}</span>
                <span className={`font-mono font-semibold ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {noSession && (
            <Button onClick={() => act('start')} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
              <Play className="w-4 h-4 mr-2" /> Iniciar Turno
            </Button>
          )}
          {active && (
            <>
              <Button onClick={() => act('pause')} disabled={loading} variant="outline" className="border-yellow-400 text-yellow-600 hover:bg-yellow-50">
                <Coffee className="w-4 h-4 mr-2" /> Pausa Almoço
              </Button>
              <Button onClick={() => act('finish')} disabled={loading} variant="outline" className="border-red-400 text-red-600 hover:bg-red-50">
                <Square className="w-4 h-4 mr-2" /> Encerrar Turno
              </Button>
            </>
          )}
          {paused && (
            <Button onClick={() => act('resume')} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
              <RotateCcw className="w-4 h-4 mr-2" /> Retornar do Almoço
            </Button>
          )}
          {finished && (
            <Badge variant="outline" className="text-gray-500">Turno encerrado — {fmtMinutes(elapsed)} trabalhados</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TeamPonto({ isDark }: { isDark: boolean }) {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-session?all=true&month=${month}`);
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const byUser = sessions.reduce<Record<string, WorkSession[]>>((acc, s) => {
    const key = s.userId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  function avgMinutes(slist: WorkSession[]): number {
    const worked = slist.filter(s => s.startedAt).map(calcWorkedMinutes);
    if (!worked.length) return 0;
    return Math.round(worked.reduce((a, b) => a + b, 0) / worked.length);
  }

  function weeklyAvg(slist: WorkSession[]): number {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recent = slist.filter(s => s.startedAt && new Date(s.startedAt) >= weekAgo);
    return avgMinutes(recent);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className={`border-2 ${isDark ? 'border-zinc-700 bg-zinc-900' : 'border-purple-200 bg-white'}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="w-5 h-5 text-purple-500" />
          Logs da Equipe
          <div className="ml-auto flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={`text-sm border rounded-lg px-2 py-1 ${isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'border-gray-300'}`}
            />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-gray-400">Carregando...</div>
        ) : Object.keys(byUser).length === 0 ? (
          <div className="text-center py-8 text-gray-400">Nenhum registro encontrado</div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byUser).map(([userId, uSessions]) => {
              const user = uSessions[0]?.user;
              const todaySession = uSessions.find(s => s.date === today);
              const mAvg = avgMinutes(uSessions);
              const wAvg = weeklyAvg(uSessions);
              const totalDays = uSessions.filter(s => s.startedAt).length;

              return (
                <div key={userId} className={`rounded-xl border p-4 ${isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {(user?.name || 'U').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{user?.name || userId}</p>
                        <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>{totalDays} dias registrados</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <p className={isDark ? 'text-zinc-400' : 'text-gray-500'}>Média semanal</p>
                        <p className="font-bold text-blue-500 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />{fmtMinutes(wAvg)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className={isDark ? 'text-zinc-400' : 'text-gray-500'}>Média mensal</p>
                        <p className="font-bold text-purple-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />{fmtMinutes(mAvg)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Today's session quick view */}
                  {todaySession ? (
                    <div className={`grid grid-cols-4 gap-1 text-xs rounded-lg p-2 ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
                      {[
                        { label: 'Início', value: fmtTime(todaySession.startedAt), color: 'text-green-600' },
                        { label: 'Pausa', value: fmtTime(todaySession.pausedAt), color: 'text-yellow-600' },
                        { label: 'Retorno', value: fmtTime(todaySession.resumedAt), color: 'text-blue-600' },
                        { label: 'Fim', value: fmtTime(todaySession.finishedAt), color: 'text-red-600' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="text-center">
                          <p className={isDark ? 'text-zinc-500' : 'text-gray-400'}>{label}</p>
                          <p className={`font-mono font-semibold ${color}`}>{value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Sem registro hoje</p>
                  )}

                  {/* Session history */}
                  <details className="mt-2">
                    <summary className={`text-xs cursor-pointer ${isDark ? 'text-zinc-400' : 'text-gray-500'} hover:text-blue-500`}>
                      Ver histórico ({uSessions.length} dias)
                    </summary>
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                      {[...uSessions].sort((a, b) => b.date.localeCompare(a.date)).map(s => (
                        <div key={s.id} className={`flex items-center gap-2 text-xs p-1.5 rounded ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
                          <span className={`font-mono w-20 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                            {new Date(s.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                          <span className="text-green-600">{fmtTime(s.startedAt)}</span>
                          {s.pausedAt && <><span className="text-yellow-500">☕{fmtTime(s.pausedAt)}</span><span className="text-blue-500">↩{fmtTime(s.resumedAt)}</span></>}
                          {s.finishedAt && <span className="text-red-500">🔴{fmtTime(s.finishedAt)}</span>}
                          <span className="ml-auto font-semibold text-blue-500">{fmtMinutes(calcWorkedMinutes(s))}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TEAM_LOG_ACCESS = [
  // Adicione aqui os IDs dos usuários que podem ver os logs da equipe
  "cmazuwrcj0000iav499hqf5ij",
  "cmazo6j870000ia0gw5ppb486",
  ""
];

export function WorkSessionPanel({ isDark, role, userId }: { isDark: boolean; role?: string; userId?: string }) {
  const canSeeTeam = !!userId && TEAM_LOG_ACCESS.includes(userId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Clock className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Controle de Ponto</h1>
          <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>Registro de jornada de trabalho</p>
        </div>
      </div>

      <PersonalPonto isDark={isDark} />
      {canSeeTeam && <TeamPonto isDark={isDark} />}
    </div>
  );
}
