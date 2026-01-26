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
  read: boolean;
  createdAt: Date;
}
