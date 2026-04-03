import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nome, telefone, evento, equipe, hours, channel } = body;
    console.log(nome, telefone, evento)
    if (!telefone || !evento) {
      return NextResponse.json(
        { error: 'Telefone e evento são obrigatórios' },
        { status: 400 }
      );
    }
    

    const hoursNumber = parseInt(hours, 10);
    const executeAt = new Date(Date.now() + hoursNumber * 60 * 60 * 1000);

    const delayHours = (hours || 0);

    // const notifyAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    // ou em minutos para testar primeiro:

    // const mensagemPersonalizada = `"${nome || 'Cliente'}" com o telefone "${telefone}", será notificada em "${delayHours}h" "@${equipe || 'equipe'}"`;

    // Salva tudo que precisamos
    await db.discord.create({
      data: {
        message: equipe,
        channelId: channel,
        executeAt: executeAt,
        nome: nome || null,
        telefone: telefone,
        hours: delayHours,
      },
    });

    console.log(`✅ Notificação agendada para ${hoursNumber}h no futuro (executeAt: ${executeAt})`);

    

    if (evento === 'contratado') {
      const userExists = await db.user.findFirst({
        where: {
          telefone,
        },
      });

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
