/* eslint-disable no-unused-vars */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2, Plus, Pencil, Trash2, Check, X, Users, TrendingUp, Loader2, Info,
  Trophy, UserPlus, Activity, UserX, Crown,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { metaFor } from '@/app/_shared/utils/action-meta';
import {
  listSectors, getSectorAdminContext, listAssignableUsers,
  type SectorDTO, type AssignableUser,
} from '@/app/_actions/sectors/list-sectors';
import { getSectorAnalytics, type SectorAnalytics, type SectorMemberStats } from '@/app/_actions/sectors/get-sector-analytics';
import {
  createSector, updateSector, deleteSector, assignUserSector,
} from '@/app/_actions/sectors/manage-sectors';

const COLOR_CHOICES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#64748b'];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'U';
}

function StatCard({ icon: Icon, label, value, sub, gradient }: {
  icon: React.ElementType; label: string; value: number | string; sub?: string; gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-lg ${gradient}`}>
      <div className="absolute -right-3 -top-3 opacity-20"><Icon className="h-16 w-16" /></div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-white/70">{sub}</p>}
    </div>
  );
}

/** Sparkline SVG simples (linha 2px + área suave) da atividade diária. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 200; const H = 36; const PAD = 2;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => {
    const x = PAD + i * step;
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const total = data.reduce((a, b) => a + b, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-full" preserveAspectRatio="none" role="img"
      aria-label={`Atividade diária: ${total} ações no período`}>
      <title>{`Atividade diária (${total} ações no período)`}</title>
      <polygon points={`${PAD},${H - PAD} ${pts.join(' ')} ${W - PAD},${H - PAD}`} fill={color} opacity={0.12} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Chips com o breakdown por tipo de ação (top 4 + resto agregado). */
function ActionChips({ byAction }: { byAction: Record<string, number> }) {
  const entries = Object.entries(byAction).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const top = entries.slice(0, 4);
  const rest = entries.slice(4).reduce((acc, [, n]) => acc + n, 0);
  return (
    <div className="flex flex-wrap gap-1.5">
      {top.map(([action, count]) => {
        const meta = metaFor(action);
        const Icon = meta.icon;
        return (
          <span key={action} title={`${meta.label}: ${count}`}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.tint}`}>
            <Icon className="h-3 w-3" /> {meta.label} · {count}
          </span>
        );
      })}
      {rest > 0 && (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
          +{rest} outras
        </span>
      )}
    </div>
  );
}

/** Linha de membro com barra de progresso relativa ao melhor do setor. */
function MemberRow({ m, rank, max, color, canManage, onRemove }: {
  m: SectorMemberStats; rank: number; max: number; color: string;
  canManage: boolean; onRemove?: () => void;
}) {
  const isTop = rank === 1 && m.total > 0;
  return (
    <div className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${m.total === 0 ? 'opacity-50' : ''}`}>
      <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-gray-400">{rank}</span>
      <Avatar className="h-7 w-7 border border-gray-100 dark:border-zinc-800">
        {m.image && <AvatarImage src={m.image} alt={m.name} />}
        <AvatarFallback className="bg-gray-100 text-[9px] font-bold text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">{initials(m.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-gray-800 dark:text-zinc-200">
            <span className="truncate">{m.name}</span>
            {isTop && <Crown className="h-3 w-3 shrink-0 text-amber-500" aria-label="Melhor rendimento do setor" />}
          </p>
          <span className="shrink-0 text-xs font-bold tabular-nums text-gray-900 dark:text-zinc-100">{m.total}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
          <div className="h-full rounded-full" style={{ width: `${(m.total / max) * 100}%`, backgroundColor: color }} />
        </div>
      </div>
      {canManage && onRemove && (
        <button onClick={onRemove} title="Remover do setor"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-transparent transition-colors hover:bg-red-50 hover:!text-red-600 group-hover:text-gray-300 dark:hover:bg-red-900/30">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface Props {
  /** Janela de análise (compartilhada com o seletor da Visão do Gestor). */
  period?: 7 | 30 | 90;
}

export function SectorDashboard({ period = 30 }: Props) {
  const [analytics, setAnalytics] = useState<SectorAnalytics | null>(null);
  const [sectors, setSectors] = useState<SectorDTO[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [ctx, setCtx] = useState<{ canManage: boolean; myId: string }>({ canManage: false, myId: '' });
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLOR_CHOICES[0]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [chartMode, setChartMode] = useState<'total' | 'perMember'>('total');

  const load = useCallback(async () => {
    try {
      const [a, s, c] = await Promise.all([getSectorAnalytics(period), listSectors(), getSectorAdminContext()]);
      setAnalytics(a);
      setSectors(s);
      setCtx(c);
      if (c.canManage) setUsers(await listAssignableUsers());
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar setores.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createSector({ name, color: newColor });
      setNewName('');
      toast.success('Setor criado.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateSector({ id, name });
      setEditingId(null);
      toast.success('Setor atualizado.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar.');
    }
  }

  async function handleRecolor(id: string, color: string) {
    try {
      await updateSector({ id, color });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao mudar a cor.');
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Excluir o setor "${name}"? As pessoas nele ficam sem setor.`)) return;
    try {
      await deleteSector(id);
      toast.success('Setor excluído.');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  async function handleAssign(userId: string, sectorId: string | null) {
    try {
      await assignUserSector({ userId, sectorId });
      await load();
      toast.success(sectorId ? 'Pessoa atribuída ao setor.' : 'Pessoa removida do setor.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atribuir.');
    }
  }

  const leader = useMemo(() => {
    if (!analytics?.sectors.length) return null;
    return [...analytics.sectors].sort((a, b) => b.total - a.total)[0] ?? null;
  }, [analytics]);

  const chartData = useMemo(() => (analytics?.sectors ?? []).map((s) => ({
    name: s.name,
    value: chartMode === 'total' ? s.total : s.perMember,
    total: s.total,
    perMember: s.perMember,
    color: s.color,
  })), [analytics, chartMode]);

  if (loading || !analytics) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const slugPreview = newName.trim()
    ? newName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : '';

  return (
    <div className="space-y-6">
      {/* Cartões de resumo */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Activity} label={`Ações (${period}d)`} value={analytics.totals.actions}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600" />
        <StatCard icon={Trophy} label="Setor líder" value={leader?.total ?? 0}
          sub={leader ? `${leader.name} · ${leader.perMember}/pessoa` : 'Sem setores'}
          gradient="bg-gradient-to-br from-orange-500 to-rose-600" />
        <StatCard icon={Users} label="Pessoas com setor" value={analytics.totals.assigned}
          sub={`${sectors.length} setor(es)`} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatCard icon={UserX} label="Sem setor" value={analytics.totals.unassigned}
          sub={analytics.totals.unassigned ? 'atribua abaixo' : 'todos atribuídos'}
          gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
      </div>

      {analytics.sectors.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <Building2 className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-semibold text-gray-700 dark:text-zinc-200">Nenhum setor cadastrado ainda</p>
          <p className="mt-1 text-sm text-gray-400">Crie o primeiro setor na seção &quot;Gerir setores&quot; abaixo e atribua as pessoas da equipe.</p>
        </section>
      ) : (
        <>
          {/* Comparativo entre setores */}
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                  <TrendingUp className="h-4 w-4 text-emerald-500" /> Comparativo de rendimento
                </h2>
                <p className="text-xs text-gray-400">
                  {chartMode === 'total'
                    ? `Total de ações registradas por setor nos últimos ${period} dias.`
                    : `Média de ações por pessoa em cada setor (compara setores de tamanhos diferentes).`}
                </p>
              </div>
              <div className="flex gap-1 rounded-lg border border-gray-200 p-1 dark:border-zinc-700">
                {([['total', 'Total'], ['perMember', 'Média/pessoa']] as const).map(([mode, label]) => (
                  <button key={mode} onClick={() => setChartMode(mode)}
                    className={`h-7 rounded-md px-3 text-xs font-semibold transition-colors ${
                      chartMode === mode
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,.12)', fontSize: 12 }}
                    formatter={(v: number, _n, item) => {
                      const p = item?.payload as { total: number; perMember: number } | undefined;
                      return chartMode === 'total'
                        ? [`${v} ações (${p?.perMember ?? 0}/pessoa)`, 'Total']
                        : [`${v} ações/pessoa (${p?.total ?? 0} no total)`, 'Média'];
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
                    {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Um card por setor: tendência, breakdown e ranking interno */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {analytics.sectors.map((s) => {
              const maxMember = Math.max(1, ...s.members.map((m) => m.total));
              const addable = users.filter((u) => u.sectorId !== s.id);
              return (
                <section key={s.id} className="flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="border-b border-gray-100 p-4 dark:border-zinc-800" style={{ borderTop: `3px solid ${s.color}`, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
                          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="truncate">{s.name}</span>
                          {leader?.id === s.id && leader.total > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                              <Trophy className="h-3 w-3" /> Líder
                            </span>
                          )}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          @{s.slug} · {s.memberCount} pessoa(s) · {s.activeMembers} ativa(s) no período
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-extrabold tabular-nums text-gray-900 dark:text-zinc-100">{s.total}</p>
                        <p className="text-[10px] text-gray-400">{s.perMember}/pessoa</p>
                      </div>
                    </div>
                    <div className="mt-3"><Sparkline data={s.daily} color={s.color} /></div>
                    <div className="mt-2"><ActionChips byAction={s.byAction} /></div>
                  </div>

                  <div className="flex-1 p-3">
                    {s.members.length === 0 ? (
                      <p className="py-4 text-center text-xs text-gray-400">Nenhuma pessoa atribuída a este setor.</p>
                    ) : (
                      <div className="space-y-0.5">
                        {s.members.map((m, i) => (
                          <MemberRow key={m.id} m={m} rank={i + 1} max={maxMember} color={s.color}
                            canManage={ctx.canManage}
                            onRemove={() => handleAssign(m.id, null)} />
                        ))}
                      </div>
                    )}

                    {ctx.canManage && addable.length > 0 && (
                      <div className="mt-2 flex items-center gap-2 border-t border-gray-100 px-2 pt-2.5 dark:border-zinc-800">
                        <UserPlus className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) handleAssign(e.target.value, s.id); }}
                          className="h-8 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 text-xs text-gray-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                        >
                          <option value="">Adicionar pessoa ao setor…</option>
                          {addable.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}{u.sectorId ? ` (${sectors.find((x) => x.id === u.sectorId)?.name ?? 'outro setor'})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}

            {/* Equipe sem setor */}
            {analytics.unassigned.length > 0 && (
              <section className="flex flex-col rounded-2xl border border-dashed border-gray-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                <div className="border-b border-gray-100 p-4 dark:border-zinc-800">
                  <h3 className="flex items-center gap-2 font-bold text-gray-700 dark:text-zinc-200">
                    <UserX className="h-4 w-4 text-gray-400" /> Sem setor
                  </h3>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Pessoas da equipe ainda sem setor — o rendimento delas não entra no comparativo.
                  </p>
                </div>
                <div className="flex-1 space-y-1 p-3">
                  {analytics.unassigned.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                      <Avatar className="h-7 w-7 border border-gray-100 dark:border-zinc-800">
                        {m.image && <AvatarImage src={m.image} alt={m.name} />}
                        <AvatarFallback className="bg-gray-100 text-[9px] font-bold text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">{initials(m.name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700 dark:text-zinc-300">{m.name}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-gray-500">{m.total} ações</span>
                      {ctx.canManage && (
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) handleAssign(m.id, e.target.value); }}
                          className="h-7 shrink-0 rounded-md border border-gray-200 bg-gray-50 px-1.5 text-[11px] text-gray-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                        >
                          <option value="">Atribuir…</option>
                          {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {/* Gestão de setores (só quem pode gerir) */}
      {ctx.canManage ? (
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-gray-900 dark:text-zinc-100">
            <Building2 className="h-4 w-4 text-blue-500" /> Gerir setores
          </h2>
          <p className="mb-4 text-xs text-gray-400">Crie, renomeie, mude a cor ou exclua setores. A atribuição de pessoas é feita nos cards acima.</p>

          {/* Criar novo */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="Nome do setor (ex.: Comercial)"
                className="h-9 w-full rounded-md border border-gray-300 bg-gray-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              {slugPreview && (
                <p className="mt-1 text-[10px] text-gray-400">
                  Menção no chat: <span className="rounded px-1 font-mono font-semibold" style={{ backgroundColor: `${newColor}20`, color: newColor }}>@{slugPreview}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {COLOR_CHOICES.map((c) => (
                <button key={c} onClick={() => setNewColor(c)} title={c}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${newColor === c ? 'scale-110 border-gray-900 dark:border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <button onClick={handleCreate} disabled={creating || !newName.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar
            </button>
          </div>

          {/* Lista de setores */}
          <div className="space-y-2">
            {sectors.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-zinc-800">
                <span className="h-6 w-6 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                {editingId === s.id ? (
                  <>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(s.id); if (e.key === 'Escape') setEditingId(null); }}
                      className="h-8 flex-1 rounded-md border border-gray-300 bg-gray-50 px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950" autoFocus />
                    <button onClick={() => handleRename(s.id)} className="grid h-7 w-7 place-items-center rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditingId(null)} className="grid h-7 w-7 place-items-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-200">{s.name}</p>
                      <p className="text-[11px] text-gray-400">@{s.slug} · {s.memberCount} pessoa(s)</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {COLOR_CHOICES.map((c) => (
                        <button key={c} onClick={() => handleRecolor(s.id, c)} title={c}
                          className={`h-4 w-4 rounded-full border ${s.color === c ? 'border-gray-900 dark:border-white' : 'border-transparent'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <button onClick={() => { setEditingId(s.id); setEditName(s.name); }} className="grid h-7 w-7 place-items-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(s.id, s.name)} className="grid h-7 w-7 place-items-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
            ))}
            {sectors.length === 0 && <p className="py-2 text-sm text-gray-400">Nenhum setor. Crie o primeiro acima.</p>}
          </div>
        </section>
      ) : (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Você não tem permissão para gerir setores.</p>
            <p className="mt-1 text-xs">
              Para liberar, adicione seu ID de usuário na variável de ambiente <code className="rounded bg-black/10 px-1">SECTOR_ADMIN_IDS</code> (separado por vírgula) e faça o redeploy.
              O seu ID é: <code className="rounded bg-black/10 px-1 font-mono">{ctx.myId}</code>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
