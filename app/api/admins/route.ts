import { NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';

export async function GET() {
  try {
    const admins = await db.user.findMany({
      where: { role: { in: ['ADMIN', 'ADMIN+', 'ADMIN++'] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });

    const list = admins
      .filter((a) => a.name && a.name.trim().length > 0)
      .map((a) => ({ id: a.id, display: a.name as string, role: a.role }));

    return NextResponse.json(list);
  } catch (err) {
    console.error('[ADMINS GET]', err);
    return NextResponse.json({ error: 'Erro ao buscar administradores' }, { status: 500 });
  }
}
