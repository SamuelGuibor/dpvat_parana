// app/api/botconversa/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log('📩 Recebi POST do BotConversa:', body);

  // await fetch('https://suaapi.com/registro', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(body),
  // });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ message: 'Webhook ativo 🚀' });
}
