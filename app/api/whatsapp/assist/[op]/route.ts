import { noStoreJson, sameOrigin, teamRoute } from '@/app/_shared/lib/route-auth';
import {
  suggestReplyForContact, summarizeConversationForAgent, transcribeMessageAudio,
} from '@/app/_shared/lib/whatsapp/assist';
import { autoFillClientInfo } from '@/app/_shared/lib/whatsapp/ficha-ai';
import { assistIdField, isAssistOp, readAssistTarget } from '@/app/_shared/utils/assist-api';
import { assistFailure } from '@/app/_shared/utils/assist-errors';

// IA do Copiloto do inbox, fora da fila de server actions.
// POST /api/whatsapp/assist/<op>, op ∈ summary | suggest | transcribe | ficha
//   corpo { contactId } (summary, suggest, ficha) ou { messageId } (transcribe)
//   → { text } (summary, suggest, transcribe) ou o FichaAiResult (ficha)
//
// Por que rota (auditoria de 24/09/2026, DUR-4): como server action, cada
// pedido de 2-4 s (até 30 s com o micro travado) segurava a fila SERIAL de
// actions da aba, e enviar, tag e anexos esperavam a IA. E o erro da action
// chega mascarado em produção; aqui a mensagem PT-BR volta com o status do
// `AssistError` (assist-errors.ts).
//
// Acesso: `sameOrigin` (POST com cookie fora do mecanismo das server actions;
// o SameSite=Lax do NextAuth é a 1ª barreira, e gasto de IA não pode ser
// disparado por terceiros) + `teamRoute` (cargo do banco + trava de IP). Rota
// da equipe: NÃO entra em allowlist do middleware.
//
// A IA do Copiloto só AJUDA: nada aqui envia ao cliente nem mexe no cérebro.

export const dynamic = 'force-dynamic';

// A IA espera até 30 s (ASSIST_TIMEOUT_MS / TRANSCRIBE_TIMEOUT_MS) e a ficha
// baixa anexos do S3 antes do Haiku: 60 s dá folga sem cair no teto padrão
// da função, que cortaria a resposta (e o log com o usage) no meio.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { op: string } }) {
  const blocked = sameOrigin(req);
  if (blocked) return blocked;

  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  const op = params.op;
  if (!isAssistOp(op)) return noStoreJson({ error: 'Pedido de IA desconhecido.' }, { status: 404 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // corpo vazio ou não-JSON: cai no 400 abaixo
  }
  const id = readAssistTarget(op, body);
  if (!id) {
    return noStoreJson({ error: `Pedido inválido: falta o ${assistIdField(op)}.` }, { status: 400 });
  }

  const agent = { id: auth.ctx.userId, name: auth.ctx.name ?? 'Atendente' };
  try {
    switch (op) {
      case 'summary':
        return noStoreJson({ text: await summarizeConversationForAgent(id, agent) });
      case 'suggest':
        return noStoreJson({ text: await suggestReplyForContact(id, agent) });
      case 'transcribe':
        return noStoreJson({ text: await transcribeMessageAudio(id, agent) });
      case 'ficha':
        // Não lança: devolve `reason` quando nada foi preenchido (a UI mostra).
        return noStoreJson(await autoFillClientInfo(id));
    }
  } catch (err) {
    const failure = assistFailure(err);
    // 4xx é pedido do atendente (contato sumiu, sem áudio); o resto vai ao log
    // da Vercel com o erro cru, que não sai na resposta.
    if (failure.status >= 500) console.error(`[WA assist] ${op} falhou:`, id, err);
    return noStoreJson({ error: failure.error }, { status: failure.status });
  }
}
