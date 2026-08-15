// Quem pode ver/corrigir o ponto dos outros.
//
// A regra oficial é a permissão `manage_ponto`. A allowlist abaixo é a
// compatibilidade com o mecanismo anterior (IDs chumbados no componente da
// aba de Ponto): ela SÓ CONCEDE, nunca restringe, e existe para ninguém
// perder acesso na virada. Pode sair quando esses IDs tiverem a permissão.

import type { PermissionMap } from './permissions';

const LEGACY_PONTO_IDS = new Set([
  'cmazuwrcj0000iav499hqf5ij',
  'cmazo6j870000ia0gw5ppb486',
  'cmqp55x1b0007l404d00r4gy8',
  'cmqp5w7hd000dl404atfj5mrd',
]);

export function canManagePonto(userId: string, permissions: PermissionMap): boolean {
  return permissions.manage_ponto || LEGACY_PONTO_IDS.has(userId);
}
