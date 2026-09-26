// Regras puras da lista do inbox do WhatsApp, compartilhadas entre o servidor
// (loadConversations em app/_shared/lib/whatsapp/inbox-data.ts) e o cliente,
// para a prévia montada no navegador bater com a que vem do banco.
//
// Sem "use server" e sem banco: só tipos dos DTOs e o mapa neutro de
// close-categories.ts, para os testes rodarem puros
// (tests/whatsapp-inbox.test.ts e tests/whatsapp-unread.test.ts).

import type { WhatsAppConversationDTO } from '@/app/_shared/lib/whatsapp/inbox-types';
import type { WhatsAppMessageDTO } from '@/app/_shared/lib/whatsapp/service';
import { QUALIFIED_BY_CATEGORY } from '@/app/_shared/lib/whatsapp/close-categories';

/**
 * Tamanho máximo da prévia da última mensagem na lista. O corte é feito no SQL
 * (`left(body, 160)`): a linha da lista mostra uma linha só, e mandar o corpo
 * inteiro das 1.000 conversas a cada recarga era peso morto no payload.
 */
export const LIST_PREVIEW_MAX_CHARS = 160;

/**
 * Rótulo de fallback quando a última mensagem é mídia sem legenda. A lista
 * mostra um ícone do tipo na frente, então aqui vai só o nome curto.
 */
export function mediaTypeLabel(mediaType: string): string {
  if (mediaType.startsWith('image/')) return 'Foto';
  if (mediaType.startsWith('video/')) return 'Vídeo';
  if (mediaType.startsWith('audio/')) return 'Áudio';
  return 'Documento';
}

/**
 * Corta a prévia em `max` CARACTERES, como o `left()` do Postgres. O
 * `String.slice` conta unidades UTF-16 e partiria um emoji ao meio — a prévia
 * montada no navegador ficaria diferente da que vem do banco e a linha
 * "pularia" quando o hash recarregasse a lista.
 */
export function truncatePreview(text: string, max: number = LIST_PREVIEW_MAX_CHARS): string {
  // Atalho: se nem as unidades UTF-16 passam do teto, os caracteres também não.
  if (text.length <= max) return text;
  return Array.from(text).slice(0, max).join('');
}

/**
 * Prévia da última mensagem na linha da lista. É a MESMA regra no servidor
 * (loadConversations, com o corpo já cortado no SQL) e no patch local do envio
 * (sentMessagePatch): o texto, ou o nome do tipo quando é mídia sem legenda,
 * com "Você: " na frente quando a mensagem é nossa. Sem corpo e sem mídia →
 * null (antes o cliente chamaria mediaTypeLabel(null) e quebraria).
 */
export function listPreview(m: {
  body: string | null;
  mediaType: string | null;
  direction: string | null;
}): string | null {
  const text = m.body ?? (m.mediaType ? mediaTypeLabel(m.mediaType) : null);
  if (text === null) return null;
  const cut = truncatePreview(text);
  return m.direction === 'out' && cut ? `Você: ${cut}` : cut;
}

/* ---------- patch local da lista (ações otimistas) ---------- */

// Por que existe (auditoria de 24/09/2026): a tag só aparecia depois de
// recarregar as 1.000 conversas da lista — o clique esperava a action e mais a
// recarga pesada na fila serial de server actions da aba. Agora a ação aplica
// o resultado na hora, na lista em memória (e na busca / conversa hidratada
// fora do topo), e o servidor confirma depois.

/** Linha mínima que os utilitários de patch precisam (o DTO real satisfaz). */
type PatchableRow = { contactId: string; lastMessageAt: string };

/** Mudança numa conversa: campos fixos ou calculados a partir da versão ATUAL. */
export type ConversationPatch<T = WhatsAppConversationDTO> = Partial<T> | ((current: T) => Partial<T>);

/**
 * Liga/desliga uma tag numa lista de tags, sem duplicar e sem falhar ao tirar
 * o que não está lá. Devolve a MESMA referência quando nada muda (o patch
 * vira no-op e o React não re-renderiza a lista). Tag nova vai para o fim, que
 * é a ordem do servidor (aplicação mais antiga primeiro).
 */
export function withTag<T extends { id: string }>(tags: T[], tag: T, on: boolean): T[] {
  const has = tags.some((t) => t.id === tag.id);
  if (on) return has ? tags : [...tags, tag];
  return has ? tags.filter((t) => t.id !== tag.id) : tags;
}

/**
 * Mesmas tags, na mesma ordem (id, nome e cor)? Usado para não trocar o array
 * — e re-renderizar a lista inteira — quando o servidor confirma exatamente o
 * que o patch otimista já mostrava.
 */
export function sameTags<T extends { id: string; name: string; color: string }>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((t, i) => t.id === b[i].id && t.name === b[i].name && t.color === b[i].color);
}

/**
 * Aplica um patch numa conversa. Devolve a mesma referência se o patch não
 * muda nenhum campo (comparação rasa, por referência).
 */
export function patchConversationRow<T extends PatchableRow>(row: T, patch: ConversationPatch<T>): T {
  const changes = typeof patch === 'function' ? patch(row) : patch;
  const keys = Object.keys(changes) as (keyof T)[];
  if (keys.every((k) => Object.is(row[k], changes[k]))) return row;
  return { ...row, ...changes };
}

/**
 * Aplica o patch na conversa do contato, sem mutar a lista de entrada.
 * - contato fora da lista (ou lista ainda não carregada) → MESMA referência;
 * - patch que muda `lastMessageAt` → a conversa sobe/desce para a posição
 *   certa (lista ordenada por lastMessageAt desc, como no servidor); as
 *   outras mantêm a ordem relativa.
 */
export function patchConversationList<T extends PatchableRow>(
  list: T[], contactId: string, patch: ConversationPatch<T>,
): T[];
export function patchConversationList<T extends PatchableRow>(
  list: T[] | undefined, contactId: string, patch: ConversationPatch<T>,
): T[] | undefined;
export function patchConversationList<T extends PatchableRow>(
  list: T[] | undefined, contactId: string, patch: ConversationPatch<T>,
): T[] | undefined {
  if (!list) return list;
  const idx = list.findIndex((c) => c.contactId === contactId);
  if (idx < 0) return list;
  const current = list[idx];
  const next = patchConversationRow(current, patch);
  if (next === current) return list;

  if (next.lastMessageAt === current.lastMessageAt) {
    const out = list.slice();
    out[idx] = next;
    return out;
  }
  // Reposiciona: tira da posição antiga e insere antes da primeira conversa
  // com atividade igual ou mais antiga (empate = a que acabou de mudar primeiro).
  const rest = list.filter((_, i) => i !== idx);
  const ts = Date.parse(next.lastMessageAt);
  let at = rest.findIndex((c) => Date.parse(c.lastMessageAt) <= ts);
  if (at < 0) at = rest.length;
  rest.splice(at, 0, next);
  return rest;
}

/**
 * Os valores ORIGINAIS das chaves que um patch mudou — o rollback quando a
 * action falha. Só as chaves do patch: campos que o poll atualizou nesse meio
 * tempo não voltam no tempo.
 */
export function revertPatch<T extends object>(original: T, patch: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) out[key] = original[key];
  return out;
}

/* ---------- ações da conversa: o mesmo patch no clique e na resposta ---------- */

// Por que existe (auditoria de 24/09/2026): Assumir, Devolver, Encerrar e
// Enviar esperavam a action E a recarga das 1.000 conversas antes de mudar a
// tela e soltar o toast — ~670 recargas completas por dia vinham direto de
// clique, e cada passo de fluxo manual custava ~4 s além do delay. Agora o
// clique aplica o patch otimista, a action devolve o patch real (montado com o
// que o servidor já tem, sem hidratar a conversa) e a lista não recarrega. As
// funções abaixo são usadas nos DOIS lados para o otimista bater com a resposta.

type ConversationChanges = Partial<WhatsAppConversationDTO>;
type Attendant = { id: string; name: string };

/** `qualified` que o encerramento grava: nq_* (motivos da equipe) conta como não qualificado. */
export function qualifiedForCategory(category: string): boolean | null {
  return QUALIFIED_BY_CATEGORY[category] ?? (category.startsWith('nq_') ? false : null);
}

/**
 * Assumir (ou Reabrir, que é o mesmo assumeConversation numa encerrada). O
 * desfecho (`closeCategory`/`qualified`) é preservado, como no servidor; só o
 * rótulo some porque ele só aparece em conversa encerrada.
 */
export function assumePatch(me: Attendant): ConversationChanges {
  return { status: 'human', assignedToId: me.id, assignedToName: me.name, closeCategoryLabel: null };
}

/**
 * Devolver ao bot. O dono FICA (dono pegajoso, EF-1): a conversa continua com
 * o selo do atendente na pasta Bot e em "Só minhas", e se o bot transferir ela
 * volta para ele. `keepOwner: false` = interruptor WA_HUMAN_HOLD_DAYS desligado
 * no servidor (solta o atendente, como antes); o otimista do clique usa o
 * padrão e a resposta da action corrige.
 */
export function returnToBotPatch(opts: { keepOwner?: boolean } = {}): ConversationChanges {
  const patch: ConversationChanges = { status: 'bot', closeCategoryLabel: null };
  return opts.keepOwner === false ? { ...patch, assignedToId: null, assignedToName: null } : patch;
}

/**
 * Encerrar com um desfecho. `label` é o rótulo que a lista mostra
 * (CLOSE_CATEGORY_LABELS ou o motivo da tabela whatsapp_close_reasons). As
 * tags de desfecho só chegam na resposta (syncCloseTag), porque o id da tag
 * pode nem existir antes.
 */
export function closePatch(category: string, label: string): ConversationChanges {
  return {
    status: 'closed',
    closeCategory: category,
    closeCategoryLabel: label,
    qualified: qualifiedForCategory(category),
    assignedToId: null,
    assignedToName: null,
  };
}

/**
 * Tags da conversa depois do syncCloseTag, calculadas em memória (sem reler o
 * banco): as tags de desfecho anteriores saem; a do desfecho atual fica no
 * lugar se já estava (o upsert com `update: {}` não mexe no createdAt da
 * ligação) ou entra no fim. `current` vem na ordem de aplicação (createdAt
 * asc), a mesma da lista.
 */
export function mergeCloseTag<T extends { id: string }>(current: T[], removeIds: ReadonlySet<string>, tag: T): T[] {
  const kept = current.filter((t) => !removeIds.has(t.id));
  return kept.some((t) => t.id === tag.id) ? kept : [...kept, tag];
}

/**
 * Patch local da conversa depois de um envio do atendente (texto, mídia,
 * passo de fluxo, template), a partir do DTO que a action devolve. Espelha o
 * persistOutbound (conversa vira `human` e passa a ser de quem enviou) e a
 * prévia de loadConversations. A conversa sobe para o topo porque
 * `lastMessageAt` muda (patchConversationList reposiciona).
 */
export function sentMessagePatch(
  dto: Pick<WhatsAppMessageDTO, 'body' | 'mediaType' | 'status' | 'createdAt' | 'conversationStatus'>,
  me: Attendant,
): ConversationChanges {
  return {
    lastMessageAt: dto.createdAt,
    status: dto.conversationStatus,
    assignedToId: me.id,
    assignedToName: me.name,
    lastMessagePreview: listPreview({ body: dto.body, mediaType: dto.mediaType, direction: 'out' }),
    lastMessageAuthorName: me.name,
    lastMessageFromBot: false,
    lastMessageFromClient: false,
    lastMessageStatus: dto.status,
    lastMessageMediaType: dto.mediaType,
    // O rótulo do desfecho só existe em conversa encerrada (o envio sempre
    // devolve `human`, mas não custa respeitar a regra da lista).
    ...(dto.conversationStatus === 'closed' ? {} : { closeCategoryLabel: null }),
  };
}

/* ---------- não lida = o cliente mandou algo que ninguém viu ---------- */

// Por que existe (auditoria de 24/09/2026): `unread` era "lastMessageAt depois
// da leitura", e lastMessageAt também anda com mensagem de SAÍDA (envio do
// atendente e do bot). A conversa em que o atendente acabou de responder
// voltava a ficar não lida: 86% dos envios humanos disparavam o markRead do
// próprio autor e, com ele, uma recarga da lista inteira. Agora "não lida" usa
// a MESMA contagem do badge verde (recebidas, sem nota interna, depois da
// leitura efetiva) — o badge do topo (countWhatsAppUnread) segue a mesma regra
// em SQL. A regra só muda o que é "não lida"; quais conversas cada contador
// soma continua igual.

/** Campos da conversa que dizem se ela está não lida (servidor e patch local). */
type UnreadFields = Pick<WhatsAppConversationDTO, 'unread' | 'unreadCount' | 'manualUnread' | 'lastReadAt'>;

/**
 * Não lida a partir da leitura efetiva e da contagem de recebidas depois dela.
 * `readAt` = época (1970) é a sentinela de "Marcar como não lida"
 * (markConversationUnread): vale como não lida mesmo sem mensagem nova, e a
 * lista mostra o marcador próprio em vez da contagem. Conversa nunca lida e
 * sem nenhuma recebida (só template/bot de saída) NÃO é não lida.
 */
export function computeUnread(s: { readAt: Date | null; unreadCount: number }): {
  unread: boolean;
  manualUnread: boolean;
} {
  const manualUnread = s.readAt?.getTime() === 0;
  return { manualUnread, unread: manualUnread || s.unreadCount > 0 };
}

/**
 * Patch local de "lida" (abrir a conversa ou "Marcar como lida"): zera o badge
 * na hora, sem esperar a action nem recarregar a lista. `nowIso` vem de quem
 * chama, para o teste ser determinístico.
 */
export function readPatch(nowIso: string): UnreadFields {
  return { unread: false, unreadCount: 0, manualUnread: false, lastReadAt: nowIso };
}

/** Patch local de "Marcar como não lida": o mesmo que o servidor grava (época). */
export function manualUnreadPatch(): Pick<UnreadFields, 'unread' | 'manualUnread' | 'lastReadAt'> {
  return { unread: true, manualUnread: true, lastReadAt: new Date(0).toISOString() };
}

/* ---------- estado da lista (carregando / erro / vazia) ---------- */

// Por que existe (auditoria de 24/09/2026, FE-8): na 1ª carga a lista ainda
// vazia mostrava "Nenhuma conversa ainda", e o chefe lia isso como "o inbox
// não carrega". E o SWR da lista roda com shouldRetryOnError:false: se a carga
// falha, `data` fica undefined e `isLoading` volta a false — um esqueleto
// preso a "sem dados" ficaria girando para sempre. Daí os quatro estados.

export type InboxListState = 'loading' | 'error' | 'empty' | 'ready';

/**
 * O que a área da lista mostra.
 * - `loaded` = a lista já chegou alguma vez (`data !== undefined` no SWR);
 * - `searchHits` = resultados da busca no servidor, que chegam por outro
 *   caminho: com eles a lista aparece mesmo sem a carga principal.
 * Regras: "vazia" só com a lista carregada e sem nada; erro só enquanto não há
 * lista (com lista antiga na tela, a falha de uma recarga não apaga nada); a
 * tentativa em voo (`isLoading`) ganha do erro anterior, para o "Tentar
 * novamente" mostrar o esqueleto. Sem carga, sem erro e sem voo (um patch
 * local descartou a 1ª carga e o `onDiscarded` já reagendou) conta como
 * carregando.
 */
export function inboxListState(s: {
  loaded: boolean;
  isLoading: boolean;
  hasError: boolean;
  count: number;
  searchHits?: number;
}): InboxListState {
  const hits = s.searchHits ?? 0;
  if (s.loaded) return s.count > 0 || hits > 0 ? 'ready' : 'empty';
  if (hits > 0) return 'ready';
  if (s.isLoading) return 'loading';
  return s.hasError ? 'error' : 'loading';
}
