import { NextResponse } from 'next/server';
import { getEventsCount } from '@/app/_actions/get-contagens';
export const dynamic = 'force-dynamic';

export async function GET() {
  const counts = await getEventsCount();
  return NextResponse.json(counts);
}
