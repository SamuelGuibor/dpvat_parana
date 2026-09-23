-- Sino: as 50 últimas por usuário (recipientId + createdAt desc).
CREATE INDEX IF NOT EXISTS "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");
