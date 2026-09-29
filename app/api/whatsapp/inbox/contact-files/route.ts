import { NextRequest } from 'next/server';
import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { loadContactMedia, loadContactNotes } from '@/app/_shared/lib/whatsapp/contact-files-data';
import { parseContactFilesParams } from '@/app/_shared/utils/contact-files';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Abas Arquivos e Notas do Copiloto: TODAS as mídias ou notas do contato, não
// só as da janela de 50 mensagens da thread.
// GET /api/whatsapp/inbox/contact-files?contactId=&kind=media|notes
//     &direction=in|all&onlyUnattached=1&before=<ISO>&beforeId=<id>&limit=24
//   → { items, hasMore, unattachedCount }
// Mídia já vem com a URL de leitura assinada e o nome legível
// (mediaDisplayName), como na thread: nenhuma action por miniatura.
//
// GET, não server action: as actions de uma aba saem numa fila SERIAL, e a
// grade seguraria o clique do atendente (anexar, enviar, tag).
//
// Acesso: `teamRoute` (cargo do banco + trava de IP). Rota da equipe: NÃO
// entra em allowlist do middleware. `noStoreJson`: documento pessoal do
// cliente, nada de cache no navegador nem na CDN.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  const parsed = parseContactFilesParams(new URL(req.url).searchParams);
  if ('error' in parsed) return noStoreJson({ error: parsed.error }, { status: 400 });
  const q = parsed.value;

  try {
    if (q.kind === 'notes') return noStoreJson(await loadContactNotes(q));
    const body = await loadContactMedia(q);
    if (!body) return noStoreJson({ error: 'Contato não encontrado.' }, { status: 404 });
    return noStoreJson(body);
  } catch (err) {
    // Texto próprio em vez do 500 vazio do Next: a aba mostra o aviso com
    // "Tentar de novo" e mantém o que já tinha (jsonFetcher + SWR).
    console.error('[WA arquivos] falha ao carregar mídias/notas do contato:', q.contactId, q.kind, err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}
