// Interruptor por ferramenta de escrita (L3), de envio (L4) e de registro de
// progresso (L1 `switchable`, Etapa 6) da IA de operação.
//
// Uma chave JSON em app_settings ({"mover_card": true, ...}); ausente ou
// false = desligada (padrão). Ferramenta desligada some do catálogo e recusa
// com `ferramenta_desligada`. É um kill switch: cache de 15 s por instância
// (serverless) — desligar leva no máximo isso para valer em todo lugar.

import { db } from "../prisma";
import { createLog } from "../log";

export const OP_SWITCHES_KEY = "op_l3_switches";
const TTL_MS = 15_000;

let cache: { value: Record<string, boolean>; expiresAt: number } | null = null;

export function invalidateOpSwitches(): void {
  cache = null;
}

/** Lê o JSON tolerando lixo: só valores `true` contam como ligado. */
export function parseOpSwitches(raw: string | null | undefined): Record<string, boolean> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === true]));
  } catch {
    return {};
  }
}

export async function getOpSwitches(): Promise<Record<string, boolean>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  // Falha de banco = tudo desligado (nunca liga escrita por erro de leitura).
  const row = await db.appSetting.findUnique({ where: { key: OP_SWITCHES_KEY } }).catch(() => null);
  const value = parseOpSwitches(row?.value);
  cache = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}

/** L3, L4 e as L1 que gravam registro (`switchable`, Etapa 6) têm interruptor. */
export function hasSwitch(tool: { level: number; switchable?: boolean }): boolean {
  return tool.level >= 3 || tool.switchable === true;
}

/** Sem interruptor (L1/L2 de leitura e rascunho) = sempre ligada; com interruptor, só ligada. */
export function isToolEnabled(switches: Record<string, boolean>, tool: { name: string; level: number; switchable?: boolean }): boolean {
  return !hasSwitch(tool) || switches[tool.name] === true;
}

export async function setOpSwitch(name: string, on: boolean, author: { id: string; name: string }): Promise<Record<string, boolean>> {
  const row = await db.appSetting.findUnique({ where: { key: OP_SWITCHES_KEY } });
  const next = { ...parseOpSwitches(row?.value), [name]: on };
  await db.appSetting.upsert({
    where: { key: OP_SWITCHES_KEY },
    create: { key: OP_SWITCHES_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  invalidateOpSwitches();
  await createLog({
    action: "update",
    message: `${on ? "ligou" : "desligou"} a ação da IA "${name}"`,
    authorId: author.id,
    authorName: author.name,
    metadata: { stage: "op_switch", tool: name, on },
  });
  return next;
}
