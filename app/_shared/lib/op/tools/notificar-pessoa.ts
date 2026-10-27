import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { notifyUser } from "../../notifications";
import { createSectorTask, loadSectorAudience } from "../../sector-tasks";
import { cardRefSchema } from "./obter-card";
import { loadCardState, operatorAuthor, resolveSector, resolveTeamMember } from "./_escrita";

const schema = z.object({
  para: z.string().min(1).max(120).describe("Nome de uma pessoa da equipe OU nome/slug de um setor (ex.: \"Isadora\", \"comercial\")."),
  texto: z.string().min(1).max(1000).describe("O aviso/tarefa, como o operador pediu."),
  card: cardRefSchema.optional().describe("Card relacionado (opcional): o aviso abre o card."),
  ...confirmSchema,
});

// Uma ferramenta só para aviso e tarefa (decisão do dono, 25/10): o destino
// decide — pessoa recebe aviso pessoal (sino + Menções); setor recebe UMA
// tarefa compartilhada (groupId: concluir uma cópia conclui para todos).
export const notificarPessoa = defineTool({
  name: "notificar_pessoa",
  description:
    "ESCRITA. Avisa uma pessoa da equipe (sino + Caixa de Menções) ou cria uma tarefa compartilhada para um setor. Chame com confirmar: true: executa na hora (ação direta, sem prévia). Nunca avisa cliente.",
  level: 3,
  permission: "op_write",
  schema,
  async run({ op }, args) {
    const author = operatorAuthor(op);
    const card = args.card ? await loadCardState(args.card) : null;
    const cardRef = card ? { id: card.id, isProcess: false, name: card.name ?? "card" } : null;
    const texto = args.texto.trim();

    const pessoa = await resolveTeamMember(args.para);
    const setor = pessoa ? null : await resolveSector(args.para);
    if (!pessoa && !setor) {
      throw new OpToolError("nao_encontrado", `Ninguém da equipe nem setor chamado "${args.para}".`, 404);
    }

    let destinatarios: string[] = [];
    let audience: Awaited<ReturnType<typeof loadSectorAudience>> | null = null;
    if (pessoa) {
      if (pessoa.id === op.userId) throw new OpToolError("argumentos_invalidos", "O aviso é para você mesmo.", 400);
      destinatarios = [pessoa.name ?? pessoa.email];
    } else {
      audience = await loadSectorAudience(setor!.slug);
      audience.recipientIds = audience.recipientIds.filter((id) => id !== op.userId);
      const users = await db.user.findMany({ where: { id: { in: audience.recipientIds } }, select: { name: true, email: true } });
      destinatarios = users.map((u) => u.name ?? u.email);
    }

    const out = await previewOrExecute({
      tool: "notificar_pessoa",
      args,
      estado: { destinatarios: [...destinatarios].sort() },
      previa: {
        acao: pessoa ? "aviso pessoal" : "tarefa do setor",
        autor: author.name,
        para: pessoa ? destinatarios[0] : setor!.name,
        destinatarios,
        tarefaCompartilhada: !pessoa,
        ...(audience && !audience.sector ? { aviso: "setor sem membros: vai para a equipe toda (ADMIN*)" } : {}),
        card: card ? { cardNumber: card.cardNumber, nome: card.name } : null,
        texto,
      },
      execute: async () => {
        if (pessoa) {
          await notifyUser({ recipientId: pessoa.id, author, message: texto, card: cardRef, source: "op" });
          return { groupId: null };
        }
        return { groupId: await createSectorTask({ audience: audience!, text: texto, author, card: cardRef }) };
      },
    });
    if (!out.executed) {
      return { data: { previa: out.previa }, summary: `prévia aviso → ${args.para}`, cardIds: card ? [card.id] : [] };
    }
    return {
      data: { feito: true, destinatarios, tarefaCompartilhada: !pessoa },
      summary: `${pessoa ? "avisou" : "tarefa p/ setor"} ${pessoa ? destinatarios[0] : setor!.name} (${destinatarios.length})`,
      cardIds: card ? [card.id] : [],
    };
  },
});
