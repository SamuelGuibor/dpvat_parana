// Controle de acesso da "Visão do Gestor" (Camada 3 do Espaço de Trabalho).
//
// Hoje não há distinção de cargo no banco (todo o dash é restrito a ADMIN),
// então a lista de gestores é uma allowlist fixa de e-mails. Pode ser
// sobrescrita/estendida via env MANAGER_EMAILS (separada por vírgula).

const HARDCODED_MANAGER_EMAILS = [
  "mucaguibor@gmail.com",
  "martinez.thomaz@segurosparana.com.br",
  "nikolas.paranaseguros@gmail.com",
  "daniel.paranaseguros@gmail.com",
  "luana.paranaseguros@gmail.com",
  "eduardocamargomartinez8@gmail.com"
];

function normalize(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

/** Conjunto de e-mails com acesso de gestor (hardcoded + env). */
export const MANAGER_EMAILS: Set<string> = new Set(
  [
    ...HARDCODED_MANAGER_EMAILS,
    ...(process.env.MANAGER_EMAILS ?? '').split(','),
  ]
    .map(normalize)
    .filter(Boolean),
);

/** True se o e-mail informado pertence a um gestor. */
export function isManager(email?: string | null): boolean {
  return MANAGER_EMAILS.has(normalize(email));
}
