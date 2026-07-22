import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { db } from '../../_shared/lib/prisma';
import { getSessionPermissions } from '../../_shared/lib/permissions-server';

export async function POST(req: Request) {
  try {
    const ctx = await getSessionPermissions();
    if (!ctx?.permissions.create_columns) {
      return NextResponse.json({ error: 'Você não tem permissão para criar colunas.' }, { status: 403 });
    }
    const { name, color, timeLimitDays } = await req.json();
    if (!name || !color) {
      return NextResponse.json({ error: 'name e color são obrigatórios' }, { status: 400 });
    }
    const lastLabel = await db.label.findFirst({
        orderBy: { order: "desc" },
        select: { order: true },
        });

        const label = await db.label.create({
        data: {
            name,
            color,
            timeLimitDays: timeLimitDays ?? null,
            order: (lastLabel?.order ?? -1) + 1,
        },
        });
    revalidateTag('labels');
    return NextResponse.json(label, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao criar etiqueta' }, { status: 500 });
  }
}