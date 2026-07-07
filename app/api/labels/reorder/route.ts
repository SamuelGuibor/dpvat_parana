import { NextResponse } from 'next/server';
import { db } from '../../../_shared/lib/prisma';

export async function PUT(req: Request) {
  try {
    const { orderedIds } = await req.json() as { orderedIds: string[] };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds é obrigatório' }, { status: 400 });
    }

    await db.$transaction(
      orderedIds.map((id, index) =>
        db.label.update({ where: { id }, data: { order: index } })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao reordenar etiquetas' }, { status: 500 });
  }
}
