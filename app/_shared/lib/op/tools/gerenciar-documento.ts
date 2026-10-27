// Ajuste A (26/10): documento do card pela IA — renomear, trocar de pasta,
// mandar para a lixeira, restaurar. Tudo reversível (lixeira de 30 dias),
// então L3 com prévia + previa_hash e interruptor desligado por padrão.
// Excluir de vez (purga) continua só no site. Lib: app/_shared/lib/cards/documents.ts.

import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { finalDocName, writeDocument, type DocumentAction } from "../../cards/documents";
import { DOCUMENT_CATEGORIES, categoryLabel, inferCategory, type DocumentCategoryId } from "../../document-categories";
import { normalizeColumnName } from "../resolve";
import { cardRefSchema } from "./obter-card";
import { cardSummary, loadCardState, writeCommon } from "./_escrita";

const ACOES = ["renomear", "mover_pasta", "lixeira", "restaurar"] as const;

const schema = z
  .object({
    card: cardRefSchema,
    documento: z.string().min(1).max(300).describe("id do documento (listar_documentos) ou o nome EXATO."),
    acao: z.enum(ACOES).describe("renomear | mover_pasta | lixeira (restaurável por 30 dias) | restaurar (tira da lixeira)."),
    nome: z.string().min(1).max(200).optional().describe("Só em renomear: nome novo (a extensão do arquivo é mantida)."),
    pasta: z.string().min(1).max(60).optional().describe(`Só em mover_pasta: ${DOCUMENT_CATEGORIES.map((c) => c.label).join(", ")}.`),
    ...confirmSchema,
  })
  .refine((a) => (a.acao === "renomear") === Boolean(a.nome), { message: "nome só (e sempre) com renomear" })
  .refine((a) => (a.acao === "mover_pasta") === Boolean(a.pasta), { message: "pasta só (e sempre) com mover_pasta" });

function resolvePasta(q: string): DocumentCategoryId {
  const n = normalizeColumnName(q);
  const hit = DOCUMENT_CATEGORIES.find((c) => normalizeColumnName(c.id) === n || normalizeColumnName(c.label) === n);
  if (!hit) throw new OpToolError("nao_encontrado", `Pasta "${q}" não existe.`, 404, DOCUMENT_CATEGORIES.map((c) => c.label));
  return hit.id;
}

export const gerenciarDocumento = defineTool({
  name: "gerenciar_documento",
  description:
    "ESCRITA. Renomeia, troca de pasta, manda para a lixeira (restaurável por 30 dias) ou restaura UM documento do card. Excluir de vez não existe aqui (só no site). Chame com confirmar: true: renomear, mover_pasta e restaurar executam na hora. Só lixeira volta com requer_confirmacao e a prévia: mostre, pergunte \"Confirma?\" e repita com confirmar: true + previa_hash.",
  level: 3,
  permission: "op_write",
  schema,
  async run({ op, trace }, args) {
    const card = await loadCardState(args.card);
    const naLixeira = args.acao === "restaurar";
    const docs = await db.document.findMany({
      where: { userId: card.id, deletedAt: naLixeira ? { not: null } : null },
      select: { id: true, key: true, name: true, category: true, deletedAt: true },
      take: 500,
    });
    const byId = docs.find((d) => d.id === args.documento);
    const byName = byId ? [] : docs.filter((d) => d.name === args.documento);
    if (!byId && byName.length > 1) {
      throw new OpToolError("ambiguo", `Há ${byName.length} documentos chamados "${args.documento}". Use o id.`, 409, byName.map((d) => ({ id: d.id, pasta: categoryLabel(d.category ?? inferCategory(d.name)) })));
    }
    const doc = byId ?? byName[0];
    if (!doc) {
      throw new OpToolError("nao_encontrado", naLixeira ? "Documento não está na lixeira deste card." : "Documento não encontrado neste card (ou está na lixeira).", 404);
    }

    let acao: DocumentAction;
    let para: string;
    if (args.acao === "renomear") {
      const nome = finalDocName(args.nome!, doc.key);
      if (!nome) throw new OpToolError("argumentos_invalidos", "Nome inválido.", 400);
      acao = { tipo: "renomear", nome };
      para = nome;
    } else if (args.acao === "mover_pasta") {
      const pasta = resolvePasta(args.pasta!);
      acao = { tipo: "mover_pasta", pasta };
      para = `pasta ${categoryLabel(pasta)}`;
    } else {
      acao = { tipo: args.acao };
      para = args.acao === "lixeira" ? "lixeira (restaurável por 30 dias)" : "volta para a aba Arquivos";
    }
    const pastaAtual = doc.category ?? inferCategory(doc.name);
    const noop = (acao.tipo === "renomear" && acao.nome === doc.name) || (acao.tipo === "mover_pasta" && doc.category === acao.pasta);
    if (noop) {
      return { data: { noop: true, mensagem: "O documento já está assim.", card: cardSummary(card) }, summary: `noop documento ${card.cardNumber}`, cardIds: [card.id] };
    }

    const out = await previewOrExecute({
      tool: "gerenciar_documento",
      args: { ...args, documento: doc.id },
      // Decisão do dono (27/10): só tirar arquivo da aba pede confirmação.
      confirmacao: args.acao === "lixeira" ? "exigida" : "direta",
      estado: { id: doc.id, name: doc.name, category: doc.category, lixeira: Boolean(doc.deletedAt) },
      previa: {
        acao: args.acao,
        card: { cardNumber: card.cardNumber, nome: card.name },
        documento: { id: doc.id, nome: doc.name, pasta: categoryLabel(pastaAtual) },
        para,
        avisos: args.acao === "lixeira" ? ["sai da aba Arquivos e da pasta compartilhada; restaurável por 30 dias"] : [],
      },
      execute: () => writeDocument({ ...writeCommon(op, trace, card.id), documentId: doc.id, acao }),
    });
    if (!out.executed) {
      return { data: { previa: out.previa }, summary: `prévia ${args.acao} documento ${card.cardNumber}`, cardIds: [card.id] };
    }
    return { data: { feito: !out.result.noop, documento: doc.id, acao: args.acao, para }, summary: `${args.acao} documento em ${card.cardNumber}`, cardIds: [card.id] };
  },
});
