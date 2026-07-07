import { NextResponse } from 'next/server';
import { db } from '../../../_shared/lib/prisma';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { name, color, timeLimitDays } = await req.json();
    const updated = await db.label.update({
      where: { id: params.id },
      data: { name, color, timeLimitDays: timeLimitDays ?? null },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao atualizar etiqueta' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await db.label.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao excluir etiqueta' }, { status: 500 });
  }
}