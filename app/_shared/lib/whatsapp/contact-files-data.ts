import { Prisma } from '@prisma/client';
import { db } from '@/app/_shared/lib/prisma';
import { trySignGetUrl } from '@/app/_shared/lib/s3-presign';
import { mediaDisplayName } from '@/app/_shared/utils/media-name';
import { parseDraftDocuments } from '@/app/_shared/utils/draft-documents';
import type {
  ContactFilesPage, ContactFilesQuery, ContactMediaItem, ContactNoteItem,
} from '@/app/_shared/utils/contact-files';

// Leituras das abas Arquivos e Notas do Copiloto: TODAS as mídias e notas do
// contato, paginadas do mais novo para o mais antigo (GET
// /api/whatsapp/inbox/contact-files).
//
// Sem "use server" e SEM guarda de acesso: quem chama já passou por
// `teamRoute` (cargo do banco + trava de IP). Nunca exponha numa rota ou
// action sem guarda.
//
// Por que existe (auditoria de 24/09/2026): as abas liam só a janela das 50
// mensagens da thread, e 31% dos documentos que o cliente manda ficavam fora
// dela. Por contato (o contato é por linha no multi-número), como a thread: a
// mídia do contato "gêmeo" na outra linha não entra. Servido pelo índice
// (contactId, createdAt); o maior contato medido em 09/2026 tinha 121 mídias
// recebidas e 39 notas.

/** Cursor (createdAt, id): duas mensagens no mesmo milissegundo não somem entre páginas. */
function cursorWhere(q: ContactFilesQuery): Prisma.WhatsAppMessageWhereInput {
  if (!q.before) return {};
  const before = new Date(q.before);
  return q.beforeId
    ? { OR: [{ createdAt: { lt: before } }, { createdAt: before, id: { lt: q.beforeId } }] }
    : { createdAt: { lt: before } };
}

const NEWEST_FIRST: Prisma.WhatsAppMessageOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

/**
 * Keys que já são documento do cliente: Document ATIVO do card (fora da
 * lixeira: a mídia cuja linha está na lixeira volta a aparecer para anexar, e
 * o anexo a restaura) ou, sem card, o rascunho da conversa.
 */
async function attachedKeysOf(contact: { userId: string | null; draftDocuments: unknown }): Promise<string[]> {
  if (!contact.userId) return parseDraftDocuments(contact.draftDocuments).map((d) => d.key);
  const docs = await db.document.findMany({
    where: { userId: contact.userId, deletedAt: null },
    select: { key: true },
  });
  return [...new Set(docs.map((d) => d.key))];
}

/**
 * Mídias do contato. `null` = contato não existe (404: excluído em outra aba).
 * `unattachedCount` só na 1ª página (o cabeçalho da seção), no mesmo filtro de
 * direção.
 */
export async function loadContactMedia(q: ContactFilesQuery): Promise<ContactFilesPage<ContactMediaItem> | null> {
  const contact = await db.whatsAppContact.findUnique({
    where: { id: q.contactId },
    select: { userId: true, draftDocuments: true },
  });
  if (!contact) return null;

  const firstPage = !q.before;
  const attachedKeys = q.onlyUnattached || firstPage ? await attachedKeysOf(contact) : [];

  const base: Prisma.WhatsAppMessageWhereInput = {
    contactId: q.contactId,
    deletedAt: null,
    mediaKey: { not: null },
    ...(q.direction === 'in' ? { direction: 'in' } : {}),
  };
  // notIn vazio no Prisma não casaria nada: só aplica com keys.
  const unattached: Prisma.WhatsAppMessageWhereInput = attachedKeys.length
    ? { AND: [base, { mediaKey: { notIn: attachedKeys } }] }
    : base;
  const listWhere = q.onlyUnattached ? unattached : base;

  const [rows, unattachedCount] = await Promise.all([
    db.whatsAppMessage.findMany({
      where: { AND: [listWhere, cursorWhere(q)] },
      orderBy: NEWEST_FIRST,
      take: q.limit + 1,
      select: { id: true, mediaKey: true, mediaType: true, direction: true, sentByBot: true, createdAt: true },
    }),
    firstPage ? db.whatsAppMessage.count({ where: unattached }) : Promise.resolve(null),
  ]);

  const page = rows.slice(0, q.limit);
  // Assinatura é HMAC local (sem ida à rede). Mesmo nome e modo da rota da
  // thread (inline + mediaDisplayName): a miniatura cai na mesma entrada do
  // cache do navegador que a bolha (media-url-cache.ts).
  const items = await Promise.all(page.map(async (m): Promise<ContactMediaItem> => {
    const key = m.mediaKey as string;
    const name = mediaDisplayName({ key, mediaType: m.mediaType, createdAt: m.createdAt });
    const signed = await trySignGetUrl(key, { inline: true, fileName: name });
    return {
      id: m.id,
      mediaKey: key,
      mediaType: m.mediaType,
      direction: m.direction,
      sentByBot: m.sentByBot,
      createdAt: m.createdAt.toISOString(),
      name,
      mediaUrl: signed?.url ?? null,
      mediaUrlExpiresAt: signed?.expiresAt ?? null,
    };
  }));

  return { items, hasMore: rows.length > q.limit, unattachedCount };
}

/** Notas internas do contato (as da equipe e as do bot ao transferir), fora as apagadas. */
export async function loadContactNotes(q: ContactFilesQuery): Promise<ContactFilesPage<ContactNoteItem>> {
  const rows = await db.whatsAppMessage.findMany({
    where: { AND: [{ contactId: q.contactId, internal: true, deletedAt: null }, cursorWhere(q)] },
    orderBy: NEWEST_FIRST,
    take: q.limit + 1,
    select: { id: true, body: true, authorId: true, sentByBot: true, createdAt: true },
  });
  const page = rows.slice(0, q.limit);

  const authorIds = [...new Set(page.map((r) => r.authorId).filter((id): id is string => !!id))];
  const authors = authorIds.length
    ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(authors.map((a) => [a.id, a.name ?? 'Atendente']));

  return {
    items: page.map((n) => ({
      id: n.id,
      body: n.body,
      authorId: n.authorId,
      authorName: n.authorId ? nameById.get(n.authorId) ?? null : n.sentByBot ? 'Bot' : null,
      sentByBot: n.sentByBot,
      createdAt: n.createdAt.toISOString(),
    })),
    hasMore: rows.length > q.limit,
    unattachedCount: null,
  };
}
