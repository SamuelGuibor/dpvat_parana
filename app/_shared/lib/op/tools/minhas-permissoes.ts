import { z } from "zod/v4";
import { defineTool } from "../registry";

// Quem é o operador do token e o que ele pode. A skill /conhecimento usa para
// decidir entre "sugerir" (op_use) e "implementar" (manage_knowledge) — a
// decisão de verdade continua no servidor; isto só evita o operador sem
// permissão gastar uma rodada inteira de redação à toa.

const CHAVES = ["op_use", "op_write", "op_approve", "manage_knowledge", "view_whatsapp", "view_tickets"] as const;

export const minhasPermissoes = defineTool({
  name: "minhas_permissoes",
  description:
    "Quem é o operador dono do token (nome, cargo) e quais permissões de operação ele tem (op_use, op_write, op_approve, manage_knowledge, view_whatsapp, view_tickets). Use antes de um fluxo que exige permissão específica, como /conhecimento implementar.",
  level: 1,
  permission: "op_use",
  schema: z.object({}),
  async run(ctx) {
    const perms = Object.fromEntries(CHAVES.map((k) => [k, Boolean(ctx.op.permissions[k])]));
    return {
      data: { nome: ctx.op.name, cargo: ctx.op.role, permissoes: perms },
      summary: `${ctx.op.name ?? ctx.op.email}: manage_knowledge=${perms.manage_knowledge ? "sim" : "não"}`,
    };
  },
});
