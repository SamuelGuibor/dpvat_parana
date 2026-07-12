import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { hashPassword } from '@/app/_shared/lib/password';
import { verifyWebhookSecret } from '@/app/_shared/lib/webhook-auth';

async function notifyBot(record: unknown) {
  const url = process.env.BOT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(`${url}/webhook/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.BOT_WEBHOOK_SECRET || '',
      },
      body: JSON.stringify(record),
    });
  } catch (err) {
    console.error('Falha ao notificar bot:', err);
  }
}

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
    const { nome, telefone, evento, equipe, hours, channel } = body;
    console.log(nome, telefone, evento)
    if (!telefone || !evento) {
      return NextResponse.json(
        { error: 'Telefone e evento são obrigatórios' },
        { status: 400 }
      );
    }

    if (equipe && channel && hours) {
      const hoursNumber = parseInt(hours, 10);
      const executeAt = new Date(Date.now() + hoursNumber * 60 * 60 * 1000);

      const delayHours = (hours || 0);

      const discordRecord = await db.discord.create({
        data: {
          message: equipe,
          channelId: channel,
          executeAt: executeAt,
          nome: nome || null,
          telefone: telefone,
          hours: delayHours,
        },
      });

      notifyBot(discordRecord);
    }

    if (evento === 'contratado') {

      const executeAt = new Date(Date.now())

      const discordRecord = await db.discord.create({
        data: {
          message: equipe,
          channelId: channel,
          executeAt: executeAt,
          nome: nome || null,
          telefone: telefone,
        },
      });

      notifyBot(discordRecord);

      const [userExists, label] = await Promise.all([
        db.user.findFirst({ where: { telefone } }),
        db.label.findFirst({ where: { order: 0 } }),
      ]);

      const cardNumber = await nextCardNumber();

      if (!userExists) {
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
