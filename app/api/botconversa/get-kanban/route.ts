import { db } from '@/app/_lib/prisma';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await db.botconversa.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}