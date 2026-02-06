import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { nome, telefone, evento } = body;

    if (!telefone || !evento) {
      return NextResponse.json(
        { error: 'Telefone e evento são obrigatórios' },
        { status: 400 }
      );
    }

    const existing = await db.botconversa.findFirst({
      where: { telefone },
    });

    // 👉 Se já existir no botconversa
    if (existing) {
      if (existing.evento !== evento) {
        await db.botconversa.update({
          where: { id: existing.id },
          data: {
            evento,
          },
        });
      }

      return NextResponse.json({ success: true, updated: true });
    }

    // 👉 Se NÃO existir → cria botconversa
    await db.botconversa.create({
      data: {
        nome,
        telefone,
        evento,
      },
    });

    // 👉 REGRA: só cria usuário se evento = enviou_documentos
    if (evento === 'enviou_documentos') {
      const userExists = await db.user.findFirst({
        where: {
          telefone,
        },
      });

      // 👉 Só cria se ainda não existir
      if (!userExists) {
        await db.user.create({
          data: {
            name: nome,
            email: `inserir_email-${nome}@gmail.com`,
            telefone,
            role: 'Gerar Procuração Automática',
            password: 'segurosparana1',
          },
        });
      }
    }

    return NextResponse.json({ success: true, created: true });

  } catch (err) {
    console.error('Erro webhook BotConversa', err);

    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    );
  }
}
