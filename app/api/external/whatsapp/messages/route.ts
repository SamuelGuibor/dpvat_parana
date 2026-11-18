import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/app/_shared/lib/prisma';
import { noStoreJson } from '@/app/_shared/lib/route-auth';
import { ApiAuthError, resolveApiToken } from '@/app/_shared/lib/api-token';
import { trySignGetUrl } from '@/app/_shared/lib/s3-presign';
import { runAfterResponse } from '@/app/_shared/lib/background';
import { createLog } from '@/app/_shared/lib/log';
import { reportCriticalError } from '@/app/_shared/lib/report-error';
import { CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';
import { fallbackCloseLabel } from '@/app/_shared/utils/close-tag-plan';
import { isAllowedKeyPrefix } from '@/app/_shared/utils/s3-keys';
import { mediaDisplayName } from '@/app/_shared/utils/media-name';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';
import {
  externalMessageAuthor,
  parseExternalMessagesQuery,
  publicInteractive,
  type ExternalMessagesQuery,
} from '@/app/_shared/utils/external-wa-messages';

// API EXTERNA (T-WOJYR): dados do lead e mensagens completas da conversa de
// WhatsApp por telefone, para sistema de fora do CRM (servidor a servidor).
// GET /api/external/whatsapp/messages?phone=5541999999999
//     &limit=100&before=<ISO>&after=<ISO>&numberId=<id>&messages=0|1&includeMedia=1
// Header: Authorization: Bearer crmapi_...   (tabela api_tokens; nunca na query)
// Documentação para quem integra: docs/api/whatsapp-messages.md.
//
// Sem sessão: "/api/external" está em PUBLIC_API_PREFIXES do middleware e a
// autenticação é o token, conferido aqui. Sem CORS (o token nunca vai ao
// navegador).
//
// Multi-número: o mesmo celular é um contato POR LINHA ([numberId, phone]),
// então a resposta traz uma conversa por linha; numberId filtra. Linha
// desativada continua legível.
//
// O que NUNCA sai daqui: segredos da linha (accessTokenEnc/appSecretEnc),
// ficha da IA (botMemory), rascunho da ficha (clientDraft), CPF do cadastro,
// payload cru do anúncio (adReferral/ctwaClid), nota interna, mensagem apagada
// e os campos internos do formulário (publicInteractive). Por isso todo
// select é explícito. O que o CLIENTE escreveu (texto e resposta de
// formulário) sai inteiro, por pedido do ticket — inclusive CPF/RG digitados.

export const dynamic = 'force-dynamic';
// runAfterResponse (log e lastUsedAt) só vive até o maxDuration.
export const maxDuration = 30;

const CONTACT_SELECT = {
  id: true,
  phone: true,
  name: true,
  numberId: true,
  userId: true,
  optedOut: true,
  importSource: true,
  createdAt: true,
  adPlatform: true,
  adSourceType: true,
  adSourceId: true,
  adHeadline: true,
  adSourceUrl: true,
  conversation: {
    select: {
      status: true,
      assignedToId: true,
      qualified: true,
      closeCategory: true,
      closedAt: true,
      botState: true,
      lastMessageAt: true,
      tags: {
        select: { createdAt: true, tag: { select: { name: true, color: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
} satisfies Prisma.WhatsAppContactSelect;

type ContactRow = Prisma.WhatsAppContactGetPayload<{ select: typeof CONTACT_SELECT }>;

const MESSAGE_SELECT = {
  id: true,
  waMessageId: true,
  direction: true,
  sentByBot: true,
  authorId: true,
  body: true,
  transcript: true,
  mediaKey: true,
  mediaType: true,
  status: true,
  interactive: true,
  replyToId: true,
  editedAt: true,
  createdAt: true,
} satisfies Prisma.WhatsAppMessageSelect;

type MessageRow = Prisma.WhatsAppMessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

/**
 * Bloco de mensagens de UM contato, em ordem cronológica.
 *  - sem cursor ou com `before`: as `limit` MAIS NOVAS (antes do cursor);
 *    para voltar, mande `before` = createdAt da primeira;
 *  - com `after`: as `limit` MAIS ANTIGAS depois do cursor (avançar sem pular
 *    nada); para seguir, mande `after` = createdAt da última.
 * Índice [contactId, createdAt]; sem distinct + orderBy (tabela grande).
 */
async function loadMessages(contactId: string, q: ExternalMessagesQuery): Promise<MessageRow[]> {
  const forward = q.after !== null;
  const rows = await db.whatsAppMessage.findMany({
    where: {
      contactId,
      // Nota interna é só da equipe; apagada saiu da conversa.
      internal: false,
      deletedAt: null,
      ...(q.before || q.after
        ? { createdAt: { ...(q.before ? { lt: q.before } : {}), ...(q.after ? { gt: q.after } : {}) } }
        : {}),
    },
    orderBy: { createdAt: forward ? 'asc' : 'desc' },
    take: q.limit,
    select: MESSAGE_SELECT,
  });
  return forward ? rows : rows.reverse();
}

/** Rótulo do desfecho em lote: mapa fixo → motivos `nq_*` da tabela → legível. */
async function closeLabels(categories: string[]): Promise<Map<string, string>> {
  const unknown = categories.filter((c) => !CLOSE_CATEGORY_LABELS[c] && c.startsWith('nq_'));
  const reasons = unknown.length
    ? await db.whatsAppCloseReason.findMany({ where: { key: { in: unknown } }, select: { key: true, label: true } })
    : [];
  const byKey = new Map(reasons.map((r) => [r.key, r.label]));
  return new Map(
    categories.map((c) => [c, CLOSE_CATEGORY_LABELS[c] ?? byKey.get(c) ?? fallbackCloseLabel(c)]),
  );
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await resolveApiToken(req);
  } catch (err) {
    if (err instanceof ApiAuthError) return noStoreJson({ error: err.message }, { status: err.status });
    await reportCriticalError('api_external_wa_messages_auth', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }

  const parsed = parseExternalMessagesQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return noStoreJson({ error: parsed.error }, { status: 400 });
  const q = parsed.query;

  const logCall = (total: number, conversas: number) =>
    runAfterResponse('api_wa_messages_log', () =>
      createLog({
        action: 'api_wa_messages',
        message: `API externa (${auth.label}) consultou a conversa de WhatsApp`,
        authorId: 'api-externa',
        authorName: `API externa: ${auth.label}`,
        metadata: { tokenId: auth.tokenId, phone: q.phone, conversas, total, messages: q.withMessages },
      }),
    );

  try {
    // Igualdade nas formas com/sem 9º dígito (índice [phone]); DDD fixo.
    const contacts: ContactRow[] = await db.whatsAppContact.findMany({
      where: { phone: { in: q.variants }, ...(q.numberId ? { numberId: q.numberId } : {}) },
      select: CONTACT_SELECT,
    });
    if (!contacts.length) {
      logCall(0, 0);
      return noStoreJson({ error: 'Nenhuma conversa de WhatsApp com este telefone.' }, { status: 404 });
    }

    // Lotes (sem N+1): linhas, pessoas (atendente + card) e rótulos de desfecho.
    const numberIds = [...new Set(contacts.map((c) => c.numberId).filter((v): v is string => !!v))];
    const userIds = [
      ...new Set(
        contacts.flatMap((c) => [c.userId, c.conversation?.assignedToId]).filter((v): v is string => !!v),
      ),
    ];
    const categories = [
      ...new Set(contacts.map((c) => c.conversation?.closeCategory).filter((v): v is string => !!v)),
    ];
    const [numbers, users, labels, threads] = await Promise.all([
      numberIds.length
        ? db.whatsAppNumber.findMany({
          where: { id: { in: numberIds } },
          // NUNCA accessTokenEnc/appSecretEnc.
          select: { id: true, label: true, displayPhone: true, active: true },
        })
        : [],
      userIds.length
        ? db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, cardNumber: true, archivedAt: true, label: { select: { name: true } } },
        })
        : [],
      closeLabels(categories),
      // Uma ida por contato (no máximo uma por linha da empresa).
      q.withMessages ? Promise.all(contacts.map((c) => loadMessages(c.id, q))) : null,
    ]);
    const numberById = new Map(numbers.map((n) => [n.id, n]));
    const userById = new Map(users.map((u) => [u.id, u]));

    // Mídia: URL assinada só a pedido (o arquivo nunca vem no body: 4,5 MB).
    // Assinatura é HMAC local, sem ida à rede.
    const authorIds = new Set<string>();
    threads?.forEach((rows) => rows.forEach((m) => m.authorId && authorIds.add(m.authorId)));
    const [authors, signed] = await Promise.all([
      authorIds.size
        ? db.user.findMany({ where: { id: { in: [...authorIds] } }, select: { id: true, name: true } })
        : [],
      q.withMessages && q.includeMedia && threads
        ? Promise.all(
          threads.map((rows) =>
            Promise.all(
              rows.map((m) =>
                m.mediaKey && isAllowedKeyPrefix(m.mediaKey)
                  ? trySignGetUrl(m.mediaKey, {
                    inline: true,
                    fileName: mediaDisplayName({ key: m.mediaKey, mediaType: m.mediaType, createdAt: m.createdAt }),
                  })
                  : null,
              ),
            ),
          ),
        )
        : null,
    ]);
    const authorName = new Map(authors.map((a) => [a.id, a.name ?? 'Atendente']));

    const conversas = contacts.map((c, ci) => {
      const conv = c.conversation;
      const linha = c.numberId ? numberById.get(c.numberId) ?? null : null;
      const cardUser = c.userId ? userById.get(c.userId) ?? null : null;
      const atendente = conv?.assignedToId ? userById.get(conv.assignedToId)?.name ?? null : null;
      const rows = threads?.[ci] ?? null;
      return {
        contactId: c.id,
        nome: c.name,
        telefone: c.phone,
        linha: linha
          ? { id: linha.id, label: linha.label, displayPhone: linha.displayPhone, active: linha.active }
          : null,
        tags: (conv?.tags ?? []).map((t) => ({ name: t.tag.name, color: t.tag.color, aplicadaEm: iso(t.createdAt) })),
        status: conv?.status ?? null,
        // Valor cru da conversa (null = nunca gravado), sem campo calculado.
        qualified: conv?.qualified ?? null,
        closeCategory: conv?.closeCategory ?? null,
        closeLabel: conv?.closeCategory ? labels.get(conv.closeCategory) ?? null : null,
        closedAt: iso(conv?.closedAt),
        atendente,
        botState: conv?.botState ?? null,
        ultimaMensagemEm: iso(conv?.lastMessageAt),
        primeiroContatoEm: iso(c.createdAt),
        optedOut: c.optedOut,
        importSource: c.importSource,
        origem: c.adSourceId || c.adPlatform || c.adSourceUrl
          ? {
            adPlatform: c.adPlatform,
            adSourceType: c.adSourceType,
            adSourceId: c.adSourceId,
            adHeadline: c.adHeadline,
            adSourceUrl: c.adSourceUrl,
          }
          : null,
        card: cardUser?.cardNumber != null
          ? { cardNumber: cardUser.cardNumber, coluna: cardUser.label?.name ?? null, arquivadoEm: iso(cardUser.archivedAt) }
          : null,
        ...(rows
          ? {
            // Bloco cheio → provavelmente há mais na direção do cursor.
            hasMore: rows.length === q.limit,
            mensagens: rows.map((m, mi) => {
              const autor = externalMessageAuthor(m);
              const media = signed?.[ci]?.[mi] ?? null;
              return {
                id: m.id,
                waMessageId: m.waMessageId,
                direction: m.direction,
                autor,
                authorName: autor === 'equipe' && m.authorId ? authorName.get(m.authorId) ?? null : autor === 'bot' ? 'Bot' : null,
                body: m.body,
                transcript: m.transcript,
                mediaType: m.mediaType,
                hasMedia: !!m.mediaKey,
                ...(q.includeMedia
                  ? { mediaUrl: media?.url ?? null, mediaUrlExpiresAt: media?.expiresAt ?? null }
                  : {}),
                status: m.status,
                interactive: publicInteractive(m.interactive),
                replyToId: m.replyToId,
                editedAt: iso(m.editedAt),
                createdAt: m.createdAt.toISOString(),
              };
            }),
          }
          : {}),
      };
    });

    // Mais recente primeiro (o lead costuma estar na linha da última conversa).
    conversas.sort((a, b) => (b.ultimaMensagemEm ?? '').localeCompare(a.ultimaMensagemEm ?? ''));

    logCall(threads?.reduce((n, rows) => n + rows.length, 0) ?? 0, conversas.length);
    return noStoreJson({ phone: q.phone, conversas });
  } catch (err) {
    await reportCriticalError('api_external_wa_messages', err, { metadata: { tokenId: auth.tokenId } });
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}
