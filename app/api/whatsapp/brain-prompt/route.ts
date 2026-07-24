import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import {
  renderInstructions,
  type InstructionSection,
} from '@/app/_shared/lib/whatsapp/instructions';

// O CÉREBRO, servido para o microserviço.
//
// O bot.js busca esta rota no boot e a cada poucos minutos, monta o system
// prompt com o que vier e guarda em memória. Se a rota falhar, ele cai no texto
// hardcoded — nunca fica sem instrução.
//
// Por que uma rota do CRM em vez de o microserviço ler o S3 direto: assim as
// credenciais da AWS ficam num lugar só. O microserviço não precisa de chave da
// AWS nem do SDK — só do CHATBOT_SECRET que ele já tem.
//
// ⚠️ ESTABILIDADE DE BYTES: a resposta alimenta o bloco cacheado do system
// prompt na Anthropic, e o cache é casamento de prefixo byte a byte. O texto é
// montado por renderInstructions() (ordenação determinística) e só muda quando
// alguém publica uma versão nova. Não adicione timestamp nem nada volátil ao
// campo `rendered` — derrubaria o cache a cada chamada.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CHATBOT_SECRET ?? '';
  if (!secret || req.headers.get('x-bot-secret') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const [instructions, playbook] = await Promise.all([
      db.whatsAppInstructions.findFirst({
        where: { status: 'publicado' },
        orderBy: { version: 'desc' },
      }),
      db.whatsAppPlaybook.findFirst({
        where: { status: 'publicado' },
        orderBy: { version: 'desc' },
      }),
    ]);

    // Sem instruções publicadas devolvemos null (e NÃO um texto vazio): é o
    // sinal para o microserviço usar o fallback hardcoded. Uma string vazia
    // seria interpretada como "prompt sem regras" e o bot atenderia sem
    // identidade nenhuma.
    const rendered = instructions
      ? renderInstructions(
          instructions.intro,
          instructions.sections as unknown as InstructionSection[],
        )
      : null;

    return NextResponse.json({
      instructions: instructions
        ? { version: instructions.version, rendered }
        : null,
      playbook: playbook
        ? {
            version: playbook.version,
            sections: playbook.sections,
            rulesCount: playbook.rulesCount,
          }
        : null,
    });
  } catch (err) {
    console.error('[BRAIN PROMPT] Falha ao servir o prompt:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
