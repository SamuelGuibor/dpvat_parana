import { z } from "zod/v4";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { moveCardToLabel } from "../../cards/move-card";
import { cardRefSchema } from "./obter-card";
import { automationsPreview, cardSummary, loadCardState, resolveColumnExact, writeCommon } from "./_escrita";
import { columnName } from "../cards";

const schema = z.object({
  card: cardRefSchema,
  coluna: z.string().min(1).max(120).describe("Nome EXATO da coluna de destino (use listar_colunas se não souber)."),
  enviar_whatsapp: z
    .boolean()
    .optional()
    .describe("Só quando a prévia disse que a coluna manda WhatsApp ao cliente: true = mandar também; ausente/false = não manda (o resto da automação roda)."),
  ...confirmSchema,
});

export const moverCard = defineTool({
  name: "mover_card",
  description:
    "ESCRITA. Move UM card para outra coluna do kanban, como arrastar no site (dispara as automações da coluna). Sem confirmar = só prévia: de → para, automações que vão rodar e se alguma manda WhatsApp ao cliente. Mostre a prévia ao operador, pergunte \"Confirma?\" (e, se mandaWhatsapp, \"mandar o WhatsApp também?\") e só então chame de novo com confirmar: true + previa_hash. Não muda a etapa do checklist.",
  level: 3,
  permission: "op_write",
  schema,
  async run({ op, trace }, args) {
    const card = await loadCardState(args.card);
    if (card.archiveStatus) {
      throw new OpToolError("card_arquivado", `O card ${card.cardNumber} está arquivado (${card.archiveStatus}). Desarquive antes de mover.`, 409);
    }
    const destino = await resolveColumnExact(args.coluna);
    const de = columnName(card);
    if (card.labelId === destino.id) {
      return { data: { noop: true, mensagem: `O card já está em "${destino.nome}".`, card: cardSummary(card) }, summary: `noop ${card.cardNumber} já em ${destino.nome}`, cardIds: [card.id] };
    }

    const { automacoes, mandaWhatsapp } = await automationsPreview(destino.id, card.id);
    const enviar = args.enviar_whatsapp === true;
    // enviar_whatsapp fica fora do hash: a prévia já mostrou o texto e a skill
    // pergunta as duas coisas juntas ("Confirma? Manda o WhatsApp também?").
    const hashArgs: Record<string, unknown> = { ...args };
    delete hashArgs.enviar_whatsapp;
    const out = await previewOrExecute({
      tool: "mover_card",
      args: hashArgs,
      estado: { labelId: card.labelId, archiveStatus: card.archiveStatus },
      previa: {
        acao: "mover",
        card: { cardNumber: card.cardNumber, nome: card.name },
        de,
        para: destino.nome,
        automacoes,
        mandaWhatsapp,
        ...(mandaWhatsapp
          ? { pergunta: "Esta coluna manda WhatsApp ao cliente. Mandar também? (padrão: não manda; o resto da automação roda)" }
          : {}),
        avisos: [
          ...(card.labelId ? [] : ["card sem coluna definida"]),
          ...(automacoes.some((a) => a.acoes.some((x) => x.tipo === "move"))
            ? ["a automação move o card de novo: o que a coluna seguinte faz não está nesta lista; WhatsApp da cadeia só sai se o operador liberar"]
            : []),
        ],
      },
      execute: () =>
        moveCardToLabel({
          ...writeCommon(op, trace, card.id),
          labelId: destino.id,
          // Pula SEMPRE, salvo "sim" explícito: a prévia pode não enxergar um
          // WhatsApp mais adiante numa cadeia de `move`, ou a automação pode ter
          // sido editada entre a prévia e o "sim". Pular sem WhatsApp é inofensivo.
          skipActionTypes: enviar ? [] : ["whatsapp"],
        }),
    });

    if (!out.executed) {
      return { data: { previa: out.previa }, summary: `prévia mover ${card.cardNumber}: ${de} → ${destino.nome}`, cardIds: [card.id] };
    }
    const depois = await loadCardState(card.id);
    return {
      data: {
        feito: true,
        de,
        para: destino.nome,
        whatsapp: enviar ? "liberado para a automação" : mandaWhatsapp ? "não enviado (operador optou)" : "nenhum (WhatsApp de automação bloqueado nesta movimentação)",
        nota: "As automações da coluna rodam em segundo plano; o histórico mostra o resultado em instantes.",
        card: cardSummary(depois),
      },
      summary: `moveu ${card.cardNumber}: ${de} → ${destino.nome}${mandaWhatsapp && !enviar ? " (sem WhatsApp)" : ""}`,
      cardIds: [card.id],
    };
  },
});
