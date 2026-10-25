"use server";

import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/app/_shared/lib/prisma";
import { requirePermission, requireTeam } from "@/app/_shared/lib/permissions-server";
import { AccessError } from "@/app/_shared/utils/route-guards";
import { getOpSwitches, invalidateOpSwitches, setOpSwitch } from "@/app/_shared/lib/op/switches";
import { OP_TOOLS } from "@/app/_shared/lib/op/tools";

// Seção "IA de operação" do Espaço de Trabalho (embrião do painel da Etapa 7):
// liga/desliga cada ferramenta de escrita (L3) da IA. Ver: manage_team ou
// manager_dashboard; alterar: só manage_team.

export interface OpSwitchRow {
  name: string;
  description: string;
  permission: string;
  on: boolean;
  lastChange: { by: string; at: string; on: boolean } | null;
  /** Chamadas nos últimos 7 dias (prévias + execuções). */
  calls7d: number;
  ok7d: number;
}

export async function getOpSwitchPanel(): Promise<{ rows: OpSwitchRow[]; canEdit: boolean }> {
  noStore();
  const ctx = await requireTeam();
  if (!ctx.permissions.manage_team && !ctx.permissions.manager_dashboard) {
    throw new AccessError("Você não tem permissão para ver esta seção.");
  }
  invalidateOpSwitches();
  const l3 = OP_TOOLS.filter((t) => t.level === 3);
  const names = l3.map((t) => t.name);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [switches, calls, changes] = await Promise.all([
    getOpSwitches(),
    db.opToolCall.groupBy({ by: ["tool", "ok"], where: { tool: { in: names }, createdAt: { gte: since } }, _count: { _all: true } }),
    db.log.findMany({
      // Corte de data: "update" é frequente e o filtro no JSON não tem índice.
      where: { action: "update", createdAt: { gte: new Date(Date.now() - 180 * 86_400_000) }, metadata: { path: ["stage"], equals: "op_switch" } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { authorName: true, createdAt: true, metadata: true },
    }),
  ]);
  const rows = l3.map<OpSwitchRow>((t) => {
    const last = changes.find((c) => (c.metadata as { tool?: string } | null)?.tool === t.name);
    const mine = calls.filter((c) => c.tool === t.name);
    return {
      name: t.name,
      description: t.description.replace(/^ESCRITA\.\s*/, "").split(". ")[0],
      permission: t.permission,
      on: switches[t.name] === true,
      lastChange: last
        ? { by: last.authorName, at: last.createdAt.toISOString(), on: (last.metadata as { on?: boolean }).on === true }
        : null,
      calls7d: mine.reduce((a, c) => a + c._count._all, 0),
      ok7d: mine.filter((c) => c.ok).reduce((a, c) => a + c._count._all, 0),
    };
  });
  return { rows, canEdit: ctx.permissions.manage_team };
}

export async function setOpSwitchAction(name: string, on: boolean): Promise<{ ok: true }> {
  const ctx = await requirePermission("manage_team");
  if (!OP_TOOLS.some((t) => t.level === 3 && t.name === name)) throw new Error("Ferramenta desconhecida.");
  await setOpSwitch(name, on, { id: ctx.userId, name: ctx.name ?? "Usuário" });
  return { ok: true };
}
