/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { Badge } from '@/app/_shared/ui/badge';
import { Button } from '@/app/_shared/ui/button';
import {
  Activity, Sparkles, Flame, CalendarDays, Mail, Phone, ShieldCheck, IdCard,
  Settings, TrendingUp, Trophy,
} from 'lucide-react';
import { getMyActivity, type MyActivity } from '@/app/_actions/users/get-my-activity';
import { getMyProfile } from '@/app/_actions/users/update-profile';
import { ACTION_META, metaFor } from '@/app/_shared/utils/action-meta';
import { ProfileDialog } from './ProfileDialog';

interface Profile {
  id: string; name: string; email: string; telefone: string;
  cpf: string; role: string; image: string | null; createdAt: string;
}

/* ---------- helpers ---------- */

function initials(name?: string | null) {
  return (
    (name ?? '')
      .trim().split(/\s+/).slice(0, 2)
      .map((p) => p.charAt(0)).join('').toUpperCase() || 'U'
  );
}

function firstName(name?: string | null) {
  return (name ?? '').trim().split(/\s+/)[0] || 'você';
}

/* ---------- subcomponentes ---------- */

function StatCard({
  icon: Icon, label, value, gradient,
}: { icon: React.ElementType; label: string; value: number | string; gradient: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-lg ${gradient}`}>
      <div className="absolute -right-3 -top-3 opacity-20">
        <Icon className="h-16 w-16" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-200/70 dark:bg-zinc-800 ${className}`} />;
}

/* ---------- principal ---------- */

export function MySpace() {
  const { data: session } = useSession();
  const [activity, setActivity] = useState<MyActivity | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = React.useCallback(async () => {
    try {
      const [act, prof] = await Promise.all([getMyActivity(), getMyProfile()]);
      setActivity(act);
      setProfile(prof);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const name = profile?.name || session?.user?.name || 'Usuário';
  const image = profile?.image ?? session?.user?.image ?? null;

  // Streak: nº de dias consecutivos (terminando hoje) com pelo menos 1 ação.
  const streak = useMemo(() => {
    if (!activity) return 0;
    let s = 0;
    for (let i = activity.daily.length - 1; i >= 0; i--) {
      if (activity.daily[i].count > 0) s++;
      else break;
    }
    return s;
  }, [activity]);

  const peak = useMemo(() => {
    if (!activity) return 0;
    return Math.max(1, ...activity.daily.map((d) => d.count));
  }, [activity]);

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="mx-auto max-w-8xl px-6 py-8">
      {/* Saudação */}
      <div className="mb-6 flex items-center gap-4">
        <Avatar className="h-14 w-14 border-2 border-white shadow-md dark:border-zinc-800">
          {image && <AvatarImage src={image} alt={name} />}
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-zinc-100">
            Olá, {firstName(name)} <span className="inline-block">👋</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Aqui está o resumo do seu trabalho no painel.
          </p>
        </div>
      </div>

      {/* Produtividade — cards de destaque */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard icon={Activity} label="Ações hoje" value={activity?.totals.today ?? 0}
            gradient="bg-gradient-to-br from-blue-500 to-indigo-600" />
          <StatCard icon={TrendingUp} label="Esta semana" value={activity?.totals.week ?? 0}
            gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
          <StatCard icon={Trophy} label="Este mês" value={activity?.totals.month ?? 0}
            gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
          <StatCard icon={Flame} label="Sequência" value={`${streak} ${streak === 1 ? 'dia' : 'dias'}`}
            gradient="bg-gradient-to-br from-orange-500 to-rose-600" />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna principal: gráfico + feed */}
        <div className="space-y-6 lg:col-span-2">
          {/* Gráfico de atividade */}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                  <Sparkles className="h-4 w-4 text-blue-500" /> Minha produtividade
                </h2>
                <p className="text-xs text-gray-400">Atividade dos últimos 14 dias</p>
              </div>
              <Badge variant="secondary" className="gap-1 text-[10px]">
                pico {peak}/dia
              </Badge>
            </div>

            {loading ? (
              <SkeletonBlock className="h-40" />
            ) : (
              <>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={activity?.daily ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="myAct" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={1} />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }}
                        labelStyle={{ fontWeight: 700 }}
                        formatter={(v: number) => [`${v} ${v === 1 ? 'ação' : 'ações'}`, '']}
                      />
                      <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} fill="url(#myAct)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Breakdown por tipo de ação */}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(ACTION_META).map(([key, meta]) => {
                    const count = activity?.byAction[key] ?? 0;
                    const Icon = meta.icon;
                    return (
                      <div key={key} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ring-1 ${meta.ring} dark:ring-zinc-800`}>
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${meta.tint}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-bold leading-none text-gray-900 tabular-nums dark:text-zinc-100">{count}</p>
                          <p className="truncate text-[11px] text-gray-400">{meta.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* Meu feed */}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
              <Activity className="h-4 w-4 text-violet-500" /> Meu feed
            </h2>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-12" />)}
              </div>
            ) : !activity?.feed.length ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400">
                <Activity className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">Nenhuma atividade registrada ainda.</p>
              </div>
            ) : (
              <ol className="relative space-y-1">
                {activity.feed.map((item, idx) => {
                  const meta = metaFor(item.action);
                  const Icon = meta.icon;
                  const last = idx === activity.feed.length - 1;
                  return (
                    <li key={item.id} className="relative flex gap-3 pb-3">
                      {/* linha da timeline */}
                      {!last && <span className="absolute left-[15px] top-8 h-full w-px bg-gray-100 dark:bg-zinc-800" />}
                      <span className={`z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-white dark:ring-zinc-900 ${meta.tint}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm text-gray-700 dark:text-zinc-200">
                          {item.message}
                          {item.targetName && (
                            <span className="font-semibold text-gray-900 dark:text-zinc-100"> · {item.targetName}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Coluna lateral: Meu perfil */}
        <aside className="lg:col-span-1">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {/* faixa colorida */}
            <div className="relative h-24 bg-gradient-to-br from-blue-600 to-indigo-600">
              <div className="absolute inset-0 opacity-20"
                style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
            </div>

            <div className="px-5 pb-5">
              <div className="-mt-10 flex items-end justify-between">
                <Avatar className="h-20 w-20 border-4 border-white shadow-lg dark:border-zinc-900">
                  {image && <AvatarImage src={image} alt={name} />}
                  <AvatarFallback className="bg-blue-100 text-2xl font-bold text-blue-700">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" /> Editar
                </Button>
              </div>

              <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-zinc-100">{name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge className="gap-1 border-emerald-200 bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
                </Badge>
                {profile?.role && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <ShieldCheck className="h-3 w-3" /> {profile.role}
                  </Badge>
                )}
              </div>

              {loading ? (
                <div className="mt-5 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-9" />)}
                </div>
              ) : (
                <dl className="mt-5 space-y-1">
                  <ProfileRow icon={Mail} label="E-mail" value={profile?.email} />
                  <ProfileRow icon={Phone} label="Telefone" value={profile?.telefone || '—'} />
                  <ProfileRow icon={IdCard} label="CPF" value={profile?.cpf || '—'} />
                  {memberSince && <ProfileRow icon={CalendarDays} label="Membro desde" value={memberSince} />}
                </dl>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Reaproveita o diálogo de edição já existente */}
      <ProfileDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); load(); }}
      />
    </div>
  );
}

function ProfileRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/60">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-500 dark:bg-zinc-800">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
        <dd className="truncate text-sm font-medium text-gray-800 dark:text-zinc-200">{value}</dd>
      </div>
    </div>
  );
}
