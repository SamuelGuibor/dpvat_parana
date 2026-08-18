/* eslint-disable no-unused-vars */
'use client';

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import {
  ArrowLeft, Bot, Check, CheckCheck, AlertCircle, MessageCircle, Paperclip,
  UserRound, Undo2, Archive, Headset, Inbox as InboxIcon, Search, X,
  Clock, Pencil, Trash2, Reply as ReplyIcon, Ban, Loader2, Tag as TagIcon,
  FileBadge, ChevronDown, BadgeCheck, XCircle, Settings2, FileText,
  HelpCircle, AlertTriangle, StickyNote, Play, Pause, Mic, Download, Sparkles,
  MoreVertical, Eye, RotateCcw, MessageSquareOff, Image as ImageIconWA, Video,
  UserCheck, Columns3, Users, Phone, BookUser,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import { Avatar, AvatarFallback } from '@/app/_shared/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/app/_shared/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem,
} from '@/app/_shared/ui/dropdown-menu';
import { useChatStream, type ChatStreamEvent } from '@/app/_shared/hooks/use-chat';
import {
  useWhatsAppConversations, useWhatsAppConversationsTotal, useWhatsAppMessages, type WhatsAppThreadMessage,
} from '@/app/_shared/hooks/use-whatsapp';
import {
  assumeConversation, returnConversationToBot, closeConversation, markConversationRead, markConversationUnread,
  type WhatsAppConversationDTO,
} from '@/app/_actions/whatsapp/conversations';
import {
  sendWhatsAppMessage, sendWhatsAppMedia, getWhatsAppUploadUrl,
  editWhatsAppMessage, deleteWhatsAppMessage,
} from '@/app/_actions/whatsapp/send-message';
import { listWhatsAppTags, toggleConversationTag, type WhatsAppTagDTO } from '@/app/_actions/whatsapp/tags';
import { listWaNumberOptions } from '@/app/_actions/whatsapp/numbers';
import { listCloseReasons, createCloseReason, deleteCloseReason, type CloseReasonDTO } from '@/app/_actions/whatsapp/close-reasons';
import { createWhatsAppContact } from '@/app/_actions/whatsapp/contacts';
import { blockWhatsAppContact, unblockWhatsAppContact, deleteWhatsAppContact } from '@/app/_actions/whatsapp/contacts';
import { usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';
import { transcribeWhatsAppAudio } from '@/app/_actions/whatsapp/assist';
import { CLOSE_CATEGORY_OPTIONS, CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { attachConversationMediaToCard } from '@/app/_actions/whatsapp/client-documents';
import { getClientInfo } from '@/app/_actions/whatsapp/client-info';
import { CardDialog } from '@/app/nova-dash/CardDialog';
import type { ExtendedKanbanCard } from '@/app/nova-dash/card-dialog/types';
import { WhatsAppComposer } from './WhatsAppComposer';
import { CopilotPanel } from './CopilotPanel';
import { WhatsAppTagsModal } from './WhatsAppTagsModal';
import { WhatsAppSendTemplateModal } from './WhatsAppSendTemplateModal';
import { ContactsDirectory } from './ContactsDirectory';
import { listWaContactsDirectory } from '@/app/_actions/whatsapp/contacts';
import { formatWaText, stripWaMarkup } from './wa-format';
import { renderFormattedText } from '@/app/_shared/utils/render-message';
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
  qualificado: { Icon: BadgeCheck, color: 'text-emerald-600' },
  nao_qualificado: { Icon: XCircle, color: 'text-gray-400' },
  perguntas: { Icon: HelpCircle, color: 'text-blue-500' },
  novo_acidente: { Icon: AlertTriangle, color: 'text-amber-500' },
  transferido: { Icon: Headset, color: 'text-violet-500' },
  descartado: { Icon: Trash2, color: 'text-red-500' },
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || '?';
}
function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
// Rótulo do separador de dia na thread: Hoje / Ontem / dia da semana (< 7 dias)
// / data completa.
function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) {
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
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
  standby: 'Em recuperação',
  closed: 'Encerrada',
};
const STATUS_CHIP: Record<string, string> = {
  bot: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  queued: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  human: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  standby: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  closed: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',
};

// Chips de filtro compactos (12/08/2026): só o ícone fica visível; o rótulo
// desliza suavemente no hover (e fica aberto enquanto o filtro está ativo) —
// o espaço economizado vai pra lista de conversas.
const chipCls = (active: boolean) =>
  `group flex h-7 shrink-0 items-center overflow-hidden rounded-full border px-2 text-[11px] font-bold transition-colors ${active
    ? 'border-[#6fd6ad] bg-[#1a6649] text-white'
    : 'border-[#3a6b58] text-[#8fbcac] hover:bg-[#2e5749] hover:text-white'}`;
const chipLabelCls = (expanded: boolean) =>
  `whitespace-nowrap transition-all duration-300 ease-out ${expanded
    ? 'ml-1.5 max-w-[150px] opacity-100'
    : 'ml-0 max-w-0 opacity-0 group-hover:ml-1.5 group-hover:max-w-[150px] group-hover:opacity-100'}`;

// Multi-número: etiqueta da linha em cada conversa (só aparece com 2+ números
// cadastrados). O mapa numberId → {label, cor} desce por contexto para o
// ConversationGroup, que é chamado de vários lugares.
export interface NumberBadge { label: string; dot: string }
const NUMBER_BADGE_DOTS = ['bg-sky-400', 'bg-teal-300', 'bg-violet-400', 'bg-amber-400', 'bg-rose-400'];
const NumberBadgeContext = createContext<Map<string, NumberBadge> | null>(null);

// Cor determinística do selinho de atendente na lista (por nome).
const ATTENDANT_BADGE_COLORS = ['bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-sky-600', 'bg-rose-600'];
function attendantBadgeColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ATTENDANT_BADGE_COLORS[h % ATTENDANT_BADGE_COLORS.length];
}

export function WhatsAppInbox() {
  const { data: session } = useSession();
  const meId = session?.user?.id ?? '';

  const { conversations, refreshConversations } = useWhatsAppConversations();
  // Total REAL no banco (a lista acima é capada em 200 pelo servidor).
  const conversationsTotal = useWhatsAppConversationsTotal();
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const { messages, mutate: mutateMessages, loadOlder, hasMore, loadingOlder } = useWhatsAppMessages(activeContactId);

  const [search, setSearch] = useState('');
  // Coluna Copiloto (lg+) e CardDialog do cliente vinculado.
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  // Clique no nome do contato: abre o Copiloto (se fechado) e força a aba
  // Ficha — incrementar o token é o sinal que o CopilotPanel escuta.
  const [fichaFocusToken, setFichaFocusToken] = useState(0);

  // Tags livres pra organizar/filtrar conversas.
  const [allTags, setAllTags] = useState<WhatsAppTagDTO[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [sendTemplateOpen, setSendTemplateOpen] = useState(false);
  // "Só minhas": em Ativas, esconde o atendimento humano de outros atendentes
  // (a fila continua visível pra todo mundo — ninguém é "dono" dela ainda).
  const [onlyMine, setOnlyMine] = useState(false);
  // Carga da equipe: clicar no chip de um atendente filtra o atendimento
  // humano pelas conversas dele (a fila continua visível).
  const [attendantFilter, setAttendantFilter] = useState<string | null>(null);
  // Filtros novos (12/08/2026): "Hoje" = conversas que começaram no dia;
  // "Coluna do Kanban" = estágio do card do cliente vinculado.
  const [todayOnly, setTodayOnly] = useState(false);
  const [columnFilter, setColumnFilter] = useState<string | null>(null);

  // Multi-número (17/08/2026): filtrar por linha da empresa, com a preferência
  // salva por usuário no navegador. Só aparece com 2+ números cadastrados.
  const [waNumbers, setWaNumbers] = useState<{ id: string; label: string }[]>([]);
  const [numberFilter, setNumberFilter] = useState<string | null>(null);
  useEffect(() => {
    listWaNumberOptions()
      .then((opts) => {
        setWaNumbers(opts.map((o) => ({ id: o.id, label: o.label })));
        const saved = localStorage.getItem('wa-number-filter');
        if (saved && opts.some((o) => o.id === saved)) setNumberFilter(saved);
      })
      .catch(() => setWaNumbers([]));
  }, []);
  const changeNumberFilter = (id: string | null) => {
    setNumberFilter(id);
    if (id) localStorage.setItem('wa-number-filter', id);
    else localStorage.removeItem('wa-number-filter');
  };
  const numberBadges = useMemo(() => {
    if (waNumbers.length < 2) return null;
    return new Map<string, NumberBadge>(
      waNumbers.map((n, i) => [n.id, { label: n.label, dot: NUMBER_BADGE_DOTS[i % NUMBER_BADGE_DOTS.length] }]),
    );
  }, [waNumbers]);

  // Motivos de "não qualificada" editáveis (menu Encerrar + modal de gestão).
  const { data: closeReasons, mutate: mutateCloseReasons } = useSWR<CloseReasonDTO[]>(
    'wa-close-reasons',
    () => listCloseReasons(),
    { revalidateOnFocus: false },
  );
  const [reasonsModalOpen, setReasonsModalOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  // Menu de encerrar: estático (sem os nq_* hardcoded, que agora moram na
  // tabela) + motivos dinâmicos logo depois de "Não qualificada (genérico)".
  const closeMenuOptions = useMemo(() => {
    const base = CLOSE_CATEGORY_OPTIONS.filter((o) => !o.category.startsWith('nq_'));
    const idx = base.findIndex((o) => o.category === 'nao_qualificado');
    const dynamic = (closeReasons ?? []).map((r) => ({ category: r.key, label: r.label }));
    return [...base.slice(0, idx + 1), ...dynamic, ...base.slice(idx + 1)];
  }, [closeReasons]);

  // Larguras redimensionáveis (estilo WhatsApp Web): arrastar a borda da
  // lista e do Copiloto, com limites pra não engolir a thread. Persistidas.
  const SIDEBAR_MIN = 300; const SIDEBAR_MAX = 520;
  const COPILOT_MIN = 240; const COPILOT_MAX = 420;
  const [sidebarW, setSidebarW] = useState(400);
  const [copilotW, setCopilotW] = useState(300);
  useEffect(() => {
    const s = Number(localStorage.getItem('wa-sidebar-w'));
    const c = Number(localStorage.getItem('wa-copilot-w'));
    if (s >= SIDEBAR_MIN && s <= SIDEBAR_MAX) setSidebarW(s);
    if (c >= COPILOT_MIN && c <= COPILOT_MAX) setCopilotW(c);
  }, []);
  const startResize = useCallback((e: React.MouseEvent, which: 'sidebar' | 'copilot') => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = which === 'sidebar' ? sidebarW : copilotW;
    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      if (which === 'sidebar') {
        const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + delta));
        setSidebarW(w);
      } else {
        const w = Math.min(COPILOT_MAX, Math.max(COPILOT_MIN, startW - delta));
        setCopilotW(w);
      }
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setSidebarW((w) => { localStorage.setItem('wa-sidebar-w', String(w)); return w; });
      setCopilotW((w) => { localStorage.setItem('wa-copilot-w', String(w)); return w; });
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sidebarW, copilotW]);

  const { confirm, confirmDialog } = useConfirm();
  const { perms } = usePermissions();

  function reloadTags() {
    listWhatsAppTags().then(setAllTags).catch(() => { });
  }
  useEffect(() => { reloadTags(); }, []);

  // Rail de pastas: "Ativas" (fila + atendimento humano juntos, com quem está
  // na fila sempre no topo) abre selecionada por padrão; Bot e Recuperação
  // vêm em seguida; os desfechos (encerradas) ficam cada um com seu próprio
  // ícone, sem nada escondido atrás de um select.
  const ACTIVE_FOLDERS = [
    { key: 'todos', label: 'Todos', title: 'Todas as conversas', icon: InboxIcon },
    { key: 'ativas', label: 'Ativas', title: 'Conversas ativas', icon: MessageCircle },
    { key: 'bot', label: 'Bot', title: 'Bot atendendo', icon: Bot },
    { key: 'standby', label: 'Recup.', title: 'Em recuperação', icon: RotateCcw },
  ] as const;
  const CLOSED_FOLDERS = [
    { key: 'qualified', label: 'Qualific.', title: 'Qualificadas', icon: BadgeCheck },
    { key: 'unqualified', label: 'Não qual.', title: 'Não qualificadas', icon: XCircle },
    { key: 'sem_resposta', label: 'S/ resp.', title: 'Sem resposta', icon: MessageSquareOff },
    { key: 'perguntas', label: 'Dúvidas', title: CLOSE_CATEGORY_LABELS.perguntas, icon: HelpCircle },
    { key: 'novo_acidente', label: 'Novo acid.', title: CLOSE_CATEGORY_LABELS.novo_acidente, icon: AlertTriangle },
    { key: 'transferido', label: 'Transf.', title: CLOSE_CATEGORY_LABELS.transferido, icon: Headset },
    { key: 'descartado', label: 'Descart.', title: CLOSE_CATEGORY_LABELS.descartado, icon: Trash2 },
  ] as const;
  const ALL_FOLDERS = [...ACTIVE_FOLDERS, ...CLOSED_FOLDERS];
  type FolderKey = (typeof ALL_FOLDERS)[number]['key'];
  const FOLDER_TITLE: Record<FolderKey, string> = Object.fromEntries(
    ALL_FOLDERS.map((f) => [f.key, f.title]),
  ) as Record<FolderKey, string>;
  // Cor do cabeçalho de cada pasta quando várias seções aparecem empilhadas
  // (busca global por tag) — pastas de desfecho ficam com o tom neutro padrão.
  const FOLDER_ACCENT: Record<FolderKey, keyof typeof GROUP_ACCENT | undefined> = {
    todos: 'ativas', ativas: 'ativas', bot: 'bot', standby: 'recup',
    qualified: undefined, unqualified: undefined, sem_resposta: undefined,
    perguntas: undefined, novo_acidente: undefined, transferido: undefined, descartado: undefined,
  };
  const [activeFolder, setActiveFolder] = useState<FolderKey>('todos');

  // Pasta "Contatos" (18/08/2026): a AGENDA da linha — todos os contatos,
  // mesmo sem conversa (importados do BotConversa incluídos).
  const [contactsMode, setContactsMode] = useState(false);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  useEffect(() => {
    listWaContactsDirectory('', null, 0).then((p) => setDirectoryTotal(p.total)).catch(() => {});
  }, []);

  // Paginação client-side: cada pasta mostra 200 por vez, com "Carregar mais".
  // Reinicia ao trocar de pasta, buscar ou filtrar por tag.
  const [visibleCount, setVisibleCount] = useState(200);

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

  // Ficha do cliente da conversa aberta: alimenta o Copiloto (aba Ficha /
  // checklist) e o atalho "Card #N" do cabeçalho.
  const { data: clientInfo, mutate: mutateClientInfo } = useSWR(
    activeContactId ? ['wa-client-info', activeContactId] : null,
    () => getClientInfo(activeContactId!),
    { revalidateOnFocus: false },
  );

  useEffect(() => { setCardDialogOpen(false); }, [activeContactId]);

  // Stub mínimo pro CardDialog — ele mesmo recarrega o card completo ao abrir.
  const cardStub = useMemo<ExtendedKanbanCard | null>(() => {
    if (!clientInfo?.registered || !clientInfo.userId) return null;
    return {
      id: clientInfo.userId,
      title: clientInfo.fields.name ?? active?.contactName ?? 'Cliente',
      description: '', assignee: '', timer: 0, comments: [], attachments: [],
      observations: '', checklistItems: [], createdAt: new Date(), updatedAt: new Date(),
      isProcess: false, cardNumber: clientInfo.cardNumber,
    } as ExtendedKanbanCard;
  }, [clientInfo, active?.contactName]);

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
    markConversationRead(active.id).then(() => refreshConversations()).catch(() => { });
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

  // Busca por nome ou celular + filtro por tags (basta bater em uma das
  // selecionadas) + "Hoje" + coluna do Kanban.
  const isToday = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
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
      if (todayOnly && !isToday(c.createdAt)) return false;
      if (columnFilter && c.kanbanColumn !== columnFilter) return false;
      if (numberFilter && c.numberId !== numberFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, search, tagFilter, todayOnly, columnFilter, numberFilter]);

  // Contagem do chip "Hoje" (independe dos outros filtros, senão o número
  // mudaria ao clicar no próprio chip) e colunas disponíveis pro seletor.
  const todayCount = useMemo(() => conversations.filter((c) => isToday(c.createdAt)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversations]);
  const kanbanColumns = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of conversations) {
      if (c.kanbanColumn) map.set(c.kanbanColumn, (map.get(c.kanbanColumn) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [conversations]);
  // Contagem por número (dropdown do filtro de linha).
  const numberCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of conversations) {
      if (c.numberId) map.set(c.numberId, (map.get(c.numberId) ?? 0) + 1);
    }
    return map;
  }, [conversations]);

  const groups = useMemo(() => {
    const closed = filtered.filter((c) => c.status === 'closed');
    // Conversas encerradas ANTES desta feature não têm closeCategory — caem
    // no fallback pelo `qualified` antigo (true→qualificada, senão→não qualificada).
    const byCategory = (cat: string) => closed.filter((c) => c.closeCategory === cat);
    return {
      // Urgentes (detectados pela IA) primeiro na fila de espera.
      queued: filtered.filter((c) => c.status === 'queued')
        .sort((a, b) => Number(b.urgent) - Number(a.urgent)),
      // Todas as conversas em atendimento humano, de qualquer atendente — o
      // selinho no avatar diz quem falou por último, sem filtro obrigatório.
      ativas: filtered.filter((c) => c.status === 'human'),
      bot: filtered.filter((c) => c.status === 'bot'),
      standby: filtered.filter((c) => c.status === 'standby'),
      sem_resposta: byCategory('sem_resposta'),
      qualified: closed.filter((c) => c.closeCategory === 'qualificado' || (!c.closeCategory && c.qualified === true)),
      // Inclui os sub-motivos dinâmicos (nq_*) — tudo que é "não qualificado".
      unqualified: closed.filter((c) => c.closeCategory === 'nao_qualificado' || c.closeCategory?.startsWith('nq_') || (!c.closeCategory && c.qualified !== true)),
      perguntas: byCategory('perguntas'),
      novo_acidente: byCategory('novo_acidente'),
      transferido: byCategory('transferido'),
      descartado: byCategory('descartado'),
    };
  }, [filtered]);

  // Itens de cada pasta do rail (mesma fonte que os contadores dos ícones).
  // "Ativas" junta fila + atendimento humano — quem está na fila sempre
  // aparece primeiro (e entre os da fila, urgente primeiro). "Só minhas"
  // esconde o atendimento humano de outros atendentes, mas a fila (de
  // ninguém ainda) continua visível pra não perder a visão geral.
  const humanFilter = (c: WhatsAppConversationDTO) => {
    if (onlyMine) return c.assignedToId === meId;
    if (attendantFilter) return c.assignedToId === attendantFilter;
    return true;
  };
  const ativasItems = [...groups.queued, ...groups.ativas.filter(humanFilter)];
  // "Todos" (estilo Botconversa): a lista inteira, de qualquer status, na
  // ordem da última mensagem. Com um filtro de atendente ativo ("Só minhas"
  // ou chip da equipe), vale pra TODOS os status — mostra só as conversas
  // atribuídas àquele atendente (11/08/2026).
  const todosItems = (onlyMine || attendantFilter)
    ? filtered.filter(humanFilter)
    : filtered;
  // Carga por atendente (chips da "equipe"): conta o atendimento humano SEM
  // os filtros de atendente, senão o número muda ao clicar no próprio chip.
  const teamLoad = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const c of groups.ativas) {
      if (!c.assignedToId) continue;
      const cur = map.get(c.assignedToId);
      if (cur) cur.count += 1;
      else map.set(c.assignedToId, { name: c.assignedToName ?? 'Atendente', count: 1 });
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [groups.ativas]);
  const FOLDER_ITEMS: Record<FolderKey, WhatsAppConversationDTO[]> = {
    todos: todosItems, ativas: ativasItems, bot: groups.bot, standby: groups.standby,
    qualified: groups.qualified, unqualified: groups.unqualified, sem_resposta: groups.sem_resposta,
    perguntas: groups.perguntas, novo_acidente: groups.novo_acidente, transferido: groups.transferido,
    descartado: groups.descartado,
  };
  const unreadInFolder = (key: FolderKey) => FOLDER_ITEMS[key].filter((c) => c.unread).length;

  // Filtro de tag E busca são globais: ignoram a pasta selecionada e procuram
  // em TODAS as conversas — pesquisar um número acha o cliente mesmo que ele
  // esteja em outra aba.
  const tagFilterActive = tagFilter.length > 0 || search.trim().length > 0;
  const visibleItems = tagFilterActive ? filtered : FOLDER_ITEMS[activeFolder];

  useEffect(() => { setVisibleCount(200); }, [activeFolder, search, tagFilter]);

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

  // "Anexar no card": a mídia da mensagem vira documento da ficha do cliente
  // (idempotente no servidor). O Copiloto escuta o evento e atualiza a lista.
  async function handleAttachMedia(msg: WhatsAppThreadMessage) {
    try {
      await attachConversationMediaToCard(msg.id);
      window.dispatchEvent(new Event('wa-docs-changed'));
      toast.success(clientInfo?.registered
        ? `Anexado no card${clientInfo.cardNumber ? ` #${clientInfo.cardNumber}` : ''}.`
        : 'Anexado na ficha (migra pro card quando o cliente for cadastrado).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao anexar no card.');
    }
  }

  async function handleDelete(msg: WhatsAppThreadMessage) {
    if (!(await confirm({
      title: 'Apagar mensagem da thread',
      description: 'Ela some só para a equipe — no celular do cliente a mensagem continua.',
      confirmLabel: 'Apagar',
    }))) return;
    try {
      await deleteWhatsAppMessage(msg.id);
      await mutateMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao apagar.');
    }
  }

  // Bloquear/desbloquear/excluir contato — só aparece com a permissão
  // "manage_wa_contacts" (o servidor valida de novo de qualquer forma).
  async function handleBlockContact(conv: WhatsAppConversationDTO) {
    const who = conv.contactName ?? formatPhone(conv.contactPhone);
    if (conv.optedOut) {
      if (!(await confirm({
        title: `Desbloquear ${who}?`,
        description: 'O contato volta a ser atendido normalmente (bot e mensagens da equipe).',
        confirmLabel: 'Desbloquear',
      }))) return;
      await runAction(() => unblockWhatsAppContact(conv.contactId), 'Contato desbloqueado.');
      return;
    }
    if (!(await confirm({
      title: `Bloquear ${who}?`,
      description: 'O bot e as mensagens automáticas param na hora e a conversa é encerrada como "Descartada". O histórico fica guardado e dá pra desbloquear depois.',
      confirmLabel: 'Bloquear',
    }))) return;
    await runAction(() => blockWhatsAppContact(conv.contactId), 'Contato bloqueado.');
  }

  async function handleDeleteContact(conv: WhatsAppConversationDTO) {
    const who = conv.contactName ?? formatPhone(conv.contactPhone);
    if (!(await confirm({
      title: `Excluir ${who}?`,
      description: 'Apaga o contato e TODO o histórico de conversa permanentemente. Essa ação não tem volta.',
      confirmLabel: 'Excluir de vez',
    }))) return;
    try {
      await deleteWhatsAppContact(conv.contactId);
      setActiveContactId(null);
      await refreshConversations();
      toast.success('Contato excluído.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir contato.');
    }
  }

  return (
    <NumberBadgeContext.Provider value={numberBadges}>
    <div className="flex h-full overflow-hidden rounded-none border border-[#dce8e1] bg-[#dce8e1] shadow-sm dark:border-zinc-800 whatsapp-darkreader sm:rounded-2xl">
      {confirmDialog}
      {/* ---------- Lista de conversas ----------
          Mobile: padrão WhatsApp — mostra a LISTA em tela cheia; ao abrir uma
          conversa, a lista some e a thread ocupa tudo (botão voltar no header).
          Desktop (md+): lista e thread lado a lado como sempre. */}
      <aside
        style={{ ['--wa-sb-w' as string]: `${sidebarW}px` }}
        className={`${activeContactId ? 'hidden md:flex' : 'flex'} relative w-full shrink-0 border-r border-[#14332a] bg-[#1f3d33] dark:border-zinc-800 whatsapp-darkreader md:w-[var(--wa-sb-w)]`}
      >
        {/* Rail de pastas: cada status/desfecho é um ícone próprio, sempre à
            vista — nada mais escondido atrás de um select. */}
        <div className="wa-scroll flex w-[72px] shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-[#14332a] bg-[#183129] py-2.5">
          <span className="px-1 pb-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-[#4f7a68]">Ativos</span>
          {ACTIVE_FOLDERS.map((f) => (
            <RailButton
              key={f.key}
              icon={f.icon}
              label={f.label}
              title={f.title}
              count={FOLDER_ITEMS[f.key].length}
              unread={unreadInFolder(f.key)}
              active={!tagFilterActive && !contactsMode && activeFolder === f.key}
              onClick={() => { setTagFilter([]); setAttendantFilter(null); setContactsMode(false); setActiveFolder(f.key); }}
            />
          ))}
          <div className="mx-3 my-2 h-px bg-[#14332a]" />
          <span className="px-1 pb-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-[#4f7a68]">Encerrados</span>
          {CLOSED_FOLDERS.map((f) => (
            <RailButton
              key={f.key}
              icon={f.icon}
              label={f.label}
              title={f.title}
              count={FOLDER_ITEMS[f.key].length}
              unread={unreadInFolder(f.key)}
              active={!tagFilterActive && !contactsMode && activeFolder === f.key}
              onClick={() => { setTagFilter([]); setAttendantFilter(null); setContactsMode(false); setActiveFolder(f.key); }}
            />
          ))}
          <div className="mx-3 my-2 h-px bg-[#14332a]" />
          <span className="px-1 pb-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-[#4f7a68]">Agenda</span>
          <RailButton
            icon={BookUser}
            label="Contatos"
            title="Todos os contatos da linha, mesmo sem conversa (importados do BotConversa incluídos)"
            count={directoryTotal}
            unread={0}
            active={contactsMode}
            onClick={() => { setTagFilter([]); setAttendantFilter(null); setContactsMode(true); }}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Cabeçalho fixo: título + busca + tags (não rola com a lista) */}
          <div className="shrink-0 border-b border-[#16362c] bg-[#1f3d33]/95 px-2.5 pb-2.5 pt-2.5 backdrop-blur dark:border-zinc-800 whatsapp-darkreader">
            <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
              <MessageCircle className="h-3.5 w-3.5 text-[#6fd6ad]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6fd6ad]">WhatsApp</span>
              {(conversationsTotal || conversations.length) > 0 && (
                <span className="ml-auto rounded-full bg-[#1d9e75] px-1.5 text-[10px] font-bold text-white">
                  {conversationsTotal || conversations.length}
                </span>
              )}
            </div>

            {/* Busca por nome ou celular (procura em TODAS as pastas) + novo contato */}
            <div className="flex items-center gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#3a6b58] bg-[#2e5749] px-2 py-1.5 focus-within:ring-2 focus-within:ring-[#6fd6ad]">
                <Search className="h-3.5 w-3.5 shrink-0 text-[#8fbcac]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou celular..."
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#8fbcac]"
                />
                {search && (
                  <button onClick={() => setSearch('')} title="Limpar busca" className="text-[#8fbcac] hover:text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setAddContactOpen(true)}
                title="Adicionar contato"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3a6b58] bg-[#2e5749] text-lg font-bold leading-none text-[#6fd6ad] transition-colors hover:bg-[#356b57]"
              >
                +
              </button>
            </div>

            {/* Filtros compactos: só ícones — o rótulo desliza no hover. Hoje,
                Coluna do Kanban, Tags e Só minhas numa linha só. (Na Agenda de
                contatos só a busca vale — os filtros são de conversa.) */}
            {!contactsMode && (<>
            <p className="truncate text-[13px] font-bold text-white pt-2">Filtros</p>
            <div className="mt-1.5 flex items-center gap-1">
              {/* Novas do dia */}
              <button
                onClick={() => setTodayOnly((v) => !v)}
                title="Só as conversas que começaram hoje"
                className={chipCls(todayOnly)}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className={chipLabelCls(todayOnly)}>Hoje</span>
                {todayOnly && (
                  <span className="ml-1 rounded-full bg-[#1d9e75] px-1.5 text-[10px] font-bold text-white">{todayCount}</span>
                )}
              </button>

              {/* Número da empresa (multi-número) — só com 2+ linhas cadastradas */}
              {waNumbers.length >= 2 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button title="Filtrar pelo número da empresa" className={chipCls(!!numberFilter)}>
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className={chipLabelCls(!!numberFilter)}>
                        {numberFilter ? waNumbers.find((n) => n.id === numberFilter)?.label ?? 'Número' : 'Número'}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <DropdownMenuLabel className="p-0 text-xs text-gray-400">Número da empresa</DropdownMenuLabel>
                      {numberFilter && (
                        <button
                          onClick={() => changeNumberFilter(null)}
                          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                        >
                          Todos
                        </button>
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    {waNumbers.map((n) => (
                      <DropdownMenuCheckboxItem
                        key={n.id}
                        checked={numberFilter === n.id}
                        onCheckedChange={() => changeNumberFilter(numberFilter === n.id ? null : n.id)}
                        onSelect={(e) => e.preventDefault()}
                        className="text-sm"
                      >
                        <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle ${numberBadges?.get(n.id)?.dot ?? 'bg-gray-400'}`} />
                        <span className="min-w-0 flex-1 truncate">{n.label}</span>
                        <span className="ml-2 text-xs text-gray-400">{numberCounts.get(n.id) ?? 0}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Coluna do Kanban (só conversas já vinculadas a um card) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Filtrar pela coluna do card no Kanban" className={chipCls(!!columnFilter)}>
                    <Columns3 className="h-3.5 w-3.5 shrink-0" />
                    <span className={chipLabelCls(!!columnFilter)}>
                      {columnFilter ?? 'Coluna do Kanban'}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <DropdownMenuLabel className="p-0 text-xs text-gray-400">Coluna do Kanban</DropdownMenuLabel>
                    {columnFilter && (
                      <button
                        onClick={() => setColumnFilter(null)}
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  {kanbanColumns.length === 0 && (
                    <DropdownMenuItem disabled className="text-sm text-gray-400">
                      Nenhuma conversa vinculada a card ainda.
                    </DropdownMenuItem>
                  )}
                  {kanbanColumns.map(([col, n]) => (
                    <DropdownMenuCheckboxItem
                      key={col}
                      checked={columnFilter === col}
                      onCheckedChange={() => setColumnFilter((cur) => (cur === col ? null : col))}
                      onSelect={(e) => e.preventDefault()}
                      className="text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{col}</span>
                      <span className="ml-2 text-xs text-gray-400">{n}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  
                  <p className="px-2 py-1.5 text-[10px] leading-snug text-gray-400">
                    Só conversas já vinculadas a um card do Kanban entram neste filtro.
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Tags */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Filtrar por tag (busca em todas as pastas)" className={chipCls(tagFilter.length > 0)}>
                    <TagIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className={chipLabelCls(tagFilter.length > 0)}>
                      {tagFilter.length ? `Tags (${tagFilter.length})` : 'Tags'}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <DropdownMenuLabel className="p-0 text-xs text-gray-400">Filtrar por tag</DropdownMenuLabel>
                    {tagFilter.length > 0 && (
                      <button
                        onClick={() => setTagFilter([])}
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  {allTags.length === 0 && (
                    <DropdownMenuItem disabled className="text-sm text-gray-400">Nenhuma tag criada ainda.</DropdownMenuItem>
                  )}
                  {allTags.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t.id}
                      checked={tagFilter.includes(t.id)}
                      onCheckedChange={() =>
                        setTagFilter((prev) => (prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]))}
                      onSelect={(e) => e.preventDefault()}
                      className="text-sm"
                    >
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTagsModalOpen(true)} className="text-sm">
                    <Settings2 className="mr-2 h-3.5 w-3.5" /> Gerenciar tags
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Equipe: dropdown em vez da fileira de pills (que ocupava uma
                  linha inteira e não cabia com muitos atendentes) — clique
                  abre a lista, com quem está selecionado destacado. */}
              {!tagFilterActive && (activeFolder === 'ativas' || activeFolder === 'todos') && teamLoad.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button title="Filtrar pelo atendente" className={chipCls(!!attendantFilter)}>
                      {attendantFilter ? (
                        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white ${attendantBadgeColor(teamLoad.find(([id]) => id === attendantFilter)?.[1].name ?? '')}`}>
                          {initials(teamLoad.find(([id]) => id === attendantFilter)?.[1].name ?? '')}
                        </span>
                      ) : (
                        <Users className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className={chipLabelCls(!!attendantFilter)}>
                        {attendantFilter ? teamLoad.find(([id]) => id === attendantFilter)?.[1].name ?? 'Equipe' : 'Equipe'}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <DropdownMenuLabel className="p-0 text-xs text-gray-400">Equipe</DropdownMenuLabel>
                      {attendantFilter && (
                        <button
                          onClick={() => setAttendantFilter(null)}
                          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <DropdownMenuSeparator />
                    {teamLoad.map(([id, t]) => (
                      <DropdownMenuItem
                        key={id}
                        onClick={() => { setOnlyMine(false); setAttendantFilter((cur) => (cur === id ? null : id)); }}
                        className={`text-sm ${attendantFilter === id ? 'bg-emerald-50 dark:bg-emerald-900/30' : ''}`}
                      >
                        <span className={`mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white ${attendantBadgeColor(t.name)}`}>
                          {initials(t.name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        <span className={`ml-2 text-xs font-semibold ${t.count >= 10 ? 'text-amber-500' : 'text-gray-400'}`}>{t.count}</span>
                        {attendantFilter === id && <Check className="ml-1.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {!tagFilterActive && (activeFolder === 'ativas' || activeFolder === 'todos') && (
                <button
                  onClick={() => setOnlyMine((v) => !v)}
                  title="Mostrar só o atendimento humano atribuído a mim (a fila continua visível pra todo mundo)"
                  className={`ml-auto ${chipCls(onlyMine)}`}
                >
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  <span className={chipLabelCls(onlyMine)}>Só minhas</span>
                </button>
              )}
            </div>
            {tagFilterActive && (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-[#3a6b58] bg-[#26483c] px-2 py-1.5 text-[11px] font-semibold text-[#a9f2d8]">
                <Search className="h-3 w-3 shrink-0" />
                {filtered.length} resultado{filtered.length === 1 ? '' : 's'} {search.trim() ? 'pra essa busca' : 'com essas tags'}, em <b>todas as pastas</b>.
              </div>
            )}
            </>)}
          </div>

          {/* Área rolável: só a lista de conversas rola */}
          <div className="wa-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-2">
            {contactsMode ? (
              <ContactsDirectory
                search={search}
                numberFilter={numberFilter}
                numberLabelOf={numberBadges ? (nid) => (nid ? numberBadges.get(nid) ?? null : null) : null}
                onOpen={async (contactId) => {
                  await refreshConversations();
                  setActiveContactId(contactId);
                }}
              />
            ) : (<>
            {conversations.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[#a7c9bc]">
                <InboxIcon className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">Nenhuma conversa ainda.</p>
                <p className="mt-1 text-xs">Quando um cliente mandar mensagem no WhatsApp, ela aparece aqui.</p>
              </div>
            )}
            {conversations.length > 0 && visibleItems.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[#a7c9bc]">
                <Search className="mb-2 h-6 w-6 opacity-40" />
                <p className="text-sm">Nada encontrado com esse filtro.</p>
              </div>
            )}

            {/* Com tag/busca ativa: mostra cada pasta em sua própria seção
                (sem a "Todos", que duplicaria tudo) — os resultados aparecem
                sem precisar entrar em pasta nenhuma. */}
            {tagFilterActive ? (
              ALL_FOLDERS.filter((f) => f.key !== 'todos').map((f) => (
                <ConversationGroup
                  key={f.key}
                  title={f.title}
                  accent={FOLDER_ACCENT[f.key]}
                  items={FOLDER_ITEMS[f.key]}
                  activeContactId={activeContactId}
                  onSelect={setActiveContactId}
                  meId={meId}
                  meName={session?.user?.name ?? ''}
                />
              ))
            ) : activeFolder === 'unqualified' ? (
              // Não qualificadas agrupadas POR MOTIVO de descarte — identifica
              // de cara por que cada lead não fechou.
              (() => {
                const byReason = new Map<string, WhatsAppConversationDTO[]>();
                for (const c of visibleItems) {
                  const label = c.closeCategoryLabel ?? 'Não qualificada (motivo genérico)';
                  const arr = byReason.get(label);
                  if (arr) arr.push(c); else byReason.set(label, [c]);
                }
                return [...byReason.entries()].sort((a, b) => b[1].length - a[1].length).map(([label, items]) => (
                  <ConversationGroup
                    key={label}
                    title={label.replace(/^Não qualif(icada|\.)?\s*[—-]\s*/i, '')}
                    items={items}
                    activeContactId={activeContactId}
                    onSelect={setActiveContactId}
                    meId={meId}
                    meName={session?.user?.name ?? ''}
                  />
                ));
              })()
            ) : (
              <ConversationGroup
                title={FOLDER_TITLE[activeFolder]}
                items={visibleItems}
                limit={visibleCount}
                activeContactId={activeContactId}
                onSelect={setActiveContactId}
                meId={meId}
                meName={session?.user?.name ?? ''}
                forceShow
                hideTitle
                emptyLabel="Nenhuma conversa aqui."
              />
            )}

            {!tagFilterActive && visibleItems.length > visibleCount && (
              <div className="px-3 pt-1">
                <button
                  onClick={() => setVisibleCount((v) => v + 200)}
                  className="w-full rounded-lg border border-[#3a6b58] bg-[#2e5749] py-1.5 text-[11px] font-bold text-[#6fd6ad] hover:bg-[#356b57]"
                >
                  Mostrando {Math.min(visibleCount, visibleItems.length)} de {visibleItems.length} · Carregar mais
                </button>
              </div>
            )}
            </>)}
          </div>
        </div>
        {/* Alça de redimensionar a lista (só desktop) */}
        <div
          onMouseDown={(e) => startResize(e, 'sidebar')}
          title="Arraste para redimensionar"
          className="absolute -right-1 bottom-0 top-0 z-10 hidden w-2 cursor-col-resize hover:bg-[#6fd6ad]/20 md:block"
        />
      </aside>

      {/* ---------- Thread ---------- */}
      <section className={`${activeContactId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-[#dce8e1] dark:bg-zinc-950/20`}>
        {!active ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <MessageCircle className="mb-2 h-10 w-10 opacity-30" />
            <p className="text-base">Selecione uma conversa para atender.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2.5 border-b border-gray-100 bg-white px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900 md:px-4">
              {/* Voltar para a lista (só no celular) */}
              <button
                onClick={() => setActiveContactId(null)}
                title="Voltar para as conversas"
                className="-ml-1 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 md:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <Avatar className="h-7 w-7 border border-gray-100 dark:border-zinc-800">
                <AvatarFallback className="bg-emerald-100 text-[10px] font-bold text-emerald-700">
                  {initials(active.contactName ?? active.contactPhone)}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => { setCopilotOpen(true); setFichaFocusToken((n) => n + 1); }}
                title="Abrir ficha do cliente no Copiloto"
                className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800"
              >
                <p className="truncate font-bold text-gray-900 underline-offset-2 hover:underline dark:text-zinc-100">
                  {active.contactName ?? formatPhone(active.contactPhone)}
                </p>
                {/* <p className="text-xs text-gray-400">
                  {formatPhone(active.contactPhone)}
                  {active.assignedToName ? ` · com ${active.assignedToName}` : ''}
                  {' · clique para ver a ficha'}
                </p> */}
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
              {/* Atalho conversa → card: um clique abre o dialog do kanban. */}
              {clientInfo?.registered && clientInfo.cardNumber && (
                <button
                  onClick={() => setCardDialogOpen(true)}
                  title="Abrir o card do cliente no kanban"
                  className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-300 px-2 py-0.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 sm:flex"
                >
                  Card #{clientInfo.cardNumber} ↗
                </button>
              )}
              {active.urgent && active.status !== 'closed' && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                  <AlertTriangle className="h-3 w-3" /> Urgente
                </span>
              )}
              <span className={`hidden rounded-full px-2 py-0.5 text-xs font-semibold sm:inline ${STATUS_CHIP[active.status] ?? ''}`}>
                {STATUS_LABEL[active.status] ?? active.status}
                {active.status === 'closed' && ` · ${active.closeCategoryLabel ?? (active.qualified ? 'Qualificada' : 'Não qualificada')}`}
              </span>

              {/* Tags da conversa */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Tags" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <TagIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Tags</span>
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

              {(active.status === 'queued' || active.status === 'bot' || active.status === 'standby' || (active.status === 'human' && active.assignedToId !== meId)) && (
                <HeaderButton icon={Headset} label="Assumir" onClick={() => runAction(() => assumeConversation(active.id), 'Conversa assumida.')} />
              )}
              {active.status === 'human' && (
                <HeaderButton icon={Undo2} label="Devolver pro bot" onClick={() => runAction(() => returnConversationToBot(active.id), 'Conversa devolvida pro bot.')} />
              )}
              {/* Encerrar (aberta) / Alterar desfecho (encerrada — a IA às
                  vezes desqualifica errado, e aqui a equipe corrige na mão). */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title={active.status !== 'closed' ? 'Encerrar conversa' : 'Alterar o desfecho'} className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <Archive className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{active.status !== 'closed' ? 'Encerrar' : 'Alterar desfecho'}</span> <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
                  <DropdownMenuLabel className="text-xs text-gray-400">
                    {active.status !== 'closed' ? 'Encerrar como…' : 'Mudar o desfecho para…'}
                  </DropdownMenuLabel>
                  {closeMenuOptions.map(({ category, label }) => {
                    const { Icon, color } = CLOSE_MENU_META[category]
                      ?? (category.startsWith('nq_') ? CLOSE_MENU_META.nao_qualificado : { Icon: Archive, color: 'text-gray-400' });
                    return (
                      <DropdownMenuItem
                        key={category}
                        onClick={() => runAction(() => closeConversation(active.id, category), `Encerrado: ${label}.`)}
                        className="text-base"
                      >
                        <Icon className={`mr-2 h-3.5 w-3.5 ${color}`} /> {label}
                        {active.status === 'closed' && active.closeCategory === category && <Check className="ml-2 h-3.5 w-3.5 text-emerald-600" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setReasonsModalOpen(true)} className="text-base">
                    <Settings2 className="mr-2 h-3.5 w-3.5" /> Gerenciar motivos…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {active.status === 'closed' && (
                <HeaderButton icon={Headset} label="Reabrir" onClick={() => runAction(() => assumeConversation(active.id), 'Atendimento reaberto.')} />
              )}

              {/* Mostrar/ocultar a coluna Copiloto (só existe no desktop lg+). */}
              <button
                onClick={() => setCopilotOpen((v) => !v)}
                title={copilotOpen ? 'Ocultar Copiloto' : 'Mostrar Copiloto'}
                className={`hidden shrink-0 rounded-lg border p-1.5 transition-colors lg:block ${copilotOpen
                    ? 'border-sky-300 bg-sky-50 text-sky-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <Sparkles className="h-4 w-4" />
              </button>

              {/* Mais ações: lida/não lida pra todo mundo; as destrutivas do
                  contato continuam exigindo manage_wa_contacts. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Mais ações" className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-gray-400">Conversa</DropdownMenuLabel>
                  {/* Abriu sem querer a conversa de outro atendente? Marcar como
                      não lida devolve o badge e FECHA a thread (senão o
                      auto-read remarcaria como lida na hora). */}
                  <DropdownMenuItem
                    onClick={() => {
                      const id = active.id;
                      setActiveContactId(null);
                      runAction(() => markConversationUnread(id), 'Conversa marcada como não lida.');
                    }}
                    className="text-base"
                  >
                    <MessageCircle className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Marcar como não lida
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => runAction(() => markConversationRead(active.id), 'Conversa marcada como lida.')}
                    className="text-base"
                  >
                    <CheckCheck className="mr-2 h-3.5 w-3.5 text-sky-500" /> Marcar como lida
                  </DropdownMenuItem>
                  {perms.manage_wa_contacts && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-gray-400">Contato</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleBlockContact(active)} className="text-base">
                        <Ban className={`mr-2 h-3.5 w-3.5 ${active.optedOut ? 'text-emerald-600' : 'text-amber-500'}`} />
                        {active.optedOut ? 'Desbloquear contato' : 'Bloquear contato'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDeleteContact(active)} className="text-base text-red-600 focus:text-red-600">
                        <Trash2 className="mr-2 h-3.5 w-3.5 text-red-500" /> Excluir contato e histórico
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            <div ref={scrollRef} className="wa-scroll flex-1 overflow-y-auto px-5 py-5 md:px-7">
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
                const newDay = !prev
                  || new Date(prev.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                return (
                  <Fragment key={msg.id}>
                    {newDay && (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm dark:bg-zinc-800 dark:text-zinc-400">
                          {dayLabel(msg.createdAt)}
                        </span>
                      </div>
                    )}
                    <ThreadMessageRow
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
                      onAttachToCard={() => handleAttachMedia(msg)}
                      contactName={active?.contactName}
                    />
                  </Fragment>
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

            <WhatsAppSendTemplateModal
              open={sendTemplateOpen}
              onOpenChange={setSendTemplateOpen}
              contactId={active.contactId}
              onSent={async () => { await Promise.all([mutateMessages(), refreshConversations()]); }}
            />
          </>
        )}
      </section>

      {/* ---------- Copiloto (coluna direita, lg+) ---------- */}
      {active && copilotOpen && (
        <div style={{ width: copilotW }} className="relative hidden shrink-0 lg:flex">
          {/* Alça de redimensionar o Copiloto */}
          <div
            onMouseDown={(e) => startResize(e, 'copilot')}
            title="Arraste para redimensionar"
            className="absolute -left-1 bottom-0 top-0 z-10 w-2 cursor-col-resize hover:bg-[#6fd6ad]/20"
          />
          <CopilotPanel
            conversation={active}
            messages={displayMessages}
            clientInfo={clientInfo ?? null}
            onClientInfoChanged={(info) => { mutateClientInfo(info, { revalidate: false }); }}
            onOpenCard={() => setCardDialogOpen(true)}
            onRefreshMessages={async () => { await mutateMessages(); }}
            focusFicha={fichaFocusToken}
          />
        </div>
      )}

      {/* CardDialog do cliente vinculado — aberto pelo atalho "Card #N" ou
          pelo Copiloto. O dialog recarrega o card completo sozinho. */}
      {cardDialogOpen && cardStub && clientInfo?.userId && (
        <CardDialog
          card={cardStub}
          open={cardDialogOpen}
          onClose={() => setCardDialogOpen(false)}
          onUpdate={() => { mutateClientInfo(); }}
          cardId={clientInfo.userId}
          isProcess={false}
          ownerId={clientInfo.userId}
        />
      )}

      <WhatsAppTagsModal open={tagsModalOpen} onOpenChange={setTagsModalOpen} onChanged={reloadTags} />
      <CloseReasonsModal
        open={reasonsModalOpen}
        onOpenChange={setReasonsModalOpen}
        reasons={closeReasons ?? []}
        onChanged={(updated) => mutateCloseReasons(updated, { revalidate: false })}
      />
      <AddContactDialog
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        onCreated={async (contactId) => {
          await refreshConversations();
          setActiveContactId(contactId);
        }}
      />
    </div>
    </NumberBadgeContext.Provider>
  );
}

/* ---------- subcomponentes ---------- */

// Cores do cabeçalho de cada grupo da sidebar (por prioridade de ação),
// calibradas pro fundo verde-escuro da skin original do inbox.
const GROUP_ACCENT: Record<string, { header: string; chip: string }> = {
  fila: { header: 'text-amber-400', chip: 'bg-[#2e5749] text-amber-200' },
  ativas: { header: 'text-[#6fd6ad]', chip: 'bg-[#2e5749] text-[#c5ecdb]' },
  bot: { header: 'text-sky-300', chip: 'bg-[#2e5749] text-sky-200' },
  recup: { header: 'text-violet-300', chip: 'bg-[#2e5749] text-violet-200' },
};

/** Pill âmbar da janela de 24h na lista: expirada ou expirando em < 6h. */
function windowPill(c: WhatsAppConversationDTO): string | null {
  if (c.status !== 'human' && c.status !== 'queued') return null;
  if (!c.lastInboundAt) return null;
  const remaining = WINDOW_24H_MS - (Date.now() - new Date(c.lastInboundAt).getTime());
  if (remaining <= 0) return '24h ⚠';
  if (remaining < 6 * 60 * 60 * 1000) return `24h: ${Math.max(1, Math.floor(remaining / 3_600_000))}h`;
  return null;
}

/** Ícone do tipo de mídia da última mensagem, pra prévia da lista não
 * depender só de texto cru quando é foto/áudio/documento. */
function mediaKindIcon(mediaType: string | null): React.ElementType | null {
  if (!mediaType) return null;
  if (mediaType.startsWith('image/')) return ImageIconWA;
  if (mediaType.startsWith('video/')) return Video;
  if (mediaType.startsWith('audio/')) return Mic;
  return FileText;
}

/** Logo da origem do lead (first-touch de Click-to-WhatsApp ads) no canto do
 * avatar. Orgânico não ganha selo — a ausência já diz. */
function SourceBadge({ platform }: { platform: string | null }) {
  if (platform === 'instagram') {
    return (
      <span title="Veio de anúncio no Instagram" className="absolute -left-1 -top-1 h-[15px] w-[15px] overflow-hidden rounded-full border-2 border-[#1f3d33]">
        <svg viewBox="0 0 24 24" className="h-full w-full">
          <defs>
            <radialGradient id="wa-ig-grad" cx="30%" cy="107%" r="150%">
              <stop offset="0%" stopColor="#fdf497" /><stop offset="30%" stopColor="#fd5949" />
              <stop offset="60%" stopColor="#d6249f" /><stop offset="90%" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <rect width="24" height="24" rx="7" fill="url(#wa-ig-grad)" />
          <rect x="6" y="6" width="12" height="12" rx="4" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="12" cy="12" r="2.6" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="16.2" cy="7.8" r="1" fill="#fff" />
        </svg>
      </span>
    );
  }
  if (platform === 'facebook') {
    return (
      <span title="Veio de anúncio no Facebook" className="absolute -left-1 -top-1 h-[15px] w-[15px] overflow-hidden rounded-full border-2 border-[#1f3d33]">
        <svg viewBox="0 0 24 24" className="h-full w-full">
          <rect width="24" height="24" rx="12" fill="#1877f2" />
          <path d="M15.5 12.5h-2.3V19h-2.8v-6.5H8.7V10h1.7V8.6c0-1.9 1-3 3-3 .8 0 1.5.1 1.7.1v2.1h-1.2c-.8 0-1 .4-1 1V10h2.3l-.3 2.5z" fill="#fff" />
        </svg>
      </span>
    );
  }
  return null;
}

/** Modal de gestão dos motivos de "não qualificada" — a equipe adiciona e
 * remove sem depender de deploy. Apagar um motivo não mexe em conversas já
 * encerradas com ele (o rótulo histórico continua resolvível). */
function CloseReasonsModal({
  open, onOpenChange, reasons, onChanged,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  reasons: CloseReasonDTO[]; onChanged: (updated: CloseReasonDTO[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    const value = draft.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      onChanged(await createCloseReason(value));
      setDraft('');
      toast.success('Motivo criado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar o motivo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      onChanged(await deleteCloseReason(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Motivos de não qualificada</DialogTitle>
          <DialogDescription>
            Cada motivo vira uma opção no menu Encerrar e um grupo próprio na pasta Não qual.
            Apagar um motivo não altera conversas já encerradas com ele.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Novo motivo (ex.: já recebe benefício)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={handleAdd}
            disabled={busy || !draft.trim()}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {reasons.length === 0 && <p className="text-sm text-gray-400">Nenhum motivo cadastrado ainda.</p>}
          {reasons.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-zinc-800">
              <span className="min-w-0 truncate">{r.label}</span>
              <button onClick={() => handleDelete(r.id)} title="Excluir motivo" className="shrink-0 text-gray-400 transition-colors hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog de novo contato: cria contato + conversa em atendimento humano e
 * abre o chat. Fora da janela de 24h, o primeiro envio sai por template. */
function AddContactDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onCreated: (contactId: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    try {
      const { contactId } = await createWhatsAppContact(phone, name);
      await onCreated(contactId);
      onOpenChange(false);
      setName(''); setPhone('');
      toast.success('Contato criado — a conversa já está aberta com você.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar o contato.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar contato</DialogTitle>
          <DialogDescription>
            A conversa nasce em atendimento com você. Fora da janela de 24h da Meta, o primeiro contato sai por template aprovado.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do contato"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Celular com DDD (ex.: 41 99999-9999)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={handleCreate}
            disabled={busy || !name.trim() || !phone.trim()}
            className="mt-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Criando…' : 'Criar e abrir conversa'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Botão do rail de pastas: ícone + rótulo curto + total, com selo vermelho de
// "chegou agora" (não-lidas) quando a pasta tem alguma — igual em todas as
// pastas, não só na Fila.
function RailButton({
  icon: Icon, label, title, count, unread, active, onClick,
}: {
  icon: React.ElementType; label: string; title: string; count: number; unread: number;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={`${title} — ${count}${unread > 0 ? ` (${unread} nova${unread > 1 ? 's' : ''})` : ''}`}
      className={`relative mx-1.5 mb-1 flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition-colors ${active ? 'bg-[#1a6649] text-white' : 'text-[#8fbcac] hover:bg-[#204a3c] hover:text-white'
        }`}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="text-[9.5px] font-bold uppercase leading-tight tracking-wide">{label}</span>
      <span className="text-[10px] font-semibold text-[#8fbcac]">{count}</span>
      {unread > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-0.5 text-[9px] font-bold text-white">
          {unread}
        </span>
      )}
    </button>
  );
}

function ConversationGroup({
  title, items, activeContactId, onSelect, accent, meId, meName, headerExtra, forceShow, hideTitle, emptyLabel, limit, folderLabel,
}: {
  title: string; items: WhatsAppConversationDTO[]; activeContactId: string | null;
  onSelect: (contactId: string) => void; accent?: keyof typeof GROUP_ACCENT;
  meId?: string; meName?: string;
  headerExtra?: React.ReactNode; forceShow?: boolean; hideTitle?: boolean; emptyLabel?: string;
  // Corta a RENDERIZAÇÃO em `limit` itens (paginação client-side); o cabeçalho
  // continua mostrando o total real de `items`.
  limit?: number;
  // Quando informado, mostra de qual pasta cada conversa veio — usado na
  // busca global por tag, que mistura itens de todas as pastas.
  folderLabel?: (c: WhatsAppConversationDTO) => string;
}) {
  // Etiqueta do número da empresa (multi-número) — null com menos de 2 linhas.
  const numberBadges = useContext(NumberBadgeContext);
  if (!items.length && !forceShow && !hideTitle) return null;
  const colors = accent ? GROUP_ACCENT[accent] : { header: 'text-[#8fbcac]', chip: 'bg-[#2e5749] text-[#cfe6db]' };
  const visible = limit != null ? items.slice(0, limit) : items;
  return (
    <div>
      {!hideTitle && (
        <div className={`flex items-center gap-1.5 px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider ${colors.header}`}>
          {title}
          <span className={`rounded-full px-1.5 text-[10px] font-bold ${colors.chip}`}>{items.length}</span>
          {headerExtra}
        </div>
      )}
      {!items.length && (
        <p className="px-3 pb-1 text-xs text-[#8fbcac]">{emptyLabel ?? 'Nenhuma conversa aqui.'}</p>
      )}
      {visible.map((c) => {
        const isActive = c.contactId === activeContactId;
        // Selinho sobre o avatar: quem está com a conversa agora. Bot/standby
        // mostram o robô; humano mostra as iniciais de quem falou por último
        // (ou do atendente atribuído), "EU" quando é você.
        const attName = c.status === 'human' ? (c.lastMessageAuthorName ?? c.assignedToName) : null;
        const attIsMe = !!attName && (attName === meName || (!c.lastMessageAuthorName && c.assignedToId === meId));
        const isBotSide = c.status === 'bot' || c.status === 'standby';
        const pill = windowPill(c);
        const MediaIcon = mediaKindIcon(c.lastMessageMediaType);
        // Fila: mostra o motivo que o bot deixou ao transferir em vez do
        // preview genérico — ajuda a decidir quem atender primeiro sem abrir.
        const previewText = c.status === 'queued' && c.handoffReason
          ? c.handoffReason
          : (c.lastMessagePreview ? stripWaMarkup(c.lastMessagePreview) : '—');
        const hasUnread = c.unread && c.status !== 'closed';
        // Fila de espera: destaque âmbar (bolinha + hora) até alguém assumir.
        const isQueued = c.status === 'queued';
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.contactId)}
            className={`mx-1.5 mb-0.5 flex w-[calc(100%-12px)] flex-col rounded-lg px-2 py-2 text-left transition-colors ${isActive
              ? 'bg-[#1a6649] text-white'
              : isQueued && hasUnread
                ? 'bg-amber-400/15 text-white ring-1 ring-inset ring-amber-400/30 hover:bg-amber-400/20'
                : hasUnread
                  ? 'bg-[#27503f] text-white hover:bg-[#2c5a47]'
                  : 'text-[#d3e2db] hover:bg-[#26483c]'
              }`}
          >
            {/* linha 1: avatar + nome + hora */}
            <span className="flex w-full items-center gap-2.5">
              <span className="relative shrink-0">
                <Avatar className="h-9 w-9 border border-[#3a6b58]">
                  <AvatarFallback className="bg-[#356b57] text-[11px] font-bold text-[#c5ecdb]">
                    {initials(c.contactName ?? c.contactPhone)}
                  </AvatarFallback>
                </Avatar>
                <SourceBadge platform={c.adPlatform} />
                {isBotSide && (
                  <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[#1f3d33] bg-sky-600 text-white">
                    <Bot className="h-2 w-2" />
                  </span>
                )}
                {!isBotSide && attName && (
                  <span
                    title={attIsMe ? 'Você' : attName}
                    className={`absolute -bottom-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full border-2 border-[#1f3d33] px-px text-[6.5px] font-bold text-white ${attIsMe ? 'bg-emerald-600' : attendantBadgeColor(attName)
                      }`}
                  >
                    {attIsMe ? 'EU' : initials(attName)}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={`truncate text-[13px] ${isQueued ? 'font-bold text-amber-200' : hasUnread ? 'font-bold text-white' : 'font-semibold'}`}>{c.contactName ?? formatPhone(c.contactPhone)}</span>
              </span>
              {c.urgent && c.status !== 'closed' && (
                <span className="shrink-0 animate-pulse rounded-full bg-red-500/20 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-red-300 ring-1 ring-red-500/40">Urgente</span>
              )}
              {c.status === 'standby' && c.recoveryAttempts > 0 && (
                <span className="shrink-0 rounded-full bg-violet-400/15 px-1.5 py-0.5 text-[8.5px] font-bold text-violet-300 ring-1 ring-violet-400/30">
                  {Math.min(c.recoveryAttempts, 5)}ª de 5
                </span>
              )}
              {pill && (
                <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[8.5px] font-bold text-amber-300 ring-1 ring-amber-400/30">{pill}</span>
              )}
              {/* coluna direita estilo WhatsApp: hora em cima, badge embaixo.
                  Âmbar = esperando na fila (mesmo com não-lidas — em qualquer
                  pasta, inclusive "Todos"); verde = não lida fora da fila. */}
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className={`text-[10px] font-semibold ${isQueued ? 'text-amber-400' : hasUnread ? 'text-[#6fd6ad]' : 'text-[#8fbcac]'}`}>
                  {formatDistanceToNow(new Date(c.lastMessageAt), { locale: ptBR, addSuffix: false })}
                </span>
                {hasUnread && c.manualUnread ? (
                  <span
                    title="Marcada como não lida por alguém da equipe"
                    className="flex h-[18px] items-center rounded-full bg-[#1d9e75]/20 px-1.5 text-[9px] font-bold uppercase tracking-wide text-[#6fd6ad] ring-1 ring-[#1d9e75]"
                  >
                    não lida
                  </span>
                ) : hasUnread && c.unreadCount > 0 ? (
                  <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${isQueued ? 'bg-amber-400 text-[#1f3d33] shadow-[0_0_6px_rgba(251,191,36,.6)]' : 'bg-[#1d9e75] text-white'}`}>
                    {c.unreadCount > 99 ? '99+' : c.unreadCount}
                  </span>
                ) : hasUnread ? (
                  <span className={`h-[9px] w-[9px] rounded-full ${isQueued ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,.6)]' : 'bg-[#6fd6ad]'}`} />
                ) : isQueued ? (
                  <span title="Na fila de espera — ninguém assumiu ainda" className="h-[9px] w-[9px] rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,.6)]" />
                ) : null}
              </span>
            </span>

            {/* linha 2: ticks (quando a última é nossa, estilo WhatsApp) + prévia */}
            <span className="mt-0.5 flex w-full items-center gap-1 pl-[46px] text-[11px] text-[#a7c9bc]">
              {!c.lastMessageFromClient && c.lastMessageStatus && (
                c.lastMessageStatus === 'read'
                  ? <CheckCheck className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                  : c.lastMessageStatus === 'delivered'
                    ? <CheckCheck className="h-3.5 w-3.5 shrink-0 text-[#8fbcac]" />
                    : c.lastMessageStatus === 'failed'
                      ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                      : <Check className="h-3.5 w-3.5 shrink-0 text-[#8fbcac]" />
              )}
              {MediaIcon && <MediaIcon className="h-3 w-3 shrink-0" />}
              <span className="truncate">{previewText}</span>
            </span>

            {/* linha 3: tags + etiqueta do número (multi-número) */}
            {(c.tags.length > 0 || folderLabel || (numberBadges && c.numberId && numberBadges.get(c.numberId))) && (
              <span className="mt-1 flex w-full items-center gap-1.5 pl-[46px]">
                {(() => {
                  const nb = numberBadges && c.numberId ? numberBadges.get(c.numberId) : null;
                  return nb ? (
                    <span title={`Atendido pela linha ${nb.label}`} className="flex max-w-[110px] items-center gap-1 rounded-md bg-[#33544a] px-1.5 py-0.5 text-[9px] font-bold text-[#cfe6db]">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${nb.dot}`} />
                      <span className="truncate">{nb.label}</span>
                    </span>
                  ) : null;
                })()}
                {c.tags.slice(0, 2).map((t) => (
                  <span key={t.id} className="rounded-md px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ backgroundColor: t.color }}>
                    {t.name}
                  </span>
                ))}
                {c.tags.length > 2 && (
                  <span title={c.tags.slice(2).map((t) => t.name).join(', ')} className="rounded-md bg-[#33544a] px-1.5 py-0.5 text-[9px] font-bold text-[#a7c9bc]">
                    +{c.tags.length - 2}
                  </span>
                )}
                {folderLabel && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-[#7fae9c]">{folderLabel(c)}</span>
                )}
              </span>
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

// Reação do cliente vira uma mensagem com body "Reagiu com 👍" (formato antigo:
// "👍 (reação)"). Detecta os dois pra renderizar como evento, não como balão.
function parseReactionBody(body: string | null): { emoji: string | null; removed: boolean } | null {
  if (!body) return null;
  let m = body.match(/^Reagiu com (\S{1,8})$/u);
  if (m) return { emoji: m[1], removed: false };
  m = body.match(/^(\S{1,8}) \(rea[çc][ãa]o\)$/u);
  if (m) return { emoji: m[1], removed: false };
  if (/^(\(rea[çc][ãa]o removida\)|Removeu a rea[çc][ãa]o)$/iu.test(body.trim())) return { emoji: null, removed: true };
  return null;
}

function ThreadMessageRow({
  msg, grouped, meId, highlighted, setRowRef, onReply, onEdit, onDelete, onRetry, onDiscard, onJumpToReply, onAttachToCard, contactName,
}: {
  msg: WhatsAppThreadMessage; grouped: boolean; meId: string; highlighted: boolean; contactName?: string | null;
  setRowRef: (el: HTMLDivElement | null) => void;
  onReply: () => void; onEdit: () => void; onDelete: () => void;
  onRetry: () => void; onDiscard: () => void; onJumpToReply: () => void;
  onAttachToCard: () => void;
}) {
  const mine = msg.direction === 'out';
  const isTemp = msg.id.startsWith('temp-');
  const canEdit = mine && !isTemp && msg.authorId === meId && !msg.mediaKey && !msg.deletedAt;
  const canDelete = mine && !isTemp && msg.authorId === meId && !msg.deletedAt;

  if (msg.deletedAt) {
    return (
      <div ref={setRowRef} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? 'mt-1' : 'mt-3'}`}>
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
          <span className="whitespace-pre-wrap break-words">{renderFormattedText(msg.body ?? '')}</span>
        </div>
      </div>
    );
  }

  // Reação (estilo WhatsApp): evento discreto centralizado — "Fulana reagiu
  // com 👍 a '...'"; clique pula pra mensagem reagida.
  const reaction = !mine && !msg.mediaKey ? parseReactionBody(msg.body) : null;
  if (reaction) {
    const who = (contactName ?? '').trim() || 'Cliente';
    return (
      <div ref={setRowRef} className={`flex justify-center ${grouped ? 'mt-1' : 'mt-2'} ${highlighted ? 'rounded-xl bg-amber-100/70 dark:bg-amber-900/30' : ''}`}>
        <button
          onClick={msg.replyToId ? onJumpToReply : undefined}
          disabled={!msg.replyToId}
          className="flex max-w-[85%] items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-500 shadow-sm transition-colors enabled:hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-400 dark:enabled:hover:bg-zinc-800"
        >
          {reaction.emoji && <span className="text-base leading-none">{reaction.emoji}</span>}
          <span className="truncate">
            <span className="font-semibold">{who}</span>
            {reaction.removed ? ' removeu a reação' : ` reagiu com ${reaction.emoji}`}
            {msg.replyToBody && <span className="opacity-70"> a “{msg.replyToBody.length > 48 ? `${msg.replyToBody.slice(0, 48)}…` : msg.replyToBody}”</span>}
          </span>
          <span className="shrink-0 text-[11px] opacity-60">{timeShort(msg.createdAt)}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setRowRef}
      className={`group flex items-end gap-2 rounded-xl transition-colors duration-700 ${mine ? 'flex-row-reverse' : ''} ${grouped ? 'mt-1' : 'mt-3'} ${highlighted ? 'bg-amber-100/70 dark:bg-amber-900/30' : ''}`}
    >
      <div className={`flex max-w-[85%] flex-col md:max-w-[72%] ${mine ? 'items-end' : 'items-start'}`}>
        {mine && !grouped && (
          <span className="mb-0.5 flex items-center gap-1 px-1 text-sm font-bold text-gray-500 dark:text-zinc-400">
            {msg.sentByBot ? <><Bot className="h-3 w-3" /> Bot</> : <><UserRound className="h-3 w-3" /> {msg.authorName ?? 'Atendente'}</>}
          </span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm ${mine
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
          {msg.mediaKey && <WaMediaBubble msg={msg} mine={mine} onAttachToCard={onAttachToCard} />}
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
 * Mídia inline na bolha — visual novo:
 *   - imagem: cartão arredondado com zoom no hover, clique abre em nova aba
 *   - vídeo: player nativo em cartão arredondado
 *   - áudio: player próprio (play/pausa + barra + tempo) e botão "Transcrever"
 *     (IA; o texto fica salvo na mensagem — o próximo clique é grátis)
 *   - documento: cartão com ícone, extensão em selo e ação "abrir"
 * A URL pré-assinada é buscada uma vez (cache em memória via getMediaUrl).
 */
function WaMediaBubble({ msg, mine, onAttachToCard }: { msg: WhatsAppThreadMessage; mine: boolean; onAttachToCard?: () => void }) {
  const mediaKey = msg.mediaKey as string;
  const mediaType = msg.mediaType;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isTemp = msg.id.startsWith('temp-');

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

  // "Baixar" de verdade: URL com Content-Disposition attachment.
  async function downloadAsFile() {
    const res = await downloadFileFromS3(mediaKey, docName, false);
    if (res.success && res.presignedUrl) window.open(res.presignedUrl, '_blank');
    else toast.error('Não foi possível baixar o anexo.');
  }

  // Menu compartilhado por imagem/vídeo/documento: ver, baixar, anexar no card.
  const mediaMenu = (
    <DropdownMenuContent align="start" className="w-60">
      <DropdownMenuItem onClick={openInNewTab} className="text-base">
        <Eye className="mr-2 h-3.5 w-3.5 text-gray-500" /> Ver em tela cheia
      </DropdownMenuItem>
      <DropdownMenuItem onClick={downloadAsFile} className="text-base">
        <Download className="mr-2 h-3.5 w-3.5 text-gray-500" /> Baixar
      </DropdownMenuItem>
      {onAttachToCard && !isTemp && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onAttachToCard} className="text-base text-emerald-700 focus:text-emerald-700">
            <Paperclip className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Anexar no card do cliente
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );

  if (failed) {
    return (
      <button onClick={openInNewTab} title={docName} className={`mb-1 flex max-w-[16rem] items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-900'}`}>
        <Paperclip className="h-4 w-4 shrink-0" /> <span className="truncate">{docName}</span>
      </button>
    );
  }

  if (mediaType?.startsWith('image/')) {
    return url ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            title="Opções da imagem (ver, baixar, anexar no card)"
            className="group/img relative mb-1 block overflow-hidden rounded-xl border border-black/5 shadow-sm dark:border-white/10"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Imagem enviada" className="max-h-72 max-w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.03]" />
            <span className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/25 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover/img:opacity-100">
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                Opções
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        {mediaMenu}
      </DropdownMenu>
    ) : (
      <div className={`mb-1 flex h-36 w-52 items-center justify-center rounded-xl ${mine ? 'bg-white/10' : 'bg-gray-100 dark:bg-zinc-900/60'}`}>
        <Loader2 className="h-5 w-5 animate-spin opacity-60" />
      </div>
    );
  }

  if (mediaType?.startsWith('video/')) {
    return url ? (
      <div className="mb-1">
        <div className="overflow-hidden rounded-xl border border-black/5 shadow-sm dark:border-white/10">
          <video src={url} controls className="max-h-72 max-w-full" />
        </div>
        {onAttachToCard && !isTemp && (
          <button
            onClick={onAttachToCard}
            className={`mt-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors ${mine ? 'bg-white/15 text-white/90 hover:bg-white/25' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
          >
            <Paperclip className="h-3 w-3" /> Anexar no card
          </button>
        )}
      </div>
    ) : (
      <div className={`mb-1 flex h-36 w-52 items-center justify-center rounded-xl ${mine ? 'bg-white/10' : 'bg-gray-100 dark:bg-zinc-900/60'}`}>
        <Loader2 className="h-5 w-5 animate-spin opacity-60" />
      </div>
    );
  }

  if (mediaType?.startsWith('audio/')) {
    return <WaAudioBubble msg={msg} mine={mine} url={url} />;
  }

  const ext = (docName.split('.').pop() ?? '').toUpperCase().slice(0, 5);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title={docName}
          className={`mb-1 flex w-64 max-w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold shadow-sm transition-colors ${mine
              ? 'border-white/15 bg-white/10 hover:bg-white/20'
              : 'border-gray-100 bg-gray-50 hover:bg-gray-100 dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:bg-zinc-900'
            }`}
        >
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${mine ? 'bg-white/15' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
            <FileText className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate">{docName}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-normal opacity-70">
              {ext && (
                <span className={`rounded px-1 py-px text-[10px] font-bold ${mine ? 'bg-white/20' : 'bg-gray-200 dark:bg-zinc-800'}`}>{ext}</span>
              )}
              Clique para opções
            </span>
          </span>
          <Download className={`h-4 w-4 shrink-0 ${mine ? 'text-white/70' : 'text-gray-400'}`} />
        </button>
      </DropdownMenuTrigger>
      {mediaMenu}
    </DropdownMenu>
  );
}

function fmtAudioTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Player de áudio próprio (o <audio controls> nativo destoava do resto do
 * inbox) + botão "Transcrever": chama a IA uma vez, o texto fica salvo na
 * mensagem e aparece pra equipe inteira nas próximas aberturas.
 */
function WaAudioBubble({ msg, mine, url }: { msg: WhatsAppThreadMessage; mine: boolean; url: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(msg.transcript ?? null);
  const [transcribing, setTranscribing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  // Velocidade de reprodução (estilo WhatsApp): 1x → 1.5x → 2x → 1x.
  const [speed, setSpeed] = useState(1);

  function cycleSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  // Transcrição pode chegar pelo polling (outro atendente transcreveu).
  useEffect(() => {
    if (msg.transcript && !transcript) setTranscript(msg.transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.transcript]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => toast.error('Não foi possível tocar o áudio.'));
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * duration;
  }

  async function handleTranscribe() {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const text = await transcribeWhatsAppAudio(msg.id);
      setTranscript(text);
      setShowTranscript(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao transcrever o áudio.');
    } finally {
      setTranscribing(false);
    }
  }

  const progress = duration ? (current / duration) * 100 : 0;
  const isTemp = msg.id.startsWith('temp-');

  return (
    <div className="mb-1 w-72 max-w-full">
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); e.currentTarget.playbackRate = speed; }}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrent(0); }}
          className="hidden"
        />
      )}
      <div className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 shadow-sm ${mine ? 'border-white/15 bg-white/10' : 'border-gray-100 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/60'
        }`}>
        <button
          onClick={toggle}
          disabled={!url}
          title={playing ? 'Pausar' : 'Tocar áudio'}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${mine
              ? 'bg-white/90 text-emerald-700 hover:bg-white'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
        >
          {!url
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : playing
              ? <Pause className="h-4 w-4" />
              : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div
            onClick={seek}
            title="Clique para avançar"
            className={`h-1.5 cursor-pointer overflow-hidden rounded-full ${mine ? 'bg-white/25' : 'bg-gray-200 dark:bg-zinc-700'}`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-150 ${mine ? 'bg-white' : 'bg-emerald-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className={`mt-1 flex items-center justify-between text-[11px] tabular-nums ${mine ? 'text-white/75' : 'text-gray-400'}`}>
            <span className="flex items-center gap-1"><Mic className="h-3 w-3" /> áudio</span>
            <span>{fmtAudioTime(current)} / {fmtAudioTime(duration)}</span>
          </div>
        </div>
        {/* Velocidade 1x / 1.5x / 2x (clica pra alternar) */}
        <button
          onClick={cycleSpeed}
          disabled={!url}
          title="Velocidade de reprodução"
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold tabular-nums transition-colors disabled:opacity-50 ${mine
              ? 'bg-white/20 text-white hover:bg-white/30'
              : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
            }`}
        >
          {speed === 1 ? '1x' : speed === 1.5 ? '1.5x' : '2x'}
        </button>
      </div>

      {/* Transcrição pela IA */}
      {!transcript && !isTemp && (
        <button
          onClick={handleTranscribe}
          disabled={transcribing}
          className={`mt-1.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-70 ${mine
              ? 'bg-white/15 text-white/90 hover:bg-white/25'
              : 'bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/70'
            }`}
        >
          {transcribing
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo…</>
            : <><Sparkles className="h-3 w-3" /> Transcrever com IA</>}
        </button>
      )}
      {transcript && (
        <div className={`mt-1.5 rounded-lg border-l-2 px-2.5 py-1.5 text-sm leading-relaxed ${mine
            ? 'border-white/40 bg-white/10 text-white/90'
            : 'border-violet-400 bg-violet-50/70 text-gray-600 dark:bg-violet-950/30 dark:text-zinc-300'
          }`}>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            className={`mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${mine ? 'text-white/70' : 'text-violet-500 dark:text-violet-300'}`}
          >
            <Sparkles className="h-2.5 w-2.5" /> Transcrição {showTranscript ? '▾' : '▸'}
          </button>
          {showTranscript && <p className="whitespace-pre-wrap break-words">{transcript}</p>}
        </div>
      )}
    </div>
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
      title={label}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {/* No celular o rótulo some (só ícone) para o header não estourar. */}
      <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
