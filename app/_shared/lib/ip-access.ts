import { headers } from "next/headers";
import { db } from "./prisma";

// Trava de IP da dashboard da equipe.
//
// A dashboard (/nova-dash e as server actions da equipe) só abre a partir dos
// IPs liberados (internet do escritório) — exceto para quem tem a permissão
// bypass_ip_lock (liberação individual do Super Admin). O site público e a
// área do cliente NÃO passam por aqui.
//
// A lista mora em app_settings (key "dashboard_allowed_ips", um IP por linha
// ou separados por vírgula), editável na seção Segurança do Espaço de
// Trabalho. Entradas podem ser exatas ("177.1.17.71") ou prefixo com "*"
// ("2804:d55:830c:2900:*") — útil para IPv6, cujo sufixo muda o tempo todo.
//
// Lista VAZIA = trava desligada (ninguém fica de fora por engano antes de
// configurar). Env DASHBOARD_ALLOWED_IPS serve de fallback se a linha do
// banco não existir.

export const DASHBOARD_ALLOWED_IPS_KEY = "dashboard_allowed_ips";

/** IP real do cliente atrás do proxy da Vercel (primeiro x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "desconhecido"
  );
}

export function parseIpList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getDashboardAllowedIps(): Promise<string[]> {
  const row = await db.appSetting
    .findUnique({ where: { key: DASHBOARD_ALLOWED_IPS_KEY } })
    .catch(() => null);
  if (row) return parseIpList(row.value);
  return parseIpList(process.env.DASHBOARD_ALLOWED_IPS);
}

/** Casa IP exato ou prefixo terminado em "*" (ex.: "2804:d55:830c:2900:*"). */
export function ipMatches(ip: string, entry: string): boolean {
  if (entry.endsWith("*")) return ip.toLowerCase().startsWith(entry.slice(0, -1).toLowerCase());
  return ip.toLowerCase() === entry.toLowerCase();
}

export interface IpAccessCheck {
  allowed: boolean;
  ip: string;
  /** true quando a lista está vazia (trava desligada). */
  unrestricted: boolean;
}

/**
 * Decide se a requisição atual pode usar a dashboard.
 * @param bypass permissão bypass_ip_lock já resolvida do usuário.
 */
export async function checkDashboardIpAccess(bypass: boolean): Promise<IpAccessCheck> {
  const [ip, list] = await Promise.all([getClientIp(), getDashboardAllowedIps()]);
  if (list.length === 0) return { allowed: true, ip, unrestricted: true };
  if (bypass) return { allowed: true, ip, unrestricted: false };
  // Localhost (dev) sempre passa — a trava é para o deploy.
  if (ip === "::1" || ip === "127.0.0.1" || ip === "desconhecido") {
    return { allowed: true, ip, unrestricted: false };
  }
  const allowed = list.some((entry) => ipMatches(ip, entry));
  return { allowed, ip, unrestricted: false };
}
