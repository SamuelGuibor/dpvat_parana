// Etapa 4: documentos preparados pela IA. `listar_modelos` (L1) mostra os
// modelos e os campos que cada um usa; `preparar_*` (L2) confere os campos do
// card e, sem faltante (ou com "gerar mesmo assim"), grava o PDF como RASCUNHO
// em op-drafts/ — o card não muda; `anexar_rascunho` (L3, prévia + "sim") vira
// Document na pasta do card. Lib: app/_shared/lib/docs/drafts.ts.

import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError, type OpTool } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { CARD_WHERE, resolveOneCardId } from "../cards";
import { cardRefSchema } from "./obter-card";
import { operatorAuthor } from "./_escrita";
import {
  attachDraft,
  attachedDocument,
  checkDraft,
  createDraft,
  defaultDraftFolder,
  DraftError,
  getDraft,
  listDraftTemplates,
} from "../../docs/drafts";
import { ConverterError } from "../../docs/converter";
import { DOCUMENT_CATEGORIES, categoryLabel, type DocumentCategoryId } from "../../document-categories";
import { brDateTime } from "../resolve";
import {
  DRAFT_KIND_LABEL,
  DRAFT_KIND_TOOL,
  DOC_FIELD_LABELS,
  matchTemplate,
  OP_DRAFT_TTL_DAYS,
  type DraftKind,
} from "@/app/_shared/utils/doc-fields";

const KINDS = ["procuracao", "pedido_prontuario", "contrato"] as const;

function asOpError(err: unknown): never {
  if (err instanceof DraftError) {
    const map: Record<DraftError["code"], [string, number]> = {
      rascunho_de_outro_operador: ["sem_permissao", 403],
      rascunho_invalido: ["rascunho_invalido", 400],
      rascunho_expirado: ["rascunho_expirado", 404],
      card_nao_encontrado: ["nao_encontrado", 404],
      modelo_nao_encontrado: ["nao_encontrado", 404],
      modelo_invalido: ["modelo_invalido", 422],
    };
    const [code, status] = map[err.code];
    throw new OpToolError(code, err.message, status);
  }
  if (err instanceof ConverterError) {
    throw new OpToolError(err.code, `${err.message} Nada foi gravado.`, err.code === "modelo_invalido" ? 422 : 503);
  }
  throw err;
}

// ---------------------------------------------------------------------------
// listar_modelos (L1)
// ---------------------------------------------------------------------------

export const listarModelos = defineTool({
  name: "listar_modelos",
  description:
    "Modelos de documento (.docx) que a IA pode preparar — os mesmos do \"Gerar Procuração\" do card —, com o tipo (procuracao, pedido_prontuario, contrato) e os campos do cadastro que cada um usa. Use antes de preparar_* para escolher o nome EXATO do modelo.",
  level: 1,
  permission: "op_use",
  schema: z.object({ tipo: z.enum(KINDS).optional().describe("Filtra por tipo.") }),
  async run(_ctx, args) {
    const modelos = await listDraftTemplates(args.tipo);
    return {
      data: {
        modelos: modelos.map((m) => ({
          modelo: m.label,
          arquivo: m.filename,
          tipo: m.tipo,
          ferramenta: DRAFT_KIND_TOOL[m.tipo],
          campos: m.campos.map((c) => DOC_FIELD_LABELS[c] ?? c),
        })),
      },
      summary: `${modelos.length} modelo(s)${args.tipo ? ` ${args.tipo}` : ""}`,
    };
  },
});

// ---------------------------------------------------------------------------
// preparar_* (L2)
// ---------------------------------------------------------------------------

const prepararSchema = z.object({
  card: cardRefSchema,
  modelo: z.string().min(1).max(200).describe("Nome EXATO do modelo (de listar_modelos: o \"modelo\" ou o \"arquivo\")."),
  permitir_vazios: z
    .boolean()
    .default(false)
    .describe("Só true se o operador disse \"gerar mesmo assim\" depois de ver os campos faltando. Padrão false: com campo faltando nada é gerado."),
});

async function resolveTemplate(kind: DraftKind, query: string) {
  const all = await listDraftTemplates();
  const { exact, candidates } = matchTemplate(all, query);
  if (!exact) {
    if (candidates.length) {
      throw new OpToolError("ambiguo", `"${query}" não é o nome exato de um modelo. Qual destes?`, 409, candidates.map((c) => c.label));
    }
    throw new OpToolError("nao_encontrado", `Nenhum modelo chamado "${query}".`, 404, all.filter((t) => t.tipo === kind).map((t) => t.label));
  }
  if (exact.tipo !== kind) {
    throw new OpToolError(
      "modelo_de_outro_tipo",
      `"${exact.label}" é ${DRAFT_KIND_LABEL[exact.tipo]}: use ${DRAFT_KIND_TOOL[exact.tipo]}.`,
      400,
      { tipo: exact.tipo, ferramenta: DRAFT_KIND_TOOL[exact.tipo] },
    );
  }
  return exact;
}

function prepararTool(kind: DraftKind, name: string, extra: string): OpTool {
  return defineTool({
    name,
    description:
      `PREPARA ${DRAFT_KIND_LABEL[kind]} de UM card como RASCUNHO (não mexe no card): confere os campos do cadastro que o modelo usa. ` +
      `Com campo faltando e sem permitir_vazios → devolve a lista (gerado: false) e NADA é gerado: mostre ao operador e pergunte se quer gerar mesmo assim ou preencher no site antes. ` +
      `Sem faltante (ou permitir_vazios: true) → gera o PDF e devolve o link de prévia (~90 min) e o id do rascunho, que vence em ${OP_DRAFT_TTL_DAYS} dias. Para pôr no card use anexar_rascunho. ${extra}`,
    level: 2,
    permission: "op_use",
    schema: prepararSchema,
    async run({ op }, args) {
      const cardId = await resolveOneCardId(args.card);
      const template = await resolveTemplate(kind, args.modelo);
      try {
        const check = await checkDraft({ cardId, template });
        const card = { cardNumber: check.card.cardNumber, nome: check.card.name };
        const faltando = check.faltando.map((f) => f.rotulo + (f.desconhecido ? " (o CRM não tem este campo)" : ""));
        if (check.faltando.length && !args.permitir_vazios) {
          return {
            data: {
              gerado: false,
              card,
              modelo: template.label,
              camposFaltando: faltando,
              mensagem: "Campos vazios no card. Nada foi gerado. Preencha no site (aba Cadastro do card) ou peça para gerar mesmo assim (os campos saem em branco).",
            },
            summary: `${name} ${check.card.cardNumber ?? "?"}: ${faltando.length} campo(s) faltando, nada gerado`,
            cardIds: [cardId],
          };
        }
        const draft = await createDraft({ check, author: operatorAuthor(op) });
        return {
          data: {
            gerado: true,
            card,
            modelo: template.label,
            rascunho: draft.key,
            arquivo: draft.fileName,
            previewUrl: draft.previewUrl,
            linkValidoAte: brDateTime(new Date(draft.previewExpiresAt)),
            rascunhoVenceEm: brDateTime(new Date(draft.expiresAt)),
            camposEmBranco: faltando,
            pastaSugerida: categoryLabel(draft.pastaSugerida),
            proximoPasso: "Mostre o link. Se o operador quiser no card: anexar_rascunho (prévia → \"sim\").",
          },
          summary: `${name} ${check.card.cardNumber ?? "?"}: rascunho ${draft.key}${faltando.length ? ` (${faltando.length} em branco)` : ""}`,
          cardIds: [cardId],
        };
      } catch (err) {
        asOpError(err);
      }
    },
  });
}

export const prepararProcuracao = prepararTool(
  "procuracao",
  "preparar_procuracao",
  "Modelos do tipo procuracao (procurações e declaração de hipossuficiência).",
);
export const prepararPedidoProntuario = prepararTool(
  "pedido_prontuario",
  "preparar_pedido_prontuario",
  "Só prepara o pedido: COMO e PARA ONDE mandar ao hospital vem de consultar_hospital, e o envio não é feito pela IA nesta etapa.",
);
export const prepararContrato = prepararTool(
  "contrato",
  "preparar_contrato",
  "KIT (procuração + contrato): é o PDF que a skill /contrato sobe no ZapSign pelo navegador do operador.",
);

// ---------------------------------------------------------------------------
// anexar_rascunho (L3)
// ---------------------------------------------------------------------------

const PASTAS = DOCUMENT_CATEGORIES.map((c) => c.id) as [DocumentCategoryId, ...DocumentCategoryId[]];

const anexarSchema = z.object({
  rascunho: z.string().min(10).max(200).describe("Id do rascunho devolvido por preparar_* (começa com op-drafts/)."),
  pasta: z.enum(PASTAS).optional().describe("Pasta do card. Padrão: PROCURACAO para procuração/contrato; pelo nome do arquivo para o pedido."),
  ...confirmSchema,
});

export const anexarRascunho = defineTool({
  name: "anexar_rascunho",
  description:
    "ESCRITA. Anexa ao card, como documento na pasta certa, um rascunho que VOCÊ preparou (preparar_*), com autor \"<operador> (via IA)\". Sem confirmar = só prévia (arquivo, card, pasta, campos que saíram em branco). Mostre a prévia, pergunte \"Confirma?\" e só então chame com confirmar: true + previa_hash. Repetir = noop.",
  level: 3,
  permission: "op_write",
  schema: anexarSchema,
  async run({ op, trace }, args) {
    try {
      const draft = await getDraft(args.rascunho);
      if (draft.operatorId !== op.userId) {
        throw new DraftError("rascunho_de_outro_operador", "Só quem preparou o rascunho pode anexá-lo. Prepare o seu.");
      }
      // O card do rascunho ainda tem que ser card (não virou membro/GHOST, não foi apagado).
      const isCard = await db.user.findFirst({ where: { ...CARD_WHERE, id: draft.cardId }, select: { id: true } });
      if (!isCard) throw new DraftError("card_nao_encontrado", "O card deste rascunho não existe mais.");
      const card = isCard.id;
      const existing = await attachedDocument(draft);
      if (existing) {
        return {
          data: {
            noop: true,
            mensagem: existing.deletedAt ? "Este rascunho já foi anexado e o documento está na lixeira do card." : "Este rascunho já está anexado ao card.",
            documento: { nome: existing.name, pasta: categoryLabel(existing.category) },
          },
          summary: `noop anexar ${draft.key}`,
          cardIds: [card],
        };
      }
      const pasta = args.pasta ?? defaultDraftFolder(draft.kind, draft.fileName);
      const cardRow = await db.user.findUniqueOrThrow({ where: { id: card }, select: { cardNumber: true, name: true, archiveStatus: true } });
      const out = await previewOrExecute({
        tool: "anexar_rascunho",
        args,
        estado: { rascunho: draft.key, cardId: card, pasta, anexado: false },
        previa: {
          acao: "anexar documento",
          card: { cardNumber: cardRow.cardNumber, nome: cardRow.name },
          arquivo: draft.fileName,
          tipo: DRAFT_KIND_LABEL[draft.kind],
          pasta: categoryLabel(pasta),
          camposEmBranco: draft.emBranco.map((c) => DOC_FIELD_LABELS[c] ?? c),
          autor: operatorAuthor(op).name,
          ...(cardRow.archiveStatus ? { aviso: `O card está arquivado (${cardRow.archiveStatus}).` } : {}),
        },
        execute: () => attachDraft({ draft, category: pasta, author: operatorAuthor(op), source: "op", op: trace }),
      });
      if (!out.executed) {
        return { data: { previa: out.previa }, summary: `prévia anexar ${draft.fileName} em ${cardRow.cardNumber ?? "?"}`, cardIds: [card] };
      }
      return {
        data: {
          feito: !out.result.noop,
          noop: out.result.noop,
          documento: { nome: out.result.name, pasta: categoryLabel(out.result.category) },
          card: { cardNumber: cardRow.cardNumber, nome: cardRow.name },
        },
        summary: `${out.result.noop ? "noop" : "anexou"} ${draft.fileName} em ${cardRow.cardNumber ?? "?"}`,
        cardIds: [card],
      };
    } catch (err) {
      asOpError(err);
    }
  },
});
