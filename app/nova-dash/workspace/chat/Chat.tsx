/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MentionsInput, Mention } from 'react-mentions';
import { Hash, MessageSquare, Plus, Reply, X, Users, Lock, Pencil, Trash2, Check, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { usePresence, type PresenceMember } from '@/app/_shared/hooks/use-presence';
import {
  useChannelMessages, useUnread, useMyChannels, useChatStream, markChannelRead, sendTyping,
  isTypingEvent, type ChatMessage, type ChatStreamEvent,
} from '@/app/_shared/hooks/use-chat';
import { sendMessage } from '@/app/_actions/chat/send-message';
import { editMessage, deleteMessage } from '@/app/_actions/chat/message-actions';
import { toggleReaction } from '@/app/_actions/chat/reactions';
import { getChatUploadUrl } from '@/app/_actions/chat/upload-attachment';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { listSectors, type SectorDTO } from '@/app/_actions/sectors/list-sectors';
import { Smile, Download as DownloadIcon, FileText } from 'lucide-react';

// Emojis disponíveis para reação (deve casar com o ALLOWED do server action).
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅'];
import { GENERAL_CHANNEL, dmChannelId } from '@/app/_shared/utils/chat';
import { renderFormattedText } from '@/app/_shared/utils/render-message';
import { MessageComposer } from './MessageComposer';
import { NewChannelDialog } from './NewChannelDialog';
import { ChannelInfoDialog } from './ChannelInfoDialog';
import { renderMentionSuggestion } from './mention-suggestion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type MentionableUser = { id: string; display: string };

// Estilo do MentionsInput usado na EDIÇÃO inline (sempre dentro da bolha azul
// da própria mensagem) — translúcido sobre o fundo azul, ao invés do fundo
// branco do composer principal.
const editMentionsStyles = {
  control: { backgroundColor: 'transparent', fontSize: 14, fontWeight: 'normal', color: '#fff' },
  '&multiLine': {
    control: { fontFamily: 'inherit', minHeight: 44 },
    highlighter: { padding: 8, border: '1px solid transparent' },
    input: {
      padding: 8, border: '1px solid rgba(255,255,255,0.4)', borderRadius: '0.5rem',
      outline: 'none', color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)',
    },
  },
  suggestions: {
    list: {
      backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.15)',
      fontSize: 13, borderRadius: '0.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      maxHeight: 180, overflowY: 'auto' as const,
    },
    item: {
      padding: '6px 10px', borderBottom: '1px solid rgba(0,0,0,0.05)', color: '#111827',
      '&focused': { backgroundColor: '#eff6ff', color: '#1d4ed8' },
    },
  },
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'U';
}
function avatarUrl(m: { id: string; image: string | null }) {
  return m.image || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(m.id)}`;
}
function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}


export function Chat() {
  const { data: session } = useSession();
  const meId = session?.user?.id ?? '';
  const { members } = usePresence();
  const { unread, refreshUnread } = useUnread();
  const { channels, refreshChannels } = useMyChannels();

  const [activeChannel, setActiveChannel] = useState<string>(GENERAL_CHANNEL);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [channelInfoOpen, setChannelInfoOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; ts: number }>>({});
  const { messages, mutate } = useChannelMessages(activeChannel);

  const others = useMemo(() => members.filter((m) => !m.isMe), [members]);

  // Setores viram opções de @menção (@comercial, @financeiro…). Carregados uma
  // vez; o servidor expande "sector:<id>" para todos os membros do setor.
  const [sectors, setSectors] = useState<SectorDTO[]>([]);
  useEffect(() => { listSectors().then(setSectors).catch(() => {}); }, []);

  const isDm = activeChannel.startsWith('dm:');
  const activeCustom = channels.find((c) => c.id === activeChannel) ?? null;
  const activeMember = isDm ? members.find((m) => activeChannel === dmChannelId(meId, m.id)) : null;

  // "@everyone" só faz sentido em canais de grupo (Geral/custom) — em DM é só
  // a outra pessoa. Ao ser enviado, o servidor expande para todo mundo do canal.
  const mentionData = useMemo(() => [
    ...(isDm ? [] : [{ id: 'everyone', display: 'everyone' }]),
    // Menção de setor só faz sentido em grupo (Geral/canal), não em DM.
    ...(isDm ? [] : sectors.map((s) => ({ id: `sector:${s.id}`, display: s.slug }))),
    ...others.map((m) => ({ id: m.id, display: m.name })),
  ], [others, isDm, sectors]);
  // Em canais de grupo (Geral/custom) mostramos o nome do autor; em DM não.
  const isGroup = !isDm;

  // Se o canal ativo era um canal custom e o dono o excluiu (ou você perdeu o
  // acesso), volta pro Geral em vez de deixar o membro numa conversa morta.
  useEffect(() => {
    if (activeChannel === GENERAL_CHANNEL || isDm) return;
    if (!channels.some((c) => c.id === activeChannel)) {
      setActiveChannel(GENERAL_CHANNEL);
    }
  }, [channels, activeChannel, isDm]);

  // SSE: mensagem real → revalida; evento "digitando" → registra o autor.
  const onStream = useCallback((e: ChatStreamEvent) => {
    if (isTypingEvent(e)) {
      if (e.channelId === activeChannel && e.userId !== meId) {
        setTypingUsers((prev) => ({ ...prev, [e.userId]: { name: e.userName, ts: Date.now() } }));
      }
      return;
    }
    if (e.channelId === activeChannel) mutate();
    refreshUnread();
  }, [activeChannel, meId, mutate, refreshUnread]);
  useChatStream(onStream);

  // Expira quem parou de digitar (sem novo aviso há >4s).
  useEffect(() => {
    const id = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => now - v.ts < 4_000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1_500);
    return () => clearInterval(id);
  }, []);

  // Ao abrir/trocar de canal (ou chegar msg), marca lido e limpa reply/typing.
  useEffect(() => { setReplyTo(null); setChannelInfoOpen(false); setTypingUsers({}); }, [activeChannel]);
  useEffect(() => {
    if (!activeChannel) return;
    markChannelRead(activeChannel).then(() => refreshUnread());
  }, [activeChannel, messages.length, refreshUnread]);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, replyTo]);

  async function handleSend(text: string, file?: File | null) {
    let attachment: { key: string; name: string; type: string } | null = null;

    // Sobe o anexo direto no S3 via URL pré-assinada antes de gravar a mensagem.
    if (file) {
      const presign = await getChatUploadUrl({ name: file.name, type: file.type, size: file.size });
      if (!presign.success || !presign.url || !presign.key) {
        toast.error(presign.error ?? 'Falha ao enviar o anexo.');
        return;
      }
      const put = await fetch(presign.url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!put.ok) {
        toast.error('Falha ao enviar o anexo.');
        return;
      }
      attachment = { key: presign.key, name: file.name, type: file.type || 'application/octet-stream' };
    }

    await sendMessage({ channelId: activeChannel, body: text, replyToId: replyTo?.id ?? null, attachment });
    setReplyTo(null);
    await mutate();
  }

  async function handleReact(messageId: string, emoji: string) {
    try {
      await toggleReaction({ messageId, emoji });
      await mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao reagir.');
    }
  }

  async function handleEdit(messageId: string, body: string) {
    await editMessage({ messageId, body });
    await mutate();
  }

  async function handleDelete(messageId: string) {
    await deleteMessage({ messageId });
    await mutate();
  }

  const typingNames = Object.values(typingUsers).map((t) => t.name);

  const headerName = activeChannel === GENERAL_CHANNEL ? 'Geral' : activeCustom?.name ?? activeMember?.name ?? 'Conversa';

  const generalInfoChannel = useMemo(
    () => ({
      id: GENERAL_CHANNEL,
      name: "Geral",
      memberIds: members.map((m) => m.id),
      createdById: null,
      isGeneral: true,
    }),
    [members]
  );

  const infoChannel =
    activeChannel === GENERAL_CHANNEL
      ? generalInfoChannel
      : activeCustom;

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* ---------- Lista de conversas ---------- */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-gray-100 bg-gray-50/50 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Canais</span>
          <button onClick={() => setNewChannelOpen(true)} title="Novo canal" className="grid h-5 w-5 place-items-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-zinc-800">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <ConversationButton active={activeChannel === GENERAL_CHANNEL} onClick={() => setActiveChannel(GENERAL_CHANNEL)} icon={<Hash className="h-4 w-4" />} label="Geral" badge={unread[GENERAL_CHANNEL]} />
        {channels.map((c) => (
          <ConversationButton key={c.id} active={activeChannel === c.id} onClick={() => setActiveChannel(c.id)} icon={<Lock className="h-3.5 w-3.5" />} label={c.name} badge={unread[c.id]} />
        ))}

        <div className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-gray-400">Mensagens diretas</div>
        <div className="flex-1 overflow-y-auto pb-2">
          {others.map((m) => {
            const ch = dmChannelId(meId, m.id);
            return (
              <ConversationButton key={m.id} active={activeChannel === ch} onClick={() => setActiveChannel(ch)} icon={<PresenceAvatar member={m} />} label={m.name} badge={unread[ch]} />
            );
          })}
        </div>
      </aside>

      {/* ---------- Thread + composer ---------- */}
      <section className="flex min-w-0 flex-1 flex-col bg-gray-50/30 dark:bg-zinc-950/20">
        <header className="flex items-center gap-2 border-b border-gray-100 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          {activeChannel === GENERAL_CHANNEL ? <Hash className="h-4 w-4 text-blue-500" />
            : activeCustom ? <Lock className="h-4 w-4 text-blue-500" />
              : activeMember ? <PresenceAvatar member={activeMember} /> : null}
          <span className="font-bold text-gray-900 dark:text-zinc-100">{headerName}</span>
          {infoChannel && (
        <button
          onClick={() => setChannelInfoOpen(true)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800"
        >
          <Users className="h-3 w-3" />
          {infoChannel.memberIds.length}
        </button>
      )}
          {/* {activeCustom && (
            <button
              onClick={() => setChannelInfoOpen(true)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800"
              title="Ver membros do canal"
            >
              <Users className="h-3 w-3" /> {activeCustom.memberIds.length}
            </button>
          )} */}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <MessageSquare className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">Nenhuma mensagem ainda. Comece a conversa!</p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const prev = messages[i - 1];
              const mine = msg.authorId === meId;
              const grouped = prev && prev.authorId === msg.authorId && !msg.replyToId
                && new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              return (
                <MessageRow
                  key={msg.id}
                  msg={msg}
                  mine={mine}
                  meId={meId}
                  grouped={!!grouped}
                  showName={isGroup && !mine}
                  mentionData={mentionData}
                  onReply={() => setReplyTo(msg)}
                  onEdit={(body) => handleEdit(msg.id, body)}
                  onDelete={() => handleDelete(msg.id)}
                  onReact={(emoji) => handleReact(msg.id, emoji)}
                />
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {/* Indicador "digitando…" */}
        {typingNames.length > 0 && (
          <div className="flex items-center gap-2 px-5 pb-1 text-[11px] text-gray-400">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
            </span>
            {typingNames.length === 1
              ? `${typingNames[0]} está digitando…`
              : typingNames.length === 2
                ? `${typingNames[0]} e ${typingNames[1]} estão digitando…`
                : `${typingNames.length} pessoas estão digitando…`}
          </div>
        )}

        {/* Banner de reply */}
        {replyTo && (
          <div className="flex items-center gap-2 border-t border-gray-100 bg-blue-50/60 px-4 py-2 dark:border-zinc-800 dark:bg-blue-900/20">
            <Reply className="h-4 w-4 shrink-0 text-blue-500" />
            <div className="min-w-0 flex-1 border-l-2 border-blue-400 pl-2">
              <p className="text-[11px] font-bold text-blue-600 dark:text-blue-300">Respondendo a {replyTo.authorName}</p>
              <p className="truncate text-xs text-gray-500 dark:text-zinc-400">{replyTo.body}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="grid h-6 w-6 place-items-center rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="border-t border-gray-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <MessageComposer
            members={mentionData}
            onSend={handleSend}
            onTyping={() => sendTyping(activeChannel)}
            placeholder={`Mensagem para ${headerName}...`}
          />
        </div>
      </section>

      <NewChannelDialog
        open={newChannelOpen}
        onClose={() => setNewChannelOpen(false)}
        members={others}
        onCreated={(id) => { refreshChannels(); setActiveChannel(id); }}
      />

      {infoChannel && (
        <ChannelInfoDialog
          open={channelInfoOpen}
          onClose={() => setChannelInfoOpen(false)}
          channel={infoChannel}
          presenceMembers={members}
          meId={meId}
          onRenamed={refreshChannels}
          onDeleted={() => {
            refreshChannels();
            setChannelInfoOpen(false);
            setActiveChannel(GENERAL_CHANNEL);
          }}
        />
      )}
    </div>
  );
}

/* ---------- subcomponentes ---------- */

function MessageRow({
  msg, mine, meId, grouped, showName, mentionData, onReply, onEdit, onDelete, onReact,
}: {
  msg: ChatMessage; mine: boolean; meId: string; grouped: boolean; showName: boolean; mentionData: MentionableUser[];
  onReply: () => void; onEdit: (body: string) => Promise<void>; onDelete: () => Promise<void>;
  onReact: (emoji: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.body);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const deleted = !!msg.deletedAt;

  async function saveEdit() {
    const text = editText.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onEdit(text);
      setEditing(false);
      toast.success('Mensagem editada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao editar.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!confirm('Apagar esta mensagem?')) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao apagar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`group flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
      {/* Avatar só para os outros (WhatsApp não mostra o seu). */}
      <div className="w-7 shrink-0">
        {!mine && !grouped && (
          <Avatar className="h-7 w-7 border border-gray-100 dark:border-zinc-800">
            <AvatarFallback className="bg-gray-200 text-[9px] font-bold text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">{initials(msg.authorName)}</AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className={`flex max-w-[72%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showName && !grouped && (
          <span className="mb-0.5 px-1 text-[11px] font-bold text-gray-500 dark:text-zinc-400">{msg.authorName}</span>
        )}
        <div
          className={`relative rounded-2xl px-3 py-2 text-sm shadow-sm ${
            deleted
              ? 'border border-dashed border-gray-200 bg-gray-50 text-gray-400 dark:border-zinc-700 dark:bg-zinc-900'
              : mine
                ? 'rounded-br-md bg-blue-600 text-white'
                : 'rounded-bl-md border border-gray-100 bg-white text-gray-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
          }`}
        >
          {deleted ? (
            <p className="flex items-center gap-1.5 italic"><Ban className="h-3.5 w-3.5" /> Esta mensagem foi apagada</p>
          ) : editing ? (
            <div className="w-64 max-w-full space-y-2">
              <MentionsInput
                value={editText}
                onChange={(e: any) => setEditText(e.target.value)}
                onKeyDown={(e: any) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditing(false); }}
                style={editMentionsStyles}
                autoFocus
              >
                <Mention
                  trigger="@"
                  data={mentionData}
                  markup="@[__display__](__id__)"
                  displayTransform={(_id: string, display: string) => `@${display}`}
                  renderSuggestion={renderMentionSuggestion}
                  appendSpaceOnAdd
                />
              </MentionsInput>
              <div className="flex items-center justify-end gap-1.5 text-[11px]">
                <button onClick={() => setEditing(false)} disabled={busy} className="rounded px-2 py-1 hover:bg-black/10">Cancelar</button>
                <button onClick={saveEdit} disabled={busy || !editText.trim()} className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 font-semibold hover:bg-white/30">
                  <Check className="h-3 w-3" /> Salvar
                </button>
              </div>
            </div>
          ) : (
            <>
              {msg.replyToId && (
                <div className={`mb-1 rounded-md border-l-2 px-2 py-1 text-xs ${mine ? 'border-white/60 bg-white/15' : 'border-blue-400 bg-gray-50 dark:bg-zinc-900/60'}`}>
                  <p className={`font-bold ${mine ? 'text-white/90' : 'text-blue-600 dark:text-blue-300'}`}>{msg.replyToAuthor ?? 'Mensagem'}</p>
                  <p className={`truncate ${mine ? 'text-white/80' : 'text-gray-500 dark:text-zinc-400'}`}>{msg.replyToBody}</p>
                </div>
              )}
              {msg.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{renderFormattedText(msg.body)}</p>}
              {msg.attachmentKey && (
                <AttachmentView
                  attachmentKey={msg.attachmentKey}
                  name={msg.attachmentName ?? 'arquivo'}
                  type={msg.attachmentType ?? ''}
                  mine={mine}
                />
              )}
              <span className={`ml-2 mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-white/70' : 'text-gray-400'}`}>
                {msg.editedAt && <span className="italic">editado</span>}
                {timeShort(msg.createdAt)}
              </span>
            </>
          )}
        </div>

        {/* Reações agrupadas por emoji */}
        {!deleted && msg.reactions && msg.reactions.length > 0 && (
          <ReactionChips reactions={msg.reactions} meId={meId} onReact={onReact} align={mine ? 'end' : 'start'} />
        )}
      </div>

      {/* Ações (aparecem no hover). Editar/apagar só do autor; não em msg apagada/edição. */}
      {!deleted && !editing && (
        <div className="relative mb-1 flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={() => setPickerOpen((v) => !v)} title="Reagir" className="grid h-6 w-6 place-items-center rounded-full text-gray-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-900/30">
            <Smile className="h-3.5 w-3.5" />
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute bottom-8 left-0 z-20 flex gap-0.5 rounded-full border border-gray-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onReact(emoji); setPickerOpen(false); }}
                    className="grid h-7 w-7 place-items-center rounded-full text-base hover:bg-gray-100 dark:hover:bg-zinc-700"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          )}
          <button onClick={onReply} title="Responder" className="grid h-6 w-6 place-items-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-zinc-800">
            <Reply className="h-3.5 w-3.5" />
          </button>
          {mine && (
            <>
              <button onClick={() => { setEditText(msg.body); setEditing(true); }} title="Editar" className="grid h-6 w-6 place-items-center rounded-full text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/30">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={confirmDelete} disabled={busy} title="Apagar" className="grid h-6 w-6 place-items-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Agrupa reações por emoji e mostra a contagem; destaca as que eu dei. */
function ReactionChips({
  reactions, meId, onReact, align,
}: { reactions: { emoji: string; userId: string; userName: string }[]; meId: string; onReact: (e: string) => void; align: 'start' | 'end' }) {
  const groups = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean; names: string[] }>();
    for (const r of reactions) {
      const g = map.get(r.emoji) ?? { count: 0, mine: false, names: [] };
      g.count++;
      g.names.push(r.userName);
      if (r.userId === meId) g.mine = true;
      map.set(r.emoji, g);
    }
    return Array.from(map.entries());
  }, [reactions, meId]);

  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      {groups.map(([emoji, g]) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          title={g.names.join(', ')}
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors ${
            g.mine
              ? 'border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
              : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          }`}
        >
          <span>{emoji}</span>
          <span className="tabular-nums">{g.count}</span>
        </button>
      ))}
    </div>
  );
}

/** Renderiza o anexo: imagem/vídeo/áudio inline; outros como card de download.
 *  Busca a URL pré-assinada (inline) sob demanda. */
function AttachmentView({
  attachmentKey, name, type, mine,
}: { attachmentKey: string; name: string; type: string; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const kind = type.startsWith('image/') ? 'image'
    : type.startsWith('video/') ? 'video'
    : type.startsWith('audio/') ? 'audio' : 'file';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    downloadFileFromS3(attachmentKey, name, true)
      .then((r) => { if (alive && r.success && r.presignedUrl) setUrl(r.presignedUrl); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attachmentKey, name]);

  async function forceDownload() {
    const r = await downloadFileFromS3(attachmentKey, name, false);
    if (r.success && r.presignedUrl) window.location.href = r.presignedUrl;
  }

  if (loading && !url) {
    return <div className="my-1 h-24 w-48 animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />;
  }
  if (!url) return null;

  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="my-1 max-h-64 max-w-full cursor-pointer rounded-lg" onClick={() => window.open(url, '_blank')} />;
  }
  if (kind === 'video') {
    return <video src={url} controls className="my-1 max-h-64 max-w-full rounded-lg" />;
  }
  if (kind === 'audio') {
    return <audio src={url} controls className="my-1 w-56 max-w-full" />;
  }
  return (
    <button
      onClick={forceDownload}
      className={`my-1 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
        mine ? 'border-white/30 bg-white/10 hover:bg-white/20' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-900'
      }`}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <DownloadIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </button>
  );
}

function ConversationButton({
  active, onClick, icon, label, badge,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`mx-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${active ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
        }`}
    >
      <span className="grid w-5 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      {badge ? (
        <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{badge > 99 ? '99+' : badge}</span>
      ) : null}
    </button>
  );
}

function PresenceAvatar({ member }: { member: PresenceMember }) {
  return (
    <div className="relative shrink-0">
      <Avatar className="h-6 w-6">
        <AvatarImage src={avatarUrl(member)} alt={member.name} />
        <AvatarFallback className="bg-blue-100 text-[9px] font-bold text-blue-700">{initials(member.name)}</AvatarFallback>
      </Avatar>
      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${member.online ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-600'}`} />
    </div>
  );
}
