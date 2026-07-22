import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { db } from '../../../_shared/lib/prisma';
import { getSessionPermissions } from '../../../_shared/lib/permissions-server';

export async function PUT(req: Request) {
  try {
    const ctx = await getSessionPermissions();
    if (!ctx?.permissions.edit_columns) {
      return NextResponse.json({ error: 'Você não tem permissão para reordenar colunas.' }, { status: 403 });
    }
    const { orderedIds } = await req.json() as { orderedIds: string[] };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ error: 'orderedIds é obrigatório' }, { status: 400 });
    }

    await db.$transaction(
      orderedIds.map((id, index) =>
        db.label.update({ where: { id }, data: { order: index } })
      )
    );

    revalidateTag('labels');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao reordenar etiquetas' }, { status: 500 });
  }
}
