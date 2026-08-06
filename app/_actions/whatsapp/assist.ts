'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { suggestReplyForContact, transcribeMessageAudio, summarizeConversationForAgent } from '@/app/_shared/lib/whatsapp/assist';
import { autoFillClientInfo, type FichaAiResult } from '@/app/_shared/lib/whatsapp/ficha-ai';

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

/**
 * Resumo da conversa para a aba Copiloto — o texto volta pro atendente na
 * hora (diferente do resumo automático, que vira comentário no card).
 */
export async function summarizeWhatsAppConversation(contactId: string): Promise<string> {
  const me = await requireTeamMember();
  return summarizeConversationForAgent(contactId, me);
}

/**
 * Dispara na hora o preenchimento automático da ficha pela IA (o mesmo que
 * roda sozinho no webhook a cada mensagem nova do cliente). Serve pra
 * conversas antigas (anteriores ao recurso) e pra conferir por que nada foi
 * preenchido — o motivo volta pro atendente em vez de morrer no console.
 */
export async function fillClientInfoWithAI(contactId: string): Promise<FichaAiResult> {
  await requireTeamMember();
  return autoFillClientInfo(contactId);
}
