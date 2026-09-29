'use server';

import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { suggestReplyForContact, transcribeMessageAudio, summarizeConversationForAgent } from '@/app/_shared/lib/whatsapp/assist';
import { autoFillClientInfo, type FichaAiResult } from '@/app/_shared/lib/whatsapp/ficha-ai';

// Ações de agent-assist do inbox: a IA AJUDA o atendente (sugere resposta,
// transcreve áudio) — quem decide e envia é sempre o humano.
//
// Desde 26/09/2026 o bundle novo chama a IA do Copiloto por
// POST /api/whatsapp/assist/<op> (fora da fila serial de server actions da
// aba: enviar, tag e anexos não esperam mais os 2-4 s da IA). As actions
// abaixo ficam por UM deploy só para as abas abertas com o bundle antigo (que
// ainda chamam pelo id); no deploy seguinte, remover este arquivo E o
// `import '@/app/_actions/whatsapp/assist'` do WhatsAppInbox.tsx. Esse import
// de efeito colateral é o que mantém as actions no manifesto: o Next 14 só
// registra action de arquivo alcançável pelos imports da página, e a UI nova
// não importa mais nada daqui. O id da action sai do caminho do arquivo + nome
// do export: não mova nem renomeie nada aqui enquanto o wrapper existir.
// O guarda é o `requireTeam` (cargo do banco + trava de IP), no lugar do
// requireTeamMember local que lia só o cargo.

function agentOf(ctx: { userId: string; name: string | null }): { id: string; name: string } {
  return { id: ctx.userId, name: ctx.name ?? 'Atendente' };
}

/** @deprecated bundle antigo: a sugestão vem de POST /api/whatsapp/assist/suggest. */
export async function suggestWhatsAppReply(contactId: string): Promise<string> {
  const ctx = await requireTeam();
  return suggestReplyForContact(contactId, agentOf(ctx));
}

/** @deprecated bundle antigo: a transcrição vem de POST /api/whatsapp/assist/transcribe. */
export async function transcribeWhatsAppAudio(messageId: string): Promise<string> {
  const ctx = await requireTeam();
  return transcribeMessageAudio(messageId, agentOf(ctx));
}

/** @deprecated bundle antigo: o resumo do Copiloto vem de POST /api/whatsapp/assist/summary. */
export async function summarizeWhatsAppConversation(contactId: string): Promise<string> {
  const ctx = await requireTeam();
  return summarizeConversationForAgent(contactId, agentOf(ctx));
}

/** @deprecated bundle antigo: o "Preencher com IA" vem de POST /api/whatsapp/assist/ficha. */
export async function fillClientInfoWithAI(contactId: string): Promise<FichaAiResult> {
  await requireTeam();
  return autoFillClientInfo(contactId);
}
