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

/** Grupos exibidos no editor de permissões (a ordem aqui é a ordem na tela). */
export const PERMISSION_CATEGORIES = [
  "Kanban",
  "Arquivados e pagamentos",
  "WhatsApp e IA",
  "Documentos e contratos",
  "Gestão e equipe",
  "Segurança",
] as const;
export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export const PERMISSION_DEFS = [
  {
    key: "view_archived",
    label: "Ver Arquivados",
    description: "Acessa a aba Arquivados e pode restaurar cards.",
    category: "Arquivados e pagamentos",
  },
  {
    key: "view_pagos_caique",
    label: "Pagos Caique",
    description:
      "Acessa a planilha Pastas Caique (pagos/negados CCS) dentro da aba Arquivados.",
    category: "Arquivados e pagamentos",
  },
  {
    key: "view_pagos_uni",
    label: "Pagos UNI",
    description:
      "Acessa a planilha Pastas UNI (pagos/negados UNI) dentro da aba Arquivados.",
    category: "Arquivados e pagamentos",
  },
  {
    key: "archive_cards",
    label: "Arquivar cards",
    description: "Pode arquivar e desarquivar cards do kanban.",
    category: "Arquivados e pagamentos",
  },
  {
    key: "delete_cards",
    label: "Excluir cards",
    description: "Pode excluir cards permanentemente.",
    category: "Kanban",
  },
  {
    key: "view_tickets",
    label: "Tickets Dev",
    description: "Acessa a aba de tickets de desenvolvimento.",
    category: "Gestão e equipe",
  },
  {
    key: "manage_automations",
    label: "Automações",
    description: "Cria e edita as automações do kanban.",
    category: "Kanban",
  },
  {
    key: "create_columns",
    label: "Criar colunas",
    description: "Cria novas colunas (etiquetas) no kanban.",
    category: "Kanban",
  },
  {
    key: "edit_columns",
    label: "Editar colunas",
    description: "Renomeia, muda cor/prazo e reordena as colunas do kanban.",
    category: "Kanban",
  },
  {
    key: "delete_columns",
    label: "Excluir colunas",
    description: "Exclui colunas do kanban (ação estrutural do board).",
    category: "Kanban",
  },
  {
    key: "manager_dashboard",
    label: "Visão do Gestor",
    description: "Acessa a Visão do Gestor (métricas da equipe) no Espaço de Trabalho.",
    category: "Gestão e equipe",
  },
  {
    key: "review_ai",
    label: "Revisão da IA",
    description:
      "Julga os atendimentos encerrados do WhatsApp (aprovar/reprovar) — alimenta o cérebro do bot.",
    category: "WhatsApp e IA",
  },
  {
    key: "manage_wa_contacts",
    label: "Excluir/bloquear contatos (WhatsApp)",
    description:
      "Bloqueia números (para de responder) e exclui contatos do WhatsApp com todo o histórico.",
    category: "WhatsApp e IA",
  },
  {
    key: "manage_wa_numbers",
    label: "Números do WhatsApp",
    description:
      "Acessa a seção Números do Espaço de Trabalho (linhas do WhatsApp e API keys).",
    category: "WhatsApp e IA",
  },
  {
    key: "view_costs",
    label: "Custos do projeto",
    description:
      "Vê e lança os custos de infraestrutura (Vercel, Neon, Claude, AWS...) no Espaço de Trabalho.",
    category: "Gestão e equipe",
  },
  {
    key: "create_hospitals",
    label: "Criar hospitais",
    description: "Pode adicionar hospitais novos no campo Hospital do card (quem não tem só seleciona os existentes).",
    category: "Kanban",
  },
  {
    key: "run_ai_audit",
    label: "Auditoria IA",
    description:
      "Dispara manualmente a auditoria de documentos por IA no card e avalia os resultados (feedback).",
    category: "WhatsApp e IA",
  },
  {
    key: "view_all_mentions",
    label: "Menções da equipe",
    description:
      "Vê a caixa de Menções e Tarefas de todo mundo (quem foi marcado, o que ainda está pendente).",
    category: "Gestão e equipe",
  },
  {
    key: "manage_ponto",
    label: "Ponto da equipe",
    description:
      "Vê o ponto de toda a equipe, corrige batidas esquecidas e exporta a folha do mês.",
    category: "Gestão e equipe",
  },
  {
    key: "manage_contracts",
    label: "Contratos e assinaturas",
    description:
      "Gera contratos para assinatura eletrônica, acompanha a aba Contratos e valida os assinados.",
    category: "Documentos e contratos",
  },
  {
    key: "manage_templates",
    label: "Modelos de documentos",
    description:
      "Gerencia os modelos .docx de procuração e contrato (enviar novos, renomear e excluir).",
    category: "Documentos e contratos",
  },
  {
    key: "bypass_ip_lock",
    label: "Acesso fora do escritório",
    description:
      "Pode abrir a dashboard de qualquer internet — sem esta permissão, só pelos IPs liberados do escritório.",
    category: "Segurança",
  },
  {
    key: "manage_team",
    label: "Gerenciar equipe",
    description: "Altera cargos e permissões — exclusivo do Super Admin (ADMIN++).",
    category: "Gestão e equipe",
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
    create_hospitals: false,
    run_ai_audit: true,
    view_archived: false,
    // Pagos Caique/UNI seguem o histórico da aba Arquivados: fechados pro
    // ADMIN, liberados por override individual.
    view_pagos_caique: false,
    view_pagos_uni: false,
    archive_cards: false,
    delete_cards: true,
    view_tickets: false,
    manage_automations: true,
    create_columns: true,
    edit_columns: true,
    delete_columns: true,
    manager_dashboard: false,
    review_ai: false,
    manage_wa_contacts: false,
    manage_wa_numbers: false,
    view_costs: false,
    view_all_mentions: false,
    manage_ponto: false,
    // Gerar contrato é operação de atendimento — o comercial precisa disso.
    manage_contracts: true,
    manage_templates: false,
    bypass_ip_lock: false,
    manage_team: false,
  },
  "ADMIN+": {
    create_hospitals: true,
    run_ai_audit: true,
    view_archived: true,
    // Quem já via a aba Arquivados via as duas planilhas de pagos — o padrão
    // preserva esse comportamento; dá pra revogar por override.
    view_pagos_caique: true,
    view_pagos_uni: true,
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
    // Excluir/bloquear contato é destrutivo — nasce exclusivo do ADMIN++,
    // concedível ao ADMIN+ por override.
    manage_wa_contacts: false,
    // Números/API keys são infraestrutura — nasce exclusivo do ADMIN++.
    manage_wa_numbers: false,
    // Custo do projeto é informação de sócio — nasce exclusivo do ADMIN++,
    // concedível por override a quem o Super Admin quiser.
    view_costs: false,
    // Ver a caixa de menções dos outros é supervisão — nasce exclusiva do
    // ADMIN++, concedível ao ADMIN+ por override.
    view_all_mentions: false,
    // Ponto da equipe é dado de RH — nasce exclusivo do ADMIN++, concedível
    // ao ADMIN+ por override.
    manage_ponto: false,
    manage_contracts: true,
    // Editar os modelos .docx muda o que TODO contrato gerado contém —
    // estrutural, nasce exclusivo do ADMIN++.
    manage_templates: false,
    // Fora do escritório só com liberação individual do Super Admin.
    bypass_ip_lock: false,
    manage_team: false,
  },
  "ADMIN++": {
    create_hospitals: true,
    run_ai_audit: true,
    view_archived: true,
    view_pagos_caique: true,
    view_pagos_uni: true,
    archive_cards: true,
    delete_cards: true,
    view_tickets: true,
    manage_automations: true,
    create_columns: true,
    edit_columns: true,
    delete_columns: true,
    manager_dashboard: true,
    review_ai: true,
    manage_wa_contacts: true,
    manage_wa_numbers: true,
    view_costs: true,
    view_all_mentions: true,
    manage_ponto: true,
    manage_contracts: true,
    manage_templates: true,
    bypass_ip_lock: true,
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
