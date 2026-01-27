import { db } from '@/app/_lib/prisma';
import { NextResponse } from 'next/server';

interface Params {
  params: {
    id: string;
  };
}

export async function PUT(req: Request, { params }: Params) {
  const body = await req.json();

  const item = await db.botconversa.update({
    where: {
      id: params.id,
    },
    data: body,
  });

  return NextResponse.json(item);
}

export async function DELETE(_: Request, { params }: Params) {
  await db.botconversa.delete({
    where: {
      id: params.id,
    },
  });

  return NextResponse.json({ success: true });
}
