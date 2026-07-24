// Fonte única de verdade de papéis e permissões da equipe.
//
// Modelo: três cargos (ADMIN < ADMIN+ < ADMIN++). Cada cargo tem um conjunto
// padrão de permissões; o ADMIN++ (Super Admin) tem tudo sempre e é o único
// que pode alterar cargos e conceder/revogar permissões individuais dos
// demais (overrides gravados em User.permissions como JSON parcial).
//
// Este arquivo é puro (sem banco/sessão) para poder ser importado tanto no
// client (UI de gestão) quanto no server. Helpers com banco/sessão ficam em
// permissions-server.ts.

export const TEAM_ROLES = ["ADMIN", "ADMIN+", "ADMIN++"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export function isTeamRole(role?: string | null): role is TeamRole {
  return !!role && (TEAM_ROLES as readonly string[]).includes(role);
}

export const PERMISSION_DEFS = [
  {
    key: "view_archived",
    label: "Ver Arquivados",
    description: "Acessa a aba Arquivados e pode restaurar cards.",
  },
  {
    key: "archive_cards",
    label: "Arquivar cards",
    description: "Pode arquivar e desarquivar cards do kanban.",
  },
  {
    key: "delete_cards",
    label: "Excluir cards",
    description: "Pode excluir cards permanentemente.",
  },
  {
    key: "view_tickets",
    label: "Tickets Dev",
    description: "Acessa a aba de tickets de desenvolvimento.",
  },
  {
    key: "manage_automations",
    label: "Automações",
    description: "Cria e edita as automações do kanban.",
  },
  {
    key: "create_columns",
    label: "Criar colunas",
    description: "Cria novas colunas (etiquetas) no kanban.",
  },
  {
    key: "edit_columns",
    label: "Editar colunas",
    description: "Renomeia, muda cor/prazo e reordena as colunas do kanban.",
  },
  {
    key: "delete_columns",
    label: "Excluir colunas",
    description: "Exclui colunas do kanban (ação estrutural do board).",
  },
  {
    key: "manager_dashboard",
    label: "Visão do Gestor",
    description: "Acessa a Visão do Gestor (métricas da equipe) no Espaço de Trabalho.",
  },
  {
    key: "review_ai",
    label: "Revisão da IA",
    description:
      "Julga os atendimentos encerrados do WhatsApp (aprovar/reprovar) — alimenta o cérebro do bot.",
  },
  {
    key: "manage_team",
    label: "Gerenciar equipe",
    description: "Altera cargos e permissões — exclusivo do Super Admin (ADMIN++).",
  },
] as const;

export type PermissionKey = (typeof PERMISSION_DEFS)[number]["key"];
export type PermissionMap = Record<PermissionKey, boolean>;
/** Override parcial por usuário (User.permissions no banco). */
export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>;

export const PERMISSION_KEYS = PERMISSION_DEFS.map((d) => d.key) as PermissionKey[];

// Padrões por cargo. ADMIN mantém o comportamento histórico (sem acesso a
// Arquivados/Tickets — antes era uma allowlist de IDs); ADMIN+ é o operador
// de confiança; ADMIN++ tem tudo.
const ROLE_DEFAULTS: Record<TeamRole, PermissionMap> = {
  ADMIN: {
    view_archived: false,
    archive_cards: false,
    delete_cards: true,
    view_tickets: false,
    manage_automations: true,
    create_columns: true,
    edit_columns: true,
    delete_columns: true,
    manager_dashboard: false,
    review_ai: false,
    manage_team: false,
  },
  "ADMIN+": {
    view_archived: true,
    archive_cards: true,
    delete_cards: true,
    view_tickets: true,
    manage_automations: true,
    create_columns: true,
    edit_columns: true,
    delete_columns: true,
    manager_dashboard: false,
    // Revisão da IA nasce exclusiva do ADMIN++ (a curadoria do cérebro é
    // manual nos primeiros meses). Concedível ao ADMIN+ por override.
    review_ai: false,
    manage_team: false,
  },
  "ADMIN++": {
    view_archived: true,
    archive_cards: true,
    delete_cards: true,
    view_tickets: true,
    manage_automations: true,
    create_columns: true,
    edit_columns: true,
    delete_columns: true,
    manager_dashboard: true,
    review_ai: true,
    manage_team: true,
  },
};

export function roleDefaults(role: TeamRole): PermissionMap {
  return { ...ROLE_DEFAULTS[role] };
}

/** Normaliza o JSON de User.permissions vindo do banco. */
export function parseOverrides(raw: unknown): PermissionOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PermissionOverrides = {};
  for (const key of PERMISSION_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

/**
 * Resolve o mapa final de permissões de um membro da equipe.
 * ADMIN++ sempre tem tudo (overrides são ignorados); manage_team nunca é
 * concedível por override — só pelo cargo ADMIN++.
 */
export function resolvePermissions(
  role: string | null | undefined,
  overrides?: unknown,
): PermissionMap {
  if (!isTeamRole(role)) {
    // Não é da equipe: nenhuma permissão.
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as PermissionMap;
  }
  if (role === "ADMIN++") return roleDefaults("ADMIN++");

  const map = { ...ROLE_DEFAULTS[role], ...parseOverrides(overrides) };
  map.manage_team = false;
  return map;
}

/**
 * Diff de um mapa editado contra o padrão do cargo — o que gravar como
 * override. Retorna null quando o mapa é idêntico ao padrão.
 */
export function diffFromDefaults(role: TeamRole, edited: PermissionMap): PermissionOverrides | null {
  const defaults = ROLE_DEFAULTS[role];
  const diff: PermissionOverrides = {};
  for (const key of PERMISSION_KEYS) {
    if (key === "manage_team") continue;
    if (edited[key] !== defaults[key]) diff[key] = edited[key];
  }
  return Object.keys(diff).length ? diff : null;
}
