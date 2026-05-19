import { NextResponse } from 'next/server';
import { fetchBotconversaAll } from '@/app/_lib/db/botconversa';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await fetchBotconversaAll();
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
