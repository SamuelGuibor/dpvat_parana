import { z } from "zod/v4";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { autoProgress } from "../progress";
import { setCardTag } from "../../cards/tags";
import { cardRefSchema } from "./obter-card";
import { automationsUsingTag, cardSummary, loadCardState, resolveTagExact, writeCommon } from "./_escrita";

const schema = z.object({
  card: cardRefSchema,
  tag: z.string().min(1).max(120).describe("Nome EXATO da tag (use listar_tags se não souber)."),
  ...confirmSchema,
});

function tagTool(on: boolean) {
  const name = on ? "adicionar_tag" : "remover_tag";
  return defineTool({
    name,
    description: on
      ? "ESCRITA. Marca uma tag em UM card. Chame com confirmar: true: executa na hora (ação direta, sem prévia). Devolve as tags relidas e as automações que usam a tag."
      : "ESCRITA. Tira uma tag de UM card. Chame com confirmar: true: executa na hora (ação direta, sem prévia). Devolve as tags relidas.",
    level: 3,
    permission: "op_write",
    schema,
    async run({ op, trace }, args) {
      const card = await loadCardState(args.card);
      const tag = await resolveTagExact(args.tag);
      const antes = card.cardTags.map((t) => t.name);
      const has = card.cardTags.some((t) => t.id === tag.id);
      if (has === on) {
        return {
          data: { noop: true, mensagem: on ? `O card já tem a tag "${tag.name}".` : `O card não tem a tag "${tag.name}".`, card: cardSummary(card) },
          summary: `noop ${name} ${card.cardNumber} ${tag.name}`,
          cardIds: [card.id],
        };
      }
      const depois = on ? [...antes, tag.name].sort() : antes.filter((t) => t !== tag.name);
      const usadaEm = await automationsUsingTag(tag.name);
      const out = await previewOrExecute({
        tool: name,
        args,
        estado: { tagIds: card.cardTags.map((t) => t.id).sort() },
        previa: {
          acao: on ? "marcar tag" : "tirar tag",
          card: { cardNumber: card.cardNumber, nome: card.name },
          tag: tag.name,
          antes,
          depois,
          avisos: [
            ...(card.archiveStatus ? [`card arquivado (${card.archiveStatus})`] : []),
            ...(usadaEm.length ? [`a tag é condição destas automações (valem na próxima entrada na coluna): ${usadaEm.join("; ")}`] : []),
          ],
        },
        execute: () => setCardTag({ ...writeCommon(op, trace, card.id), tagId: tag.id, on }),
      });
      if (!out.executed) {
        return { data: { previa: out.previa }, summary: `prévia ${name} ${card.cardNumber} ${tag.name}`, cardIds: [card.id] };
      }
      if (!out.result.changed) throw new OpToolError("estado_mudou", "A tag mudou no meio do caminho. Releia o card.", 409);
      const relido = await loadCardState(card.id);
      // Item I (27/10): passo "tag" do fluxo aberto (só ao marcar).
      const progresso = on ? await autoProgress({ op, trace, cardId: card.id, match: (s) => s.kind === "registro" && s.confere === "tag", refs: [tag.name] }) : null;
      return { data: { feito: true, card: cardSummary(relido), ...(progresso ? { progresso } : {}) }, summary: `${name} ${card.cardNumber} ${tag.name}`, cardIds: [card.id] };
    },
  });
}

export const adicionarTag = tagTool(true);
export const removerTag = tagTool(false);
