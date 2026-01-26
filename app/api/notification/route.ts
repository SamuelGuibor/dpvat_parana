import { NextResponse } from 'next/server';
import { db } from '@/app/_lib/prisma';

export async function GET() {
  const notifications = await db.notification.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(notifications, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
