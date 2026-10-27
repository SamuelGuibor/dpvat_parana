import { z } from "zod/v4";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { autoProgress } from "../progress";
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
    "ESCRITA. Move UM card para outra coluna do kanban, como arrastar no site (dispara as automações da coluna). Chame com confirmar: true: executa na hora. Só quando a coluna de destino manda WhatsApp ao cliente a chamada volta com requer_confirmacao e a prévia (automações + texto do WhatsApp): mostre, pergunte \"Confirma? Mandar o WhatsApp também?\" e repita com confirmar: true + previa_hash (+ enviar_whatsapp: true só com sim explícito). Não muda a etapa do checklist.",
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
    // enviar_whatsapp fica fora do hash: a prévia já mostrou o texto e a skill
    // pergunta as duas coisas juntas ("Confirma? Manda o WhatsApp também?").
    // Só vale junto do previa_hash (27/10): sem prévia ninguém viu o texto que
    // sairia — e em modo direto (coluna sem WhatsApp na prévia) nunca libera
    // uma cadeia de `move` que a prévia não enxerga.
    const enviar = args.enviar_whatsapp === true && Boolean(args.previa_hash);
    const hashArgs: Record<string, unknown> = { ...args };
    delete hashArgs.enviar_whatsapp;
    const out = await previewOrExecute({
      tool: "mover_card",
      args: hashArgs,
      // Decisão do dono (27/10): mover executa direto; só a coluna que manda
      // WhatsApp ao cliente passa pela prévia (mensagem ao cliente = aprovação).
      confirmacao: mandaWhatsapp ? "exigida" : "direta",
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
    // Item I (27/10): passo "mover" do fluxo aberto do card.
    const progresso = await autoProgress({ op, trace, cardId: card.id, match: (s) => s.kind === "registro" && s.confere === "coluna", refs: [destino.nome] });
    return {
      data: {
        feito: true,
        de,
        para: destino.nome,
        ...(progresso ? { progresso } : {}),
        whatsapp: enviar ? "liberado para a automação" : mandaWhatsapp ? "não enviado (operador optou)" : "nenhum (WhatsApp de automação bloqueado nesta movimentação)",
        nota: "As automações da coluna rodam em segundo plano; o histórico mostra o resultado em instantes.",
        card: cardSummary(depois),
      },
      summary: `moveu ${card.cardNumber}: ${de} → ${destino.nome}${mandaWhatsapp && !enviar ? " (sem WhatsApp)" : ""}`,
      cardIds: [card.id],
    };
  },
});
