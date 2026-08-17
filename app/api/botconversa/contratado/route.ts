import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { hashPassword } from '@/app/_shared/lib/password';
import { verifyWebhookSecret } from '@/app/_shared/lib/webhook-auth';
import { recordSectorTask } from '@/app/_shared/lib/sector-tasks';

async function nextCardNumber(): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('card_number_seq') AS nextval`);
  return Number(rows[0].nextval);
}

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req, 'BOTCONVERSA_WEBHOOK_SECRET')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json();
    console.log('Recebido webhook BotConversa:', body);
    const { nome, telefone, evento } = body;
    if (!telefone || !evento) {
      return NextResponse.json(
        { error: 'Telefone e evento são obrigatórios' },
        { status: 400 }
      );
    }

    if (evento === 'contratado') {
      // Fechamento vira tarefa na Caixa de Menções e Tarefas do setor
      // responsável (substitui o antigo aviso "NOVO CONTRATADO" do Discord).
      await recordSectorTask({
        kind: 'botconversa_contratado',
        authorName: 'BotConversa',
        source: 'botconversa',
        text: `Novo contratado 🎉 — ${nome || 'sem nome'} (${telefone}). Conferir o card e o contrato.`,
        targetName: `BotConversa · ${nome || telefone}`,
      });

      const [userExists, label] = await Promise.all([
        db.user.findFirst({ where: { telefone } }),
        db.label.findFirst({ where: { order: 0 } }),
      ]);

      if (!userExists) {
        const cardNumber = await nextCardNumber();
        await db.user.create({
          data: {
            name: nome,
            email: `inserir_email-${telefone}@gmail.com`,
            telefone,
            role: 'Filtro de Cartões',
            password: await hashPassword('segurosparana1'),
            cardNumber,
            ...(label && { labelId: label.id }),
          },
        });
      }
    }

    const existing = await db.botconversa.findFirst({
      where: { telefone },
    });

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

    await db.botconversa.create({
      data: {
        nome,
        telefone,
        evento,
      },
    });

    return NextResponse.json({ success: true, created: true });

  } catch (err) {
    console.error('Erro webhook BotConversa', err);

    return NextResponse.json(
      { error: 'Erro interno' },
      { status: 500 }
    );
  }
}
