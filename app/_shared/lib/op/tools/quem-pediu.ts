// Ajuste A / decisão 7 do dono (26/10): "quem pediu isso?". Sem cc nos
// envios, o registro de quem pediu fica em op_approvals (quem preparou e o
// prompt do "aprovo"), op_tool_calls e no log com metadata.source = "op".
// Esta leitura junta isso por aprovação (id ou código) ou por card. Nunca
// devolve texto de prompt, args nem conteúdo do envio — só quem, quando, o quê.

import { z } from "zod/v4";
import { Prisma } from "@prisma/client";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { brDateTime } from "../resolve";
import { resolveOneCardId } from "../cards";
import { cardRefSchema } from "./obter-card";

const schema = z
  .object({
    aprovacao: z.string().min(4).max(60).optional().describe("approvalId ou o código de 4 letras do \"aprovo <código>\"."),
    card: cardRefSchema.optional().describe("Card: o que a IA fez nele (envios, ações) e a pedido de quem."),
    dias: z.number().int().min(1).max(90).default(30).describe("Com card: últimos N dias (padrão 30)."),
  })
  .refine((a) => Boolean(a.aprovacao) !== Boolean(a.card), { message: "mande aprovacao OU card" });

async function nomes(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = await db.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, email: true } });
  return new Map(rows.map((u) => [u.id, u.name ?? u.email]));
}

const APPROVAL_SELECT = {
  id: true,
  code: true,
  operatorId: true,
  tool: true,
  canal: true,
  status: true,
  cardId: true,
  createdAt: true,
  executedAt: true,
  approvedRequestId: true,
} as const;

export const quemPediu = defineTool({
  name: "quem_pediu",
  description:
    "Quem pediu o quê à IA: por aprovação (id ou código do \"aprovo\") diz quem preparou, quem digitou o aprovo e quando saiu; por card lista os envios e as ações da IA nele (últimos N dias) com quem pediu e quando. Só nomes, datas e tipo da ação — nunca o texto do pedido nem o conteúdo enviado. Só leitura.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    if (args.aprovacao) {
      const ref = args.aprovacao.trim();
      const rows = await db.opApproval.findMany({
        where: ref.length <= 6 ? { code: ref.toUpperCase() } : { id: ref },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: APPROVAL_SELECT,
      });
      if (!rows.length) throw new OpToolError("nao_encontrado", "Nenhuma aprovação com esse id/código.", 404);
      const reqIds = rows.map((r) => r.approvedRequestId).filter((x): x is string => !!x);
      const reqs = reqIds.length ? await db.opRequest.findMany({ where: { id: { in: reqIds } }, select: { id: true, operatorId: true, createdAt: true } }) : [];
      const cards = await db.user.findMany({ where: { id: { in: rows.map((r) => r.cardId).filter((x): x is string => !!x) } }, select: { id: true, cardNumber: true } });
      const n = await nomes([...rows.map((r) => r.operatorId), ...reqs.map((r) => r.operatorId)]);
      return {
        data: {
          aprovacoes: rows.map((a) => {
            const r = reqs.find((x) => x.id === a.approvedRequestId);
            return {
              aprovacao: a.id,
              codigo: a.code,
              tipo: a.tool,
              canal: a.canal,
              status: a.status,
              card: cards.find((c) => c.id === a.cardId)?.cardNumber ?? null,
              preparadoPor: n.get(a.operatorId) ?? a.operatorId,
              preparadoEm: brDateTime(a.createdAt),
              aprovadoPor: r ? n.get(r.operatorId) ?? r.operatorId : null,
              aprovadoEm: r ? brDateTime(r.createdAt) : null,
              executadoEm: a.executedAt ? brDateTime(a.executedAt) : null,
            };
          }),
          ...(rows.length > 1 ? { aviso: "Código repetido entre aprovações diferentes (é curto): confira o card e a data." } : {}),
        },
        summary: `quem pediu: ${rows.length} aprovação(ões)`,
        cardIds: rows.map((r) => r.cardId).filter((x): x is string => !!x),
      };
    }

    const cardId = await resolveOneCardId(args.card!);
    const desde = new Date(Date.now() - args.dias * 86_400_000);
    const [aprovacoes, logs] = await Promise.all([
      db.opApproval.findMany({ where: { cardId, createdAt: { gte: desde } }, orderBy: { createdAt: "desc" }, take: 30, select: APPROVAL_SELECT }),
      // Log do card com origem "op" (toda escrita da IA grava metadata.source).
      db.log.findMany({
        where: { userId: cardId, createdAt: { gte: desde }, metadata: { path: ["source"], equals: "op" } as Prisma.JsonFilter<"Log"> },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, action: true, message: true, authorId: true, authorName: true, createdAt: true },
      }),
    ]);
    const n = await nomes(aprovacoes.map((a) => a.operatorId));
    return {
      data: {
        periodoDias: args.dias,
        envios: aprovacoes.map((a) => ({
          aprovacao: a.id,
          codigo: a.code,
          tipo: a.tool,
          status: a.status,
          preparadoPor: n.get(a.operatorId) ?? a.operatorId,
          preparadoEm: brDateTime(a.createdAt),
          executadoEm: a.executedAt ? brDateTime(a.executedAt) : null,
        })),
        acoes: logs.map((l) => ({ log: l.id, acao: l.action, oQue: l.message.slice(0, 200), pedidoPor: l.authorName, em: brDateTime(l.createdAt) })),
        definicao: "pedidoPor = o operador que pediu à IA (o autor sai como \"<nome> (via IA)\"). Envio só sai depois de quem preparou digitar \"aprovo <código>\".",
      },
      summary: `quem pediu: card, ${aprovacoes.length} envio(s), ${logs.length} ação(ões)`,
      cardIds: [cardId],
    };
  },
});
