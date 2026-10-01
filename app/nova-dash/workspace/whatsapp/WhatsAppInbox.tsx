/* eslint-disable no-unused-vars */
'use client';

import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import {
  ArrowLeft, Bot, Check, CheckCheck, AlertCircle, MessageCircle, Paperclip,
  UserRound, Undo2, Archive, Headset, Inbox as InboxIcon, Search, X,
  Clock, Pencil, Trash2, Reply as ReplyIcon, Ban, Loader2, Tag as TagIcon,
  FileBadge, ChevronDown, BadgeCheck, XCircle, Settings2, FileText,
  HelpCircle, AlertTriangle, StickyNote, Play, Pause, Mic, Download, Sparkles,
  MoreVertical, Eye, RotateCcw, MessageSquareOff, Image as ImageIconWA, Video,
  UserCheck, Columns3, Users, Phone, BookUser, Smile,
  Lock, ArrowDown, UserX,
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
  fetchInboxConversation, fetchInboxFilter, fetchThreadRecent, useInboxColumns,
  useWaNumberOptions, useWhatsAppConversations, useWhatsAppMessages,
  type WaNumberOption, type WhatsAppThreadMessage,
} from '@/app/_shared/hooks/use-whatsapp';
import {
  OPEN_CONTACT_STORAGE_KEY, browserSessionStorage, pruneColumnFilter, pruneTagFilter, restoreInboxView,
  saveInboxViewState, type InboxFolderKey, type InboxViewState,
} from '@/app/_shared/utils/inbox-view-state';
import {
  INBOX_FILTER_PAGE, appendFilterPage, filterResultChanged, hasServerFilter, inboxFilterQuery, matchesInboxFilter,
  mergeLiveIntoFiltered, mergeRefreshedFirstPage, type InboxServerFilter,
} from '@/app/_shared/utils/inbox-filter';
import { closedFolderOf, type ClosedFolderKey } from '@/app/_shared/utils/inbox-folders';
import {
  assumeConversation, returnConversationToBot, closeConversation, markConversationRead, markConversationUnread,
  setConversationCollectRequest,
} from '@/app/_actions/whatsapp/conversations';
import { collectRequestPatch, sameCollectRequest } from '@/app/_shared/utils/collect-request';
// Só tipo: o módulo de dados (inbox-data.ts) importa o Prisma e não pode
// entrar no bundle do navegador.
import type { WhatsAppConversationDTO } from '@/app/_shared/lib/whatsapp/inbox-types';
import {
  sendWhatsAppMessage, sendWhatsAppMedia, getWhatsAppUploadUrl,
  editWhatsAppMessage, deleteWhatsAppMessage, reactToWhatsAppMessage,
} from '@/app/_actions/whatsapp/send-message';
import { listWhatsAppTags, setConversationTag, type WhatsAppTagDTO } from '@/app/_actions/whatsapp/tags';
import {
  assumePatch, closePatch, inboxListState, manualUnreadPatch, patchConversationList, patchConversationRow, readPatch,
  returnToBotPatch, revertPatch, sameTags, sentMessagePatch, withTag, type ConversationPatch,
} from '@/app/_shared/utils/whatsapp-inbox';
import type { WhatsAppMessageDTO } from '@/app/_shared/lib/whatsapp/service';
import { toThreadMessage, type SentMessageDTO } from '@/app/_shared/utils/thread-window';
import { HttpError, describeFetchError } from '@/app/_shared/utils/fetch-json';
import { mergeConversationDelta } from '@/app/_shared/utils/inbox-delta';
import {
  NEAR_BOTTOM_PX, countNewBelow, decideThreadScroll, isOwnThreadMessage, tailAdvanced, threadTail, type ThreadTail,
} from '@/app/_shared/utils/thread-scroll';
import { listCloseReasons, createCloseReason, deleteCloseReason, type CloseReasonDTO } from '@/app/_actions/whatsapp/close-reasons';
import { createWhatsAppContact } from '@/app/_actions/whatsapp/contacts';
import { blockWhatsAppContact, unblockWhatsAppContact, deleteWhatsAppContact } from '@/app/_actions/whatsapp/contacts';
import { usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';
import { describeAssistError, requestAssistText } from '@/app/_shared/utils/assist-api';
// SÓ POR 1 DEPLOY: a UI chama a IA do Copiloto por fetch, mas a aba aberta com
// o bundle antigo ainda chama as actions de assist.ts pelo id. No Next 14 a
// action só entra no manifesto se o arquivo for alcançável pelos imports da
// página; sem esta linha, os 4 botões de IA da aba antiga dariam "Failed to
// find Server Action" até o F5. Remover no deploy seguinte, junto com o arquivo.
import '@/app/_actions/whatsapp/assist';
import { CLOSE_CATEGORY_OPTIONS, CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';
import { RECOVERY_MAX_ATTEMPTS_DEFAULT } from '@/app/_shared/lib/whatsapp/recovery-caps';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { attachConversationMediaToCard } from '@/app/_actions/whatsapp/client-documents';
import { useCopilot } from '@/app/_shared/hooks/use-copilot';
import { CardDialog } from '@/app/nova-dash/CardDialog';
import type { ExtendedKanbanCard } from '@/app/nova-dash/card-dialog/types';
import { WhatsAppComposer } from './WhatsAppComposer';
import { CopilotPanel } from './CopilotPanel';
import { WhatsAppTagsModal } from './WhatsAppTagsModal';
import { WhatsAppSendTemplateModal } from './WhatsAppSendTemplateModal';
import { ContactsDirectory } from './ContactsDirectory';
import { CloseWithRequestDialog, CollectRequestBar, CollectRequestPill, ReturnToBotDialog } from './CollectRequest';
import { listWaContactsDirectory } from '@/app/_actions/whatsapp/contacts';
import { formatWaText, stripWaMarkup } from './wa-format';
import { renderFormattedText } from '@/app/_shared/utils/render-message';
import { resolveMimeType } from './media-rules';
import {
  RETRY_CHECK_FAILED_TEXT, RETRY_WINDOW_CLOSED_TEXT, findSentMedia, mediaSendFailedText, pendingPreviewKind,
} from '@/app/_shared/utils/pending-media';
import { brDayKey, brLabelFromKey } from '@/app/_shared/utils/date-br';
import { mediaDisplayName } from '@/app/_shared/utils/media-name';
import { getMediaUrl, useMediaUrl } from './media-url-cache';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Janela de resposta da Meta: 24h desde a última mensagem RECEBIDA do cliente.
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;

/**
 * Anexo de uma bolha pendente, guardado FORA do estado (por tempId, em
 * `pendingMediaRef`) para o "tentar de novo" não pedir para anexar de novo.
 * Liberado só quando a bolha sai (`removePending`: enviou ou descartou) e no
 * unmount do inbox, nunca na troca de conversa.
 */
interface PendingMedia {
  file: File;
  mime: string;
  caption?: string;
  replyToId: string | null;
  /** Key do S3 depois do PUT: o retry pula o upload e confere se a mensagem já entrou. */
  uploadedKey?: string;
  /** Object URL do preview (só imagem); revogado junto com a bolha. */
  previewUrl?: string;
}

// Dados de apoio (tags, total da agenda) pelo cache global do SWR: a nova-dash
// desmonta o inbox a cada troca de aba, e voltar ao WhatsApp mostra tudo na
// hora. Remontar dentro de 60 s não busca de novo (cada busca é uma server
// action na fila serial, na frente do 1º clique); sem retry automático, como
// antes (as tags têm "Tentar novamente").
const INBOX_SUPPORT_SWR = { revalidateOnFocus: false, dedupingInterval: 60_000, shouldRetryOnError: false } as const;
// Uma gravação da navegação (conversa, pasta, busca, filtros) por pausa de
// digitação na busca; o desmontar grava na hora o que estiver pendente.
const INBOX_VIEW_SAVE_DEBOUNCE_MS = 300;
// Filtros no banco: uma busca por pausa de digitação/cliques (cada troca de
// filtro é um GET) e, com o filtro ligado, no máximo uma rebusca a cada 30 s
// quando o delta mostra conversa entrando ou saindo do resultado.
const FILTER_DEBOUNCE_MS = 350;
const FILTER_REFRESH_MIN_MS = 30_000;
// Referência estável para "linhas ainda não chegaram" (deps dos useMemo).
const NO_WA_NUMBERS: WaNumberOption[] = [];

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

// Pills de leitura estilo WhatsApp (20/08/2026): Tudo / Não lidas / Lidas /
// Em fila com rótulo e contagem sempre visíveis, como no app oficial.
const pillCls = (active: boolean) =>
  `flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors ${active
    ? 'border-transparent bg-[#1d9e75] text-white'
    : 'border-[#3a6b58]/70 bg-[#24463a] text-[#a9cabc] hover:bg-[#2e5749] hover:text-white'}`;

// Multi-número: etiqueta da linha em cada conversa (só aparece com 2+ números
// cadastrados). O mapa numberId → {label, cor} desce por contexto para o
// ConversationGroup, que é chamado de vários lugares.
export interface NumberBadge { label: string; dot: string }
const NUMBER_BADGE_DOTS = ['bg-sky-400', 'bg-teal-300', 'bg-violet-400', 'bg-amber-400', 'bg-rose-400'];
const NumberBadgeContext = createContext<Map<string, NumberBadge> | null>(null);

// Teto de provocações do ciclo de recuperação POR NÚMERO (pill "Nª de N") —
// vem de listWaNumberOptions; conversa sem numberId herda o teto do default.
// eslint-disable-next-line no-unused-vars
const RecoveryCapContext = createContext<(numberId: string | null) => number>(() => RECOVERY_MAX_ATTEMPTS_DEFAULT);

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
  // Quem sou eu nos patches locais (assumir, enviar): mesmo fallback do
  // servidor ('Atendente') para a linha não trocar de nome na recarga.
  const meName = session?.user?.name ?? 'Atendente';
  const me = useMemo(() => ({ id: meId, name: meName }), [meId, meName]);

  // Delta da lista também nas cópias fora do SWR (resultados da busca no
  // servidor e conversa hidratada fora do topo): sem isso, a conversa aberta
  // pela busca ou pela agenda nunca recebia a tag ou o encerramento feitos em
  // outra aba. Preenchido mais abaixo, junto desses estados.
  const deltaListenerRef = useRef<((items: WhatsAppConversationDTO[]) => void) | null>(null);
  // `conversationsTotal` = total REAL no banco (a lista é capada em 1.000 pelo
  // servidor), vindo com a lista e com cada delta, sem poll próprio.
  const {
    conversations, refreshConversations, reloadAll: reloadAllConversations, scheduleConversationsRefresh,
    patchConversations, holdConversation, total: conversationsTotal,
    loaded: conversationsLoaded, isLoading: conversationsLoading, error: conversationsError,
    syncError: conversationsSyncError, retrySync: retryConversationsSync,
  } = useWhatsAppConversations({ onDelta: (items) => deltaListenerRef.current?.(items) });
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const {
    messages, mutate: mutateMessages, loadOlder, hasMore, loadingOlder, isLoading: messagesLoading,
    error: messagesError, upsertThreadMessage, revalidateThread,
  } = useWhatsAppMessages(activeContactId);

  // Busca por nome ou celular. Com 2+ caracteres ela vai ao banco inteiro
  // junto com os outros filtros de servidor (ver "FILTROS NO BANCO" abaixo);
  // com 1, filtra só as conversas carregadas.
  const [search, setSearch] = useState('');
  // Coluna Copiloto (lg+) e CardDialog do cliente vinculado.
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  // Clique no nome do contato: abre o Copiloto (se fechado) e força a aba
  // Ficha — incrementar o token é o sinal que o CopilotPanel escuta.
  const [fichaFocusToken, setFichaFocusToken] = useState(0);

  // Tags livres pra organizar/filtrar conversas. `undefined` = ainda não
  // chegaram (começava em [] e o menu dizia "Nenhuma tag criada ainda" durante
  // a carga); `tagsFailed` tira o "Carregando tags…" quando a busca falha (e
  // volta a "Carregando…" durante o "Tentar novamente"). Falha com a lista já
  // carregada (ex.: depois de editar no modal) mantém a lista antiga: o SWR
  // guarda o último `data`.
  const {
    data: allTags, error: tagsError, isValidating: tagsValidating, mutate: mutateTags,
  } = useSWR<WhatsAppTagDTO[]>('wa-tags', () => listWhatsAppTags(), INBOX_SUPPORT_SWR);
  const tagsFailed = !!tagsError && !tagsValidating;
  // Retry do menu e "tags mudaram" do modal: busca de novo, ignorando o dedupe.
  const reloadTags = useCallback(() => { void mutateTags(); }, [mutateTags]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  // Tag apagada (no modal ou em outra aba) sai do filtro, inclusive do filtro
  // restaurado da troca de aba: senão ficaria "Tags (1)" com a lista vazia.
  // Depende do filtro também porque, no remount, as tags já vêm do cache e a
  // restauração chega depois. Sem laço: nada a tirar devolve a mesma lista.
  useEffect(() => {
    if (allTags) setTagFilter((prev) => pruneTagFilter(prev, allTags));
  }, [allTags, tagFilter]);
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
  // Filtro por DATA DE ENTRADA do lead (21/09/2026, estilo BotConversa):
  // substitui o antigo chip "Hoje" — presets + intervalo livre. Dias em
  // "YYYY-MM-DD" (Brasília), inclusivos. Vai ao banco inteiro (createdAt da
  // conversa via brDayRangeToInstants), não só às 1.000 carregadas.
  const [dateRange, setDateRange] = useState<{ from: string; to: string; label: string } | null>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const applyDatePreset = (preset: 'hoje' | 'ontem' | '7d' | '30d' | 'mes') => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const today = brDayKey(now);
    if (preset === 'hoje') setDateRange({ from: today, to: today, label: 'Hoje' });
    else if (preset === 'ontem') { const y = brDayKey(now - DAY); setDateRange({ from: y, to: y, label: 'Ontem' }); }
    else if (preset === '7d') setDateRange({ from: brDayKey(now - 6 * DAY), to: today, label: 'Últimos 7 dias' });
    else if (preset === '30d') setDateRange({ from: brDayKey(now - 29 * DAY), to: today, label: 'Últimos 30 dias' });
    else setDateRange({ from: `${today.slice(0, 8)}01`, to: today, label: 'Este mês' });
  };
  const applyCustomRange = () => {
    if (!customFrom && !customTo) return;
    let from = customFrom || customTo;
    let to = customTo || customFrom;
    if (from > to) [from, to] = [to, from];
    const fmt = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
    setDateRange({ from, to, label: from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}` });
  };
  // Coluna do Kanban = ID da Label do card (a coluna de verdade; o nome em
  // `role` diverge quando a coluna é renomeada). Opções com a contagem real
  // por GET /api/whatsapp/inbox/columns. Estado salvo com o NOME (antes de
  // 26/09/2026) ou coluna apagada: `pruneColumnFilter` converte ou tira.
  const [columnFilter, setColumnFilter] = useState<string | null>(null);
  const { columns: inboxColumns, failed: columnsFailed, reload: reloadColumns } = useInboxColumns();
  useEffect(() => {
    if (inboxColumns) setColumnFilter((prev) => pruneColumnFilter(prev, inboxColumns));
  }, [inboxColumns, columnFilter]);
  const columnName = columnFilter ? inboxColumns?.find((c) => c.id === columnFilter)?.name ?? null : null;

  // Estado de leitura/fila (19/08/2026): triagem rápida do que ainda não foi
  // visto, do que já foi, ou de quem espera atendente na fila — sem precisar
  // caçar pasta por pasta. A escolha sobrevive ao reload (mesmo padrão do
  // filtro de número), porque quem vive de triagem quer abrir já filtrado.
  type ReadFilter = 'todas' | 'nao_lidas' | 'lidas' | 'fila';
  const [readFilter, setReadFilter] = useState<ReadFilter>('todas');
  useEffect(() => {
    const saved = localStorage.getItem('wa-read-filter');
    if (saved === 'nao_lidas' || saved === 'lidas' || saved === 'fila') setReadFilter(saved);
  }, []);
  const changeReadFilter = (f: ReadFilter) => {
    setReadFilter(f);
    // "Todas" é o default — sem chave guardada o inbox abre limpo.
    if (f === 'todas') localStorage.removeItem('wa-read-filter');
    else localStorage.setItem('wa-read-filter', f);
  };

  // Multi-número (17/08/2026): filtrar por linha da empresa, com a preferência
  // salva por usuário no navegador. Só aparece com 2+ números cadastrados.
  // As linhas vêm do cache SWR 'wa-number-options' (compartilhado com os
  // outros seletores de número); falha = sem linhas, como antes.
  const numberOptions = useWaNumberOptions();
  const waNumbers = numberOptions ?? NO_WA_NUMBERS;
  const [numberFilter, setNumberFilter] = useState<string | null>(null);
  // O filtro salvo volta quando as linhas chegam (no remount já estão no
  // cache) e só se a linha ainda existir. Uma vez por montagem: depois disso
  // quem manda é o seletor.
  const numberFilterRestored = useRef(false);
  useEffect(() => {
    if (!numberOptions || numberFilterRestored.current) return;
    numberFilterRestored.current = true;
    let saved: string | null = null;
    try { saved = localStorage.getItem('wa-number-filter'); } catch { /* storage bloqueado: sem filtro salvo */ }
    if (saved && numberOptions.some((o) => o.id === saved)) setNumberFilter(saved);
  }, [numberOptions]);
  const changeNumberFilter = (id: string | null) => {
    setNumberFilter(id);
    try {
      if (id) localStorage.setItem('wa-number-filter', id);
      else localStorage.removeItem('wa-number-filter');
    } catch { /* storage bloqueado: o filtro só não sobrevive ao F5 */ }
  };
  const numberBadges = useMemo(() => {
    if (waNumbers.length < 2) return null;
    return new Map<string, NumberBadge>(
      waNumbers.map((n, i) => [n.id, { label: n.label, dot: NUMBER_BADGE_DOTS[i % NUMBER_BADGE_DOTS.length] }]),
    );
  }, [waNumbers]);
  const recoveryCapOf = useMemo(() => {
    const byId = new Map(waNumbers.map((n) => [n.id, n.recoveryMax]));
    const defaultCap = waNumbers.find((n) => n.isDefault)?.recoveryMax ?? RECOVERY_MAX_ATTEMPTS_DEFAULT;
    return (numberId: string | null) => (numberId ? byId.get(numberId) : undefined) ?? defaultCap;
  }, [waNumbers]);

  // Motivos de "não qualificada" editáveis (menu Encerrar + modal de gestão).
  const { data: closeReasons, mutate: mutateCloseReasons } = useSWR<CloseReasonDTO[]>(
    'wa-close-reasons',
    () => listCloseReasons(),
    { revalidateOnFocus: false },
  );
  const [reasonsModalOpen, setReasonsModalOpen] = useState(false);
  // Pedido em aberto (CollectRequest.tsx): diálogo do Devolver/Editar e a
  // pergunta do Encerrar com pedido. `base` = a conversa capturada no clique,
  // como no runAction (patch e rollback não dependem do `active` do render).
  // `open` separado: ao fechar, o conteúdo fica até a animação terminar (sem
  // o título trocar para o padrão no meio do fade).
  const [collectDialog, setCollectDialog] = useState<{ mode: 'return' | 'edit'; base: WhatsAppConversationDTO; open: boolean } | null>(null);
  const [closeAsk, setCloseAsk] = useState<{ base: WhatsAppConversationDTO; category: string; label: string; listLabel: string; open: boolean } | null>(null);
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

  // Rail de pastas: "Ativas" (fila + atendimento humano juntos, com quem está
  // na fila sempre no topo) abre selecionada por padrão; Bot e Recuperação
  // vêm em seguida; os desfechos (encerradas) ficam cada um com seu próprio
  // ícone, sem nada escondido atrás de um select.
  // O `satisfies` confere cada pasta contra INBOX_FOLDER_KEYS (as que a
  // restauração da troca de aba aceita); o setActiveFolder da restauração
  // confere o outro lado.
  type RailFolder = { key: InboxFolderKey; label: string; title: string; icon: React.ElementType };
  const ACTIVE_FOLDERS = [
    { key: 'todos', label: 'Todos', title: 'Todas as conversas', icon: InboxIcon },
    { key: 'ativas', label: 'Ativas', title: 'Conversas ativas', icon: MessageCircle },
    { key: 'bot', label: 'Bot', title: 'Bot atendendo', icon: Bot },
    { key: 'standby', label: 'Recup.', title: 'Em recuperação', icon: RotateCcw },
  ] as const satisfies readonly RailFolder[];
  const CLOSED_FOLDERS = [
    { key: 'qualified', label: 'Qualific.', title: 'Qualificadas', icon: BadgeCheck },
    { key: 'unqualified', label: 'Não qual.', title: 'Não qualificadas', icon: XCircle },
    { key: 'sem_resposta', label: 'S/ resp.', title: 'Sem resposta', icon: MessageSquareOff },
    { key: 'perguntas', label: 'Dúvidas', title: CLOSE_CATEGORY_LABELS.perguntas, icon: HelpCircle },
    { key: 'novo_acidente', label: 'Novo acid.', title: CLOSE_CATEGORY_LABELS.novo_acidente, icon: AlertTriangle },
    { key: 'transferido', label: 'Transf.', title: CLOSE_CATEGORY_LABELS.transferido, icon: Headset },
    { key: 'descartado', label: 'Descart.', title: CLOSE_CATEGORY_LABELS.descartado, icon: Trash2 },
    // Churn (contratou e foi perdido) não tinha pasta: sumia da lista e só
    // aparecia pela pasta Todos.
    { key: 'churn', label: 'Churn', title: CLOSE_CATEGORY_LABELS.contratado_perdido, icon: UserX },
  ] as const satisfies readonly RailFolder[];
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
    perguntas: undefined, novo_acidente: undefined, transferido: undefined, descartado: undefined, churn: undefined,
  };
  const [activeFolder, setActiveFolder] = useState<FolderKey>('todos');

  // Pasta "Contatos" (18/08/2026): a AGENDA da linha — todos os contatos,
  // mesmo sem conversa (importados do BotConversa incluídos).
  const [contactsMode, setContactsMode] = useState(false);
  // Total do selo do rail (cache SWR: sobrevive à troca de aba). Falha = 0.
  const { data: directoryTotal = 0 } = useSWR<number>(
    'wa-directory-total',
    () => listWaContactsDirectory('', null, 0).then((p) => p.total),
    INBOX_SUPPORT_SWR,
  );

  // FILTROS NO BANCO (auditoria de 24/09/2026, E3/LISTA-3): busca (2+
  // caracteres), tag, data de entrada e coluna do Kanban procuram em TODO o
  // histórico por GET (/api/whatsapp/inbox/search), com o total real ("X de
  // Y") e "Carregar mais" de 300 em 300. Antes tag e data filtravam só as 1.000
  // carregadas e o contador mentia (Contratados 124 de 276; "Este mês" 861 de
  // 1.608). Com um deles ligado, número e "Em fila" vão junto no where, a lista
  // vira GLOBAL (seções por pasta sobre o resultado, a pasta do rail não
  // filtra) e só "lidas/não lidas" filtram no navegador, na página carregada.
  // Regras puras em app/_shared/utils/inbox-filter.ts.
  const serverFilter = useMemo<InboxServerFilter>(() => ({
    term: search,
    tagIds: tagFilter,
    fromDay: dateRange?.from,
    toDay: dateRange?.to,
    labelId: columnFilter ?? undefined,
    numberId: numberFilter ?? undefined,
    queuedOnly: readFilter === 'fila',
  }), [search, tagFilter, dateRange, columnFilter, numberFilter, readFilter]);
  // Na Agenda a busca é dos contatos: nenhum filtro de conversa vai ao banco.
  const serverFilterActive = !contactsMode && hasServerFilter(serverFilter);
  // Chave do resultado = a query normalizada, sem a página.
  const filterQuery = serverFilterActive ? inboxFilterQuery(serverFilter) : null;
  type FilterResult = { key: string; items: WhatsAppConversationDTO[]; total: number };
  const [remote, setRemote] = useState<FilterResult | null>(null);
  const [remoteError, setRemoteError] = useState<{ key: string; error: unknown } | null>(null);
  const [filterFetching, setFilterFetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Lidos pelos callbacks (delta, timer, resposta do GET): vale o último render.
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const filterQueryRef = useRef(filterQuery);
  filterQueryRef.current = filterQuery;
  const serverFilterRef = useRef(serverFilter);
  serverFilterRef.current = serverFilter;
  const lastFilterFetchAtRef = useRef(0);
  const filterRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Rebusca pedida com a aba oculta: sai na volta à aba.
  const filterRefreshDirtyRef = useRef(false);

  // Uma página do filtro. A resposta só vale se o filtro na tela ainda for o
  // mesmo (os GET correm em paralelo e chegam fora de ordem). 'first' = filtro
  // novo (substitui); 'refresh' = rebusca da 1ª página sem perder as seguintes
  // já carregadas; 'more' = "Carregar mais".
  const fetchFilterPage = useCallback(async (query: string, mode: 'first' | 'refresh' | 'more') => {
    const current = remoteRef.current;
    const skip = mode === 'more' && current?.key === query ? current.items.length : 0;
    if (mode === 'more') setLoadingMore(true);
    else lastFilterFetchAtRef.current = Date.now();
    try {
      const page = await fetchInboxFilter(query, skip);
      if (filterQueryRef.current !== query) return;
      setRemote((prev) => {
        const same = prev?.key === query ? prev : null;
        if (!same || mode === 'first') return { key: query, items: page.items, total: page.total };
        const items = mode === 'more'
          ? appendFilterPage(same.items, page.items)
          : mergeRefreshedFirstPage(same.items, page.items, INBOX_FILTER_PAGE);
        return { key: query, items, total: page.total };
      });
      setRemoteError((prev) => (prev?.key === query ? null : prev));
    } catch (err) {
      if (filterQueryRef.current !== query) return;
      // Rebusca que falha deixa na tela o resultado que já estava; a próxima
      // mudança tenta de novo. O motivo vem da rota (ex.: fora da rede do escritório).
      if (mode === 'first') setRemoteError({ key: query, error: err });
      else if (mode === 'more') toast.error(`Não foi possível carregar mais conversas: ${describeFetchError(err)}`);
    } finally {
      if (mode === 'more') setLoadingMore(false);
      else if (mode === 'first' && filterQueryRef.current === query) setFilterFetching(false);
    }
  }, []);

  // Filtro mudou → 1ª página depois da pausa (debounce). Filtro desligado →
  // volta à lista normal. O resultado anterior fica em `remote` até o novo
  // chegar: serve de prévia (a lista não pisca a cada tecla).
  useEffect(() => {
    if (filterRefreshTimerRef.current) {
      clearTimeout(filterRefreshTimerRef.current);
      filterRefreshTimerRef.current = null;
    }
    filterRefreshDirtyRef.current = false;
    if (!filterQuery) {
      setRemote(null);
      setRemoteError(null);
      setFilterFetching(false);
      return;
    }
    setFilterFetching(true);
    const t = setTimeout(() => { void fetchFilterPage(filterQuery, 'first'); }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filterQuery, fetchFilterPage]);

  // Rebusca da 1ª página quando o delta mostra conversa entrando ou saindo do
  // resultado (a fusão do delta já atualiza quem continua nele): no máximo a
  // cada 30 s, e nunca com a aba oculta (marca e sai na volta).
  const scheduleFilterRefresh = useCallback(() => {
    if (filterRefreshTimerRef.current) return;
    if (document.hidden) {
      filterRefreshDirtyRef.current = true;
      return;
    }
    const wait = Math.max(0, lastFilterFetchAtRef.current + FILTER_REFRESH_MIN_MS - Date.now());
    filterRefreshTimerRef.current = setTimeout(() => {
      filterRefreshTimerRef.current = null;
      const query = filterQueryRef.current;
      if (!query) return;
      if (document.hidden) {
        filterRefreshDirtyRef.current = true;
        return;
      }
      void fetchFilterPage(query, 'refresh');
    }, wait);
  }, [fetchFilterPage]);
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !filterRefreshDirtyRef.current) return;
      filterRefreshDirtyRef.current = false;
      scheduleFilterRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (filterRefreshTimerRef.current) {
        clearTimeout(filterRefreshTimerRef.current);
        filterRefreshTimerRef.current = null;
      }
    };
  }, [scheduleFilterRefresh]);

  // Resultado do banco para o filtro NA TELA (o de um filtro anterior só serve de prévia).
  const serverResult = remote && remote.key === filterQuery ? remote : null;
  const serverFilterError = remoteError && remoteError.key === filterQuery ? remoteError.error : null;
  const searchingServer = serverFilterActive && !serverResult && (filterFetching || !serverFilterError);
  const retryServerFilter = () => {
    if (!filterQuery) return;
    setRemoteError(null);
    setFilterFetching(true);
    void fetchFilterPage(filterQuery, 'first');
  };

  // Paginação client-side: cada pasta mostra 200 por vez, com "Carregar mais".
  // Reinicia ao trocar de pasta, buscar ou filtrar por tag.
  const [visibleCount, setVisibleCount] = useState(200);

  // Envio otimista: a mensagem entra na thread como "sending" na hora e o
  // input fica livre; quando a action confirma, o registro real substitui.
  // O pending é POR CONTATO (a thread filtra pelo `contactId` em
  // `displayMessages`) e sobrevive à troca de conversa: a bolha que falhou
  // continua lá na volta, com o anexo em `pendingMediaRef` para o retry.
  const [pending, setPending] = useState<WhatsAppThreadMessage[]>([]);
  const pendingMediaRef = useRef(new Map<string, PendingMedia>());
  // Unmount (troca de aba da nova-dash): os previews saem da memória. Envio
  // ainda em voo segue com o File que já capturou.
  useEffect(() => {
    const media = pendingMediaRef.current;
    return () => {
      media.forEach((m) => { if (m.previewUrl) URL.revokeObjectURL(m.previewUrl); });
      media.clear();
    };
  }, []);
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

  // Sem `setPending([])` aqui: zerar na troca de conversa sumia com a bolha
  // que falhou (e o anexo dela ficaria órfão no ref, sem retry possível).
  useEffect(() => {
    setReplyTo(null); setEditTarget(null);
  }, [activeContactId]);

  // Navegação que sobrevive à troca de aba (THR-4/LISTA-9): a nova-dash
  // desmonta o inbox em toda troca de aba, e voltar do Kanban perdia conversa,
  // pasta, busca e filtros. Restaura no mount, NUNCA no useState inicial (o
  // SSR não tem sessionStorage: daria hydration mismatch). Não usar
  // forceMount na aba: manteria SSE e polls rodando com o inbox escondido.
  //
  // Notificação de WhatsApp clicada → abre a conversa do contato. O sinal
  // chega por evento (inbox já montado) ou pelo sessionStorage (montou agora).
  // As duas chaves são lidas juntas por `restoreInboxView`, com o pedido
  // ('wa-open-contact') por último: ele vence a conversa restaurada.
  const viewRestoredRef = useRef(false);
  // contactId que veio da navegação salva (não de um pedido de abertura).
  const restoredContactIdRef = useRef<string | null>(null);
  // Só grava depois de restaurar: senão o estado inicial (vazio) apagaria o salvo.
  const [viewReady, setViewReady] = useState(false);
  useEffect(() => {
    // Uma vez por montagem (o StrictMode roda o efeito 2x; a 2ª leitura não
    // acharia mais o pedido já consumido e reabriria a conversa salva).
    if (!viewRestoredRef.current) {
      viewRestoredRef.current = true;
      const restored = restoreInboxView(browserSessionStorage());
      if (restored) {
        const { view } = restored;
        setActiveFolder(view.folder);
        setSearch(view.search);
        setTagFilter(view.tagFilter);
        setDateRange(view.dateRange);
        setColumnFilter(view.columnFilter);
        setContactsMode(view.contactsMode);
        setActiveContactId(view.contactId);
        restoredContactIdRef.current = restored.fromRequest ? null : view.contactId;
      }
      setViewReady(true);
    }
    function openConversation(e: Event) {
      const contactId = (e as CustomEvent<{ contactId?: string }>).detail?.contactId;
      if (!contactId) return;
      try { sessionStorage.removeItem(OPEN_CONTACT_STORAGE_KEY); } catch { /* storage bloqueado */ }
      setActiveContactId(contactId);
    }
    window.addEventListener('open-whatsapp-conversation', openConversation);
    return () => window.removeEventListener('open-whatsapp-conversation', openConversation);
  }, []);

  // Grava a navegação a cada mudança, com debounce (a busca muda a cada
  // tecla). Trocar de aba logo depois de clicar desmonta o inbox no meio do
  // debounce: o efeito de desmontagem abaixo grava o que ficou pendente.
  const pendingViewRef = useRef<InboxViewState | null>(null);
  useEffect(() => {
    if (!viewReady) return;
    const view: InboxViewState = {
      contactId: activeContactId, folder: activeFolder, search, tagFilter, dateRange, columnFilter, contactsMode,
    };
    pendingViewRef.current = view;
    const t = setTimeout(() => {
      pendingViewRef.current = null;
      saveInboxViewState(browserSessionStorage(), view);
    }, INBOX_VIEW_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [viewReady, activeContactId, activeFolder, search, tagFilter, dateRange, columnFilter, contactsMode]);
  useEffect(() => () => {
    const view = pendingViewRef.current;
    if (!view) return;
    pendingViewRef.current = null;
    saveInboxViewState(browserSessionStorage(), view);
  }, []);

  // Conversa aberta: procura na lista, depois nos resultados da busca. Quem
  // está FORA dos dois (contato antigo aberto pela agenda, por exemplo) é
  // hidratado sob demanda — antes a thread abria vazia e parecia que a
  // conversa "não abria" (27/08/2026). A hidratação é GET
  // (/api/whatsapp/inbox/conversations?contactId=), fora da fila de actions:
  // abrir pela agenda não espera mais uma recarga da lista em andamento.
  const listActive = useMemo(
    () => conversations.find((c) => c.contactId === activeContactId)
      ?? remote?.items.find((c) => c.contactId === activeContactId)
      ?? null,
    [conversations, remote, activeContactId],
  );
  const [fetchedActive, setFetchedActive] = useState<WhatsAppConversationDTO | null>(null);
  // contactId cuja busca sob demanda já terminou (achando ou não).
  const [activeLookupDone, setActiveLookupDone] = useState<string | null>(null);
  const hasListActive = !!listActive;
  useEffect(() => {
    if (!activeContactId || hasListActive) return;
    let cancelled = false;
    const cid = activeContactId;
    fetchInboxConversation(cid)
      .then((c) => {
        if (cancelled) return;
        if (c) setFetchedActive(c);
        // Conversa restaurada da troca de aba que deixou de existir (contato
        // excluído em outra aba): solta o id. Senão ela voltaria a cada troca
        // de aba e, no celular, a lista ficaria escondida atrás da thread vazia.
        else if (restoredContactIdRef.current === cid) {
          restoredContactIdRef.current = null;
          setActiveContactId((cur) => (cur === cid ? null : cur));
        }
      })
      .catch(() => { /* a thread ainda carrega pelas mensagens */ })
      .finally(() => { if (!cancelled) setActiveLookupDone(activeContactId); });
    // Zera na troca: reabrir depois o mesmo contato fora da lista volta a
    // mostrar "Abrindo conversa…" até a nova busca responder.
    return () => { cancelled = true; setActiveLookupDone(null); };
  }, [activeContactId, hasListActive]);
  const active = listActive
    ?? (fetchedActive?.contactId === activeContactId ? fetchedActive : null);
  // Conversa pedida (notificação, "Abrir conversa" do card) antes de a lista
  // chegar: a thread mostra "Abrindo conversa…" em vez de "Selecione uma
  // conversa", que parecia clique perdido. Termina quando a lista ou a busca
  // sob demanda responde — contato inexistente volta ao estado vazio.
  const openingActive = !!activeContactId && !active && activeLookupDone !== activeContactId;

  // Delta da lista (sincronização a cada 15 s): as cópias fora do SWR só
  // SUBSTITUEM quem já têm (`insertNew: false`) — o resultado filtrado não
  // ganha conversa que não casa. As travas do patch otimista já vêm aplicadas
  // pelo hook. Nada mudou = mesma referência (sem re-render). Conversa que
  // entrou ou saiu do filtro (tag aplicada, card que mudou de coluna…) pede a
  // rebusca do total no banco (`scheduleFilterRefresh`).
  deltaListenerRef.current = (items) => {
    setRemote((prev) => {
      if (!prev) return prev;
      const merged = mergeConversationDelta(prev.items, items, { cap: prev.items.length, insertNew: false });
      return merged === prev.items ? prev : { ...prev, items: merged };
    });
    setFetchedActive((prev) => (prev ? mergeConversationDelta([prev], items, { cap: 1, insertNew: false })[0] : prev));
    const current = remoteRef.current;
    if (current && current.key === filterQueryRef.current
      && filterResultChanged(items, current.items, serverFilterRef.current)) {
      scheduleFilterRefresh();
    }
  };

  // Tira UMA conversa de todas as cópias da tela (lista, busca, hidratada).
  // Exclusão de contato não aparece no delta (o cascade apaga a conversa):
  // quem excluiu tira na hora; as outras abas, no 404 ao abrir ou na lista
  // completa de 10 min.
  const dropConversation = useCallback((contactId: string) => {
    void patchConversations((list) => (
      list?.some((c) => c.contactId === contactId) ? list.filter((c) => c.contactId !== contactId) : list
    ));
    setRemote((prev) => (prev?.items.some((c) => c.contactId === contactId)
      ? { ...prev, items: prev.items.filter((c) => c.contactId !== contactId), total: Math.max(0, prev.total - 1) }
      : prev));
    setFetchedActive((prev) => (prev?.contactId === contactId ? null : prev));
  }, [patchConversations]);

  // Ficha + documentos do cliente da conversa aberta numa ida só (GET
  // /api/whatsapp/inbox/copilot/<id>, fora da fila serial de actions). A
  // MESMA key alimenta o Copiloto (abas Ficha, Arquivos e checklist); aqui ela
  // serve ao atalho "Card #N" do cabeçalho e ao CardDialog. O vínculo pelo
  // telefone acontece nessa leitura e os documentos já vêm lidos depois dele:
  // não há mais evento para a aba Arquivos recarregar.
  const { clientInfo, error: copilotError, reloadCopilot, setCopilotDocuments } = useCopilot(activeContactId);

  // 404 da ficha ou da thread = contato excluído em outra aba (o delta não vê
  // exclusão). Sai da tela na hora, em vez de ficar na lista até a carga
  // completa de 10 min com a thread vazia.
  const activeGone = [copilotError, messagesError].some((e) => e instanceof HttpError && e.status === 404);
  useEffect(() => {
    if (!activeGone || !activeContactId) return;
    const cid = activeContactId;
    dropConversation(cid);
    setActiveContactId((cur) => (cur === cid ? null : cur));
    toast.info('Esta conversa foi excluída.');
  }, [activeGone, activeContactId, dropConversation]);

  useEffect(() => { setCardDialogOpen(false); }, [activeContactId]);

  // Reações aplicadas nesta sessão (messageId → emoji|null): feedback imediato
  // e única fonte de verdade pras mensagens antigas já acumuladas no client.
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, string | null>>({});
  const reactBusy = useRef<Set<string>>(new Set());
  useEffect(() => { setReactionOverrides({}); }, [activeContactId]);

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
  // Guarda da auditoria de 24/09/2026: o relay hoje NÃO entrega em produção,
  // e quando voltar cada evento de QUALQUER contato vai pedir a lista em todas
  // as abas abertas, inclusive as ocultas. Não tire esta guarda ao consertar o
  // relay. A thread só recarrega com a aba visível (o foco já revalida a
  // thread na volta) e a lista pede só o DELTA pelo coalescer (rajada = 1
  // pedido; aba oculta só marca, e a volta à aba já puxa um delta).
  const onStream = useCallback((e: ChatStreamEvent) => {
    const channelId = (e as { channelId?: string }).channelId;
    if (!channelId?.startsWith('whatsapp:')) return;
    if (channelId === `whatsapp:${activeContactId}` && !document.hidden) mutateMessages();
    scheduleConversationsRefresh();
  }, [activeContactId, mutateMessages, scheduleConversationsRefresh]);
  useChatStream(onStream);

  const displayMessages = useMemo(
    () => [...messages, ...pending.filter((p) => p.contactId === activeContactId)],
    [messages, pending, activeContactId],
  );

  /* ---------- rolagem da thread ---------- */
  // Quem decide é o id da ÚLTIMA mensagem, não o total (auditoria de
  // 24/09/2026): com a janela das 50 recentes cheia, a mensagem nova tira a
  // mais antiga, o total não muda e a tela não descia. Regras em
  // `decideThreadScroll` (app/_shared/utils/thread-scroll.ts).
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tudo em ref: o onScroll dispara dezenas de vezes por segundo e não pode
  // virar setState. Só o chip "Nova mensagem ↓" é estado (muda pouco).
  const scrollSessionRef = useRef<{ contactId: string | null; el: HTMLDivElement | null; positioned: boolean }>(
    { contactId: null, el: null, positioned: false },
  );
  // Distância do fim no último evento de scroll = onde o atendente estava ANTES
  // de a mensagem nova entrar (medir depois somaria a altura dela).
  const distanceRef = useRef(0);
  // Rolagem automática para o fim em andamento: os eventos de scroll do meio
  // da animação não contam como "saiu do fim". Para ao chegar ou quando o
  // atendente mexe (roda do mouse, toque, tecla, clique na barra).
  const followRef = useRef(false);
  const tailRef = useRef<ThreadTail | null>(null);
  // "Carregar anteriores": distância do fim no clique + 1ª mensagem daquele
  // momento. Só vira 'restore' quando o topo muda de verdade — bloco vazio ou
  // erro não deixam âncora velha para a próxima mensagem nova.
  const prependRef = useRef<{ anchor: number; firstId: string | null } | null>(null);
  // Contador do chip por conversa (a troca de conversa zera).
  const [newBelow, setNewBelow] = useState<{ contactId: string | null; count: number }>({ contactId: null, count: 0 });
  const newBelowCount = newBelow.contactId === activeContactId ? newBelow.count : 0;
  const hasActive = !!active;

  // Layout effect: roda antes de pintar — abrir a conversa não mostra 1 frame
  // do topo, e o prepend não dá o pulo antes de voltar ao ponto de leitura.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasActive) return; // thread ainda não montou ("Abrindo conversa…")
    const session = scrollSessionRef.current;
    // Troca de conversa ou thread remontada (fechou e reabriu): nada do scroll
    // anterior vale aqui.
    if (session.contactId !== activeContactId || session.el !== el) {
      scrollSessionRef.current = { contactId: activeContactId, el, positioned: false };
      tailRef.current = null;
      prependRef.current = null;
      followRef.current = false;
      distanceRef.current = 0;
      setNewBelow((prev) => (prev.count === 0 ? prev : { contactId: null, count: 0 }));
    }
    if (displayMessages.length === 0) return; // 1ª carga ainda não chegou
    const tail = threadTail(displayMessages);
    const prevTail = tailRef.current;
    tailRef.current = tail;
    const advanced = tailAdvanced(prevTail, tail);
    const lastIsMine = isOwnThreadMessage(displayMessages[displayMessages.length - 1], meId);
    const prepend = prependRef.current;
    const action = decideThreadScroll({
      contactChanged: !scrollSessionRef.current.positioned,
      prependPending: !!prepend && displayMessages[0].id !== prepend.firstId,
      lastIdChanged: advanced,
      distanceFromBottom: followRef.current ? 0 : distanceRef.current,
      lastIsMine,
    });
    const bumpChip = () => {
      const n = countNewBelow(displayMessages, prevTail?.id ?? null);
      setNewBelow((prev) => ({
        contactId: activeContactId,
        count: (prev.contactId === activeContactId ? prev.count : 0) + n,
      }));
    };
    switch (action) {
      case 'jump':
        scrollSessionRef.current.positioned = true;
        el.scrollTop = el.scrollHeight;
        distanceRef.current = 0;
        break;
      case 'restore':
        prependRef.current = null;
        if (prepend) el.scrollTop = el.scrollHeight - prepend.anchor;
        // Mensagem nova no mesmo render do bloco antigo: quem está lendo o
        // topo não é puxado, mas fica sabendo pelo chip.
        if (advanced && !lastIsMine) bumpChip();
        break;
      case 'smooth':
        followRef.current = true;
        distanceRef.current = 0;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        // Vai mostrar tudo o que chegou: o chip (se havia) já não tem o que avisar.
        setNewBelow((prev) => (prev.count === 0 ? prev : { contactId: activeContactId, count: 0 }));
        break;
      case 'chip':
        bumpChip();
        break;
      case 'none':
        break;
    }
  }, [activeContactId, hasActive, displayMessages, meId]);

  // Foto/vídeo que termina de carregar cresce a thread DEPOIS da rolagem para o
  // fim (THR-11): quem estava no fim continua no fim. 'load' não borbulha, por
  // isso a escuta é na fase de captura, no container.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasActive) return;
    const onMediaLoad = () => {
      if (followRef.current || distanceRef.current < NEAR_BOTTOM_PX) el.scrollTop = el.scrollHeight;
    };
    el.addEventListener('load', onMediaLoad, true);
    el.addEventListener('loadedmetadata', onMediaLoad, true);
    return () => {
      el.removeEventListener('load', onMediaLoad, true);
      el.removeEventListener('loadedmetadata', onMediaLoad, true);
    };
  }, [hasActive]);

  function handleThreadScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (followRef.current) {
      if (distance > 2) return; // animação ainda descendo: continua "no fim"
      followRef.current = false;
    }
    distanceRef.current = distance;
    // Chegou ao fim: o chip some. setState só quando ele está aparecendo.
    if (distance < NEAR_BOTTOM_PX && newBelowCount > 0) setNewBelow({ contactId: activeContactId, count: 0 });
  }
  // O atendente mexeu na rolagem: a rolagem automática deixa de valer.
  function stopFollowingThread() {
    followRef.current = false;
  }

  function scrollThreadToEnd() {
    const el = scrollRef.current;
    if (!el) return;
    followRef.current = true;
    distanceRef.current = 0;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setNewBelow({ contactId: activeContactId, count: 0 });
  }

  async function handleLoadOlder() {
    // Âncora = distância do fim; depois do prepend, o layout effect recompõe o scrollTop.
    const el = scrollRef.current;
    if (el) prependRef.current = { anchor: el.scrollHeight - el.scrollTop, firstId: displayMessages[0]?.id ?? null };
    await loadOlder();
  }

  // Com filtro no banco e a resposta na tela: o resultado do servidor (com a
  // versão mais nova da lista viva por cima) e SÓ "lidas/não lidas" no
  // navegador — busca, tag, data, coluna, número e fila já vieram aplicados, e
  // refiltrar uma página faria o "X de Y" mentir de novo. Esperando a resposta
  // (ou com erro): prévia local do mesmo filtro sobre a lista + o último
  // resultado, para a digitação não piscar. Sem filtro no banco: tudo local
  // sobre as conversas carregadas (busca de 1 caractere, número, leitura/fila).
  const serverItems = useMemo(
    () => (serverResult ? mergeLiveIntoFiltered(serverResult.items, conversations) : null),
    [serverResult, conversations],
  );
  const previewUniverse = useMemo(() => {
    if (!serverFilterActive || !remote?.items.length) return conversations;
    const known = new Set(conversations.map((c) => c.contactId));
    return [...conversations, ...remote.items.filter((r) => !known.has(r.contactId))];
  }, [serverFilterActive, remote, conversations]);
  const filtered = useMemo(() => {
    // "Não lidas" = mensagem recebida depois da última leitura (computeUnread).
    const readOk = (c: WhatsAppConversationDTO) => (
      readFilter === 'nao_lidas' ? c.unread : readFilter === 'lidas' ? !c.unread : true
    );
    if (serverItems) {
      return readFilter === 'nao_lidas' || readFilter === 'lidas' ? serverItems.filter(readOk) : serverItems;
    }
    return previewUniverse.filter((c) => matchesInboxFilter(c, serverFilter) && readOk(c));
  }, [serverItems, previewUniverse, serverFilter, readFilter]);

  // Contagens dos chips de leitura/fila: independem dos outros filtros — o
  // número não pode mudar ao clicar no chip. Contam as conversas carregadas.
  const readCounts = useMemo(() => ({
    nao_lidas: conversations.filter((c) => c.unread).length,
    lidas: conversations.filter((c) => !c.unread).length,
    fila: conversations.filter((c) => c.status === 'queued').length,
  }), [conversations]);
  // Contagem por número (dropdown do filtro de linha).
  const numberCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of conversations) {
      if (c.numberId) map.set(c.numberId, (map.get(c.numberId) ?? 0) + 1);
    }
    return map;
  }, [conversations]);

  const groups = useMemo(() => {
    // Encerradas: uma pasta por desfecho pela regra pura closedFolderOf
    // (inclui o fallback pelo `qualified` antigo e os sub-motivos nq_*).
    // 'outros' é a rede de segurança para categoria sem pasta: não tem ícone
    // no rail, mas aparece nas seções da lista global ("Outros desfechos")
    // para as seções baterem com o resultado.
    const closed: Record<ClosedFolderKey, WhatsAppConversationDTO[]> = {
      qualified: [], unqualified: [], churn: [], sem_resposta: [], perguntas: [],
      novo_acidente: [], transferido: [], descartado: [], outros: [],
    };
    for (const c of filtered) {
      if (c.status === 'closed') closed[closedFolderOf(c)].push(c);
    }
    return {
      queued: filtered.filter((c) => c.status === 'queued'),
      // Todas as conversas em atendimento humano, de qualquer atendente — o
      // selinho no avatar diz quem falou por último, sem filtro obrigatório.
      ativas: filtered.filter((c) => c.status === 'human'),
      bot: filtered.filter((c) => c.status === 'bot'),
      standby: filtered.filter((c) => c.status === 'standby'),
      ...closed,
    };
  }, [filtered]);

  // Itens de cada pasta do rail (mesma fonte que os contadores dos ícones).
  // "Ativas" junta fila + atendimento humano — quem está na fila sempre
  // aparece primeiro. "Só minhas"
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
    descartado: groups.descartado, churn: groups.churn,
  };
  const unreadInFolder = (key: FolderKey) => FOLDER_ITEMS[key].filter((c) => c.unread).length;

  // Lista GLOBAL: ignora a pasta selecionada e mostra o resultado em seções
  // por pasta — pesquisar um número acha o cliente mesmo que ele esteja em
  // outra pasta. Vale com filtro no banco (busca, tag, data, coluna) e com a
  // busca de 1 caractere (local). Uma pasta refiltrando a PÁGINA do resultado
  // faria o "X de Y" mentir.
  const globalView = serverFilterActive || search.trim().length > 0;
  const visibleItems = globalView ? filtered : FOLDER_ITEMS[activeFolder];
  // Esqueleto / erro com "Tentar novamente" / "Nenhuma conversa ainda" — regra
  // em inboxListState. Com a lista global, o que o banco achou aparece mesmo
  // que a carga principal ainda não tenha chegado.
  const listState = inboxListState({
    loaded: conversationsLoaded,
    isLoading: conversationsLoading,
    hasError: !!conversationsError,
    count: conversations.length,
    searchHits: globalView ? filtered.length : 0,
  });

  // Aviso da lista parcial: desde quando vão as conversas carregadas (a lista
  // vem por lastMessageAt desc; o mínimo protege de uma ordem trocada).
  const loadedSinceLabel = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    for (const c of conversations) {
      const t = Date.parse(c.lastMessageAt);
      if (t < min) min = t;
    }
    return Number.isFinite(min) ? brLabelFromKey(brDayKey(min)) : null;
  }, [conversations]);

  // Pasta do rail = sair da lista global: limpa tag, data e coluna (os
  // filtros que vão ao banco e ignoram a pasta), como o clique já limpava a
  // tag. A busca digitada fica, como antes.
  const selectFolder = (key: FolderKey) => {
    setTagFilter([]);
    setDateRange(null);
    setCustomFrom('');
    setCustomTo('');
    setColumnFilter(null);
    setAttendantFilter(null);
    setContactsMode(false);
    setActiveFolder(key);
  };

  useEffect(() => { setVisibleCount(200); }, [activeFolder, search, tagFilter, readFilter, dateRange, columnFilter]);

  // Janela de 24h: sem mensagem recebida recente, a Meta só aceita template.
  const windowExpired = !!active && (
    !active.lastInboundAt || Date.now() - new Date(active.lastInboundAt).getTime() > WINDOW_24H_MS
  );

  // Ação sobre uma conversa sem esperar a recarga da lista (auditoria de
  // 24/09/2026): server actions saem numa fila serial por aba (Next 14.2.35),
  // e o clique esperava a action E a recarga das 1.000 conversas — 2-4 s até
  // o toast, ~670 recargas completas por dia vindas direto de clique.
  // - `optimistic` entra no clique; a resposta da action, quando é um patch
  //   (assumir/devolver/encerrar), entra por cima e o toast sai logo em seguida;
  // - resposta vazia com otimista (lida/não lida): o otimista já é o estado
  //   final e nada recarrega — as outras abas veem pelo delta;
  // - resposta vazia sem otimista (bloquear/desbloquear): um delta em segundo
  //   plano (single-flight), sem segurar o toast;
  // - enquanto a action roda, a conversa fica travada para o delta
  //   (`holdConversation`): um delta lido antes do commit desfaria o otimista;
  // - erro: rollback e mensagem própria (erro de action chega mascarado em
  //   produção, e a aba com o bundle de antes do deploy também cai aqui).
  // `base` é a conversa capturada ANTES do clique (antes até de fechar a
  // thread, como no "Marcar como não lida"), para o patch e o rollback não
  // dependerem do `active` do render.
  async function runAction(
    fn: () => Promise<Partial<WhatsAppConversationDTO> | void>,
    okMsg: string,
    opts: {
      errorMsg: string;
      base?: WhatsAppConversationDTO;
      optimistic?: Partial<WhatsAppConversationDTO>;
    },
  ) {
    const { base, optimistic, errorMsg } = opts;
    const release = base ? holdConversation(base.contactId) : null;
    if (base && optimistic) patchConversation(base.contactId, optimistic);
    try {
      const res = await fn();
      if (base && res) patchConversation(base.contactId, confirmedPatch(base.id, res));
      else if (!optimistic) void refreshConversations();
      toast.success(okMsg);
    } catch {
      if (base && optimistic) patchConversation(base.contactId, revertPatch(base, optimistic));
      toast.error(errorMsg);
    } finally {
      release?.();
    }
  }

  // Patch devolvido pela action, aplicado sobre a versão ATUAL da conversa.
  // As tags do encerramento (syncCloseTag) só entram se não houver tag desta
  // conversa gravando — a lista do servidor ainda não teria a tag em voo e o
  // chip piscaria; a gravação da tag traz a lista certa quando termina.
  function confirmedPatch(
    conversationId: string,
    res: Partial<WhatsAppConversationDTO>,
  ): ConversationPatch {
    const { tags, ...rest } = res;
    if (!tags) return rest;
    return (c) => {
      const prefix = `${conversationId}:`;
      const tagBusy = [...pendingTagsRef.current].some((k) => k.startsWith(prefix));
      return tagBusy || sameTags(c.tags, tags) ? rest : { ...rest, tags };
    };
  }

  // ---- Pedido em aberto (CollectRequest.tsx, 30/09/2026) -------------------
  // Devolver com o campo "O que a IA deve recolher?", Editar/Limpar da barra e
  // Encerrar com pedido. Mesmo desenho do runAction: otimista pelas mesmas
  // funções puras que a action usa na resposta, rollback e texto próprio
  // (erro de action chega mascarado em produção).

  // `value` no formato da action: texto = abre/substitui; null = conclui o
  // pedido que existia; undefined = campo vazio sem pedido (o servidor mantém
  // ou detecta a última lista do atendente e devolve o pedido no patch).
  function handleReturnToBot(base: WhatsAppConversationDTO, value: string | null | undefined) {
    const current = base.collectRequest?.text ?? null;
    const collect = value === undefined || sameCollectRequest(value, current)
      ? undefined
      : collectRequestPatch(value ? { text: value, at: new Date(), byName: me.name, source: 'devolver' } : null);
    void runAction(
      // 1 argumento quando não há o que mandar (a action lê undefined como
      // "manter/detectar"; null e texto vão como estão).
      () => (value === undefined ? returnConversationToBot(base.id) : returnConversationToBot(base.id, value)),
      value ? 'Conversa devolvida. A IA vai recolher o pedido.' : value === null ? 'Conversa devolvida pro bot. Pedido concluído.' : 'Conversa devolvida pro bot.',
      {
        base,
        optimistic: returnToBotPatch({ collect }),
        errorMsg: 'Não foi possível devolver ao bot. Recarregue a página (F5) e tente de novo.',
      },
    );
  }

  function handleSaveCollectRequest(base: WhatsAppConversationDTO, value: string | null) {
    if (sameCollectRequest(value, base.collectRequest?.text ?? null)) return;
    void runAction(() => setConversationCollectRequest(base.id, value), value ? 'Pedido atualizado.' : 'Pedido concluído.', {
      base,
      optimistic: collectRequestPatch(value ? { text: value, at: new Date(), byName: me.name, source: 'devolver' } : null),
      errorMsg: 'Não foi possível salvar o pedido. Recarregue a página (F5) e tente de novo.',
    });
  }

  async function handleClearCollectRequest(base: WhatsAppConversationDTO) {
    if (!(await confirm({
      title: 'Concluir o pedido?',
      description: 'A IA para de conferir e de cobrar esta lista, e ela não volta a valer. O histórico da conversa continua.',
      tone: 'warning',
      confirmLabel: 'Concluir pedido',
    }))) return;
    handleSaveCollectRequest(base, null);
  }

  // Encerrar (e Alterar desfecho). Com pedido em aberto, pergunta antes se
  // conclui ou mantém; sem pedido, encerra direto como sempre.
  function runClose(base: WhatsAppConversationDTO, category: string, label: string, collect?: 'concluir' | 'manter') {
    // Rótulo como a lista mostra (CLOSE_CATEGORY_LABELS; o motivo da tabela já
    // vem com o rótulo dele), não o do menu — senão o chip trocaria na resposta.
    void runAction(
      () => (collect ? closeConversation(base.id, category, collect) : closeConversation(base.id, category)),
      `Encerrado: ${label}.`,
      {
        base,
        optimistic: closePatch(category, CLOSE_CATEGORY_LABELS[category] ?? label, { keepRequest: collect === 'manter' }),
        errorMsg: 'Não foi possível encerrar. Recarregue a página (F5) e tente de novo.',
      },
    );
  }

  // Patch local de UMA conversa em todas as cópias que a tela pode estar
  // mostrando: a lista (SWR), o resultado dos filtros no servidor e a conversa
  // hidratada fora do topo (agenda/busca). Sem as duas últimas, a ação em
  // cliente antigo não aparecia até recarregar. Patch em função é calculado
  // sobre a versão ATUAL de cada cópia (nunca sobre o `active` do render). O
  // contactId vai junto para o hook travar a conversa contra um delta que já
  // estava em voo (ele traria o estado de antes do clique).
  const patchConversation = useCallback(
    (contactId: string, patch: ConversationPatch) => {
      void patchConversations((list) => patchConversationList(list, contactId, patch), contactId);
      setRemote((prev) => {
        if (!prev) return prev;
        const items = patchConversationList(prev.items, contactId, patch);
        return items === prev.items ? prev : { ...prev, items };
      });
      setFetchedActive((prev) => (prev?.contactId === contactId ? patchConversationRow(prev, patch) : prev));
    },
    [patchConversations],
  );

  // Abrir conversa zera o badge de não-lida — só quando há o que ler.
  // Auditoria de 24/09/2026: o effect antigo dependia de messages.length e
  // recarregava a lista inteira depois de cada markRead; como "não lida" contava
  // mensagem de SAÍDA, todo envio do atendente virava markRead do próprio autor
  // + recarga (~19% das cargas da lista). Agora "não lida" é só por mensagem
  // recebida (computeUnread), o badge some por patch local e a lista não
  // recarrega. A chave (conversa + última recebida + marcador manual) garante UM
  // markRead por inbound novo: a lista percebe o inbound pelo delta (≤15 s) e a
  // chave muda. Falhou → a chave zera e o próximo reload tenta de novo. A
  // conversa fica travada para o delta até a action voltar: um delta lido antes
  // do commit reacenderia a bolinha.
  const readKeyRef = useRef<string | null>(null);
  useEffect(() => { readKeyRef.current = null; }, [activeContactId]);
  const readKey = active?.unread ? `${active.id}|${active.lastInboundAt ?? ''}|${active.manualUnread}` : null;
  const readConversationId = active?.id;
  const readContactId = active?.contactId;
  useEffect(() => {
    if (!readKey || !readConversationId || !readContactId) return;
    if (readKeyRef.current === readKey) return;
    readKeyRef.current = readKey;
    const release = holdConversation(readContactId);
    patchConversation(readContactId, readPatch(new Date().toISOString()));
    markConversationRead(readConversationId)
      .catch(() => { readKeyRef.current = null; })
      .finally(release);
  }, [readKey, readConversationId, readContactId, patchConversation, holdConversation]);

  // Gravações de tag em voo, por `${conversationId}:${tagId}`: chaveado por
  // conversa para trocar de conversa no meio de uma gravação não travar a
  // mesma tag na outra. O ref responde na hora (duplo clique antes do
  // re-render); o estado desenha o spinner.
  const pendingTagsRef = useRef<Set<string>>(new Set());
  const [pendingTags, setPendingTags] = useState<ReadonlySet<string>>(() => new Set());
  const setTagPending = useCallback((key: string, on: boolean) => {
    const next = new Set(pendingTagsRef.current);
    if (on) next.add(key); else next.delete(key);
    pendingTagsRef.current = next;
    setPendingTags(next);
  }, []);

  // Tag na hora (auditoria de 24/09/2026): antes o clique esperava a action e
  // a recarga das 1.000 conversas, e o 2º clique desfazia a tag. Agora o check
  // e o chip mudam no clique, o servidor recebe o estado DESEJADO (idempotente)
  // e a lista não é recarregada — outras abas veem pelo delta (a action "toca"
  // o updatedAt da conversa, senão tirar a tag não deixava rastro).
  async function handleSetTag(tag: WhatsAppTagDTO, on: boolean) {
    if (!active) return;
    const { id: conversationId, contactId } = active;
    const key = `${conversationId}:${tag.id}`;
    if (pendingTagsRef.current.has(key)) return;
    setTagPending(key, true);
    const release = holdConversation(contactId);
    patchConversation(contactId, (c) => ({ tags: withTag(c.tags, tag, on) }));
    try {
      const res = await setConversationTag(conversationId, tag.id, on);
      setTagPending(key, false);
      // A verdade do banco só entra quando não sobrou outra tag desta conversa
      // gravando: aplicar antes apagaria o otimista da outra e o chip piscaria.
      const prefix = `${conversationId}:`;
      if (![...pendingTagsRef.current].some((k) => k.startsWith(prefix))) {
        patchConversation(contactId, (c) => (sameTags(c.tags, res.tags) ? {} : { tags: res.tags }));
      }
    } catch {
      setTagPending(key, false);
      patchConversation(contactId, (c) => ({ tags: withTag(c.tags, tag, !on) }));
      // Erro de server action chega mascarado em produção — e a aba com o
      // bundle de antes do deploy também cai aqui: por isso a dica do F5.
      toast.error('Não foi possível salvar a tag. Recarregue a página (F5) e tente de novo.');
    } finally {
      release();
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
  // A bolha saiu (enviou ou foi descartada): o anexo e o preview saem junto.
  // Fora do updater do setState (o StrictMode o roda 2x).
  function removePending(id: string) {
    const media = pendingMediaRef.current.get(id);
    if (media) {
      if (media.previewUrl) URL.revokeObjectURL(media.previewUrl);
      pendingMediaRef.current.delete(id);
    }
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  /**
   * Troca a bolha otimista pela mensagem real SEM piscar (THR-10, auditoria de
   * 24/09/2026). Antes: tirava o pending e esperava o refetch da thread — a
   * bolha sumia por um instante e a rolagem pulava. Agora a mensagem que a
   * action devolveu entra direto no cache da thread (sem refetch) e só então o
   * pending sai; a revalidação vem depois, em segundo plano, e completa o que
   * o DTO não traz (transcrição, reação, ticks).
   *
   * flushSync: o cache do SWR avisa a tela por useSyncExternalStore (render
   * síncrono), e o setPending fora de evento teria prioridade normal — sairiam
   * em dois renders, com 1 frame de bolha DUPLICADA. Dentro do flushSync os
   * dois entram no mesmo render.
   *
   * `contactId` é o da conversa em que o envio começou (o atendente pode ter
   * trocado de conversa no meio): o upsert mira a thread certa.
   */
  function commitSent(contactId: string, tempId: string, dto: SentMessageDTO, authorName: string | null) {
    const real = toThreadMessage(dto, authorName);
    flushSync(() => {
      upsertThreadMessage(contactId, real);
      removePending(tempId);
    });
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

    const contactId = active.contactId;
    sendWhatsAppMessage({ contactId, body: text, replyToId: rt?.id ?? null })
      .then((dto) => {
        commitSent(contactId, temp.id, dto, temp.authorName);
        // A conversa sobe para o topo com a prévia nova por patch local; a
        // lista NÃO recarrega por envio (as outras abas veem pelo delta).
        patchConversation(contactId, sentMessagePatch(dto, me));
        void revalidateThread(contactId);
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

    // Cada arquivo vira uma bolha com o que está sendo mandado (a foto pelo
    // object URL do File local, ou o nome), e o anexo fica guardado por tempId
    // para o "tentar de novo". Só imagem ganha object URL: é o único preview.
    const batch = files.map((file, i) => {
      const mime = resolveMimeType(file);
      const previewUrl = pendingPreviewKind(mime) === 'image' ? URL.createObjectURL(file) : undefined;
      const temp = makePending({
        body: i === 0 && caption ? caption : null,
        mediaType: mime,
        localPreviewUrl: previewUrl,
        fileName: file.name,
        replyToId: i === 0 ? rt?.id ?? null : null,
        replyToBody: i === 0 && rt ? rt.body ?? '📎 Anexo' : null,
        replyToDirection: i === 0 ? rt?.direction ?? null : null,
      });
      const item: PendingMedia = {
        file,
        mime,
        caption: i === 0 ? caption || undefined : undefined,
        replyToId: i === 0 ? rt?.id ?? null : null,
        previewUrl,
      };
      pendingMediaRef.current.set(temp.id, item);
      return { temp, item };
    });
    setPending((prev) => [...prev, ...batch.map((b) => b.temp)]);

    (async () => {
      // Em série: os arquivos chegam ao cliente na ordem em que foram anexados.
      for (const { temp, item } of batch) await sendOneMedia(contactId, temp.id, item, temp.authorName);
      // Revalidação de fundo (uma para o lote): completa os campos que o DTO
      // não traz; a bolha já está no lugar. A lista não recarrega.
      void revalidateThread(contactId);
    })();
  }

  /**
   * Sobe (se ainda não subiu) e envia UM anexo de bolha pendente. O `item` vem
   * capturado, não relido do ref: sair do inbox no meio do lote (unmount limpa
   * o ref) não pode cortar os arquivos seguintes, que o atendente já mandou.
   * A `uploadedKey` fica gravada logo depois do PUT: o retry não sobe de novo.
   * Nunca lança: a falha vira bolha "Falhou." + toast com texto próprio.
   */
  async function sendOneMedia(contactId: string, tempId: string, item: PendingMedia, authorName: string | null) {
    const { file, mime } = item;
    let stage: 'upload' | 'send' = 'upload';
    try {
      let key = item.uploadedKey;
      if (!key) {
        const upload = await getWhatsAppUploadUrl(contactId, file.name, mime);
        const put = await fetch(upload.url, { method: 'PUT', body: file, headers: { 'Content-Type': mime } });
        if (!put.ok) throw new Error(`PUT do anexo respondeu ${put.status}`);
        key = upload.key;
        item.uploadedKey = key;
      }
      stage = 'send';
      const dto = await sendWhatsAppMedia({
        contactId, key, mimeType: mime, fileName: file.name, caption: item.caption, replyToId: item.replyToId,
      });
      commitSent(contactId, tempId, dto, authorName);
      // Patch por arquivo: a prévia da lista acompanha o último enviado.
      patchConversation(contactId, sentMessagePatch(dto, me));
    } catch {
      patchPending(tempId, { status: 'failed' });
      toast.error(mediaSendFailedText(file.name, stage));
    }
  }

  // Envio que não passa pela bolha otimista (passo de fluxo, template): a
  // mensagem entra direto no cache da thread (o mesmo upsert do commitSent,
  // sem esperar o refetch) e a conversa recebe o patch local na lista. Quem
  // chama revalida a thread em segundo plano. Pelo contactId do DTO: o
  // atendente pode ter trocado de conversa no meio do fluxo.
  function handleSentOutside(dto: WhatsAppMessageDTO) {
    upsertThreadMessage(dto.contactId, toThreadMessage(dto, session?.user?.name ?? 'Você'));
    patchConversation(dto.contactId, sentMessagePatch(dto, me));
  }

  // "tentar de novo" só existe na conversa ABERTA (a bolha pendente só aparece
  // nela), então `windowExpired` é o da conversa da bolha. Com a janela de
  // 24 h fechada a Meta recusaria de novo, e o motivo chegaria mascarado.
  function retryPending(msg: WhatsAppThreadMessage) {
    if (msg.status !== 'failed') return;
    if (windowExpired) {
      toast.error(RETRY_WINDOW_CLOSED_TEXT);
      return;
    }
    if (msg.mediaType) {
      const item = pendingMediaRef.current.get(msg.id);
      if (item) void retryPendingMedia(msg, item);
      return;
    }
    removePending(msg.id);
    if (msg.body) handleSendText(msg.body);
  }

  /**
   * Retry de mídia sem reanexar. Se o arquivo já tinha subido, antes de
   * reenviar confere na thread se a mensagem já entrou: a Meta pode ter aceitado
   * e só a resposta da action ter se perdido, e reenviar mandaria a mesma foto
   * duas vezes ao cliente (WABA com aviso de spam). Sem conseguir conferir, não
   * reenvia.
   */
  async function retryPendingMedia(msg: WhatsAppThreadMessage, item: PendingMedia) {
    const { id: tempId, contactId } = msg;
    patchPending(tempId, { status: 'sending' });
    if (item.uploadedKey) {
      let recent: WhatsAppThreadMessage[];
      try {
        recent = await fetchThreadRecent(contactId);
      } catch {
        patchPending(tempId, { status: 'failed' });
        toast.error(RETRY_CHECK_FAILED_TEXT);
        return;
      }
      const sent = findSentMedia(recent, item.uploadedKey);
      if (sent) {
        // Já foi: a real entra no cache e a bolha sai no MESMO render (como no
        // commitSent). A prévia da lista chega pelo delta.
        flushSync(() => {
          upsertThreadMessage(contactId, sent);
          removePending(tempId);
        });
        return;
      }
    }
    await sendOneMedia(contactId, tempId, item, msg.authorName);
    void revalidateThread(contactId);
  }

  async function handleEditSubmit(id: string, text: string) {
    await editWhatsAppMessage(id, text);
    setEditTarget(null);
    await mutateMessages();
  }

  // "Anexar no card": a mídia da mensagem vira documento da ficha do cliente
  // (idempotente no servidor). A action devolve a lista nova, que entra no
  // cache do Copiloto pela key do contato DA MENSAGEM (se o atendente trocou
  // de conversa no meio, a lista não cai na ficha de outro cliente).
  async function handleAttachMedia(msg: WhatsAppThreadMessage) {
    try {
      const updated = await attachConversationMediaToCard(msg.id);
      void setCopilotDocuments(msg.contactId, updated);
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

  // Reagir com emoji (o cliente vê a reação na bolha, como no app). Repetir o
  // mesmo emoji remove; emoji '' remove explicitamente (chip). O override
  // local cobre as mensagens do bloco "carregar anteriores", que o polling
  // não refaz — sem ele a reação nunca apareceria nelas.
  async function handleReact(msg: WhatsAppThreadMessage, emoji: string) {
    if (reactBusy.current.has(msg.id)) return; // clique duplo = 1 envio
    reactBusy.current.add(msg.id);
    try {
      const { reaction } = await reactToWhatsAppMessage({ messageId: msg.id, emoji });
      setReactionOverrides((prev) => ({ ...prev, [msg.id]: reaction }));
      await mutateMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar a reação.');
    } finally {
      reactBusy.current.delete(msg.id);
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
      // Sem patch: o desbloqueio mexe no contato, e a lista revalida em
      // segundo plano sem segurar o toast.
      await runAction(() => unblockWhatsAppContact(conv.contactId), 'Contato desbloqueado.', {
        errorMsg: 'Não foi possível desbloquear o contato. Recarregue a página (F5) e tente de novo.',
      });
      return;
    }
    if (!(await confirm({
      title: `Bloquear ${who}?`,
      description: 'O bot e as mensagens automáticas param na hora e a conversa é encerrada como "Descartada". O histórico fica guardado e dá pra desbloquear depois.',
      confirmLabel: 'Bloquear',
    }))) return;
    await runAction(() => blockWhatsAppContact(conv.contactId), 'Contato bloqueado.', {
      errorMsg: 'Não foi possível bloquear o contato. Recarregue a página (F5) e tente de novo.',
    });
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
      // O delta não vê exclusão (o cascade apaga a conversa): sai da tela aqui,
      // sem recarregar as 1.000 conversas.
      dropConversation(conv.contactId);
      toast.success('Contato excluído.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir contato.');
    }
  }

  return (
    <NumberBadgeContext.Provider value={numberBadges}>
    <RecoveryCapContext.Provider value={recoveryCapOf}>
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
              active={!globalView && !contactsMode && activeFolder === f.key}
              onClick={() => selectFolder(f.key)}
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
              active={!globalView && !contactsMode && activeFolder === f.key}
              onClick={() => selectFolder(f.key)}
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

            {/* Pills de leitura estilo WhatsApp: Tudo / Não lidas / Lidas / Em
                fila numa fileira própria; os demais filtros ficam nos chips
                compactos logo abaixo. (Na Agenda de contatos só a busca vale —
                os filtros são de conversa.) */}
            {!contactsMode && (<>
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* "Tudo" limpa o filtro de leitura/fila (igual ao pill do app). */}
              <button
                onClick={() => changeReadFilter('todas')}
                title="Todas as conversas"
                className={pillCls(readFilter === 'todas')}
              >
                <span className="whitespace-nowrap">Tudo</span>
              </button>

              {/* Estado de leitura/fila: chips exclusivos entre si — clicar no
                  ativo volta pra "Tudo". Contagem sempre visível, como no app. */}
              {([
                { key: 'nao_lidas', label: 'Não lidas', hint: 'Só conversas com mensagem ainda não lida' },
                { key: 'lidas', label: 'Lidas', hint: 'Só conversas já lidas' },
                { key: 'fila', label: 'Em fila', hint: 'Só quem está na fila, aguardando atendente' },
              ] as const).map(({ key, label, hint }) => (
                <button
                  key={key}
                  onClick={() => changeReadFilter(readFilter === key ? 'todas' : key)}
                  title={hint}
                  className={pillCls(readFilter === key)}
                >
                  <span className="whitespace-nowrap">{label}</span>
                  {readCounts[key] > 0 && (
                    <span className={`text-[11px] font-bold ${readFilter === key ? 'text-white/85' : 'text-[#7fae9c]'}`}>
                      {readCounts[key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <p className="truncate text-[13px] font-bold text-white pt-2">Filtros</p>
            <div className="mt-1.5 flex items-center gap-1">
              {/* Data de entrada do lead (presets + intervalo livre) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Filtrar pela data de entrada do lead" className={chipCls(!!dateRange)}>
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span className={chipLabelCls(!!dateRange)}>{dateRange?.label ?? 'Data de entrada'}</span>
                    {/* Total do banco com TODOS os filtros ligados (o número
                        antigo contava só as 1.000 carregadas). */}
                    {dateRange && (
                      <span
                        title="Conversas com todos os filtros ativos, em todo o histórico"
                        className="ml-1 rounded-full bg-[#1d9e75] px-1.5 text-[10px] font-bold text-white"
                      >
                        {serverResult ? serverResult.total.toLocaleString('pt-BR') : '…'}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  <DropdownMenuLabel>Entrada do lead</DropdownMenuLabel>
                  {([['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', 'Últimos 7 dias'], ['30d', 'Últimos 30 dias'], ['mes', 'Este mês']] as const).map(([k, label]) => (
                    <DropdownMenuItem key={k} onSelect={() => applyDatePreset(k)}>
                      {label}
                      {dateRange?.label === label && <Check className="ml-auto h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Período personalizado</DropdownMenuLabel>
                  <div className="space-y-1.5 px-2 pb-2" onKeyDown={(e) => e.stopPropagation()}>
                    <label className="flex items-center justify-between gap-2 text-xs">
                      De
                      <input type="date" value={customFrom} max={customTo || undefined}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="rounded border px-1.5 py-0.5 text-xs" />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs">
                      Até
                      <input type="date" value={customTo} min={customFrom || undefined}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="rounded border px-1.5 py-0.5 text-xs" />
                    </label>
                    <button
                      onClick={applyCustomRange}
                      disabled={!customFrom && !customTo}
                      className="w-full rounded bg-[#1d9e75] py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Aplicar período
                    </button>
                  </div>
                  {dateRange && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => { setDateRange(null); setCustomFrom(''); setCustomTo(''); }}>
                        <X className="mr-2 h-3.5 w-3.5" /> Limpar filtro de data
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

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

              {/* Coluna do Kanban (só conversas já vinculadas a um card), pelo
                  id da coluna e em todo o histórico */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Filtrar pela coluna do card no Kanban (em todo o histórico)" className={chipCls(!!columnFilter)}>
                    <Columns3 className="h-3.5 w-3.5 shrink-0" />
                    <span className={chipLabelCls(!!columnFilter)}>
                      {columnFilter ? columnName ?? 'Coluna' : 'Coluna do Kanban'}
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
                  {inboxColumns === undefined && !columnsFailed && (
                    <DropdownMenuItem disabled className="text-sm text-gray-400">
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Carregando colunas…
                    </DropdownMenuItem>
                  )}
                  {columnsFailed && (
                    <DropdownMenuItem
                      onSelect={(e) => { e.preventDefault(); reloadColumns(); }}
                      className="text-sm text-amber-600"
                    >
                      <RotateCcw className="mr-2 h-3.5 w-3.5" /> Não carregou · Tentar novamente
                    </DropdownMenuItem>
                  )}
                  {inboxColumns?.length === 0 && (
                    <DropdownMenuItem disabled className="text-sm text-gray-400">
                      Nenhuma coluna no Kanban.
                    </DropdownMenuItem>
                  )}
                  {(inboxColumns ?? []).map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={columnFilter === col.id}
                      onCheckedChange={() => setColumnFilter((cur) => (cur === col.id ? null : col.id))}
                      onSelect={(e) => e.preventDefault()}
                      className="text-sm"
                    >
                      <span className={`min-w-0 flex-1 truncate ${col.count === 0 ? 'opacity-50' : ''}`}>{col.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{col.count}</span>
                    </DropdownMenuCheckboxItem>
                  ))}

                  <p className="px-2 py-1.5 text-[10px] leading-snug text-gray-400">
                    Conversas com card nesta coluna do Kanban, em todo o histórico (cards arquivados não entram).
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Tags */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button title="Filtrar por tag (em todo o histórico)" className={chipCls(tagFilter.length > 0)}>
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
                  <TagMenuStatus tags={allTags} failed={tagsFailed} onRetry={reloadTags} className="text-sm" />
                  {(allTags ?? []).map((t) => (
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
              {!globalView && (activeFolder === 'ativas' || activeFolder === 'todos') && teamLoad.length > 0 && (
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

              {!globalView && (activeFolder === 'ativas' || activeFolder === 'todos') && (
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
            {/* Faixa da lista global: o total vem do banco ("X de Y"), nunca
                da página na tela. Leitura (lidas/não lidas) filtra só a
                página carregada, e a faixa diz isso. */}
            {globalView && (
              <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-[#3a6b58] bg-[#26483c] px-2 py-1.5 text-[11px] font-semibold text-[#a9f2d8]">
                {searchingServer
                  ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  : serverFilterError != null
                    ? <AlertCircle className="h-3 w-3 shrink-0 text-amber-300" />
                    : <Search className="h-3 w-3 shrink-0" />}
                <span className="min-w-0 flex-1">
                  {!serverFilterActive ? (
                    <>
                      {filtered.length} resultado{filtered.length === 1 ? '' : 's'} nas conversas carregadas. Digite ao
                      menos 2 letras para procurar em <b>todo o histórico</b>.
                    </>
                  ) : searchingServer ? (
                    <>Procurando em todo o histórico…</>
                  ) : serverFilterError != null ? (
                    <>Sem resposta do histórico ({describeFetchError(serverFilterError)}): mostrando só as conversas carregadas.</>
                  ) : serverResult ? (
                    <>
                      {serverResult.items.length < serverResult.total
                        ? `${serverResult.items.length.toLocaleString('pt-BR')} de ${serverResult.total.toLocaleString('pt-BR')}`
                        : serverResult.total.toLocaleString('pt-BR')}
                      {' '}conversa{serverResult.total === 1 ? '' : 's'} com esses filtros, em <b>todo o histórico</b>.
                      {(readFilter === 'nao_lidas' || readFilter === 'lidas') && (
                        <> {readFilter === 'nao_lidas' ? 'Não lidas' : 'Lidas'}: {filtered.length} (leitura filtrada só nesta página).</>
                      )}
                    </>
                  ) : null}
                </span>
                {serverFilterError != null && !searchingServer && (
                  <button
                    onClick={retryServerFilter}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-amber-300/50 px-1.5 py-0.5 text-amber-100 hover:bg-amber-500/20"
                  >
                    <RotateCcw className="h-3 w-3" /> Tentar de novo
                  </button>
                )}
              </div>
            )}
            </>)}
          </div>

          {/* Lista já na tela, mas a lista completa ou o delta falharam (403 da trava
              de IP ao trocar de rede, 500 do banco, sem internet): as
              conversas ficam (o SWR guarda o último dado) e o aviso diz o
              motivo real — a rota GET devolve o texto, a action o mascarava. */}
          {!contactsMode && conversationsLoaded && conversationsSyncError != null && (
            <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-amber-300/40 bg-amber-500/15 px-3 py-1.5 text-[11px] text-amber-100">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="min-w-0 flex-1">Lista sem atualizar: {describeFetchError(conversationsSyncError)}</span>
              <button
                onClick={() => { void retryConversationsSync(); }}
                className="flex shrink-0 items-center gap-1 rounded-md border border-amber-300/50 px-1.5 py-0.5 font-semibold text-amber-100 hover:bg-amber-500/20"
              >
                <RotateCcw className="h-3 w-3" /> Tentar de novo
              </button>
            </div>
          )}

          {/* Área rolável: só a lista de conversas rola */}
          <div className="wa-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-2">
            {contactsMode ? (
              <ContactsDirectory
                search={search}
                numberFilter={numberFilter}
                numberLabelOf={numberBadges ? (nid) => (nid ? numberBadges.get(nid) ?? null : null) : null}
                // Abre na hora: quem está fora da lista é hidratado pelo
                // fetchedActive (GET por contato). A conversa recém-criada
                // pelo openContactConversation entra na lista por um delta
                // coalescido, depois — antes o clique esperava as 1.000
                // conversas.
                onOpen={(contactId) => {
                  setActiveContactId(contactId);
                  scheduleConversationsRefresh();
                }}
              />
            ) : listState === 'loading' ? (
              <ConversationListSkeleton />
            ) : listState === 'error' ? (
              // shouldRetryOnError:false no hook: sem este botão a lista só
              // tentaria de novo no próximo delta. O motivo vem da rota (ex.:
              // fora da internet do escritório), não um genérico. Sem lista
              // não há delta: o botão pede a lista inteira.
              <div role="alert" className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[#a7c9bc]">
                <AlertCircle className="mb-2 h-7 w-7 text-amber-300" />
                <p className="text-sm">Não foi possível carregar as conversas.</p>
                <p className="mt-1 text-xs">{describeFetchError(conversationsError)}</p>
                <button
                  onClick={() => { void reloadAllConversations(); }}
                  className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#3a6b58] bg-[#2e5749] px-3 py-1.5 text-[12px] font-bold text-[#6fd6ad] hover:bg-[#356b57]"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
                </button>
              </div>
            ) : listState === 'empty' ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[#a7c9bc]">
                <InboxIcon className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">Nenhuma conversa ainda.</p>
                <p className="mt-1 text-xs">Quando um cliente mandar mensagem no WhatsApp, ela aparece aqui.</p>
              </div>
            ) : (<>
            {conversations.length > 0 && visibleItems.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-[#a7c9bc]">
                {searchingServer ? (
                  <>
                    <Loader2 className="mb-2 h-6 w-6 animate-spin opacity-60" />
                    <p className="text-sm">Procurando no histórico…</p>
                  </>
                ) : (
                  <>
                    <Search className="mb-2 h-6 w-6 opacity-40" />
                    <p className="text-sm">
                      {serverResult?.total === 0 ? 'Nenhuma conversa com esses filtros em todo o histórico.' : 'Nada encontrado com esse filtro.'}
                    </p>
                    {search.trim().length >= 2 && (
                      <p className="mt-1 text-xs">
                        Sem conversa com esse termo — veja na <b>Agenda de contatos</b>.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Lista global (filtro no banco ou busca): cada pasta em sua
                própria seção (sem a "Todos", que duplicaria tudo) — os
                resultados aparecem sem precisar entrar em pasta nenhuma. */}
            {globalView ? (<>
              {ALL_FOLDERS.filter((f) => f.key !== 'todos').map((f) => (
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
              ))}
              {/* Encerradas com desfecho sem pasta no rail (categoria nova). */}
              <ConversationGroup
                title="Outros desfechos"
                items={groups.outros}
                activeContactId={activeContactId}
                onSelect={setActiveContactId}
                meId={meId}
                meName={session?.user?.name ?? ''}
              />
            </>) : activeFolder === 'unqualified' ? (
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

            {!globalView && visibleItems.length > visibleCount && (
              <div className="px-3 pt-1">
                <button
                  onClick={() => setVisibleCount((v) => v + 200)}
                  className="w-full rounded-lg border border-[#3a6b58] bg-[#2e5749] py-1.5 text-[11px] font-bold text-[#6fd6ad] hover:bg-[#356b57]"
                >
                  Mostrando {Math.min(visibleCount, visibleItems.length)} de {visibleItems.length} · Carregar mais
                </button>
              </div>
            )}

            {/* Resultado do banco maior que a página: a próxima de 300 (skip). */}
            {serverResult && serverResult.items.length < serverResult.total && (
              <div className="px-3 pt-1">
                <button
                  onClick={() => { if (filterQuery) void fetchFilterPage(filterQuery, 'more'); }}
                  disabled={loadingMore}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#3a6b58] bg-[#2e5749] py-1.5 text-[11px] font-bold text-[#6fd6ad] hover:bg-[#356b57] disabled:opacity-60"
                >
                  {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
                  Mostrando {serverResult.items.length.toLocaleString('pt-BR')} de {serverResult.total.toLocaleString('pt-BR')} · Carregar mais
                </button>
              </div>
            )}

            {/* Sem filtro no banco, pastas, leitura e número contam só as
                conversas carregadas (as mais recentes): dizer isso em voz
                alta evita a sensação de "sumiu conversa" e de contador
                errado. Busca, tag, data e coluna vão ao histórico inteiro. */}
            {!globalView && conversationsTotal > conversations.length && conversations.length > 0 && (
              <p className="px-3 pb-1 pt-2 text-center text-[10px] leading-relaxed text-[#7fae9c]">
                Mostrando as {conversations.length.toLocaleString('pt-BR')} conversas mais recentes
                {loadedSinceLabel ? ` (desde ${loadedSinceLabel})` : ''} de {conversationsTotal.toLocaleString('pt-BR')} —
                pastas e filtros de leitura/número valem só para elas.
                <br />
                <b>Busca</b>, <b>tags</b>, <b>data de entrada</b> e <b>coluna do Kanban</b> procuram em todo o histórico.
              </p>
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
          openingActive ? (
            <div role="status" className="flex h-full flex-col items-center justify-center text-gray-400">
              <Loader2 className="mb-2 h-8 w-8 animate-spin opacity-60" />
              <p className="text-base">Abrindo conversa…</p>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <MessageCircle className="mb-2 h-10 w-10 opacity-30" />
              <p className="text-base">Selecione uma conversa para atender.</p>
            </div>
          )
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
                  <TagMenuStatus tags={allTags} failed={tagsFailed} onRetry={reloadTags} className="text-sm" />
                  {(allTags ?? []).map((t) => {
                    const tagPending = pendingTags.has(`${active.id}:${t.id}`);
                    return (
                      // Menu fica aberto (preventDefault no select) para marcar
                      // várias tags seguidas; o Radix chama onCheckedChange
                      // mesmo assim. Travado só enquanto ESTA tag grava.
                      <DropdownMenuCheckboxItem
                        key={t.id}
                        checked={active.tags.some((at) => at.id === t.id)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(v) => handleSetTag(t, v === true)}
                        disabled={tagPending}
                        className="text-base"
                      >
                        <span className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full align-middle" style={{ backgroundColor: t.color }} />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        {tagPending && <Loader2 className="ml-2 h-3.5 w-3.5 shrink-0 animate-spin opacity-70" />}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTagsModalOpen(true)} className="text-base">
                    <Settings2 className="mr-2 h-3.5 w-3.5" /> Gerenciar tags
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {(active.status === 'queued' || active.status === 'bot' || active.status === 'standby' || (active.status === 'human' && active.assignedToId !== meId)) && (
                <HeaderButton
                  icon={Headset}
                  label="Assumir"
                  onClick={() => {
                    const base = active;
                    void runAction(() => assumeConversation(base.id), 'Conversa assumida.', {
                      base,
                      optimistic: assumePatch(me),
                      errorMsg: 'Não foi possível assumir a conversa. Recarregue a página (F5) e tente de novo.',
                    });
                  }}
                />
              )}
              {/* Devolver abre o diálogo do pedido ("O que a IA deve
                  recolher?"). Também na Fila: a IA transferiu por uma dúvida
                  no meio da coleta e o atendente respondeu sem assumir. */}
              {(active.status === 'human' || active.status === 'queued') && (
                <HeaderButton
                  icon={Undo2}
                  label="Devolver pro bot"
                  onClick={() => setCollectDialog({ mode: 'return', base: active, open: true })}
                />
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
                        onClick={() => {
                          const base = active;
                          // Pedido em aberto: concluir ou manter, antes de encerrar.
                          if (base.collectRequest) {
                            setCloseAsk({ base, category, label, listLabel: CLOSE_CATEGORY_LABELS[category] ?? label, open: true });
                            return;
                          }
                          runClose(base, category, label);
                        }}
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
                <HeaderButton
                  icon={Headset}
                  label="Reabrir"
                  onClick={() => {
                    const base = active;
                    void runAction(() => assumeConversation(base.id), 'Atendimento reaberto.', {
                      base,
                      optimistic: assumePatch(me),
                      errorMsg: 'Não foi possível reabrir o atendimento. Recarregue a página (F5) e tente de novo.',
                    });
                  }}
                />
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
                      auto-read remarcaria como lida na hora). Os dois itens
                      mudam a lista no clique (patch local), sem recarregá-la. */}
                  <DropdownMenuItem
                    onClick={() => {
                      const base = active;
                      setActiveContactId(null);
                      void runAction(() => markConversationUnread(base.id), 'Conversa marcada como não lida.', {
                        base,
                        optimistic: manualUnreadPatch(),
                        errorMsg: 'Não foi possível marcar como não lida. Recarregue a página (F5) e tente de novo.',
                      });
                    }}
                    className="text-base"
                  >
                    <MessageCircle className="mr-2 h-3.5 w-3.5 text-emerald-600" /> Marcar como não lida
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const base = active;
                      void runAction(() => markConversationRead(base.id), 'Conversa marcada como lida.', {
                        base,
                        optimistic: readPatch(new Date().toISOString()),
                        errorMsg: 'Não foi possível marcar como lida. Recarregue a página (F5) e tente de novo.',
                      });
                    }}
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

            {/* Pedido em aberto: o que a IA está recolhendo (ou pausado fora
                do bot). Editar reaproveita o diálogo do Devolver. */}
            {active.collectRequest && (
              <CollectRequestBar
                value={active.collectRequest}
                status={active.status}
                readOnly={active.readOnly}
                onEdit={() => setCollectDialog({ mode: 'edit', base: active, open: true })}
                onClear={() => { void handleClearCollectRequest(active); }}
              />
            )}

            {/* Invólucro relativo só para o chip "Nova mensagem ↓" flutuar sobre o rodapé da thread. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
            {/* Poll da thread falhou (403 da trava de IP, 500, rede): as
                mensagens que já estavam ficam (o SWR guarda o último dado) e
                o aviso diz o motivo, em vez de a conversa esvaziar calada. */}
            {messagesError != null && (
              <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">
                  {displayMessages.length > 0 ? 'Mensagens sem atualizar: ' : 'Não foi possível carregar as mensagens: '}
                  {describeFetchError(messagesError)}
                </span>
                <button
                  onClick={() => { void mutateMessages(); }}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-100"
                >
                  <RotateCcw className="h-3 w-3" /> Tentar de novo
                </button>
              </div>
            )}
            <div
              ref={scrollRef}
              onScroll={handleThreadScroll}
              onWheel={stopFollowingThread}
              onTouchMove={stopFollowingThread}
              onPointerDown={stopFollowingThread}
              onKeyDown={stopFollowingThread}
              className="wa-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-7"
            >
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
              {/* 1ª carga de uma conversa não visitada: sem isto a thread
                  aparecia vazia, como se o cliente nunca tivesse escrito. */}
              {messagesLoading && displayMessages.length === 0 && (
                <div role="status" className="flex h-full flex-col items-center justify-center text-gray-400">
                  <Loader2 className="mb-2 h-7 w-7 animate-spin opacity-60" />
                  <p className="text-sm">Carregando mensagens…</p>
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
                      msg={reactionOverrides[msg.id] !== undefined ? { ...msg, reaction: reactionOverrides[msg.id] } : msg}
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
                      canRetryMedia={!!msg.mediaType && pendingMediaRef.current.has(msg.id)}
                      onDiscard={() => removePending(msg.id)}
                      onJumpToReply={() => jumpToMessage(msg.replyToId)}
                      onAttachToCard={() => handleAttachMedia(msg)}
                      onReact={(emoji) => handleReact(msg, emoji)}
                      contactName={active?.contactName}
                    />
                  </Fragment>
                );
              })}
            </div>
            {/* Mensagem nova chegou enquanto o atendente lia mais acima: não
                puxa a tela, avisa. Some ao chegar no fim. */}
            {newBelowCount > 0 && (
              <button
                type="button"
                onClick={scrollThreadToEnd}
                title="Ir para a última mensagem"
                className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#1d9e75] px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-black/5 transition-colors hover:bg-[#178a66]"
              >
                {newBelowCount === 1 ? 'Nova mensagem' : `${newBelowCount} novas mensagens`}
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            )}
            </div>

            {/* Número desativado (tela Números): histórico só para consulta. */}
            {active.readOnly ? (
              <div className="flex items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <Lock className="h-4 w-4 shrink-0" />
                <span>Somente leitura: este número foi desativado. O histórico fica disponível para consulta, mas não é possível enviar mensagens por aqui.</span>
              </div>
            ) : (<>
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
                onRefreshThread={() => revalidateThread(active.contactId)}
                onSent={handleSentOutside}
              />
            </div>
            </>)}

            <WhatsAppSendTemplateModal
              open={sendTemplateOpen}
              onOpenChange={setSendTemplateOpen}
              contactId={active.contactId}
              onSent={(dto) => { handleSentOutside(dto); void revalidateThread(dto.contactId); }}
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
          onUpdate={() => { if (activeContactId) void reloadCopilot(activeContactId); }}
          cardId={clientInfo.userId}
          isProcess={false}
          ownerId={clientInfo.userId}
        />
      )}

      {/* Renomear, recolorir ou excluir tag não passa pelo delta (não toca
          conversa nenhuma): quem editou recarrega a lista inteira para os
          chips baterem; as outras abas, na carga de 10 min. */}
      <WhatsAppTagsModal
        open={tagsModalOpen}
        onOpenChange={setTagsModalOpen}
        onChanged={() => { reloadTags(); void reloadAllConversations(); }}
      />
      <ReturnToBotDialog
        open={!!collectDialog?.open}
        onOpenChange={(o) => { if (!o) setCollectDialog((d) => (d ? { ...d, open: false } : d)); }}
        mode={collectDialog?.mode ?? 'return'}
        current={collectDialog?.base.collectRequest ?? null}
        lastInboundAt={collectDialog?.base.lastInboundAt ?? null}
        onConfirm={(value) => {
          const dialog = collectDialog;
          if (!dialog?.open) return;
          if (dialog.mode === 'return') handleReturnToBot(dialog.base, value);
          else handleSaveCollectRequest(dialog.base, value ?? null);
        }}
      />
      <CloseWithRequestDialog
        open={!!closeAsk?.open}
        onOpenChange={(o) => { if (!o) setCloseAsk((d) => (d ? { ...d, open: false } : d)); }}
        closeLabel={closeAsk?.listLabel ?? ''}
        request={closeAsk?.base.collectRequest ?? null}
        onChoose={(choice) => {
          if (closeAsk?.open) runClose(closeAsk.base, closeAsk.category, closeAsk.label, choice);
        }}
      />
      <CloseReasonsModal
        open={reasonsModalOpen}
        onOpenChange={setReasonsModalOpen}
        reasons={closeReasons ?? []}
        onChanged={(updated) => mutateCloseReasons(updated, { revalidate: false })}
      />
      <AddContactDialog
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        // Mesmo desenho do "Abrir" da agenda: abre na hora (fetchedActive) e a
        // lista pega a conversa nova num delta coalescido.
        onCreated={(contactId) => {
          setActiveContactId(contactId);
          scheduleConversationsRefresh();
        }}
      />
    </div>
    </RecoveryCapContext.Provider>
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
  onCreated: (contactId: string) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    try {
      const { contactId } = await createWhatsAppContact(phone, name);
      onCreated(contactId);
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

// Esqueleto da 1ª carga da lista (auditoria de 24/09/2026, FE-8: a lista
// vazia dizia "Nenhuma conversa ainda" e o chefe lia como "não carrega").
// 8 linhas no formato da linha real (avatar + nome/hora + prévia), com as
// cores fixas da lista — sem dark:, o modo escuro é o Dark Reader.
function ConversationListSkeleton() {
  return (
    <div role="status" aria-label="Carregando conversas" className="px-1.5 pt-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="mb-0.5 flex animate-pulse items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="h-9 w-9 shrink-0 rounded-full bg-[#2e5749]" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <span className="h-3 rounded bg-[#2e5749]" style={{ width: `${45 + ((i * 17) % 35)}%` }} />
              <span className="ml-auto h-2.5 w-8 shrink-0 rounded bg-[#294e41]" />
            </span>
            <span className="h-2.5 rounded bg-[#294e41]" style={{ width: `${60 + ((i * 23) % 30)}%` }} />
          </span>
        </div>
      ))}
      <span className="sr-only">Carregando conversas…</span>
    </div>
  );
}

// Linha de estado dos dois menus de tag (filtro da lista e cabeçalho da
// thread): carregando / falhou / nenhuma criada. Com tags carregadas não
// desenha nada. "Tentar novamente" mantém o menu aberto (preventDefault) para
// o atendente ver o "Carregando tags…" e depois a lista.
function TagMenuStatus({ tags, failed, onRetry, className = '' }: {
  tags: WhatsAppTagDTO[] | undefined; failed: boolean; onRetry: () => void; className?: string;
}) {
  if (tags === undefined && failed) {
    return (
      <>
        <DropdownMenuItem disabled className={`${className} text-gray-400`}>Não foi possível carregar as tags.</DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onRetry(); }} className={className}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Tentar novamente
        </DropdownMenuItem>
      </>
    );
  }
  if (tags === undefined) {
    return (
      <DropdownMenuItem disabled className={`${className} text-gray-400`}>
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Carregando tags…
      </DropdownMenuItem>
    );
  }
  if (tags.length === 0) {
    return <DropdownMenuItem disabled className={`${className} text-gray-400`}>Nenhuma tag criada ainda.</DropdownMenuItem>;
  }
  return null;
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
  const recoveryCapOf = useContext(RecoveryCapContext);
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
              {c.status === 'standby' && c.recoveryAttempts > 0 && (
                <span className="shrink-0 rounded-full bg-violet-400/15 px-1.5 py-0.5 text-[8.5px] font-bold text-violet-300 ring-1 ring-violet-400/30">
                  {Math.min(c.recoveryAttempts, recoveryCapOf(c.numberId))}ª de {recoveryCapOf(c.numberId)}
                </span>
              )}
              {/* Pedido em aberto: a IA está recolhendo uma lista (resumo no title). */}
              {c.collectRequest && <CollectRequestPill value={c.collectRequest} status={c.status} />}
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

// Paleta de reações (mesma do chat interno; whitelist replicada no servidor).
const WA_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅'];

function ThreadMessageRow({
  msg, grouped, meId, highlighted, setRowRef, onReply, onEdit, onDelete, onRetry, canRetryMedia, onDiscard, onJumpToReply, onAttachToCard, onReact, contactName,
}: {
  msg: WhatsAppThreadMessage; grouped: boolean; meId: string; highlighted: boolean; contactName?: string | null;
  setRowRef: (el: HTMLDivElement | null) => void;
  onReply: () => void; onEdit: () => void; onDelete: () => void;
  // canRetryMedia: a bolha de mídia que falhou ainda tem o anexo guardado
  // (`pendingMediaRef`), então dá para tentar de novo sem reanexar.
  onRetry: () => void; canRetryMedia: boolean; onDiscard: () => void; onJumpToReply: () => void;
  onAttachToCard: () => void;
  onReact: (emoji: string) => void;
}) {
  const mine = msg.direction === 'out';
  const isTemp = msg.id.startsWith('temp-');
  const canEdit = mine && !isTemp && msg.authorId === meId && !msg.mediaKey && !msg.deletedAt;
  const canDelete = mine && !isTemp && msg.authorId === meId && !msg.deletedAt;
  // Reagir exige que a mensagem exista na Meta (waMessageId) — nota interna e
  // envio otimista ficam de fora.
  const canReact = !isTemp && !msg.internal && !msg.deletedAt && !!msg.waMessageId;
  const [reactOpen, setReactOpen] = useState(false);

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
          {!msg.mediaKey && msg.mediaType && <PendingMediaPreview msg={msg} mine={mine} />}
          {msg.body && <p className="whitespace-pre-wrap break-words leading-relaxed">{formatWaText(msg.body)}</p>}
          <span className={`ml-2 mt-0.5 flex items-center justify-end gap-1 text-xs ${mine ? 'text-white/70' : 'text-gray-400'}`}>
            {msg.editedAt && <span className="italic">editada ·</span>}
            {timeShort(msg.createdAt)}
            {mine && <StatusTicks status={msg.status} />}
          </span>
        </div>

        {/* Reação da equipe aplicada — chip encostado na bolha. Remoção
            EXPLÍCITA (emoji '') pra clique duplo não reaplicar por engano. */}
        {msg.reaction && (
          <button
            onClick={() => onReact('')}
            title="Reação enviada ao cliente — clique para remover"
            className={`z-[1] -mt-2 flex items-center rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-sm shadow-sm transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 ${mine ? 'mr-1 self-end' : 'ml-1 self-start'}`}
          >
            {msg.reaction}
          </button>
        )}

        {msg.status === 'failed' && isTemp && (
          <span className="mt-0.5 flex items-center gap-2 px-1 text-sm text-red-500">
            Falhou.
            {((msg.body && !msg.mediaType) || canRetryMedia) && (
              <button onClick={onRetry} className="font-semibold underline">tentar de novo</button>
            )}
            <button onClick={onDiscard} className="underline">descartar</button>
          </span>
        )}
      </div>

      {/* Ações da mensagem (aparecem no hover) */}
      {!isTemp && (
        <div className={`relative mb-1 flex gap-0.5 transition-opacity group-hover:opacity-100 ${reactOpen ? 'opacity-100' : 'opacity-0'}`}>
          {canReact && (
            <>
              <MsgAction icon={Smile} label="Reagir" onClick={() => setReactOpen((v) => !v)} />
              {reactOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setReactOpen(false)} />
                  <div className={`absolute bottom-8 z-20 flex gap-0.5 rounded-full border border-gray-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 ${mine ? 'right-0' : 'left-0'}`}>
                    {WA_REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => { onReact(emoji); setReactOpen(false); }}
                        title={msg.reaction === emoji ? 'Remover reação' : `Reagir com ${emoji}`}
                        className={`grid h-7 w-7 place-items-center rounded-full text-base transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700 ${msg.reaction === emoji ? 'bg-emerald-100 dark:bg-emerald-900/40' : ''}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          <MsgAction icon={ReplyIcon} label="Responder" onClick={onReply} />
          {canEdit && <MsgAction icon={Pencil} label="Editar (só na thread)" onClick={onEdit} />}
          {canDelete && <MsgAction icon={Trash2} label="Apagar (só na thread)" onClick={onDelete} />}
        </div>
      )}
    </div>
  );
}

/**
 * Anexo da bolha otimista: o atendente vê O QUE está mandando (a foto, ou o
 * nome do arquivo) enquanto sobe e envia. Antes era um "Enviando anexo..." que
 * continuava lá até depois da falha. A foto vem do object URL do File local
 * (sem ida à rede), translúcida e com spinner enquanto envia; formato que o
 * navegador não desenha (HEIC) cai no nome.
 */
function PendingMediaPreview({ msg, mine }: { msg: WhatsAppThreadMessage; mine: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const sending = msg.status === 'sending';
  const name = msg.fileName?.trim() || 'Anexo';

  if (msg.localPreviewUrl && pendingPreviewKind(msg.mediaType) === 'image' && !imgFailed) {
    return (
      <div className="relative mb-1 overflow-hidden rounded-xl border border-black/5 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={msg.localPreviewUrl}
          alt={name}
          onError={() => setImgFailed(true)}
          className={`max-h-72 max-w-full object-cover ${sending ? 'opacity-50' : 'opacity-80'}`}
        />
        {sending && (
          <span role="status" aria-label={`Enviando ${name}`} className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/45 p-2">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </span>
          </span>
        )}
      </div>
    );
  }

  return (
    <span
      title={name}
      className={`mb-1 flex max-w-[16rem] items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold ${mine ? 'bg-white/15' : 'bg-gray-100'}`}
    >
      {sending
        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-label="Enviando" />
        : <Paperclip className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Mídia inline na bolha — visual novo:
 *   - imagem: cartão arredondado com zoom no hover, clique abre em nova aba
 *   - vídeo: player nativo em cartão arredondado
 *   - áudio: player próprio (play/pausa + barra + tempo) e botão "Transcrever"
 *     (IA; o texto fica salvo na mensagem — o próximo clique é grátis)
 *   - documento: cartão com ícone, extensão em selo e ação "abrir"
 * A URL pré-assinada já vem na mensagem (rota da thread, `mediaUrl`) e passa
 * pelo cache único do media-url-cache: sem server action por bolha. A action
 * só entra como fallback (sem URL, URL vencida) e no "Baixar".
 */
function WaMediaBubble({ msg, mine, onAttachToCard }: { msg: WhatsAppThreadMessage; mine: boolean; onAttachToCard?: () => void }) {
  const mediaKey = msg.mediaKey as string;
  const mediaType = msg.mediaType;
  // Nome legível ("Foto 24-09-2026 14h32m05.jpeg" no lugar de "midia.jpeg").
  // É o mesmo que a rota da thread usa ao assinar: a URL do servidor e a do
  // fallback caem na mesma entrada do cache.
  const docName = mediaDisplayName({ key: mediaKey, mediaType, createdAt: msg.createdAt });
  const { url, failed, onError, retry } = useMediaUrl(mediaKey, msg.mediaUrl, msg.mediaUrlExpiresAt, { fileName: docName });
  const isTemp = msg.id.startsWith('temp-');

  async function openInNewTab() {
    const u = url ?? await getMediaUrl(mediaKey, { fileName: docName });
    if (u) window.open(u, '_blank');
    else toast.error('Não foi possível abrir o anexo.');
  }

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

  // Sem URL (action falhou) ou o navegador recusou a URL duas vezes: objeto
  // renomeado/purgado no S3. Clique tenta de novo (falha passageira de rede).
  if (failed) {
    return (
      <button onClick={retry} title={`${docName} — clique para tentar de novo`} className={`mb-1 flex max-w-[16rem] items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-900'}`}>
        <Paperclip className="h-4 w-4 shrink-0" /> <span className="truncate">Arquivo indisponível</span>
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
            <img
              src={url}
              alt="Imagem enviada"
              loading="lazy"
              decoding="async"
              onError={onError}
              className="max-h-72 max-w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.03]"
            />
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
          <video src={url} controls preload="metadata" onError={onError} className="max-h-72 max-w-full" />
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
    return <WaAudioBubble msg={msg} mine={mine} url={url} onMediaError={onError} />;
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
function WaAudioBubble({ msg, mine, url, onMediaError }: {
  msg: WhatsAppThreadMessage; mine: boolean; url: string | null; onMediaError?: () => void;
}) {
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

  // POST /api/whatsapp/assist/transcribe (fora da fila de actions: enviar e
  // tag não esperam a transcrição). O texto fica salvo na mensagem.
  async function handleTranscribe() {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const text = await requestAssistText('transcribe', msg.id);
      setTranscript(text);
      setShowTranscript(true);
    } catch (e) {
      toast.error(describeAssistError(e, 'Falha ao transcrever o áudio.'));
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
          // URL recusada (vencida ou objeto apagado): o media-url-cache busca
          // outra e, se falhar de novo, a bolha vira "Arquivo indisponível".
          onError={onMediaError}
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
