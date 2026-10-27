// Ajuste D (decisão 15 do dono, 26/10): a IA preenche e corrige o cadastro
// do card. L3 com prévia + previa_hash; campo já preenchido só troca com
// `confirmar_trocas: true` (o operador viu "antes → depois"). Lista fechada
// e normalização em app/_shared/utils/cadastro-ia.ts; escrita na lib
// app/_shared/lib/cards/cadastro.ts (mesmo log do site).

import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { updateCardFields } from "../../cards/cadastro";
import { CADASTRO_CAMPOS, CADASTRO_CAMPO_IDS, normalizeCampo, planCadastro, resolveCampo, type CadastroCampo } from "@/app/_shared/utils/cadastro-ia";
import { cardRefSchema } from "./obter-card";
import { cardSummary, loadCardState, writeCommon } from "./_escrita";

const schema = z.object({
  card: cardRefSchema,
  campos: z
    .record(z.string().min(1).max(40), z.string().max(1000))
    .refine((r) => Object.keys(r).length >= 1 && Object.keys(r).length <= 15, { message: "de 1 a 15 campos" })
    .describe(`Campo → valor novo. Campos aceitos: ${Object.values(CADASTRO_CAMPOS).join(", ")} (ou o id: ${CADASTRO_CAMPO_IDS.join(", ")}).`),
  confirmar_trocas: z
    .boolean()
    .optional()
    .describe("true só depois de o operador ver o \"antes → depois\" dos campos JÁ preenchidos e confirmar a troca. Fica fora do hash."),
  ...confirmSchema,
});

export const editarCadastro = defineTool({
  name: "editar_cadastro",
  description:
    "ESCRITA. Preenche ou corrige campos do cadastro de UM card (nome, CPF, RG, endereço, estado civil, profissão, telefones, datas, hospital, lesões…). Nunca: senha, senha do INSS, e-mail, coluna, status do checklist. Chame com confirmar: true: campo VAZIO é preenchido na hora (ação direta). Campo JÁ PREENCHIDO volta com requer_confirmacao e a prévia \"antes → depois\": mostre cada troca, pergunte \"Troco?\" e repita com confirmar: true + previa_hash + confirmar_trocas: true.",
  level: 3,
  permission: "op_write",
  schema,
  async run({ op, trace }, args) {
    const card = await loadCardState(args.card);

    const novos: Partial<Record<CadastroCampo, string>> = {};
    const erros: string[] = [];
    for (const [nome, valor] of Object.entries(args.campos)) {
      const r = resolveCampo(nome);
      if (!r) {
        erros.push(`"${nome}": campo desconhecido`);
        continue;
      }
      if ("proibido" in r) {
        erros.push(`"${nome}": ${r.proibido}`);
        continue;
      }
      const n = normalizeCampo(r.campo, valor);
      if (!n.ok) erros.push(n.motivo);
      else novos[r.campo] = n.valor;
    }
    if (erros.length) throw new OpToolError("argumentos_invalidos", erros.join("; "), 400, { camposAceitos: Object.values(CADASTRO_CAMPOS) });

    const campos = Object.keys(novos) as CadastroCampo[];
    const atual = (await db.user.findUniqueOrThrow({
      where: { id: card.id },
      select: Object.fromEntries(campos.map((c) => [c, true])) as Record<CadastroCampo, true>,
    })) as Partial<Record<CadastroCampo, string | null>>;
    const plano = planCadastro(atual, novos);
    if (!plano.mudancas.length) {
      return { data: { noop: true, mensagem: "O cadastro já está com esses valores.", card: cardSummary(card) }, summary: `noop cadastro ${card.cardNumber}`, cardIds: [card.id] };
    }
    const trocas = plano.mudancas.filter((m) => m.tipo === "trocar");

    // confirmar_trocas fica fora do hash: a prévia (sem ele) e a execução
    // (com ele) amarram os mesmos campos e valores. Preencher campo vazio é
    // direto; trocar valor existente exige ver o antes → depois (decisão 15 e 27/10).
    const out = await previewOrExecute({
      tool: "editar_cadastro",
      args: { card: args.card, campos: novos, confirmar: args.confirmar, previa_hash: args.previa_hash },
      confirmacao: trocas.length ? "exigida" : "direta",
      estado: Object.fromEntries(campos.map((c) => [c, atual[c] ?? null])),
      previa: {
        acao: "editar cadastro",
        card: { cardNumber: card.cardNumber, nome: card.name },
        preencher: plano.mudancas.filter((m) => m.tipo === "preencher").map((m) => ({ campo: m.rotulo, valor: m.para })),
        trocar: trocas.map((m) => ({ campo: m.rotulo, antes: m.de, depois: m.para })),
        jaIguais: plano.iguais.map((c) => CADASTRO_CAMPOS[c]),
        avisos: [
          ...(trocas.length ? [`${trocas.length} campo(s) já preenchido(s) vão ser TROCADOS: confirme cada "antes → depois" com o operador (confirmar_trocas: true).`] : []),
          ...(novos.name && trocas.some((t) => t.campo === "name") ? ["o nome novo também vai para o contato do WhatsApp (inbox e bot chamam o cliente por ele)"] : []),
          ...(campos.some((c) => c === "hospital" || c === "outro_hospital") ? ["hospital é condição de automação e define o pedido de prontuário"] : []),
        ],
      },
      execute: async () => {
        if (trocas.length && args.confirmar_trocas !== true) {
          throw new OpToolError(
            "confirmar_trocas",
            `Há campo já preenchido para trocar (${trocas.map((t) => t.rotulo).join(", ")}). Mostre o antes → depois e, com o OK do operador, mande confirmar_trocas: true.`,
            409,
            { trocar: trocas.map((m) => ({ campo: m.rotulo, antes: m.de, depois: m.para })) },
          );
        }
        return updateCardFields({ ...writeCommon(op, trace, card.id), campos: novos });
      },
    });
    if (!out.executed) {
      return { data: { previa: out.previa }, summary: `prévia cadastro ${card.cardNumber} (${plano.mudancas.length} campo(s))`, cardIds: [card.id] };
    }
    return {
      data: { feito: !out.result.noop, alterados: out.result.alterados.map((c) => CADASTRO_CAMPOS[c as CadastroCampo] ?? c), card: cardSummary(card) },
      summary: `cadastro ${card.cardNumber}: ${out.result.alterados.join(", ") || "nada"}`,
      cardIds: [card.id],
    };
  },
});
