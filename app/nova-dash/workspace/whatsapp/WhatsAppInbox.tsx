/* eslint-disable no-unused-vars */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Bot, Check, CheckCheck, AlertCircle, MessageCircle, Paperclip,
  UserRound, Undo2, Archive, Headset, Inbox as InboxIcon, Search, X,
  Clock, Pencil, Trash2, Reply as ReplyIcon, Ban, Loader2, Tag as TagIcon,
  FileBadge, ChevronDown, BadgeCheck, XCircle, Settings2, FileText,
  HelpCircle, AlertTriangle, StickyNote,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/app/_shared/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem,
} from '@/app/_shared/ui/dropdown-menu';
import { useChatStream, type ChatStreamEvent } from '@/app/_shared/hooks/use-chat';
import {
  useWhatsAppConversations, useWhatsAppMessages, type WhatsAppThreadMessage,
} from '@/app/_shared/hooks/use-whatsapp';
import {
  assumeConversation, returnConversationToBot, closeConversation, markConversationRead,
  listWhatsAppAttendants, type WhatsAppConversationDTO, type AttendantDTO,
} from '@/app/_actions/whatsapp/conversations';
import {
  sendWhatsAppMessage, sendWhatsAppMedia, getWhatsAppUploadUrl,
  editWhatsAppMessage, deleteWhatsAppMessage,
} from '@/app/_actions/whatsapp/send-message';
import { listWhatsAppTags, toggleConversationTag, type WhatsAppTagDTO } from '@/app/_actions/whatsapp/tags';
import { CLOSE_CATEGORY_OPTIONS, CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { WhatsAppComposer } from './WhatsAppComposer';
import { ClientInfoModal } from './ClientInfoModal';
import { WhatsAppTagsModal } from './WhatsAppTagsModal';
import { WhatsAppSendTemplateModal } from './WhatsAppSendTemplateModal';
import { formatWaText } from './wa-format';
import { resolveMimeType } from './media-rules';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Nome amigável do arquivo a partir da chave S3. As chaves de mídia recebida
// têm o formato ".../{timestamp}-{nome}", então tiramos o prefixo numérico e
// decodificamos. Ex.: "whatsapp/abc/1720000000000-contrato.pdf" → "contrato.pdf".
function fileNameFromKey(key: string): string {
  const raw = key.split('/').pop() ?? 'arquivo';
  const noTimestamp = raw.replace(/^\d{10,}-/, '');
  try { return decodeURIComponent(noTimestamp); } catch { return noTimestamp; }
}

// Cache de URLs pré-assinadas em memória (por chave S3) — evita gerar uma nova
// a cada re-render da thread (polling/SSE). Expira 5 min antes do real (1h).
const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();
async function getMediaUrl(key: string): Promise<string | null> {
  const cached = mediaUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const fileName = key.split('/').pop() ?? 'anexo';
  const res = await downloadFileFromS3(key, fileName, true);
  if (!res.success || !res.presignedUrl) return null;
  mediaUrlCache.set(key, { url: res.presignedUrl, expiresAt: Date.now() + 55 * 60_000 });
  return res.presignedUrl;
}

// Janela de resposta da Meta: 24h desde a última mensagem RECEBIDA do cliente.
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

// Ícone/cor de cada categoria no menu manual de "Encerrar".
const CLOSE_MENU_META: Record<string, { Icon: React.ElementType; color: string }> = {
  qualificado:     { Icon: BadgeCheck,    color: 'text-emerald-600' },
  nao_qualificado: { Icon: XCircle,       color: 'text-gray-400' },
  perguntas:       { Icon: HelpCircle,    color: 'text-blue-500' },
  novo_acidente:   { Icon: AlertTriangle, color: 'text-amber-500' },
  transferido:     { Icon: Headset,       color: 'text-violet-500' },
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || '?';
}
function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function formatPhone(phone: string) {
  // 5541999999999 → +55 41 99999-9999 (best-effort, só para exibição)
  const m = phone.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${phone}`;
}

const STATUS_LABEL: Record<string, string> = {
  bot: 'Com o bot',
  queued: 'Na fila',
  human: 'Em atendimento',
  closed: 'Encerrada',
};
const STATUS_CHIP: Record<string, string> = {
  bot: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  queued: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  human: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  closed: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',
};

export function WhatsAppInbox() {
  const { data: session } = useSession();
  const meId = session?.user?.id ?? '';

  const { conversations, refreshConversations } = useWhatsAppConversations();
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const { messages, mutate: mutateMessages, loadOlder, hasMore, loadingOlder } = useWhatsAppMessages(activeContactId);

  const [search, setSearch] = useState('');
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [attendants, setAttendants] = useState<AttendantDTO[]>([]);
  const [attendantFilter, setAttendantFilter] = useState('all');

  // Tags livres pra organizar/filtrar conversas.
  const [allTags, setAllTags] = useState<WhatsAppTagDTO[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [sendTemplateOpen, setSendTemplateOpen] = useState(false);

  function reloadTags() {
    listWhatsAppTags().then(setAllTags).catch(() => {});
  }
  useEffect(() => { reloadTags(); }, []);

  // Aba única abaixo de "Fila de espera" / "Meus atendimentos" (que ficam
  // sempre fixas no topo) — reduz a lista de grupos empilhados pra 1 por vez.
  // As 3 últimas espelham CLOSE_CATEGORY_LABELS (categorias de encerramento);
  // "qualified"/"unqualified" continuam com nome próprio por compatibilidade.
  const TABS = [
    { key: 'qualified', label: 'Qualificadas' },
    { key: 'bot', label: 'Com o bot' },
    { key: 'unqualified', label: 'Não qualificadas' },
    { key: 'others', label: 'Outros atendentes' },
    { key: 'perguntas', label: CLOSE_CATEGORY_LABELS.perguntas },
    { key: 'novo_acidente', label: CLOSE_CATEGORY_LABELS.novo_acidente },
    { key: 'transferido', label: CLOSE_CATEGORY_LABELS.transferido },
  ] as const;
  type TabKey = (typeof TABS)[number]['key'];
  const [activeTab, setActiveTab] = useState<TabKey>('others');

  // Envio otimista: a mensagem entra na thread como "sending" na hora e o
  // input fica livre; quando a action confirma, o registro real substitui.
  const [pending, setPending] = useState<WhatsAppThreadMessage[]>([]);
  const [replyTo, setReplyTo] = useState<WhatsAppThreadMessage | null>(null);
  const [editTarget, setEditTarget] = useState<WhatsAppThreadMessage | null>(null);

  // Clique na citação (quote) pula pra mensagem original, se ela estiver carregada.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  function jumpToMessage(id: string | null | undefined) {
    if (!id) return;
    const el = rowRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1500);
  }

  useEffect(() => {
    listWhatsAppAttendants().then(setAttendants).catch(() => {});
  }, []);

  useEffect(() => {
    setPending([]); setReplyTo(null); setEditTarget(null);
  }, [activeContactId]);

  // Notificação de WhatsApp clicada → abre a conversa do contato. O sinal
  // chega por evento (inbox já montado) ou pelo sessionStorage (montou agora).
  useEffect(() => {
    const stored = sessionStorage.getItem('wa-open-contact');
    if (stored) {
      sessionStorage.removeItem('wa-open-contact');
      setActiveContactId(stored);
    }
    function openConversation(e: Event) {
      const contactId = (e as CustomEvent<{ contactId?: string }>).detail?.contactId;
      if (!contactId) return;
      sessionStorage.removeItem('wa-open-contact');
      setActiveContactId(contactId);
    }
    window.addEventListener('open-whatsapp-conversation', openConversation);
    return () => window.removeEventListener('open-whatsapp-conversation', openConversation);
  }, []);

  const active = conversations.find((c) => c.contactId === activeContactId) ?? null;

  // SSE do relay existente: eventos de WhatsApp chegam como canal "whatsapp:*".
  const onStream = useCallback((e: ChatStreamEvent) => {
    const channelId = (e as { channelId?: string }).channelId;
    if (!channelId?.startsWith('whatsapp:')) return;
    if (channelId === `whatsapp:${activeContactId}`) mutateMessages();
    refreshConversations();
  }, [activeContactId, mutateMessages, refreshConversations]);
  useChatStream(onStream);

  // Abrir conversa zera o badge de não-lida.
  useEffect(() => {
    if (!active?.unread || !active.id) return;
    markConversationRead(active.id).then(() => refreshConversations()).catch(() => {});
  }, [active?.id, active?.unread, messages.length, refreshConversations]);

  const displayMessages = useMemo(
    () => [...messages, ...pending.filter((p) => p.contactId === activeContactId)],
    [messages, pending, activeContactId],
  );

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Ao carregar mensagens ANTIGAS (prepend), preservamos a posição de leitura em
  // vez de pular pro fim. Guardamos a altura antes do prepend e ajustamos depois.
  const prependAnchorRef = useRef<number | null>(null);

  useEffect(() => {
    // Prepend de bloco antigo: mantém o ponto onde o usuário estava lendo.
    if (prependAnchorRef.current != null && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight - prependAnchorRef.current;
      prependAnchorRef.current = null;
      return;
    }
    // Fluxo normal (mensagem nova / troca de conversa): desce pro fim.
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length]);

  async function handleLoadOlder() {
    // Âncora = distância do fim; após o prepend, o effect recompõe o scrollTop.
    if (scrollRef.current) prependAnchorRef.current = scrollRef.current.scrollHeight - scrollRef.current.scrollTop;
    await loadOlder();
  }

  // Busca por nome ou celular + filtro por tags (basta bater em uma das selecionadas).
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return conversations.filter((c) => {
      if (term) {
        const nameMatch = (c.contactName ?? '').toLowerCase().includes(term);
        const phoneMatch = digits.length >= 2 && c.contactPhone.includes(digits);
        if (!nameMatch && !phoneMatch) return false;
      }
      if (tagFilter.length && !c.tags.some((t) => tagFilter.includes(t.id))) return false;
      return true;
    });
  }, [conversations, search, tagFilter]);

  const groups = useMemo(() => {
    const closed = filtered.filter((c) => c.status === 'closed');
    // Conversas encerradas ANTES desta feature não têm closeCategory — caem
    // no fallback pelo `qualified` antigo (true→qualificada, senão→não qualificada).
    const byCategory = (cat: string) => closed.filter((c) => c.closeCategory === cat);
    return {
      // Urgentes (detectados pela IA) primeiro na fila de espera.
      queued: filtered.filter((c) => c.status === 'queued')
        .sort((a, b) => Number(b.urgent) - Number(a.urgent)),
      mine: filtered.filter((c) => c.status === 'human' && c.assignedToId === meId),
      others: filtered.filter((c) => c.status === 'human' && c.assignedToId !== meId
        && (attendantFilter === 'all' || c.assignedToId === attendantFilter)),
      bot: filtered.filter((c) => c.status === 'bot'),
      qualified: closed.filter((c) => c.closeCategory === 'qualificado' || (!c.closeCategory && c.qualified === true)),
      unqualified: closed.filter((c) => c.closeCategory === 'nao_qualificado' || (!c.closeCategory && c.qualified !== true)),
      perguntas: byCategory('perguntas'),
      novo_acidente: byCategory('novo_acidente'),
      transferido: byCategory('transferido'),
    };
  }, [filtered, meId, attendantFilter]);

  const tabItems: Record<TabKey, WhatsAppConversationDTO[]> = {
    others: groups.others, bot: groups.bot, unqualified: groups.unqualified, qualified: groups.qualified,
    perguntas: groups.perguntas, novo_acidente: groups.novo_acidente, transferido: groups.transferido,
  };

  // Janela de 24h: sem mensagem recebida recente, a Meta só aceita template.
  const windowExpired = !!active && (
    !active.lastInboundAt || Date.now() - new Date(active.lastInboundAt).getTime() > WINDOW_24H_MS
  );

  async function runAction(fn: () => Promise<void>, okMsg: string) {
    try {
      await fn();
      await refreshConversations();
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha na operação.');
    }
  }

  async function handleToggleTag(tagId: string) {
    if (!active) return;
    try {
      await toggleConversationTag(active.id, tagId);
      await refreshConversations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar tag.');
    }
  }

  /* ---------- envio otimista ---------- */

  function makePending(partial: Partial<WhatsAppThreadMessage>): WhatsAppThreadMessage {
    return {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      contactId: activeContactId ?? '',
      direction: 'out',
      body: null,
      mediaKey: null,
      mediaType: null,
      status: 'sending',
      sentByBot: false,
      authorId: meId,
      authorName: session?.user?.name ?? 'Você',
      internal: false,
      createdAt: new Date().toISOString(),
      ...partial,
    };
  }
  function patchPending(id: string, patch: Partial<WhatsAppThreadMessage>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function removePending(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSendText(text: string) {
    if (!active) return;
    const rt = replyTo;
    setReplyTo(null);
    const temp = makePending({
      body: text,
      replyToId: rt?.id ?? null,
      replyToBody: rt ? rt.body ?? '📎 Anexo' : null,
      replyToDirection: rt?.direction ?? null,
    });
    setPending((prev) => [...prev, temp]);

    sendWhatsAppMessage({ contactId: active.contactId, body: text, replyToId: rt?.id ?? null })
      .then(async () => {
        removePending(temp.id);
        await Promise.all([mutateMessages(), refreshConversations()]);
      })
      .catch((e) => {
        patchPending(temp.id, { status: 'failed' });
        toast.error(e instanceof Error ? e.message : 'Falha ao enviar.');
      });
  }

  function handleSendMedia(files: File[], caption: string) {
    if (!active) return;
    const contactId = active.contactId;
    const rt = replyTo;
    setReplyTo(null);

    const temps = files.map((file, i) => makePending({
      body: i === 0 && caption ? caption : null,
      mediaType: resolveMimeType(file),
      replyToId: i === 0 ? rt?.id ?? null : null,
      replyToBody: i === 0 && rt ? rt.body ?? '📎 Anexo' : null,
      replyToDirection: i === 0 ? rt?.direction ?? null : null,
    }));
    setPending((prev) => [...prev, ...temps]);

    (async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const temp = temps[i];
        try {
          const mime = resolveMimeType(file);
          const { url, key } = await getWhatsAppUploadUrl(contactId, file.name, mime);
          const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': mime } });
          if (!put.ok) throw new Error(`Falha ao subir "${file.name}".`);
          await sendWhatsAppMedia({
            contactId, key, mimeType: mime, fileName: file.name,
            caption: i === 0 ? caption || undefined : undefined,
            replyToId: i === 0 ? rt?.id ?? null : null,
          });
          removePending(temp.id);
        } catch (e) {
          patchPending(temp.id, { status: 'failed' });
          toast.error(e instanceof Error ? e.message : `Falha ao enviar "${file.name}".`);
        }
      }
      await Promise.all([mutateMessages(), refreshConversations()]);
    })();
  }

  function retryPending(msg: WhatsAppThreadMessage) {
    removePending(msg.id);
    if (msg.body && !msg.mediaType) handleSendText(msg.body);
  }

  async function handleEditSubmit(id: string, text: string) {
    await editWhatsAppMessage(id, text);
    setEditTarget(null);
    await mutateMessages();
  }

  async function handleDelete(msg: WhatsAppThreadMessage) {
    if (!window.confirm('Apagar esta mensagem da thread? (ela continua no celular do cliente)')) return;
    try {
      await deleteWhatsAppMessage(msg.id);
      await mutateMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao apagar.');
    }
  }

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-[#dce8e1] bg-[#dce8e1] shadow-sm dark:border-zinc-800 whatsapp-darkreader">
      {/* ---------- Lista de conversas ---------- */}
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-[#14332a] bg-[#1f3d33] dark:border-zinc-800 whatsapp-darkreader">
        {/* Cabeçalho fixo: título + busca + tags (não rola com a lista) */}
        <div className="shrink-0 border-b border-[#16362c] bg-[#1f3d33]/95 px-3 pb-3 pt-3 backdrop-blur dark:border-zinc-800 whatsapp-darkreader">
          <div className="mb-2 flex items-center gap-2 px-1">
            <MessageCircle className="h-4 w-4 text-[#6fd6ad]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#6fd6ad]">WhatsApp</span>
            {conversations.length > 0 && (
              <span className="ml-auto rounded-full bg-[#1d9e75] px-1.5 text-[11px] font-bold text-white">
                {conversations.length}
              </span>
            )}
          </div>

          {/* Busca por nome ou celular */}
          <div className="flex items-center gap-2 rounded-lg border border-[#3a6b58] bg-[#2e5749] px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-[#6fd6ad]">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#8fbcac]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou celular..."
              className="w-full bg-transparent text-base text-white outline-none placeholder:text-[#8fbcac]"
            />
            {search && (
              <button onClick={() => setSearch('')} title="Limpar busca" className="text-[#8fbcac] hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtro por tags */}
          {allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {allTags.map((t) => {
                const on = tagFilter.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => setTagFilter((prev) => (on ? prev.filter((id) => id !== t.id) : [...prev, t.id]))}
                    className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors"
                    style={on
                      ? { backgroundColor: t.color, borderColor: t.color, color: 'white' }
                      : { borderColor: t.color, color: t.color }}
                  >
                    {t.name}
                  </button>
                );
              })}
              <button onClick={() => setTagsModalOpen(true)} title="Gerenciar tags" className="rounded-full p-1 text-[#8fbcac] hover:bg-[#2e5749] hover:text-white">
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {allTags.length === 0 && (
            <div className="mt-2">
              <button onClick={() => setTagsModalOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-[#8fbcac] hover:text-white">
                <TagIcon className="h-3 w-3" /> Criar tags
              </button>
            </div>
          )}
        </div>

        {/* Área rolável: só a lista de conversas rola */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
          {conversations.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[#a7c9bc]">
              <InboxIcon className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-base">Nenhuma conversa ainda.</p>
              <p className="mt-1 text-sm">Quando um cliente mandar mensagem no WhatsApp, ela aparece aqui.</p>
            </div>
          )}
          {conversations.length > 0 && filtered.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[#a7c9bc]">
              <Search className="mb-2 h-6 w-6 opacity-40" />
              <p className="text-base">Nada encontrado com esse filtro.</p>
            </div>
          )}

          {/* Fixas no topo */}
          <ConversationGroup title="Fila de espera" items={groups.queued} activeContactId={activeContactId} onSelect={setActiveContactId} highlight />
          <ConversationGroup title="Meus atendimentos" items={groups.mine} activeContactId={activeContactId} onSelect={setActiveContactId} />

          {/* Aba com o resto das categorias — uma lista por vez.
              Gruda no topo da área rolável (sticky) pra ficar sempre acessível. */}
          <div className="sticky top-0 z-10 mt-3 flex gap-1 overflow-x-auto border-y border-[#14332a] bg-[#1f3d33]/95 px-3 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold transition-colors ${
                  activeTab === tab.key
                    ? 'bg-[#1d9e75] text-white'
                    : 'bg-[#2e5749] text-[#cfe6db] hover:bg-[#366b58]'
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-1.5 text-[11px] font-bold ${activeTab === tab.key ? 'bg-white/20' : 'bg-[#1a4034]'}`}>
                  {tabItems[tab.key].length}
                </span>
              </button>
            ))}
          </div>

          {activeTab === 'others' && attendants.length > 0 && (
            <div className="px-4 pb-1 pt-2">
              <select
                value={attendantFilter}
                onChange={(e) => setAttendantFilter(e.target.value)}
                className="h-7 w-full max-w-[180px] cursor-pointer rounded-md border border-[#dce8e1] bg-[#2e5749] px-1.5 text-xs font-semibold text-[#cfe6db] outline-none"
              >
                <option value="all">Todos os atendentes</option>
                {attendants.filter((a) => a.id !== meId).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <ConversationGroup
            title={TABS.find((t) => t.key === activeTab)!.label}
            items={tabItems[activeTab]}
            activeContactId={activeContactId}
            onSelect={setActiveContactId}
            hideTitle
            emptyLabel={
              activeTab === 'others' ? 'Nenhuma conversa com outros atendentes.'
                : activeTab === 'bot' ? 'Nenhuma conversa com o bot.'
                  : activeTab === 'qualified' ? 'Nenhuma conversa qualificada ainda.'
                    : activeTab === 'unqualified' ? 'Nenhuma conversa encerrada não qualificada.'
                      : `Nenhuma conversa encerrada como "${TABS.find((t) => t.key === activeTab)?.label}".`
            }
          />
        </div>
      </aside>

      {/* ---------- Thread ---------- */}
      <section className="flex min-w-0 flex-1 flex-col bg-[#dce8e1] dark:bg-zinc-950/20">
        {!active ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <MessageCircle className="mb-2 h-10 w-10 opacity-30" />
            <p className="text-base">Selecione uma conversa para atender.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <Avatar className="h-8 w-8 border border-gray-100 dark:border-zinc-800">
                <AvatarFallback className="bg-emerald-100 text-[11px] font-bold text-emerald-700">
                  {initials(active.contactName ?? active.contactPhone)}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => setClientModalOpen(true)}
                title="Abrir ficha do cliente"
                className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800"
              >
                <p className="truncate font-bold text-gray-900 underline-offset-2 hover:underline dark:text-zinc-100">
                  {active.contactName ?? formatPhone(active.contactPhone)}
                </p>
                <p className="text-xs text-gray-400">
                  {formatPhone(active.contactPhone)}
                  {active.assignedToName ? ` · com ${active.assignedToName}` : ''}
                  {' · clique para ver a ficha'}
                </p>
                {active.tags.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {active.tags.map((t) => (
                      <span key={t.id} className="rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: t.color }}>
                        {t.name}
                      </span>
                    ))}
                  </span>
                )}
              </button>
              {active.urgent && active.status !== 'closed' && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                  <AlertTriangle className="h-3 w-3" /> Urgente
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[active.status] ?? ''}`}>
                {STATUS_LABEL[active.status] ?? active.status}
                {active.status === 'closed' && (active.qualified ? ' · Qualificada' : ' · Não qualificada')}
              </span>

              {/* Tags da conversa */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <TagIcon className="h-3.5 w-3.5" /> Tags
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-sm">Tags desta conversa</DropdownMenuLabel>
                  {allTags.length === 0 && (
                    <DropdownMenuItem disabled className="text-sm text-gray-400">Nenhuma tag criada ainda.</DropdownMenuItem>
                  )}
                  {allTags.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t.id}
                      checked={active.tags.some((at) => at.id === t.id)}
                      onCheckedChange={() => handleToggleTag(t.id)}
                      className="text-base"
                    >
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTagsModalOpen(true)} className="text-base">
                    <Settings2 className="mr-2 h-3.5 w-3.5" /> Gerenciar tags
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {(active.status === 'queued' || active.status === 'bot' || (active.status === 'human' && active.assignedToId !== meId)) && (
                <HeaderButton icon={Headset} label="Assumir" onClick={() => runAction(() => assumeConversation(active.id), 'Conversa assumida.')} />
              )}
              {active.status === 'human' && (
                <HeaderButton icon={Undo2} label="Devolver pro bot" onClick={() => runAction(() => returnConversationToBot(active.id), 'Conversa devolvida pro bot.')} />
              )}
              {active.status !== 'closed' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                      <Archive className="h-3.5 w-3.5" /> Encerrar <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-xs text-gray-400">Encerrar como…</DropdownMenuLabel>
                    {CLOSE_CATEGORY_OPTIONS.map(({ category, label }) => {
                      const { Icon, color } = CLOSE_MENU_META[category] ?? { Icon: Archive, color: 'text-gray-400' };
                      return (
                        <DropdownMenuItem
                          key={category}
                          onClick={() => runAction(() => closeConversation(active.id, category), `Encerrado: ${label}.`)}
                          className="text-base"
                        >
                          <Icon className={`mr-2 h-3.5 w-3.5 ${color}`} /> {label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <HeaderButton icon={Headset} label="Reabrir" onClick={() => runAction(() => assumeConversation(active.id), 'Atendimento reaberto.')} />
              )}
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {/* Carregar histórico anterior em blocos (evita puxar tudo de uma vez) */}
              {hasMore && (
                <div className="mb-2 flex justify-center">
                  <button
                    onClick={handleLoadOlder}
                    disabled={loadingOlder}
                    className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-xs font-semibold text-gray-500 shadow-sm transition-colors hover:bg-gray-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {loadingOlder
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...</>
                      : <><Clock className="h-3.5 w-3.5" /> Carregar mensagens anteriores</>}
                  </button>
                </div>
              )}
              {displayMessages.map((msg, i) => {
                const prev = displayMessages[i - 1];
                const grouped = prev && prev.direction === msg.direction
                  && new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
                return (
                  <ThreadMessageRow
                    key={msg.id}
                    msg={msg}
                    grouped={!!grouped}
                    meId={meId}
                    highlighted={highlightId === msg.id}
                    setRowRef={(el) => {
                      if (el) rowRefs.current.set(msg.id, el);
                      else rowRefs.current.delete(msg.id);
                    }}
                    onReply={() => { setEditTarget(null); setReplyTo(msg); }}
                    onEdit={() => { setReplyTo(null); setEditTarget(msg); }}
                    onDelete={() => handleDelete(msg)}
                    onRetry={() => retryPending(msg)}
                    onDiscard={() => removePending(msg.id)}
                    onJumpToReply={() => jumpToMessage(msg.replyToId)}
                  />
                );
              })}
              <div ref={endRef} />
            </div>

            {windowExpired && (
              <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="flex-1">Janela de 24h expirada: a Meta só aceita mensagem de template aprovado até o cliente responder de novo.</span>
                <button
                  onClick={() => setSendTemplateOpen(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-900 dark:hover:bg-amber-900/30"
                >
                  <FileBadge className="h-3.5 w-3.5" /> Enviar template
                </button>
              </div>
            )}

            <div className="border-t border-gray-100 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <WhatsAppComposer
                contactId={active.contactId}
                disabled={windowExpired}
                placeholder={windowExpired
                  ? 'Aguardando o cliente responder para reabrir a janela...'
                  : `Responder ${active.contactName ?? formatPhone(active.contactPhone)}...`}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                editTarget={editTarget}
                onCancelEdit={() => setEditTarget(null)}
                onSendText={handleSendText}
                onSendMedia={handleSendMedia}
                onEditSubmit={handleEditSubmit}
                onRefresh={async () => { await Promise.all([mutateMessages(), refreshConversations()]); }}
              />
            </div>

            <ClientInfoModal
              open={clientModalOpen}
              onOpenChange={setClientModalOpen}
              contactId={active.contactId}
              contactLabel={active.contactName ?? formatPhone(active.contactPhone)}
            />
            <WhatsAppSendTemplateModal
              open={sendTemplateOpen}
              onOpenChange={setSendTemplateOpen}
              contactId={active.contactId}
              onSent={async () => { await Promise.all([mutateMessages(), refreshConversations()]); }}
            />
          </>
        )}
      </section>

      <WhatsAppTagsModal open={tagsModalOpen} onOpenChange={setTagsModalOpen} onChanged={reloadTags} />
    </div>
  );
}

/* ---------- subcomponentes ---------- */

function ConversationGroup({
  title, items, activeContactId, onSelect, highlight, headerExtra, forceShow, hideTitle, emptyLabel,
}: {
  title: string; items: WhatsAppConversationDTO[]; activeContactId: string | null;
  onSelect: (contactId: string) => void; highlight?: boolean;
  headerExtra?: React.ReactNode; forceShow?: boolean; hideTitle?: boolean; emptyLabel?: string;
}) {
  if (!items.length && !forceShow && !hideTitle) return null;
  return (
    <div>
      {!hideTitle && (
        <div className={`flex items-center gap-1.5 px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wider ${highlight ? 'text-amber-400' : 'text-[#8fbcac]'}`}>
          {title}
          <span className="rounded-full bg-[#2e5749] px-1.5 text-[11px] font-bold text-[#cfe6db]">{items.length}</span>
          {headerExtra}
        </div>
      )}
      {!items.length && (
        <p className="px-4 pb-1 text-sm text-[#8fbcac]">{emptyLabel ?? 'Nenhuma conversa aqui.'}</p>
      )}
      {items.map((c) => {
        const isActive = c.contactId === activeContactId;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.contactId)}
            className={`mx-2 flex w-[calc(100%-16px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
              isActive ? 'bg-[#1a6649] text-white' : 'text-[#d3e2db] hover:bg-[#26483c]'
            }`}
          >
            <Avatar className="h-8 w-8 shrink-0 border border-[#3a6b58]">
              <AvatarFallback className="bg-[#356b57] text-[11px] font-bold text-[#c5ecdb]">
                {initials(c.contactName ?? c.contactPhone)}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-base font-semibold">{c.contactName ?? formatPhone(c.contactPhone)}</span>
                  {c.urgent && c.status !== 'closed' && (
                    <span className="shrink-0 animate-pulse rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Urgente
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-[#8fbcac]">
                  {formatDistanceToNow(new Date(c.lastMessageAt), { locale: ptBR, addSuffix: false })}
                </span>
              </span>
              <span className="block truncate text-sm text-[#a7c9bc]">{c.lastMessagePreview ?? '—'}</span>
              {c.tags.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {c.tags.map((t) => (
                    <span key={t.id} className="rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: t.color }}>
                      {t.name}
                    </span>
                  ))}
                </span>
              )}
            </span>
            {c.unread && c.status !== 'closed' && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function StatusTicks({ status }: { status: string }) {
  if (status === 'sending') return <Clock className="h-3.5 w-3.5 text-white/70" />;
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-red-300" />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-300" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-white/70" />;
  return <Check className="h-3.5 w-3.5 text-white/70" />;
}

function ThreadMessageRow({
  msg, grouped, meId, highlighted, setRowRef, onReply, onEdit, onDelete, onRetry, onDiscard, onJumpToReply,
}: {
  msg: WhatsAppThreadMessage; grouped: boolean; meId: string; highlighted: boolean;
  setRowRef: (el: HTMLDivElement | null) => void;
  onReply: () => void; onEdit: () => void; onDelete: () => void;
  onRetry: () => void; onDiscard: () => void; onJumpToReply: () => void;
}) {
  const mine = msg.direction === 'out';
  const isTemp = msg.id.startsWith('temp-');
  const canEdit = mine && !isTemp && msg.authorId === meId && !msg.mediaKey && !msg.deletedAt;
  const canDelete = mine && !isTemp && msg.authorId === meId && !msg.deletedAt;

  if (msg.deletedAt) {
    return (
      <div ref={setRowRef} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
        <div className="flex items-center gap-1.5 rounded-2xl border border-dashed border-gray-200 px-3 py-1.5 text-sm italic text-gray-400 dark:border-zinc-700">
          <Ban className="h-3 w-3" /> Mensagem apagada
        </div>
      </div>
    );
  }

  // Nota interna: só a equipe vê (o cliente nunca recebeu). Renderiza como um
  // aviso centralizado em âmbar — motivo de transferência do bot, recado entre
  // atendentes etc.
  if (msg.internal) {
    return (
      <div ref={setRowRef} className="mt-2 flex justify-center">
        <div className="max-w-[85%] rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="mr-1.5 inline-flex items-center gap-1 align-middle font-bold">
            <StickyNote className="h-3 w-3" />
            {msg.sentByBot ? 'Bot' : msg.authorName ?? 'Equipe'} · nota interna
            <span className="font-normal opacity-60">{timeShort(msg.createdAt)}</span>
          </span>
          <span className="whitespace-pre-wrap break-words">{msg.body}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setRowRef}
      className={`group flex items-end gap-2 rounded-xl transition-colors duration-700 ${mine ? 'flex-row-reverse' : ''} ${grouped ? 'mt-0.5' : 'mt-2'} ${highlighted ? 'bg-amber-100/70 dark:bg-amber-900/30' : ''}`}
    >
      <div className={`flex max-w-[72%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {mine && !grouped && (
          <span className="mb-0.5 flex items-center gap-1 px-1 text-sm font-bold text-gray-500 dark:text-zinc-400">
            {msg.sentByBot ? <><Bot className="h-3 w-3" /> Bot</> : <><UserRound className="h-3 w-3" /> {msg.authorName ?? 'Atendente'}</>}
          </span>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-base shadow-sm ${
            mine
              ? msg.sentByBot
                ? 'rounded-br-md bg-violet-600 text-white'
                : 'rounded-br-md bg-emerald-600 text-white'
              : 'rounded-bl-md border border-gray-100 bg-white text-gray-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
          } ${msg.status === 'failed' ? 'opacity-70' : ''}`}
        >
          {msg.replyToId && (
            <button
              onClick={onJumpToReply}
              className={`mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-sm transition-colors ${mine ? 'border-white/50 bg-white/10 text-white/80 hover:bg-white/20' : 'border-emerald-500 bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:bg-zinc-900'}`}
            >
              <span className="block text-[11px] font-bold">
                {msg.replyToDirection === 'out' ? 'Equipe' : 'Cliente'}
              </span>
              <span className="line-clamp-2">{msg.replyToBody ?? '—'}</span>
            </button>
          )}
          {msg.mediaKey && <WaMediaBubble mediaKey={msg.mediaKey} mediaType={msg.mediaType} mine={mine} />}
          {!msg.mediaKey && msg.mediaType && (
            <span className={`mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold ${mine ? 'bg-white/15' : 'bg-gray-100 dark:bg-zinc-900/60'}`}>
              <Paperclip className="h-3.5 w-3.5" /> Enviando anexo...
            </span>
          )}
          {msg.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{formatWaText(msg.body)}</p>}
          <span className={`ml-2 mt-0.5 flex items-center justify-end gap-1 text-xs ${mine ? 'text-white/70' : 'text-gray-400'}`}>
            {msg.editedAt && <span className="italic">editada ·</span>}
            {timeShort(msg.createdAt)}
            {mine && <StatusTicks status={msg.status} />}
          </span>
        </div>

        {msg.status === 'failed' && isTemp && (
          <span className="mt-0.5 flex items-center gap-2 px-1 text-sm text-red-500">
            Falhou.
            {msg.body && !msg.mediaType && (
              <button onClick={onRetry} className="font-semibold underline">tentar de novo</button>
            )}
            <button onClick={onDiscard} className="underline">descartar</button>
          </span>
        )}
      </div>

      {/* Ações da mensagem (aparecem no hover) */}
      {!isTemp && (
        <div className="mb-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <MsgAction icon={ReplyIcon} label="Responder" onClick={onReply} />
          {canEdit && <MsgAction icon={Pencil} label="Editar (só na thread)" onClick={onEdit} />}
          {canDelete && <MsgAction icon={Trash2} label="Apagar (só na thread)" onClick={onDelete} />}
        </div>
      )}
    </div>
  );
}

/**
 * Mídia inline na bolha: imagem/vídeo tocam direto, áudio ganha player nativo.
 * Documento continua como botão (abre em nova aba). Busca a URL pré-assinada
 * uma vez (cache em memória) e mostra estado de carregando/erro.
 */
function WaMediaBubble({ mediaKey, mediaType, mine }: { mediaKey: string; mediaType: string | null; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    getMediaUrl(mediaKey).then((u) => {
      if (cancelled) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [mediaKey]);

  async function openInNewTab() {
    const u = url ?? await getMediaUrl(mediaKey);
    if (u) window.open(u, '_blank');
    else toast.error('Não foi possível abrir o anexo.');
  }

  const docName = fileNameFromKey(mediaKey);

  if (failed) {
    return (
      <button onClick={openInNewTab} title={docName} className={`mb-1 flex max-w-[16rem] items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-900'}`}>
        <Paperclip className="h-4 w-4 shrink-0" /> <span className="truncate">{docName}</span>
      </button>
    );
  }

  if (mediaType?.startsWith('image/')) {
    return url ? (
      <button onClick={openInNewTab} className="mb-1 block overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Imagem enviada" className="max-h-64 max-w-full rounded-lg object-cover" />
      </button>
    ) : (
      <div className={`mb-1 flex h-32 w-48 items-center justify-center rounded-lg ${mine ? 'bg-white/10' : 'bg-gray-100 dark:bg-zinc-900/60'}`}>
        <Loader2 className="h-5 w-5 animate-spin opacity-60" />
      </div>
    );
  }

  if (mediaType?.startsWith('video/')) {
    return url ? (
      <video src={url} controls className="mb-1 max-h-64 max-w-full rounded-lg" />
    ) : (
      <div className={`mb-1 flex h-32 w-48 items-center justify-center rounded-lg ${mine ? 'bg-white/10' : 'bg-gray-100 dark:bg-zinc-900/60'}`}>
        <Loader2 className="h-5 w-5 animate-spin opacity-60" />
      </div>
    );
  }

  if (mediaType?.startsWith('audio/')) {
    return url ? (
      <audio src={url} controls className="mb-1 h-10 w-64 max-w-full" />
    ) : (
      <div className={`mb-1 flex h-10 w-64 max-w-full items-center gap-2 rounded-lg px-2 text-sm ${mine ? 'bg-white/10' : 'bg-gray-100 dark:bg-zinc-900/60'}`}>
        <Loader2 className="h-4 w-4 animate-spin opacity-60" /> Carregando áudio...
      </div>
    );
  }

  return (
    <button
      onClick={openInNewTab}
      title={docName}
      className={`mb-1 flex max-w-[16rem] items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-900'}`}
    >
      <FileText className="h-5 w-5 shrink-0 opacity-80" />
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="w-full truncate">{docName}</span>
        <span className="text-[11px] font-normal opacity-60">Abrir documento</span>
      </span>
    </button>
  );
}

function MsgAction({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function HeaderButton({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
