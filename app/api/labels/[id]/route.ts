import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { db } from '../../../_shared/lib/prisma';
import { getSessionPermissions } from '../../../_shared/lib/permissions-server';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getSessionPermissions();
    if (!ctx?.permissions.edit_columns) {
      return NextResponse.json({ error: 'Você não tem permissão para editar colunas.' }, { status: 403 });
    }
    const { name, color, timeLimitDays } = await req.json();
    const updated = await db.label.update({
      where: { id: params.id },
      data: { name, color, timeLimitDays: timeLimitDays ?? null },
    });
    revalidateTag('labels');
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao atualizar etiqueta' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getSessionPermissions();
    if (!ctx?.permissions.delete_columns) {
      return NextResponse.json({ error: 'Você não tem permissão para excluir colunas.' }, { status: 403 });
    }
    await db.label.delete({ where: { id: params.id } });
    revalidateTag('labels');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao excluir etiqueta' }, { status: 500 });
  }
}