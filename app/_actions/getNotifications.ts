'use server';

import { db } from '../_lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../_lib/auth';

export async function getNotifications() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error('Não autenticado');
  }

  return db.notification.findMany({
    where: {
      recipientId: session.user.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}
