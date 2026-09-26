import { NextRequest } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { trySignGetUrl } from '@/app/_shared/lib/s3-presign';
import { fileNameFromKey, isAllowedKeyPrefix } from '@/app/_shared/utils/s3-keys';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Histórico de uma conversa de WhatsApp (também é o polling de fallback do SWR,
// espelho de /api/chat/messages).
// GET /api/whatsapp/messages?contactId=<id>&after=<ISO>&before=<ISO>&limit=50
//   - after:  mensagens MAIS NOVAS que o ISO (polling incremental)
//   - before: mensagens MAIS ANTIGAS que o ISO (paginação "carregar anteriores")
// Cada mídia já vem com `mediaUrl` assinada (janela estável de 30 min, ver
// s3-presign.ts): a bolha nasce com o link, sem uma server action por anexo.
//
// Acesso: `teamRoute` (cargo do BANCO + trava de IP), não o role do JWT — que
// fica congelado até o próximo login e não passava pela trava. O cache de 30 s
// das permissões (e de 60 s da lista de IPs) deixa o custo no poll de 8 s em
// ~0. O cliente (`useWhatsAppMessages`) usa `jsonFetcher`, que trata o 403/500
// como erro e mantém a thread na tela: os dois precisam ir no MESMO deploy.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contactId');
  if (!contactId) {
    return noStoreJson({ error: 'contactId obrigatório' }, { status: 400 });
  }

  const after = searchParams.get('after');
  const before = searchParams.get('before');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

  try {
    const rows = await db.whatsAppMessage.findMany({
      where: {
        contactId,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, contactId: true, direction: true, body: true,
        mediaKey: true, mediaType: true, status: true, sentByBot: true,
        authorId: true, internal: true, createdAt: true,
        editedAt: true, deletedAt: true, transcript: true,
        replyToId: true, replyToBody: true, replyToDirection: true,
        waMessageId: true, reaction: true, reactionAuthorId: true,
      },
    });

    // Nome dos atendentes que aparecem na thread (mensagens "out" humanas).
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean))] as string[];
    const authors = authorIds.length
      ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(authors.map((a) => [a.id, a.name ?? 'Atendente']));

    // Assinatura é HMAC local (sem ida à rede): assina tudo em paralelo. O nome
    // do Content-Disposition é o mesmo que a bolha usa no fallback
    // (fileNameFromKey), para as duas URLs caírem na mesma entrada do cache do
    // navegador (media-url-cache.ts). Mensagem apagada não mostra a mídia.
    const ordered = rows.reverse();
    const signed = await Promise.all(
      ordered.map((m) =>
        m.mediaKey && !m.deletedAt && isAllowedKeyPrefix(m.mediaKey)
          ? trySignGetUrl(m.mediaKey, { inline: true, fileName: fileNameFromKey(m.mediaKey) })
          : null,
      ),
    );

    const messages = ordered.map((m, i) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      authorName: m.authorId ? nameById.get(m.authorId) ?? null : m.sentByBot ? 'Bot' : null,
      mediaUrl: signed[i]?.url ?? null,
      mediaUrlExpiresAt: signed[i]?.expiresAt ?? null,
    }));

    // hasMore: veio o bloco cheio → provavelmente há mais mensagens antigas.
    return noStoreJson({ messages, hasMore: rows.length === limit });
  } catch (err) {
    // Texto próprio em vez do 500 vazio do Next: a thread mostra o aviso e
    // mantém as mensagens que já tinha (jsonFetcher + SWR).
    console.error('[WA messages] falha ao carregar a thread:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}
