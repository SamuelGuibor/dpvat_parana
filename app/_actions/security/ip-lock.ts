"use server";

import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/app/_shared/lib/prisma";
import { requirePermission } from "@/app/_shared/lib/permissions-server";
import { createLog } from "@/app/_shared/lib/log";
import {
  DASHBOARD_ALLOWED_IPS_KEY,
  getClientIp,
  getDashboardAllowedIps,
  ipMatches,
  parseIpList,
} from "@/app/_shared/lib/ip-access";

// Configuração da trava de IP da dashboard (seção Segurança do Espaço de
// Trabalho). Só o manage_team mexe aqui; a checagem em si mora em
// _shared/lib/ip-access.ts e roda no requireTeam + layout da /nova-dash.

export interface IpLockSettings {
  /** Lista atual (vazia = trava desligada). */
  ips: string[];
  /** IP público de quem está abrindo a tela — atalho pro "adicionar meu IP". */
  currentIp: string;
}

export async function getIpLockSettings(): Promise<IpLockSettings> {
  noStore();
  await requirePermission("manage_team");
  const [ips, currentIp] = await Promise.all([getDashboardAllowedIps(), getClientIp()]);
  return { ips, currentIp };
}

/** Valida uma entrada: IPv4/IPv6 exato ou prefixo terminado em "*". */
function isValidEntry(entry: string): boolean {
  const body = entry.endsWith("*") ? entry.slice(0, -1) : entry;
  if (!body) return false;
  // IPv4 (completo ou prefixo tipo "192.168.0.")
  if (/^\d{1,3}(\.\d{1,3}){0,3}\.?$/.test(body)) return true;
  // IPv6 (hex + ":")
  if (/^[0-9a-fA-F:]+$/.test(body) && body.includes(":")) return true;
  return false;
}

export async function setDashboardAllowedIps(raw: string): Promise<IpLockSettings> {
  const eu = await requirePermission("manage_team");

  const entries = parseIpList(raw);
  const invalid = entries.filter((e) => !isValidEntry(e));
  if (invalid.length) {
    throw new Error(`Entrada inválida: ${invalid.join(", ")}. Use um IP por linha (ou prefixo com *).`);
  }

  // Guarda anti-tiro-no-pé: quem NÃO tem bypass e está salvando uma lista que
  // exclui o próprio IP se trancaria pra fora no clique seguinte.
  const currentIp = await getClientIp();
  const selfLocked =
    entries.length > 0 &&
    !eu.permissions.bypass_ip_lock &&
    !entries.some((e) => ipMatches(currentIp, e));
  if (selfLocked) {
    throw new Error(
      `Seu IP atual (${currentIp}) não está na lista e você não tem "Acesso fora do escritório" — você se trancaria pra fora. Adicione seu IP ou peça o bypass antes.`,
    );
  }

  const value = entries.join("\n");
  await db.appSetting.upsert({
    where: { key: DASHBOARD_ALLOWED_IPS_KEY },
    create: { key: DASHBOARD_ALLOWED_IPS_KEY, value },
    update: { value },
  });

  await createLog({
    action: "update",
    message: entries.length
      ? `ATUALIZOU os IPs liberados da dashboard (${entries.length} ${entries.length === 1 ? "entrada" : "entradas"})`
      : "DESLIGOU a trava de IP da dashboard (lista vazia)",
    authorId: eu.userId,
    authorName: eu.name ?? eu.email,
    metadata: { stage: "ip_lock", ips: entries },
  });

  return { ips: entries, currentIp };
}
