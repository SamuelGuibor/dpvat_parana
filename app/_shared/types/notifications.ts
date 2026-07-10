export interface DbNotification {
  id: string;
  recipientId: string;
  authorId: string;
  authorName: string;
  message: string;
  targetName: string
  commentId: string | null;
  userId: string | null;
  processId: string | null;
  // Notificações de WhatsApp: contato da conversa (clique abre o inbox).
  contactId: string | null;
  read: boolean;
  createdAt: Date;
}
