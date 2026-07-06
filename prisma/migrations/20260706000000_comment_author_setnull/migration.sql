-- Comment.authorId: permitir NULL e SetNull ao deletar o autor (authorName é preservado)
ALTER TABLE "Comment" ALTER COLUMN "authorId" DROP NOT NULL;

ALTER TABLE "Comment" DROP CONSTRAINT "Comment_authorId_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Comment.userId: comentários feitos NO card do user somem junto com o user
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_userId_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notification.recipientId: notificações do destinatário somem junto com ele
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_recipientId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
