// GET /api/op/tools — catálogo das ferramentas para o MCP (tools/crm-mcp/).
// Liberada no middleware (PUBLIC_API_PREFIXES "/api/op"); a credencial é o
// token do operador, conferido aqui. Cada entrada diz se o operador pode usar.

import { noStoreJson } from "@/app/_shared/lib/route-auth";
import { opAuth } from "@/app/_shared/lib/op/http";
import { catalogEntry } from "@/app/_shared/lib/op/registry";
import { canRun } from "@/app/_shared/lib/op/policy";
import { OP_TOOLS } from "@/app/_shared/lib/op/tools";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await opAuth(req, "op_tools_catalog");
  if ("res" in auth) return auth.res;
  const { op } = auth;
  return noStoreJson({
    ok: true,
    data: {
      operador: { nome: op.name, cargo: op.role },
      tools: OP_TOOLS.map((t) => ({ ...catalogEntry(t), permitido: canRun(t.level, t.permission, op.permissions).ok })),
    },
  });
}
