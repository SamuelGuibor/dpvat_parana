// Ajuste A (26/10): editar/apagar o comentário que o operador fez pela IA e
// dar ciência/concluir tarefa da Caixa de Menções dele. Ambas L3 (prévia +
// previa_hash), com interruptor desligado por padrão. Libs:
// app/_shared/lib/cards/comment-edit.ts e app/_shared/lib/mention-status.ts.

import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { editOpComment, VIA_IA_SUFFIX } from "../../cards/comment-edit";
import { sanitizeOpCommentText } from "../../cards/comment";
import { setMentionStatusFor } from "../../mention-status";
import { brDateTime } from "../resolve";
import { cardRefSchema } from "./obter-card";
import { loadCardState, writeCommon } from "./_escrita";

// ---------------------------------------------------------------------------
// editar_comentario
// ---------------------------------------------------------------------------

const comentarioSchema = z
  .object({
    card: cardRefSchema,
    comentario: z.string().min(5).max(60).describe("comentarioId (de comentar_card ou listar_historico)."),
    acao: z.enum(["editar", "apagar"]),
    texto: z.string().min(1).max(4000).optional().describe("Só em editar: o texto novo inteiro."),
    ...confirmSchema,
  })
  .refine((a) => (a.acao === "editar") === Boolean(a.texto), { message: "texto só (e sempre) com editar" });

export const editarComentario = defineTool({
  name: "editar_comentario",
  description:
    "ESCRITA. Edita ou apaga um comentário que o PRÓPRIO operador fez pela IA (autor \"<nome> (via IA)\"). Comentário de outra pessoa, ou feito no site, é recusado. O texto antigo fica no histórico do card. Chame com confirmar: true: executa na hora (ação direta).",
  level: 3,
  permission: "op_write",
  schema: comentarioSchema,
  async run({ op, trace }, args) {
    const card = await loadCardState(args.card);
    const c = await db.comment.findFirst({
      where: { id: args.comentario, userId: card.id },
      select: { id: true, text: true, authorId: true, authorName: true, createdAt: true },
    });
    if (!c) throw new OpToolError("nao_encontrado", "Comentário não encontrado neste card.", 404);
    if (c.authorId !== op.userId || !c.authorName.endsWith(VIA_IA_SUFFIX)) {
      throw new OpToolError("sem_permissao", "Só dá para mexer em comentário que você mesmo fez pela IA. Os outros, pelo site.", 403);
    }
    const novo = args.acao === "editar" ? sanitizeOpCommentText(args.texto!) : null;
    if (args.acao === "editar" && !novo) throw new OpToolError("argumentos_invalidos", "Comentário vazio.", 400);
    if (novo === c.text) {
      return { data: { noop: true, mensagem: "O comentário já está com esse texto." }, summary: `noop comentário ${card.cardNumber}`, cardIds: [card.id] };
    }
    const out = await previewOrExecute({
      tool: "editar_comentario",
      args,
      estado: { id: c.id, text: c.text },
      previa: {
        acao: args.acao === "editar" ? "editar comentário" : "APAGAR comentário",
        card: { cardNumber: card.cardNumber, nome: card.name },
        feitoEm: brDateTime(c.createdAt),
        antes: c.text,
        depois: novo,
        avisos: args.acao === "apagar" ? ["o comentário some do card; o texto fica guardado no histórico"] : [],
      },
      execute: () => editOpComment({ ...writeCommon(op, trace, card.id), commentId: c.id, text: novo }),
    });
    if (!out.executed) return { data: { previa: out.previa }, summary: `prévia ${args.acao} comentário ${card.cardNumber}`, cardIds: [card.id] };
    return { data: { feito: !out.result.noop, acao: args.acao, comentarioId: c.id }, summary: `${args.acao} comentário em ${card.cardNumber}`, cardIds: [card.id] };
  },
});

// ---------------------------------------------------------------------------
// atualizar_tarefa
// ---------------------------------------------------------------------------

const tarefaSchema = z.object({
  tarefa: z.string().min(5).max(60).describe("tarefaId (de meu_dia)."),
  status: z.enum(["ciente", "concluida"]).describe("ciente = tomei ciência; concluida = resolvi."),
  ...confirmSchema,
});

export const atualizarTarefa = defineTool({
  name: "atualizar_tarefa",
  description:
    "ESCRITA. Dá ciência ou conclui UMA menção/tarefa da Caixa de Menções do PRÓPRIO operador (tarefaId do meu_dia). Tarefa de setor vale para o setor todo (como no site). Chame com confirmar: true: executa na hora (ação direta).",
  level: 3,
  permission: "op_write",
  schema: tarefaSchema,
  async run({ op }, args) {
    const m = await db.mention.findFirst({
      where: { id: args.tarefa, recipientId: op.userId },
      select: { id: true, status: true, excerpt: true, targetName: true, authorName: true, groupId: true, sectorName: true, userId: true },
    });
    if (!m) throw new OpToolError("nao_encontrado", "Tarefa não encontrada na SUA Caixa de Menções.", 404);
    const alvo = args.status === "ciente" ? "ACK" : "DONE";
    if (m.status === alvo || (alvo === "ACK" && m.status === "DONE")) {
      return { data: { noop: true, mensagem: `A tarefa já está ${m.status === "DONE" ? "concluída" : "com ciência"}.` }, summary: "noop tarefa", cardIds: m.userId ? [m.userId] : [] };
    }
    const out = await previewOrExecute({
      tool: "atualizar_tarefa",
      args,
      estado: { id: m.id, status: m.status },
      previa: {
        acao: args.status === "ciente" ? "dar ciência" : "concluir",
        tarefa: { de: m.authorName, onde: m.targetName, texto: m.excerpt.slice(0, 300) },
        avisos: m.groupId ? [`tarefa do setor ${m.sectorName ?? ""}: muda para todas as pessoas do setor`] : [],
      },
      execute: () => setMentionStatusFor(op.userId, m.id, alvo),
    });
    if (!out.executed) return { data: { previa: out.previa }, summary: `prévia tarefa ${args.status}`, cardIds: m.userId ? [m.userId] : [] };
    return { data: { feito: !out.result.noop, status: args.status, setor: out.result.setor }, summary: `tarefa ${args.status}`, cardIds: m.userId ? [m.userId] : [] };
  },
});
