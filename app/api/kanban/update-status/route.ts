import { NextResponse } from 'next/server';
import { db } from '@/app/_lib/prisma';
import { revalidatePath } from 'next/cache'

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      id,
      status,
      isProcess,
    } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      );
    }

    const now = new Date();

    if (isProcess) {
      await db.process.update({
        where: { id },
        data: {
          role: status,
          statusStartedAt: now,
        },
      });
    } else {
      await db.user.update({
        where: { id },
        data: {
          role: status,
          statusStartedAt: now,
        },
      });
    }

    revalidatePath('/nova-dash')

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    );
  }
}
