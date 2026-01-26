import { NextResponse } from 'next/server';
import { getEventsByMonth } from '@/app/_actions/get-event-month';

export async function GET() {
  const data = await getEventsByMonth();
  return NextResponse.json(data);
}
