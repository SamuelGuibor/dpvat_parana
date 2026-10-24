import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { ACTIVE_CARD_WHERE } from "../cards";

export const listarTags = defineTool({
  name: "listar_tags",
  description: "Tags de card (FALTA SENHA, PRONTUÁRIO ANEXADO, DOCUMENTO VENCIDO…) com quantos cards ativos usam cada uma.",
  level: 1,
  permission: "op_use",
  schema: z.object({}),
  async run() {
    const tags = await db.cardTag.findMany({
      orderBy: { name: "asc" },
      select: { name: true, _count: { select: { users: { where: ACTIVE_CARD_WHERE } } } },
    });
    return {
      data: { total: tags.length, tags: tags.map((t) => ({ nome: t.name, cardsAtivos: t._count.users })) },
      summary: `${tags.length} tags`,
    };
  },
});
