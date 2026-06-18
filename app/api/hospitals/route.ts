import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_lib/prisma';

export async function GET() {
  try {
    const [usersHospitals, processHospitals] = await Promise.all([
      db.user.findMany({
        where: { hospital: { not: null } },
        select: { hospital: true },
        distinct: ['hospital'],
      }),
      db.process.findMany({
        where: { hospital: { not: null } },
        select: { hospital: true },
        distinct: ['hospital'],
      }),
    ]);

    const set = new Set<string>();
    for (const row of [...usersHospitals, ...processHospitals]) {
      const value = row.hospital?.trim();
      if (value) set.add(value);
    }

    const hospitals = Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );

    return NextResponse.json(hospitals);
  } catch (err) {
    console.error('[HOSPITALS GET]', err);
    return NextResponse.json({ error: 'Erro ao buscar hospitais' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { name } = await req.json() as { name: string };
    if (!name?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

    await Promise.all([
      db.user.updateMany({ where: { hospital: name }, data: { hospital: null } }),
      db.process.updateMany({ where: { hospital: name }, data: { hospital: null } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[HOSPITALS DELETE]', err);
    return NextResponse.json({ error: 'Erro ao remover hospital' }, { status: 500 });
  }
}
