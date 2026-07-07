import { NextRequest, NextResponse } from 'next/server';
import { fetchBotconversaAll } from '@/app/_shared/lib/db/botconversa';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const range = from && to
    ? { from: new Date(from), to: new Date(to) }
    : undefined;

  const data = await fetchBotconversaAll(range);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
