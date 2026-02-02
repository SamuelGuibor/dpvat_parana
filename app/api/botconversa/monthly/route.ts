import { NextResponse } from 'next/server';
import { getEventsByMonth } from '@/app/_actions/get-event-month';
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getEventsByMonth();
  return NextResponse.json(data);
}
