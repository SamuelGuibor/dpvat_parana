// Endereço e leitura da rota da coluna Copiloto do inbox (GET
// /api/whatsapp/inbox/copilot/<contactId>: ficha + documentos numa ida).
// Puro — sem React, sem banco — para o tests/copilot-api.test.ts e para o
// cliente importar sem arrastar o servidor.
//
// Por que uma rota GET (auditoria de 24/09/2026, THR-9): abrir a conversa
// fazia 2 server actions em série (ficha, depois documentos) na fila SERIAL da
// aba, na frente do clique do atendente.

import type { ClientInfoResult, CopilotResponse } from '@/app/_shared/lib/whatsapp/copilot-types';

export const INBOX_COPILOT_URL = '/api/whatsapp/inbox/copilot';

/** Rota da ficha + documentos de UM contato; também é a key do SWR (inbox e Copiloto dividem a entrada). */
export function copilotUrl(contactId: string): string {
  return `${INBOX_COPILOT_URL}/${encodeURIComponent(contactId)}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Corpo 2xx da rota → ficha + documentos. LANÇA quando o formato não é o
 * esperado (proxy, versão trocada no meio do deploy, `{ error }` com 200): o
 * SWR guarda o erro e mantém a ficha que já estava na tela, em vez de guardar
 * lixo como "cliente sem card".
 */
export function readCopilot(body: unknown): CopilotResponse {
  const info = isObject(body) ? body.clientInfo : undefined;
  if (
    !isObject(body)
    || !Array.isArray(body.documents)
    || !isObject(info)
    || typeof info.registered !== 'boolean'
    || typeof info.phone !== 'string'
    || !isObject(info.fields)
  ) {
    throw new Error('Resposta inválida da ficha do cliente.');
  }
  const clientInfo = info as unknown as ClientInfoResult;
  return {
    // aiFields ausente (resposta antiga) vira lista vazia: o selo "IA" some
    // em vez de quebrar a ficha.
    clientInfo: Array.isArray(clientInfo.aiFields) ? clientInfo : { ...clientInfo, aiFields: [] },
    documents: body.documents as CopilotResponse['documents'],
  };
}

/**
 * Troca a ficha e/ou os documentos no que está no cache (mutação que já
 * devolve o dado novo: salvar a ficha, anexar, subir, renomear, excluir).
 * `undefined` = ainda não há nada no cache: quem chama busca de novo em vez de
 * inventar uma ficha pela metade.
 */
export function patchCopilot(
  prev: CopilotResponse | undefined,
  patch: Partial<CopilotResponse>,
): CopilotResponse | undefined {
  if (!prev) return undefined;
  return {
    clientInfo: patch.clientInfo ?? prev.clientInfo,
    documents: patch.documents ?? prev.documents,
  };
}
