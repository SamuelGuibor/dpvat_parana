'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { suggestReplyForContact, transcribeMessageAudio } from '@/app/_shared/lib/whatsapp/assist';

// Ações de agent-assist do inbox: a IA AJUDA o atendente (sugere resposta,
// transcreve áudio) — quem decide e envia é sempre o humano.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

async function requireTeamMember(): Promise<{ id: string; name: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true },
  });
  if (!me || !TEAM_ROLES.includes(me.role)) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
  return { id: me.id, name: me.name ?? 'Atendente' };
}

/**
 * Pede à IA uma sugestão de resposta para a conversa. O texto volta pro
 * composer — o atendente revisa, edita e envia (nada vai direto pro cliente).
 */
export async function suggestWhatsAppReply(contactId: string): Promise<string> {
  const me = await requireTeamMember();
  return suggestReplyForContact(contactId, me);
}

/**
 * Transcreve um áudio da thread (Gemini, mesmo pipeline do bot). O resultado
 * fica salvo na mensagem — cliques seguintes (de qualquer atendente) são grátis.
 */
export async function transcribeWhatsAppAudio(messageId: string): Promise<string> {
  const me = await requireTeamMember();
  return transcribeMessageAudio(messageId, me);
}
