// Pasta do rail do inbox em que cada conversa ENCERRADA cai, pelo desfecho.
// Pura (sem React e sem banco) para o `groups` do WhatsAppInbox e para
// tests/inbox-folders.test.ts.
//
// 'outros' é rede de segurança (auditoria de 24/09/2026): conversa encerrada
// com categoria sem pasta (o churn, antes da pasta própria, ou uma categoria
// nova do cérebro) não aparecia em lugar nenhum, e com tag ou busca ativa o
// contador "N resultados" dizia um número e a lista mostrava menos.

import type { InboxFolderKey } from './inbox-view-state';

export type ClosedFolderKey =
  | Extract<InboxFolderKey, 'qualified' | 'unqualified' | 'churn' | 'sem_resposta' | 'perguntas' | 'novo_acidente' | 'transferido' | 'descartado'>
  | 'outros';

// Map (e não objeto literal): categoria vinda do banco não pode casar com
// "constructor"/"toString" herdados.
const FOLDER_BY_CATEGORY = new Map<string, ClosedFolderKey>([
  ['qualificado', 'qualified'],
  ['nao_qualificado', 'unqualified'],
  ['contratado_perdido', 'churn'],
  ['sem_resposta', 'sem_resposta'],
  ['perguntas', 'perguntas'],
  ['novo_acidente', 'novo_acidente'],
  ['transferido', 'transferido'],
  ['descartado', 'descartado'],
]);

export function closedFolderOf(c: { closeCategory: string | null; qualified: boolean | null }): ClosedFolderKey {
  const category = c.closeCategory;
  // Encerradas antes do closeCategory existir: fallback pelo `qualified`
  // antigo (true → qualificada, senão → não qualificada).
  if (!category) return c.qualified === true ? 'qualified' : 'unqualified';
  // Sub-motivos dinâmicos (nq_*) são todos "não qualificado".
  if (category.startsWith('nq_')) return 'unqualified';
  return FOLDER_BY_CATEGORY.get(category) ?? 'outros';
}
