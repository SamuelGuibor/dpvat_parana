// Vocabulário e formatação dos custos do projeto — compartilhado entre o
// server (validação nas actions) e o client (formulário e gráficos).
//
// Mora fora de _actions porque um arquivo "use server" só pode exportar
// funções async: constante exportada de lá quebra a compilação.

/** Serviços conhecidos. `outro` é o escape para o que não está na lista. */
export const COST_SERVICES = [
  { key: "vercel", label: "Vercel", color: "#6366f1" },
  { key: "neon", label: "Neon", color: "#00b37e" },
  { key: "claude", label: "Claude (Anthropic)", color: "#d97757" },
  { key: "gemini", label: "Gemini (Google)", color: "#4285f4" },
  { key: "openai", label: "OpenAI", color: "#10a37f" },
  { key: "railway", label: "Railway", color: "#a855f7" },
  { key: "aws", label: "AWS", color: "#ff9900" },
  { key: "meta", label: "Meta Ads", color: "#0866ff" },
  { key: "whatsapp", label: "WhatsApp (conversas)", color: "#25d366" },
  { key: "twilio", label: "Twilio", color: "#f22f46" },
  { key: "dominio", label: "Domínio / DNS", color: "#0ea5e9" },
  { key: "outro", label: "Outro", color: "#64748b" },
] as const;

export type CostServiceKey = (typeof COST_SERVICES)[number]["key"];

export const COST_SERVICE_KEYS: string[] = COST_SERVICES.map((s) => s.key);
export const COST_CURRENCIES = ["BRL", "USD"] as const;
export type CostCurrency = (typeof COST_CURRENCIES)[number];

export function costServiceLabel(key: string): string {
  return COST_SERVICES.find((s) => s.key === key)?.label ?? key;
}

export function costServiceColor(key: string): string {
  return COST_SERVICES.find((s) => s.key === key)?.color ?? "#64748b";
}

/** Centavos -> "R$ 1.234,56" (ou "US$ 45,00"). */
export function formatMoney(cents: number, currency: string = "BRL"): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
}

/**
 * "1.234,56", "1234.56" ou "R$ 1.234,56" -> 123456 centavos.
 * Devolve null quando não dá para ler um número.
 *
 * A vírgula é o separador decimal (teclado brasileiro); o ponto só é decimal
 * quando não há vírgula nenhuma — assim "1.234,56" e "1234.56" dão o mesmo.
 */
export function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return null;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(normalized);
  if (!m || (!m[2] && !m[3])) return null;

  const sign = m[1] === "-" ? -1 : 1;
  const inteiro = m[2] || "0";
  const frac = m[3] ?? "";

  // O arredondamento acontece na STRING, no dígito dos milésimos. Multiplicar
  // por 100 em float perde centavo: "1,005" * 100 dá 100.4999... e viraria
  // R$ 1,00 em vez de R$ 1,01.
  const centavos = Number(frac.slice(0, 2).padEnd(2, "0"));
  const sobe = Number(frac[2] ?? "0") >= 5 ? 1 : 0;

  return sign * (Number(inteiro) * 100 + centavos + sobe);
}

/** "2026-08" -> "ago/2026" */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${y}`;
}

/**
 * Como cada serviço é medido no painel de custos (14/09/2026) e onde a
 * fatura/pagamento mora — pra qualquer pessoa do escritório achar sem
 * depender de quem configurou.
 */
export const COST_PROVIDER_INFO: Record<string, { billingUrl: string; how: string; envVars: string[] }> = {
  claude: {
    billingUrl: "https://console.anthropic.com/settings/billing",
    how: "Relatório de custo da API Admin (chave ANTHROPIC_ADMIN_KEY); sem a chave, estimado pelos tokens gravados nos logs.",
    envVars: ["ANTHROPIC_ADMIN_KEY"],
  },
  gemini: {
    billingUrl: "https://console.cloud.google.com/billing",
    how: "Sem telemetria por chamada hoje — lançamento manual da fatura do Google Cloud.",
    envVars: [],
  },
  neon: {
    billingUrl: "https://console.neon.tech/app/billing",
    how: "API de consumo da Neon (compute, storage, tráfego) × preço do plano.",
    envVars: ["NEON_API_KEY", "NEON_PROJECT_ID"],
  },
  vercel: {
    billingUrl: "https://vercel.com/dashboard/usage",
    how: "A Vercel não expõe gasto por API — lançamento manual da fatura (plano + uso).",
    envVars: [],
  },
  railway: {
    billingUrl: "https://railway.com/account/billing",
    how: "API GraphQL da Railway (CPU, memória, saída) × preço por minuto — estimativa.",
    envVars: ["RAILWAY_API_TOKEN", "RAILWAY_PROJECT_ID"],
  },
  aws: {
    billingUrl: "https://console.aws.amazon.com/billing/home",
    how: "Cost Explorer (custo diário real). A chave AWS precisa da permissão ce:GetCostAndUsage.",
    envVars: [],
  },
  meta: {
    billingUrl: "https://business.facebook.com/billing_hub",
    how: "Insights da conta de anúncios (gasto diário) pela Marketing API.",
    envVars: ["META_ADS_TOKEN", "META_ADS_ACCOUNT_ID"],
  },
  whatsapp: {
    billingUrl: "https://business.facebook.com/billing_hub",
    how: "Analytics de preço das WABAs cadastradas (custo por conversa/mensagem).",
    envVars: [],
  },
};
