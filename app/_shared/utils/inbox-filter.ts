// Filtros do inbox do WhatsApp que vão ao BANCO: busca, tag, data de entrada
// e coluna do Kanban (e, junto com eles, número da empresa e "Em fila").
// Regras puras (sem React, sem banco) usadas pela rota GET
// /api/whatsapp/inbox/search (inbox-data.ts) e pelo WhatsAppInbox.
// Teste: tests/inbox-filter.test.ts.
//
// Por que existe (auditoria de 24/09/2026, E3/LISTA-3): tag, data e coluna
// filtravam só as 1.000 conversas carregadas (as mais recentes) e o contador
// mentia: a tag Contratados mostrava 124 de 276 e "Este mês" 861 de 1.608.
// Agora o filtro roda no banco inteiro e o total ("X de Y") vem de um count.
//
// Só tipos do Prisma (`import type`): este arquivo também vai para o bundle do
// navegador.

import type { Prisma } from '@prisma/client';
import type { WhatsAppConversationDTO } from '@/app/_shared/lib/whatsapp/inbox-types';
import { brDayKey, brDayRangeToInstants } from './date-br';

/** Conversas por página do resultado filtrado ("Carregar mais" pede a próxima). */
export const INBOX_FILTER_PAGE = 300;
/** Termo com menos caracteres que isto não vai ao banco (casaria com quase tudo). */
export const INBOX_FILTER_MIN_TERM = 2;

// Tetos contra lixo na query (ela vem do navegador).
const MAX_TERM_LEN = 200;
const MAX_TAGS = 50;
const MAX_SKIP = 100_000;
const ID_RE = /^[\w-]{1,100}$/;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filtro da lista no servidor. Dias em "YYYY-MM-DD" de Brasília, inclusivos
 * (`fromDay` = `toDay` é um dia só). `numberId` e `queuedOnly` sozinhos NÃO
 * mandam a lista ao banco (continuam valendo só nas 1.000 carregadas); junto
 * de um filtro de servidor, entram no where.
 */
export interface InboxServerFilter {
  term?: string;
  tagIds?: readonly string[];
  fromDay?: string;
  toDay?: string;
  labelId?: string;
  numberId?: string;
  queuedOnly?: boolean;
  skip?: number;
}

/** O termo que vale no banco: aparado e com pelo menos 2 caracteres, senão vazio. */
export function normalizeFilterTerm(term: string | null | undefined): string {
  const q = (term ?? '').trim();
  return q.length >= INBOX_FILTER_MIN_TERM ? q.slice(0, MAX_TERM_LEN) : '';
}

/**
 * O filtro precisa do banco? Busca (2+ caracteres), tag, data de entrada ou
 * coluna do Kanban. É também o que deixa a lista "global" (seções por pasta
 * sobre o resultado, ignorando a pasta selecionada).
 */
export function hasServerFilter(f: InboxServerFilter): boolean {
  return !!normalizeFilterTerm(f.term) || !!f.tagIds?.length || !!(f.fromDay || f.toDay) || !!f.labelId;
}

function dayRange(f: InboxServerFilter): { from: string; to: string } | null {
  const from = f.fromDay || f.toDay;
  const to = f.toDay || f.fromDay;
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * Query string do filtro, SEM o `skip` e normalizada (termo aparado, tags sem
 * repetição e em ordem): serve de URL e de CHAVE do resultado no cliente — a
 * mesma chave = o mesmo resultado, não importa a ordem em que as tags foram
 * marcadas.
 */
export function inboxFilterQuery(f: InboxServerFilter): string {
  const p = new URLSearchParams();
  const term = normalizeFilterTerm(f.term);
  if (term) p.set('q', term);
  for (const id of [...new Set(f.tagIds ?? [])].sort()) p.append('tag', id);
  const range = dayRange(f);
  if (range) {
    p.set('from', range.from);
    p.set('to', range.to);
  }
  if (f.labelId) p.set('label', f.labelId);
  if (f.numberId) p.set('number', f.numberId);
  if (f.queuedOnly) p.set('fila', '1');
  return p.toString();
}

function validId(v: string | null): string | undefined {
  return v && ID_RE.test(v) ? v : undefined;
}

function validDay(v: string | null): string | undefined {
  return v && DAY_KEY_RE.test(v) ? v : undefined;
}

/**
 * Query da rota → filtro validado. Campo inválido é ignorado (vira "sem esse
 * filtro"), nunca erro: a query pode ter vindo de um bundle de outra versão.
 * Só um dos dias → um dia só; dias trocados → desinvertidos.
 */
export function parseInboxFilterParams(sp: URLSearchParams): InboxServerFilter {
  const term = (sp.get('q') ?? '').slice(0, MAX_TERM_LEN);
  const tagIds = [...new Set(sp.getAll('tag').filter((id) => ID_RE.test(id)))].slice(0, MAX_TAGS);
  const range = dayRange({ fromDay: validDay(sp.get('from')), toDay: validDay(sp.get('to')) });
  const skipRaw = Number(sp.get('skip'));
  const skip = Number.isInteger(skipRaw) && skipRaw > 0 ? Math.min(skipRaw, MAX_SKIP) : 0;
  return {
    term,
    tagIds,
    fromDay: range?.from,
    toDay: range?.to,
    labelId: validId(sp.get('label')),
    numberId: validId(sp.get('number')),
    queuedOnly: sp.get('fila') === '1',
    skip,
  };
}

/** O que o where precisa buscar antes em users (WhatsAppContact não tem relação com User, só o userId solto). */
export interface InboxWhereContext {
  /** Cards cujo NOME casa com o termo (o nome que a lista exibe é o do card). */
  cardIdsForTerm: readonly string[];
  /** Cards NÃO arquivados da coluna filtrada; `null` = sem filtro de coluna. */
  userIdsForLabel: readonly string[] | null;
}

/**
 * Filtro → where do Prisma em whatsapp_conversations: tudo em AND. Sem filtro
 * nenhum → `{}`. Coluna sem nenhum card → `userId in []`, que o Prisma
 * transforma em "nada" (resultado vazio, nunca "tudo").
 *
 * - termo: nome do contato, nome do card vinculado ou telefone (2+ dígitos);
 * - tags: basta UMA das marcadas (igual ao filtro antigo da lista);
 * - data de entrada: `createdAt` da conversa em dias de Brasília;
 * - coluna: pelo `labelId` do card (a coluna de verdade; `role` é só cópia do
 *   nome e diverge quando a coluna é renomeada);
 * - número e "Em fila": só entram quando vêm junto de um filtro de servidor.
 */
export function buildInboxWhere(f: InboxServerFilter, ctx: InboxWhereContext): Prisma.WhatsAppConversationWhereInput {
  const and: Prisma.WhatsAppConversationWhereInput[] = [];
  const term = normalizeFilterTerm(f.term);
  if (term) {
    const digits = term.replace(/\D/g, '');
    const or: Prisma.WhatsAppConversationWhereInput[] = [
      { contact: { name: { contains: term, mode: 'insensitive' } } },
    ];
    if (ctx.cardIdsForTerm.length) or.push({ contact: { userId: { in: [...ctx.cardIdsForTerm] } } });
    if (digits.length >= 2) or.push({ contact: { phone: { contains: digits } } });
    and.push({ OR: or });
  }
  if (f.tagIds?.length) and.push({ tags: { some: { tagId: { in: [...f.tagIds] } } } });
  const range = dayRange(f);
  if (range) {
    const { gte, lt } = brDayRangeToInstants(range.from, range.to);
    and.push({ createdAt: { gte, lt } });
  }
  if (f.labelId) and.push({ contact: { userId: { in: [...(ctx.userIdsForLabel ?? [])] } } });
  if (f.numberId) and.push({ numberId: f.numberId });
  if (f.queuedOnly) and.push({ status: 'queued' });
  return and.length ? { AND: and } : {};
}

/** Campos da linha da lista que o filtro olha (o DTO satisfaz). */
export type FilterableConversation = Pick<
  WhatsAppConversationDTO,
  'contactId' | 'contactName' | 'contactPhone' | 'tags' | 'createdAt' | 'kanbanLabelId' | 'numberId' | 'status'
>;

/**
 * O mesmo filtro aplicado a UMA linha já carregada: a prévia enquanto o banco
 * não responde (lista carregada + último resultado) e a decisão de rebuscar
 * quando o delta traz conversas mudadas. O termo aqui vale com qualquer
 * tamanho (a busca local de sempre); no banco, só com 2+ caracteres.
 * Aproximação do where: o termo casa pelo nome EXIBIDO (card ou contato) e não
 * pelo nome do contato escondido atrás do card.
 */
export function matchesInboxFilter(c: FilterableConversation, f: InboxServerFilter): boolean {
  const term = (f.term ?? '').trim().toLowerCase();
  if (term) {
    const digits = term.replace(/\D/g, '');
    const nameMatch = (c.contactName ?? '').toLowerCase().includes(term);
    const phoneMatch = digits.length >= 2 && c.contactPhone.includes(digits);
    if (!nameMatch && !phoneMatch) return false;
  }
  if (f.tagIds?.length && !c.tags.some((t) => f.tagIds?.includes(t.id))) return false;
  const range = dayRange(f);
  if (range) {
    const k = brDayKey(c.createdAt);
    if (k < range.from || k > range.to) return false;
  }
  if (f.labelId && c.kanbanLabelId !== f.labelId) return false;
  if (f.numberId && c.numberId !== f.numberId) return false;
  if (f.queuedOnly && c.status !== 'queued') return false;
  return true;
}

/**
 * O delta trouxe conversa que ENTRA ou SAI do resultado filtrado (casa com o
 * filtro e não está nele, ou está nele e deixou de casar)? Só aí vale rebuscar
 * no banco (o total muda). Quem está no resultado e continua casando já é
 * atualizado pela fusão do delta, sem ida ao banco.
 */
export function filterResultChanged(
  changed: readonly FilterableConversation[],
  result: readonly { contactId: string }[],
  f: InboxServerFilter,
): boolean {
  if (!changed.length) return false;
  const inResult = new Set(result.map((c) => c.contactId));
  // O banco ignora termo com 1 caractere: a comparação também.
  const serverSide: InboxServerFilter = { ...f, term: normalizeFilterTerm(f.term) };
  return changed.some((c) => inResult.has(c.contactId) !== matchesInboxFilter(c, serverSide));
}

type ActivityRow = { contactId: string; lastMessageAt: string };

function activityOf(row: { lastMessageAt: string }): number {
  const t = Date.parse(row.lastMessageAt);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/**
 * Sobrepõe ao resultado filtrado a versão da LISTA VIVA da mesma conversa
 * quando ela é mais nova (`lastMessageAt` maior): a mensagem que chegou entre
 * uma rebusca e outra aparece sem esperar o banco. Não acrescenta conversa
 * (quem entra no filtro só entra pela rebusca) e não duplica. Com troca, a
 * ordem volta a ser a da última mensagem, a do servidor. Nada a trocar → a
 * MESMA referência.
 */
export function mergeLiveIntoFiltered<T extends ActivityRow>(filtered: T[], live: readonly T[]): T[] {
  if (!filtered.length || !live.length) return filtered;
  const liveByContact = new Map(live.map((c) => [c.contactId, c]));
  let changed = false;
  const out = filtered.map((c) => {
    const fresh = liveByContact.get(c.contactId);
    if (fresh && fresh !== c && activityOf(fresh) > activityOf(c)) {
      changed = true;
      return fresh;
    }
    return c;
  });
  if (!changed) return filtered;
  // sort estável: no empate fica a ordem do servidor.
  return out.sort((a, b) => activityOf(b) - activityOf(a));
}

/** "Carregar mais": a página seguinte no fim, sem repetir quem já está (a lista anda entre uma página e outra). */
export function appendFilterPage<T extends { contactId: string }>(current: T[], page: readonly T[]): T[] {
  if (!page.length) return current;
  const known = new Set(current.map((c) => c.contactId));
  const extra = page.filter((c) => !known.has(c.contactId));
  return extra.length ? [...current, ...extra] : current;
}

/**
 * Rebusca da 1ª página (a cada mudança relevante, no máximo a cada 30 s) sem
 * perder as páginas que o "Carregar mais" já trouxe: a página nova + das
 * antigas só as MAIS VELHAS que o fim dela (as páginas seguintes). Quem estava
 * na faixa da 1ª página e saiu do filtro some; quem subiu vem na página nova.
 * Página nova incompleta = o resultado inteiro cabe nela.
 */
export function mergeRefreshedFirstPage<T extends ActivityRow>(current: readonly T[], fresh: T[], pageSize: number): T[] {
  if (fresh.length < pageSize || !fresh.length) return fresh;
  const boundary = activityOf(fresh[fresh.length - 1]);
  const seen = new Set(fresh.map((c) => c.contactId));
  const tail = current.filter((c) => !seen.has(c.contactId) && activityOf(c) < boundary);
  return tail.length ? [...fresh, ...tail] : fresh;
}
