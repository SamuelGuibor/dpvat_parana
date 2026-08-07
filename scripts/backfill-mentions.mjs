// Backfill da Caixa de Menções e Tarefas a partir das notificações do sino.
//
// Serve para as menções criadas ANTES do deploy da caixa (o código antigo só
// gravava a Notification). É idempotente: usa o id da notificação como id da
// menção, então rodar de novo não duplica nada.
//
//   node -r dotenv/config scripts/backfill-mentions.mjs
//
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

/** Mesma limpeza do app (app/_shared/lib/mention-inbox.ts). */
function cleanExcerpt(text, max = 500) {
  const clean = (text ?? '')
    .replace(/@\[(.+?)\]\((.+?)\)/g, '@$1')
    .replace(/\[\[[A-Z_]+\|[^\]]*\]\]/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const users = new Set((await db.user.findMany({ select: { id: true } })).map((u) => u.id));

// 1) Menções em comentários de card — o trecho vem do texto do comentário.
const commentNotifs = await db.notification.findMany({
  where: { commentId: { not: null } },
  select: {
    id: true, recipientId: true, authorId: true, authorName: true, message: true,
    commentId: true, userId: true, processId: true, targetName: true, read: true, createdAt: true,
  },
});

const commentIds = [...new Set(commentNotifs.map((n) => n.commentId))];
const comments = await db.comment.findMany({
  where: { id: { in: commentIds } },
  select: { id: true, text: true },
});
const textById = new Map(comments.map((c) => [c.id, c.text]));

const fromComments = commentNotifs
  .filter((n) => users.has(n.recipientId))
  .map((n) => ({
    id: n.id,
    recipientId: n.recipientId,
    authorId: n.authorId,
    authorName: n.authorName,
    source: 'comment',
    excerpt: cleanExcerpt(textById.get(n.commentId) ?? n.message) || '(sem texto)',
    commentId: n.commentId,
    userId: n.userId,
    processId: n.processId,
    targetName: n.targetName,
    status: n.read ? 'ACK' : 'PENDING',
    ackAt: n.read ? n.createdAt : null,
    createdAt: n.createdAt,
  }));

// 2) Menções no chat da equipe (não têm commentId; identificadas pelo alvo).
const chatNotifs = await db.notification.findMany({
  where: { commentId: null, targetName: 'Chat da equipe' },
  select: {
    id: true, recipientId: true, authorId: true, authorName: true,
    message: true, targetName: true, read: true, createdAt: true,
  },
});

const fromChat = chatNotifs
  .filter((n) => users.has(n.recipientId))
  .map((n) => ({
    id: n.id,
    recipientId: n.recipientId,
    authorId: n.authorId,
    authorName: n.authorName,
    source: 'chat',
    excerpt: cleanExcerpt(n.message) || '(sem texto)',
    targetName: n.targetName,
    status: n.read ? 'ACK' : 'PENDING',
    ackAt: n.read ? n.createdAt : null,
    createdAt: n.createdAt,
  }));

const res = await db.mention.createMany({
  data: [...fromComments, ...fromChat],
  skipDuplicates: true,
});

const total = await db.mention.count();
const pendentes = await db.mention.count({ where: { status: 'PENDING' } });
console.log(`inseridas agora: ${res.count}`);
console.log(`caixa hoje: ${total} menções (${pendentes} pendentes)`);

await db.$disconnect();
