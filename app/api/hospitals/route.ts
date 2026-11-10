import { readOnlyBlock, sameOrigin, teamRoute } from "@/app/_shared/lib/route-auth";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';

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

// Remover tira o nome do hospital de TODOS os cards: exige "Gerenciar hospitais"
// (até 09/11 bastava não ser somente leitura).
export async function DELETE(req: NextRequest) {
  const origin = sameOrigin(req);
  if (origin) return origin;
  const auth = await teamRoute('create_hospitals');
  if ('res' in auth) return auth.res;
  const blocked = await readOnlyBlock();
  if (blocked) return blocked;
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
