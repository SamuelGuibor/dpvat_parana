// Controle de acesso do "Desempenho do Chatbot" (dentro da Visão do Gestor).
//
// Métricas da IA e GASTO da API do Claude são mais sensíveis que a visão da
// equipe, então o acesso é uma allowlist própria — separada da lista de
// gestores. Estenda/sobrescreva via env CHATBOT_DASHBOARD_EMAILS (vírgulas).

const HARDCODED_CHATBOT_DASHBOARD_EMAILS = [
  "mucaguibor@gmail.com",
  "martinez.thomaz@segurosparana.com.br",
  "nikolas.paranaseguros@gmail.com"
];

function normalize(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

export const CHATBOT_DASHBOARD_EMAILS: Set<string> = new Set(
  [
    ...HARDCODED_CHATBOT_DASHBOARD_EMAILS,
    ...(process.env.CHATBOT_DASHBOARD_EMAILS ?? "").split(","),
  ]
    .map(normalize)
    .filter(Boolean),
);

/** True se o e-mail pode ver o dashboard do chatbot (métricas + custos). */
export function canViewChatbotDashboard(email?: string | null): boolean {
  return CHATBOT_DASHBOARD_EMAILS.has(normalize(email));
}
