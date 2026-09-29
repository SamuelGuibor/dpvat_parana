import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { loadCopilot } from '@/app/_shared/lib/whatsapp/copilot-data';
import type { CopilotResponse } from '@/app/_shared/lib/whatsapp/copilot-types';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Coluna Copiloto do inbox: ficha do cliente + documentos numa ida só.
// GET /api/whatsapp/inbox/copilot/<contactId> → { clientInfo, documents }
//
// Substitui 2 server actions em série a cada abertura de conversa
// (getClientInfo e depois listClientDocuments, cada uma relendo o contato),
// que ficavam na fila SERIAL de actions da aba na frente do clique do
// atendente (auditoria de 24/09/2026, THR-9).
//
// Acesso: `teamRoute` (cargo do banco + trava de IP). Rota da equipe: NÃO
// entra em allowlist do middleware — a resposta tem CPF e RG. `noStoreJson`
// (private, no-store): nada de cache no navegador nem na CDN.
//
// Tem efeito colateral na 1ª abertura de quem tem card pelo telefone (vínculo,
// resumo no card, rascunhos migrados, nome alinhado), idempotente: o SWR pode
// repetir a chamada (ver `loadCopilot`).

export const dynamic = 'force-dynamic';

// PERMANENTE, mesmo com o resumo de vínculo fora do caminho da resposta: o
// resumo roda por `runAfterResponse` (waitUntil), e o waitUntil continua
// limitado pelo maxDuration da função. Sem este teto o padrão da Vercel é
// curto e cortaria o resumo (timeout de 30 s no micro) — o comentário no card
// e o log wa_summary com metadata.usage sumiriam, com a IA já paga.
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { contactId: string } }) {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  const contactId = (params.contactId ?? '').trim();
  if (!contactId) return noStoreJson({ error: 'contactId vazio.' }, { status: 400 });

  try {
    const body: CopilotResponse | null = await loadCopilot(contactId, {
      id: auth.ctx.userId,
      name: auth.ctx.name ?? 'Atendente',
    });
    if (!body) return noStoreJson({ error: 'Contato não encontrado.' }, { status: 404 });
    return noStoreJson(body);
  } catch (err) {
    // Texto próprio em vez do 500 vazio do Next: a ficha mostra o aviso com
    // "Tentar de novo" e mantém o que já tinha (jsonFetcher + SWR).
    console.error('[WA copiloto] falha ao carregar a ficha e os documentos:', contactId, err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}
