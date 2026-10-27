// Decisão do dono (27/10): a IA lê os documentos do card em LOTE (todos os da
// pasta numa chamada) e entrega o resultado pronto para agir — o CPF/RG/nome
// que está no documento, as divergências com o cadastro e as sugestões para
// editar_cadastro. L1 (só lê; grava só o log com usage). Custa uma chamada de
// IA por card: vários cards = chamadas em paralelo pela skill.
// Lib: app/_shared/lib/op/doc-analysis.ts.

import { z } from "zod/v4";
import { defineTool } from "../registry";
import { resolveOneCardId } from "../cards";
import { analyzeCardDocuments } from "../doc-analysis";
import { operatorAuthor } from "./_escrita";
import { cardRefSchema } from "./obter-card";
import { DOCUMENT_CATEGORIES, categoryLabel, type DocumentCategoryId } from "../../document-categories";
import { CADASTRO_CAMPOS } from "@/app/_shared/utils/cadastro-ia";

const PASTAS = DOCUMENT_CATEGORIES.map((c) => c.id) as [DocumentCategoryId, ...DocumentCategoryId[]];

const schema = z.object({
  card: cardRefSchema,
  pastas: z
    .array(z.enum(PASTAS))
    .max(PASTAS.length)
    .optional()
    .describe("Pastas a ler. Padrão: IDENTIFICACAO no objetivo cadastro; todas no resumo."),
  documentos: z.array(z.string().min(1).max(300)).max(12).optional().describe("Só estes documentos (id ou nome EXATO de listar_documentos). Sobrepõe pastas."),
  objetivo: z
    .enum(["cadastro", "resumo"])
    .default("cadastro")
    .describe("cadastro = extrai nome/CPF/RG/datas/endereço e compara com o card (sugestões para editar_cadastro). resumo = descreve cada arquivo."),
});

export const analisarDocumentos = defineTool({
  name: "analisar_documentos",
  description:
    "LÊ COM IA os documentos de UM card de uma vez (lote: todos os arquivos da pasta numa chamada; 12 arquivos, 8 MB cada) e devolve o que está escrito neles. objetivo cadastro (padrão): tipo, nome, CPF, RG, nascimento, filiação, endereço de cada arquivo + `comparacao` com o cadastro (preencher / trocar / divergências) e `sugestoes` prontas para editar_cadastro. objetivo resumo: o que é e o que diz cada arquivo. Não altera nada. Vários cards: chame em paralelo, um por card. Cada chamada custa IA (entra no Canto da IA).",
  level: 1,
  permission: "run_ai_audit",
  // Custa IA por chamada: nasce com interruptor desligado (kill switch de custo), como as L3.
  switchable: true,
  schema,
  async run({ op, trace }, args) {
    const cardId = await resolveOneCardId(args.card);
    const r = await analyzeCardDocuments({
      cardId,
      pastas: args.pastas,
      documentos: args.documentos,
      objetivo: args.objetivo,
      author: operatorAuthor(op),
      trace,
    });
    const comp = r.comparacao;
    const divergencias = comp?.divergencias.length ?? 0;
    const pastasLidas = args.documentos?.length ? null : (args.pastas?.length ? args.pastas : r.objetivo === "cadastro" ? ["IDENTIFICACAO" as const] : PASTAS).map(categoryLabel);
    return {
      data: {
        card: r.card,
        objetivo: r.objetivo,
        arquivosAnalisados: r.arquivosAnalisados,
        naoAnalisados: r.naoAnalisados,
        pastasLidas,
        documentos: r.documentos,
        resumo: r.resumo,
        ...(comp
          ? {
              comparacao: {
                preencher: comp.preencher,
                trocar: comp.trocar,
                divergencias: comp.divergencias,
                iguais: comp.iguais.map((c) => CADASTRO_CAMPOS[c]),
              },
              sugestoes: comp.sugestoes,
              proximoPasso: Object.keys(comp.sugestoes).length
                ? "Mostre as divergências (documento × card) e ofereça corrigir com editar_cadastro (campos = sugestoes). Campo vazio grava direto; troca exige o OK do operador."
                : "Cadastro bate com os documentos lidos.",
            }
          : {}),
        aviso: "Valores lidos pela IA do que está escrito nos arquivos; confira o documento antes de trocar um campo já preenchido.",
      },
      summary: `analisou ${r.arquivosAnalisados.length} doc(s) do card ${r.card.cardNumber ?? "?"} (${r.objetivo}${comp ? `, ${divergencias} divergência(s)` : ""})`,
      cardIds: [cardId],
    };
  },
});
