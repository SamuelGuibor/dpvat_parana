import { NextRequest, NextResponse } from 'next/server';
import { fetchEventsCount } from '@/app/_shared/lib/db/botconversa';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const range = from && to
    ? { from: new Date(from), to: new Date(to) }
    : undefined;

  const counts = await fetchEventsCount(range);
  return NextResponse.json(counts, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
