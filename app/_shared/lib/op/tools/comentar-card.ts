import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { addCardComment, sanitizeOpCommentText } from "../../cards/comment";
import { cardRefSchema } from "./obter-card";
import { cardSummary, loadCardState, operatorAuthor, resolveTeamMember, writeCommon } from "./_escrita";

const schema = z.object({
  card: cardRefSchema,
  texto: z.string().min(1).max(4000).describe("Texto do comentário, como o operador pediu."),
  mencionar: z.array(z.string().min(1).max(120)).max(10).optional().describe("Nomes de pessoas da EQUIPE a mencionar (recebem sino + Caixa de Menções)."),
  ...confirmSchema,
});

export const comentarCard = defineTool({
  name: "comentar_card",
  description:
    "ESCRITA. Comenta em UM card, com autor \"<operador> (via IA)\", e opcionalmente menciona pessoas da equipe. Sem confirmar = só prévia (texto final e quem será mencionado). Mostre a prévia, pergunte \"Confirma?\" e só então chame com confirmar: true + previa_hash.",
  level: 3,
  permission: "op_write",
  schema,
  async run({ op, trace }, args) {
    const card = await loadCardState(args.card);
    const texto = sanitizeOpCommentText(args.texto);
    if (!texto) throw new OpToolError("argumentos_invalidos", "Comentário vazio.", 400);

    const pessoas: { id: string; nome: string }[] = [];
    const naoAchou: string[] = [];
    for (const nome of args.mencionar ?? []) {
      const m = await resolveTeamMember(nome);
      if (m) pessoas.push({ id: m.id, nome: m.name ?? m.email });
      else naoAchou.push(nome);
    }
    if (naoAchou.length) {
      throw new OpToolError("nao_encontrado", `Ninguém da equipe chamado: ${naoAchou.join(", ")}.`, 404, naoAchou);
    }

    // Repetir o mesmo pedido (o modelo reenviando a confirmação) = noop: mesmo
    // texto do mesmo operador no card nos últimos 10 minutos.
    const repetido = await db.comment.findFirst({
      where: { userId: card.id, authorId: op.userId, text: texto, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
      select: { id: true },
    });
    if (repetido) {
      return { data: { noop: true, mensagem: "Este comentário já foi feito há pouco.", card: cardSummary(card) }, summary: `noop comentário ${card.cardNumber}`, cardIds: [card.id] };
    }

    const out = await previewOrExecute({
      tool: "comentar_card",
      args,
      estado: { cardId: card.id },
      previa: {
        acao: "comentar",
        card: { cardNumber: card.cardNumber, nome: card.name },
        autor: operatorAuthor(op).name,
        texto,
        mencionados: pessoas.map((p) => p.nome),
      },
      execute: () => addCardComment({ ...writeCommon(op, trace, card.id), text: texto, mentionIds: pessoas.map((p) => p.id) }),
    });
    if (!out.executed) {
      return { data: { previa: out.previa }, summary: `prévia comentário ${card.cardNumber}`, cardIds: [card.id] };
    }
    return {
      data: { feito: true, comentarioId: out.result.id, mencionados: pessoas.map((p) => p.nome), card: cardSummary(card) },
      summary: `comentou em ${card.cardNumber}${pessoas.length ? ` (+${pessoas.length} menção)` : ""}`,
      cardIds: [card.id],
    };
  },
});
