import { NextResponse } from 'next/server';
import { getEventsCount } from '@/app/_actions/get-contagens';

export async function GET() {
  const counts = await getEventsCount();
  return NextResponse.json(counts);
}
