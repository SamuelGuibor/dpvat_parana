/* eslint-disable no-unused-vars */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  AtSign, CheckCheck, CheckCircle2, Circle, Clock, Eye, Hash, Inbox, ListChecks,
  MessageSquare, RotateCcw, Search, ShieldCheck, Sparkles, SquareArrowOutUpRight,
  Trash2, Trello, UserRound, Users,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { Input } from '@/app/_shared/ui/input';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  listMyMentions, listTeamMentions, setMentionStatus, setManyMentionsStatus, clearDoneMentions,
  type MentionDTO, type MentionStatus,
} from '@/app/_actions/mentions/mention-actions';
import { notifyMentionsChanged } from '@/app/_shared/hooks/use-mentions';
import { usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';

/* ---------- helpers ---------- */

function initials(name?: string | null) {
  return (
    (name ?? '').trim().split(/\s+/).slice(0, 2)
      .map((p) => p.charAt(0)).join('').toUpperCase() || 'U'
  );
}

function relativeTime(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

function fullTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

/** Cabeçalho do grupo de dia: "Hoje", "Ontem" ou a data por extenso. */
function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Destaca os @nomes dentro do trecho, sem reprocessar markup. */
function Excerpt({ text, muted }: { text: string; muted: boolean }) {
  const parts = text.split(/(@[\wÀ-ÿ.]+(?:\s[A-ZÀ-Ý][\wÀ-ÿ.]+)?)/g);
  return (
    <span className={muted ? 'line-through decoration-emerald-500/40' : ''}>
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="font-semibold text-indigo-600 dark:text-indigo-400">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

type FilterKey = 'PENDING' | 'ACK' | 'DONE' | 'ALL';
type SourceKey = 'all' | 'comment' | 'chat';

const FILTERS: { key: FilterKey; label: string; dot: string }[] = [
  { key: 'PENDING', label: 'Pendentes', dot: 'bg-amber-500' },
  { key: 'ACK', label: 'Ciente', dot: 'bg-sky-500' },
  { key: 'DONE', label: 'Concluídas', dot: 'bg-emerald-500' },
  { key: 'ALL', label: 'Todas', dot: 'bg-gray-400' },
];

/* ---------- subcomponentes ---------- */

function StatCard({
  icon: Icon, label, value, gradient, active, onClick,
}: {
  icon: React.ElementType; label: string; value: number; gradient: string;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl p-4 text-left text-white shadow-lg transition-all ${gradient} ${
        active ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-50 dark:ring-offset-zinc-950' : 'opacity-90 hover:opacity-100 hover:-translate-y-0.5'
      }`}
    >
      <div className="absolute -right-3 -top-3 opacity-20">
        <Icon className="h-16 w-16" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
    </button>
  );
}

/** Anel de progresso (concluídas / total) desenhado com conic-gradient. */
function ProgressRing({ percent }: { percent: number }) {
  return (
    <div
      className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(#ffffff ${percent * 3.6}deg, rgba(255,255,255,0.22) 0deg)` }}
    >
      <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-indigo-600/90 backdrop-blur">
        <span className="text-xl font-extrabold tabular-nums text-white">{percent}%</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/70">resolvido</span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: MentionStatus }) {
  const map = {
    PENDING: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700 ring-amber-200' },
    ACK: { label: 'Ciente', cls: 'bg-sky-100 text-sky-700 ring-sky-200' },
    DONE: { label: 'Concluída', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  }[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${map.cls}`}>
      {map.label}
    </span>
  );
}

function IconAction({
  icon: Icon, title, onClick, tone = 'default',
}: { icon: React.ElementType; title: string; onClick: () => void; tone?: 'default' | 'sky' | 'emerald' }) {
  const tones = {
    default: 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800',
    sky: 'text-gray-400 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-sky-950',
    emerald: 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950',
  }[tone];
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${tones}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** Botões de ação da linha (ciente / concluir / reabrir / abrir origem). */
function RowActions({
  m, canOpen, readOnly, onStatus, onOpen,
}: {
  m: MentionDTO; canOpen: boolean; readOnly: boolean;
  onStatus: (id: string, status: MentionStatus) => void; onOpen: (m: MentionDTO) => void;
}) {
  if (readOnly) {
    // Supervisão: quem marca ciente/concluído é sempre a pessoa mencionada.
    return canOpen ? (
      <IconAction
        icon={SquareArrowOutUpRight}
        title={m.source === 'comment' ? 'Abrir o card' : 'Abrir a conversa'}
        onClick={() => onOpen(m)}
      />
    ) : null;
  }
  return (
    <>
      {m.status === 'PENDING' && (
        <IconAction icon={Eye} title="Tomei ciência" tone="sky" onClick={() => onStatus(m.id, 'ACK')} />
      )}
      {m.status === 'ACK' && (
        <IconAction icon={CheckCheck} title="Concluir" tone="emerald" onClick={() => onStatus(m.id, 'DONE')} />
      )}
      {m.status === 'DONE' && (
        <IconAction icon={RotateCcw} title="Reabrir" onClick={() => onStatus(m.id, 'PENDING')} />
      )}
      {canOpen && (
        <IconAction
          icon={SquareArrowOutUpRight}
          title={m.source === 'comment' ? 'Abrir o card' : 'Abrir a conversa'}
          onClick={() => onOpen(m)}
        />
      )}
    </>
  );
}

function MentionRow({
  m, readOnly = false, onStatus, onOpen,
}: {
  m: MentionDTO; readOnly?: boolean;
  onStatus: (id: string, status: MentionStatus) => void; onOpen: (m: MentionDTO) => void;
}) {
  const done = m.status === 'DONE';
  const isCard = m.source === 'comment';
  const canOpen = isCard ? m.targetExists : !!m.channelId;

  const accent = done
    ? 'before:bg-emerald-500'
    : m.status === 'ACK'
      ? 'before:bg-sky-500'
      : 'before:bg-amber-500';

  return (
    <li
      onClick={() => canOpen && onOpen(m)}
      className={`group relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-gray-100 px-3 py-3 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1 last:border-b-0 dark:border-zinc-800 md:grid-cols-[auto_minmax(0,1fr)_14rem_8.5rem_auto] md:items-center md:gap-4 md:px-4 ${accent} ${
        canOpen ? 'cursor-pointer' : ''
      } ${done ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : 'hover:bg-gray-50 dark:hover:bg-zinc-800/50'}`}
    >
      {/* ✅ marcar/desmarcar como concluída (na supervisão vira só indicador) */}
      {readOnly ? (
        <span
          title={`${done ? 'Concluída' : m.status === 'ACK' ? 'Ciente' : 'Pendente'} — só quem foi marcado pode alterar`}
          className="mt-0.5 shrink-0 md:mt-0"
        >
          {done
            ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            : <Circle className={`h-6 w-6 ${m.status === 'ACK' ? 'text-sky-400' : 'text-amber-400'}`} />}
        </span>
      ) : (
        <button
          type="button"
          title={done ? 'Reabrir' : 'Marcar como concluída'}
          aria-label={done ? 'Reabrir menção' : 'Marcar menção como concluída'}
          onClick={(e) => { e.stopPropagation(); onStatus(m.id, done ? 'PENDING' : 'DONE'); }}
          className="mt-0.5 shrink-0 md:mt-0"
        >
          {done ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-500 transition-transform hover:scale-110" />
          ) : (
            <Circle className="h-6 w-6 text-gray-300 transition-all hover:scale-110 hover:text-emerald-500 dark:text-zinc-600" />
          )}
        </button>
      )}

      {/* quem marcou + trecho */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Avatar className="h-6 w-6 border border-white shadow-sm dark:border-zinc-800">
            {m.authorImage && <AvatarImage src={m.authorImage} alt={m.authorName} />}
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-bold text-white">
              {initials(m.authorName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-bold text-gray-800 dark:text-zinc-100">{m.authorName}</span>
          <span className="text-xs text-gray-400">marcou</span>
          {m.recipientName ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pl-0.5 pr-2 text-xs font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
              <Avatar className="h-4 w-4">
                {m.recipientImage && <AvatarImage src={m.recipientImage} alt={m.recipientName} />}
                <AvatarFallback className="bg-indigo-500 text-[8px] font-bold text-white">
                  {initials(m.recipientName)}
                </AvatarFallback>
              </Avatar>
              {m.recipientName}
            </span>
          ) : (
            <span className="text-xs text-gray-400">você</span>
          )}
          <span className="md:hidden"><StatusPill status={m.status} /></span>
        </div>
        <p className={`mt-1 line-clamp-2 text-sm leading-snug ${done ? 'text-gray-400' : 'text-gray-600 dark:text-zinc-300'}`}>
          <Excerpt text={m.excerpt} muted={done} />
        </p>

        {/* origem + tempo + ações (só no celular; no desktop viram colunas) */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 md:hidden">
          <OriginBadge m={m} />
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
            <Clock className="h-3 w-3" />{relativeTime(m.createdAt)}
          </span>
          <span className="ml-auto flex items-center gap-0.5">
            <RowActions m={m} canOpen={canOpen} readOnly={readOnly} onStatus={onStatus} onOpen={onOpen} />
          </span>
        </div>
      </div>

      {/* coluna: de onde veio */}
      <div className="hidden min-w-0 md:block"><OriginBadge m={m} /></div>

      {/* coluna: quando */}
      <div className="hidden md:block">
        <span title={fullTime(m.createdAt)} className="inline-flex items-center gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />{relativeTime(m.createdAt)}
        </span>
        <div className="mt-1"><StatusPill status={m.status} /></div>
      </div>

      {/* coluna: ações (aparecem no hover da linha) */}
      <div className="hidden w-[104px] items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:flex">
        <RowActions m={m} canOpen={canOpen} readOnly={readOnly} onStatus={onStatus} onOpen={onOpen} />
      </div>
    </li>
  );
}

/** Etiqueta de origem: card do Kanban (com nº), canal do chat ou WhatsApp. */
function OriginBadge({ m }: { m: MentionDTO }) {
  if (m.source === 'whatsapp') {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300">
        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{m.targetName.replace(/^WhatsApp · /, '') || 'WhatsApp'}</span>
      </span>
    );
  }
  if (m.source === 'chat') {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300">
        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{m.targetName.replace(/^Chat · /, '') || 'Chat'}</span>
      </span>
    );
  }
  return (
    <span
      title={m.targetExists ? m.targetName : 'Card apagado'}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${
        m.targetExists
          ? 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300'
          : 'bg-gray-100 text-gray-400 line-through ring-gray-200 dark:bg-zinc-800'
      }`}
    >
      <Trello className="h-3.5 w-3.5 shrink-0" />
      {m.cardNumber != null && (
        <span className="inline-flex items-center gap-0.5 opacity-70"><Hash className="h-2.5 w-2.5" />{m.cardNumber}</span>
      )}
      <span className="truncate">{m.targetName}</span>
    </span>
  );
}

/* ---------- principal ---------- */

export function MentionsInbox() {
  const { confirm, confirmDialog } = useConfirm();
  const { perms } = usePermissions();
  const canSeeTeam = perms.view_all_mentions;

  const [items, setItems] = useState<MentionDTO[]>([]);
  // Visão de supervisão (ADMIN++): carregada sob demanda, só leitura.
  const [teamItems, setTeamItems] = useState<MentionDTO[] | null>(null);
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [person, setPerson] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('PENDING');
  const [sourceFilter, setSourceFilter] = useState<SourceKey>('all');
  const [query, setQuery] = useState('');

  const isTeam = scope === 'team' && canSeeTeam;

  const load = useCallback(async () => {
    try {
      setItems(await listMyMentions());
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível carregar as menções.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A lista da equipe só é buscada quando a visão é aberta pela primeira vez.
  useEffect(() => {
    if (!isTeam || teamItems !== null) return;
    let alive = true;
    setLoading(true);
    listTeamMentions()
      .then((rows) => { if (alive) setTeamItems(rows); })
      .catch((err) => {
        console.error(err);
        toast.error('Não foi possível carregar as menções da equipe.');
        if (alive) setTeamItems([]);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isTeam, teamItems]);

  const source = useMemo(() => (isTeam ? teamItems ?? [] : items), [isTeam, teamItems, items]);

  // Na visão de equipe, o filtro por pessoa vem antes de tudo.
  const scoped = useMemo(
    () => (isTeam && person !== 'all' ? source.filter((m) => m.recipientId === person) : source),
    [source, isTeam, person],
  );

  const counts = useMemo(() => ({
    PENDING: scoped.filter((m) => m.status === 'PENDING').length,
    ACK: scoped.filter((m) => m.status === 'ACK').length,
    DONE: scoped.filter((m) => m.status === 'DONE').length,
    ALL: scoped.length,
  }), [scoped]);

  const percent = counts.ALL ? Math.round((counts.DONE / counts.ALL) * 100) : 0;

  // Placar por pessoa da equipe (só na supervisão), ordenado por pendências.
  const people = useMemo(() => {
    if (!isTeam) return [];
    const map = new Map<string, {
      id: string; name: string; image: string | null;
      PENDING: number; ACK: number; DONE: number; total: number;
    }>();
    for (const m of source) {
      const id = m.recipientId ?? '';
      if (!id) continue;
      const entry = map.get(id) ?? {
        id, name: m.recipientName ?? 'Usuário', image: m.recipientImage ?? null,
        PENDING: 0, ACK: 0, DONE: 0, total: 0,
      };
      entry[m.status] += 1;
      entry.total += 1;
      map.set(id, entry);
    }
    return [...map.values()].sort((a, b) => b.PENDING - a.PENDING || b.total - a.total);
  }, [source, isTeam]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((m) => {
      if (filter !== 'ALL' && m.status !== filter) return false;
      if (sourceFilter !== 'all' && m.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        m.excerpt.toLowerCase().includes(q)
        || m.authorName.toLowerCase().includes(q)
        || (m.recipientName ?? '').toLowerCase().includes(q)
        || m.targetName.toLowerCase().includes(q)
        || String(m.cardNumber ?? '').includes(q)
      );
    });
  }, [scoped, filter, sourceFilter, query]);

  // Agrupamento por dia — a caixa lê como uma linha do tempo.
  const groups = useMemo(() => {
    const map = new Map<string, MentionDTO[]>();
    for (const m of visible) {
      const key = dayLabel(m.createdAt);
      const arr = map.get(key);
      if (arr) arr.push(m); else map.set(key, [m]);
    }
    return [...map.entries()];
  }, [visible]);

  /** Muda o estado com atualização otimista (a lista não pisca). */
  const handleStatus = useCallback(async (id: string, status: MentionStatus) => {
    const before = items;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((m) => (m.id === id
      ? {
        ...m,
        status,
        ackAt: status === 'PENDING' ? null : m.ackAt ?? now,
        doneAt: status === 'DONE' ? now : null,
      }
      : m)));
    try {
      await setMentionStatus(id, status);
      notifyMentionsChanged();
      if (status === 'DONE') toast.success('Tarefa concluída ✅');
      else if (status === 'ACK') toast.success('Marcada como ciente 👀');
    } catch (err) {
      console.error(err);
      setItems(before);
      toast.error('Não foi possível atualizar a menção.');
    }
  }, [items]);

  const handleBulkAck = useCallback(async () => {
    const ids = items.filter((m) => m.status === 'PENDING').map((m) => m.id);
    if (!ids.length) return;
    const before = items;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((m) => (m.status === 'PENDING' ? { ...m, status: 'ACK' as const, ackAt: now } : m)));
    try {
      await setManyMentionsStatus(ids, 'ACK');
      notifyMentionsChanged();
      toast.success(`${ids.length} menç${ids.length === 1 ? 'ão marcada' : 'ões marcadas'} como ciente.`);
    } catch (err) {
      console.error(err);
      setItems(before);
      toast.error('Não foi possível marcar todas.');
    }
  }, [items]);

  const handleClearDone = useCallback(async () => {
    const total = counts.DONE;
    if (!total) return;
    const ok = await confirm({
      title: 'Limpar concluídas?',
      description: `${total} menç${total === 1 ? 'ão concluída será apagada' : 'ões concluídas serão apagadas'} da sua caixa. As pendentes e as marcadas como ciente continuam aqui.`,
      confirmLabel: 'Limpar',
      tone: 'danger',
    });
    if (!ok) return;
    const before = items;
    setItems((prev) => prev.filter((m) => m.status !== 'DONE'));
    try {
      await clearDoneMentions();
      notifyMentionsChanged();
      toast.success('Caixa limpa.');
    } catch (err) {
      console.error(err);
      setItems(before);
      toast.error('Não foi possível limpar.');
    }
  }, [items, counts.DONE, confirm]);

  /** Clique na linha: abre o card no Kanban, a conversa no chat ou o WhatsApp. */
  const handleOpen = useCallback((m: MentionDTO) => {
    if (m.source === 'whatsapp') {
      if (!m.channelId) return; // channelId = contactId da conversa
      // Mesmo padrão do chat: sessionStorage cobre o caso do inbox ainda não
      // estar montado (usuário precisa trocar pra aba WhatsApp).
      try { sessionStorage.setItem('wa-open-contact', m.channelId); } catch { /* noop */ }
      window.dispatchEvent(new CustomEvent('open-whatsapp-conversation', { detail: { contactId: m.channelId } }));
      toast.info('Abra a aba WhatsApp — a conversa já fica selecionada.');
      return;
    }
    if (m.source === 'chat') {
      if (!m.channelId) return;
      // sessionStorage cobre o caso do chat ainda não estar montado na troca de aba.
      try { sessionStorage.setItem('chat-open-channel', m.channelId); } catch { /* noop */ }
      window.dispatchEvent(new CustomEvent('open-chat-channel', { detail: { channelId: m.channelId } }));
      return;
    }
    const cardId = m.processId ?? m.userId;
    if (!cardId || !m.targetExists) {
      toast.error('Esse card não existe mais.');
      return;
    }
    // O board não está montado enquanto esta aba está ativa, então o evento
    // sozinho se perde: o sessionStorage segura o pedido até os items chegarem
    // (mesmo padrão da busca global).
    const payload = { id: cardId, isProcess: !!m.processId };
    try { sessionStorage.setItem('kanban-open-card', JSON.stringify(payload)); } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent('open-kanban-card', { detail: payload }));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-600/20 md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 opacity-15">
          <AtSign className="h-56 w-56" />
        </div>
        <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
              {isTeam
                ? <><ShieldCheck className="h-3.5 w-3.5" /> Supervisão · toda a equipe</>
                : <><Sparkles className="h-3.5 w-3.5" /> Sua caixa pessoal</>}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Menções &amp; Tarefas</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              {isTeam
                ? 'Todas as menções da equipe: quem foi marcado, em que card e o que ainda está pendente. Só leitura — quem marca ciente ou conclui é a própria pessoa.'
                : 'Tudo em que te marcaram nos comentários e no chat fica aqui — mesmo depois de limpar o sino. Assinale ✅ quando tomar ciência ou finalizar a tarefinha.'}
            </p>

            {/* Alternador de escopo — só para quem tem view_all_mentions. */}
            {canSeeTeam && (
              <div className="mt-4 inline-flex items-center gap-1 rounded-xl bg-white/15 p-1 backdrop-blur">
                {([
                  { key: 'mine' as const, label: 'Minhas', icon: UserRound },
                  { key: 'team' as const, label: 'Da equipe', icon: Users },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setScope(key); setPerson('all'); }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      scope === key ? 'bg-white text-indigo-700 shadow' : 'text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />{label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ProgressRing percent={percent} />
        </div>
      </div>

      {/* Placar por pessoa (só na supervisão) — clicar filtra a tabela */}
      {isTeam && people.length > 0 && (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Por pessoa</p>
            {person !== 'all' && (
              <button onClick={() => setPerson('all')} className="text-[11px] font-bold text-indigo-600 hover:underline">
                ver todos
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {people.map((p) => {
              const active = person === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPerson(active ? 'all' : p.id)}
                  className={`flex w-44 shrink-0 items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm dark:bg-indigo-950/30'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <Avatar className="h-9 w-9 border border-white shadow-sm dark:border-zinc-800">
                    {p.image && <AvatarImage src={p.image} alt={p.name} />}
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                      {initials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-gray-800 dark:text-zinc-100">{p.name}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold">
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700" title="Pendentes">{p.PENDING}</span>
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700" title="Ciente">{p.ACK}</span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700" title="Concluídas">{p.DONE}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Números — clicar filtra */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard icon={Inbox} label="Pendentes" value={counts.PENDING} active={filter === 'PENDING'}
          onClick={() => setFilter('PENDING')} gradient="bg-gradient-to-br from-amber-500 to-orange-600" />
        <StatCard icon={Eye} label="Ciente" value={counts.ACK} active={filter === 'ACK'}
          onClick={() => setFilter('ACK')} gradient="bg-gradient-to-br from-sky-500 to-blue-600" />
        <StatCard icon={CheckCircle2} label="Concluídas" value={counts.DONE} active={filter === 'DONE'}
          onClick={() => setFilter('DONE')} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatCard icon={ListChecks} label="Total" value={counts.ALL} active={filter === 'ALL'}
          onClick={() => setFilter('ALL')} gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
      </div>

      {/* Barra de ferramentas */}
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map(({ key, label, dot }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                filter === key
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${filter === key ? 'bg-white' : dot}`} />
              {label}
              <span className={`tabular-nums ${filter === key ? 'text-white/70' : 'text-gray-400'}`}>{counts[key]}</span>
            </button>
          ))}

          <span className="mx-1 hidden h-5 w-px bg-gray-200 dark:bg-zinc-700 sm:block" />

          {([
            { key: 'all' as const, label: 'Tudo', icon: ListChecks },
            { key: 'comment' as const, label: 'Cards', icon: Trello },
            { key: 'chat' as const, label: 'Chat', icon: MessageSquare },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSourceFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                sourceFilter === key
                  ? 'bg-gray-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-64 lg:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por texto, pessoa ou card…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          {!isTeam && counts.PENDING > 0 && (
            <button
              onClick={handleBulkAck}
              title="Dar ciência em todas as pendentes"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300"
            >
              <Eye className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ciente em todas</span>
            </button>
          )}
          {!isTeam && counts.DONE > 0 && (
            <button
              onClick={handleClearDone}
              title="Apagar as concluídas"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-bold text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:bg-zinc-800"
            >
              <Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Limpar concluídas</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* Cabeçalho de colunas (desktop) */}
        <div className="hidden grid-cols-[auto_minmax(0,1fr)_14rem_8.5rem_auto] items-center gap-4 border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:border-zinc-800 dark:bg-zinc-800/50 md:grid">
          <span className="w-6 text-center">✅</span>
          <span>Menção</span>
          <span>De onde veio</span>
          <span>Quando</span>
          <span className="w-[104px]" />
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100 dark:divide-zinc-800">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4">
                <div className="h-6 w-6 animate-pulse rounded-full bg-gray-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 animate-pulse rounded bg-gray-200 dark:bg-zinc-800" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-zinc-800/60" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/20">
              {filter === 'PENDING' ? <CheckCircle2 className="h-8 w-8" /> : <Inbox className="h-8 w-8" />}
            </div>
            <p className="text-base font-bold text-gray-700 dark:text-zinc-200">
              {query
                ? 'Nada encontrado nessa busca'
                : filter === 'PENDING'
                  ? isTeam ? 'Nenhuma pendência na equipe 🎉' : 'Tudo em dia por aqui 🎉'
                  : filter === 'DONE'
                    ? 'Nenhuma menção concluída ainda'
                    : 'Nenhuma menção por enquanto'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-gray-400">
              {query
                ? 'Tente outro termo ou troque o filtro acima.'
                : isTeam
                  ? 'Assim que alguém da equipe for marcado com @, a menção aparece aqui.'
                  : 'Quando alguém te marcar com @ num comentário de card ou no chat, aparece aqui na hora.'}
            </p>
          </div>
        ) : (
          groups.map(([day, rows]) => (
            <div key={day}>
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{day}</span>
                <span className="text-[10px] font-semibold text-gray-300 dark:text-zinc-600">· {rows.length}</span>
              </div>
              <ul>
                {rows.map((m) => (
                  <MentionRow key={m.id} m={m} readOnly={isTeam} onStatus={handleStatus} onOpen={handleOpen} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 px-1 text-center text-[11px] text-gray-400">
        {isTeam
          ? 'Visão de supervisão: clique na linha para abrir o card ou a conversa. Marcar ciente/concluído é sempre da pessoa mencionada.'
          : 'Dica: clique na linha para abrir o card ou a conversa de origem — e no ✅ para concluir.'}
      </p>

      {confirmDialog}
    </div>
  );
}
