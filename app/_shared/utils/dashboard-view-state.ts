// Navegação do Espaço de Trabalho e da Gestão Estratégica que sobrevive à
// troca de aba da nova-dash e ao F5.
//
// Auditoria de 25/09/2026 (PAINEL-4): trocar o período devolvia o gestor para
// a aba Analytics, e voltar do Kanban reabria o Espaço de Trabalho em "Meu
// Espaço" (as abas da nova-dash desmontam o conteúdo). A seção e a aba ficam no
// sessionStorage (por aba do navegador; some ao fechar a aba).
//
// Nada aqui é estado crítico: storage bloqueado ou valor desconhecido (outra
// versão do código, DevTools) = cai no padrão, nunca erro na tela.

/** O que a navegação precisa do Storage (o sessionStorage real ou um falso nos testes). */
export type ViewStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Chave do sessionStorage com a aba da Gestão Estratégica. */
export const STRATEGIC_TAB_STORAGE_KEY = 'strategic-tab';

/**
 * Abas da Gestão Estratégica que podem ser restauradas. O Calendário fica de
 * FORA de propósito: a aba ainda não é visível (trabalho em andamento), e
 * restaurá-la abriria um conteúdo sem gatilho na barra.
 */
export const STRATEGIC_TABS = ['analytics', 'fluxo', 'chatbot', 'form-leads'] as const;
export type StrategicTab = (typeof STRATEGIC_TABS)[number];
export const DEFAULT_STRATEGIC_TAB: StrategicTab = 'analytics';

/** Chave do sessionStorage com a seção do Espaço de Trabalho. */
export const WORKSPACE_SECTION_STORAGE_KEY = 'workspace-section';

/**
 * Seções do Espaço de Trabalho (o `WorkspaceSection` da sidebar deriva
 * daqui). A guarda por permissão continua no `Workspace` (`effective`).
 */
export const WORKSPACE_SECTIONS = [
  'meu-espaco', 'chat', 'revisao-ia', 'gestao', 'dashboard', 'custos', 'numeros', 'seguranca',
] as const;
export type WorkspaceSectionKey = (typeof WORKSPACE_SECTIONS)[number];
export const DEFAULT_WORKSPACE_SECTION: WorkspaceSectionKey = 'meu-espaco';

/** Seções que não voltam por restauração: o chat geral está desligado. */
const NON_RESTORABLE_SECTIONS: ReadonlySet<WorkspaceSectionKey> = new Set(['chat']);

function pick<T extends string>(raw: string | null | undefined, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/** Valor salvo → aba conhecida, ou null (nada salvo, valor estranho, Calendário). */
export function parseStrategicTab(raw: string | null | undefined): StrategicTab | null {
  return pick(raw, STRATEGIC_TABS);
}

/**
 * Aba que a tela mostra: a aba Chatbot só existe para a allowlist do painel
 * (`canViewChatbot` da carga única). Sem ela, cai em Analytics — a UI só
 * esconde; o guard de verdade é o do servidor.
 */
export function visibleStrategicTab(tab: StrategicTab, canViewChatbot: boolean): StrategicTab {
  return tab === 'chatbot' && !canViewChatbot ? DEFAULT_STRATEGIC_TAB : tab;
}

/** Valor salvo → seção restaurável, ou null (nada salvo, valor estranho, chat desligado). */
export function parseWorkspaceSection(raw: string | null | undefined): WorkspaceSectionKey | null {
  const section = pick(raw, WORKSPACE_SECTIONS);
  return section && !NON_RESTORABLE_SECTIONS.has(section) ? section : null;
}

/** O sessionStorage do navegador, ou null (SSR, ou acesso bloqueado, que lança SecurityError). */
export function browserViewStorage(): ViewStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Lê uma chave sem nunca lançar (storage bloqueado = null). */
export function readViewValue(storage: ViewStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Grava uma chave sem nunca lançar (cota cheia ou storage bloqueado: só não lembra). */
export function writeViewValue(storage: ViewStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // A tela só não lembra a navegação.
  }
}
