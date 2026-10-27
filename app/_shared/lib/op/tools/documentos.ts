// Etapa 4: documentos preparados pela IA. `listar_modelos` (L1) mostra os
// modelos e os campos que cada um usa; `preparar_*` (L2) confere os campos do
// card e, sem faltante (ou com "gerar mesmo assim"), grava o PDF como RASCUNHO
// em op-drafts/ — o card não muda; `anexar_rascunho` (L3) vira Document na
// pasta do card: direto (decisão do dono, 27/10), em lote (`rascunhos`), e só
// o KIT/contrato pede o OK antes. Lib: app/_shared/lib/docs/drafts.ts.

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
  type DraftInfo,
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
import { LOTE_ANEXOS_MAX } from "@/app/_shared/utils/op-lote";
import { autoProgress } from "../progress";

const KINDS = ["procuracao", "pedido_prontuario", "contrato"] as const;

function asOpError(err: unknown): never {
  if (err instanceof DraftError) {
    const map: Record<DraftError["code"], [string, number]> = {
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
      `Sem faltante (ou permitir_vazios: true) → gera o PDF e devolve o link de prévia (~90 min) e o id do rascunho, que vence em ${OP_DRAFT_TTL_DAYS} dias. Para pôr no card use anexar_rascunho. Vários cards = chamadas em paralelo, uma por card. ${extra}`,
    level: 2,
    permission: "op_use",
    schema: prepararSchema,
    async run({ op, trace, previewOnly }, args) {
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
              mensagem: "Campos vazios no card. Nada foi gerado. Preencha (editar_cadastro ou aba Cadastro do card) ou peça para gerar mesmo assim (os campos saem em branco).",
            },
            summary: `${name} ${check.card.cardNumber ?? "?"}: ${faltando.length} campo(s) faltando, nada gerado`,
            cardIds: [cardId],
          };
        }
        const draft = await createDraft({ check, author: operatorAuthor(op) });
        // Item I (27/10): se há fluxo aberto do card esperando este rascunho, o passo é gravado aqui.
        const progresso = await autoProgress({ op, trace, previewOnly, cardId, match: (s) => s.kind === "rascunho" && s.rascunho === kind, refs: [draft.key] });
        return {
          data: {
            gerado: true,
            ...(progresso ? { progresso } : {}),
            card,
            modelo: template.label,
            rascunho: draft.key,
            arquivo: draft.fileName,
            previewUrl: draft.previewUrl,
            linkValidoAte: brDateTime(new Date(draft.previewExpiresAt)),
            rascunhoVenceEm: brDateTime(new Date(draft.expiresAt)),
            camposEmBranco: faltando,
            pastaSugerida: categoryLabel(draft.pastaSugerida),
            proximoPasso: "Mostre o link. Se o operador quiser no card: anexar_rascunho (direto; contrato pede confirmação).",
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
  "Só prepara o pedido: COMO e PARA ONDE mandar ao hospital vem de consultar_hospital; o envio por e-mail é preparar_email (com aprovação).",
);
export const prepararContrato = prepararTool(
  "contrato",
  "preparar_contrato",
  "KIT (procuração + contrato): é o PDF que a skill /contrato sobe no ZapSign pelo navegador do operador.",
);

// ---------------------------------------------------------------------------
// anexar_rascunho (L3) — direto; lote; contrato pede confirmação
// ---------------------------------------------------------------------------

const PASTAS = DOCUMENT_CATEGORIES.map((c) => c.id) as [DocumentCategoryId, ...DocumentCategoryId[]];

const anexarSchema = z
  .object({
    rascunho: z.string().min(10).max(200).optional().describe("Id de UM rascunho devolvido por preparar_* (começa com op-drafts/)."),
    rascunhos: z
      .array(z.string().min(10).max(200))
      .min(1)
      .max(LOTE_ANEXOS_MAX)
      .optional()
      .describe(`LOTE: até ${LOTE_ANEXOS_MAX} rascunhos de uma vez (podem ser de cards diferentes); um registro por documento.`),
    pasta: z.enum(PASTAS).optional().describe("Pasta do card. Padrão: PROCURACAO para procuração/contrato; pelo nome do arquivo para o pedido."),
    ...confirmSchema,
  })
  .refine((a) => Boolean(a.rascunho) !== Boolean(a.rascunhos), { message: "mande rascunho OU rascunhos (um dos dois)" });

interface AnexarItem {
  draft: DraftInfo;
  pasta: DocumentCategoryId;
  card: { id: string; cardNumber: number | null; name: string | null; archiveStatus: string | null };
  existing: { id: string; name: string; category: string | null; deletedAt: Date | null } | null;
}

export const anexarRascunho = defineTool({
  name: "anexar_rascunho",
  description:
    "ESCRITA. Anexa ao card, como documento na pasta certa, um ou vários rascunhos preparados pela IA (preparar_*; seus ou de um colega — o rascunho é do card), com autor \"<operador> (via IA)\". Chame com confirmar: true: executa na hora (ação direta). Só o KIT/contrato volta com requer_confirmacao e a prévia (arquivo de contrato precisa do OK do operador): mostre, pergunte \"Confirma?\" e repita com confirmar: true + previa_hash. Lote: `rascunhos`. Repetir = noop.",
  level: 3,
  permission: "op_write",
  schema: anexarSchema,
  async run({ op, trace }, args) {
    try {
      const keys = [...new Set(args.rascunhos ?? [args.rascunho!])];
      const itens: AnexarItem[] = [];
      for (const key of keys) {
        const draft = await getDraft(key);
        // Item K (27/10): o rascunho é do CARD — colega anexa o que outro preparou (a decisão 17 de 26/10 foi revogada).
        // O card do rascunho ainda tem que ser card (não virou membro/GHOST, não foi apagado).
        const card = await db.user.findFirst({ where: { ...CARD_WHERE, id: draft.cardId }, select: { id: true, cardNumber: true, name: true, archiveStatus: true } });
        if (!card) throw new DraftError("card_nao_encontrado", `O card do rascunho ${draft.fileName} não existe mais.`);
        const existing = await attachedDocument(draft);
        itens.push({ draft, pasta: args.pasta ?? defaultDraftFolder(draft.kind, draft.fileName), card, existing });
      }
      const cardIds = [...new Set(itens.map((i) => i.card.id))];
      const cardOf = (i: AnexarItem) => ({ cardNumber: i.card.cardNumber, nome: i.card.name });
      // id = ref do passo "anexar" do salvar_progresso (Etapa 6).
      const jaAnexado = (i: AnexarItem) => ({
        id: i.existing!.id,
        nome: i.existing!.name,
        pasta: categoryLabel(i.existing!.category ?? i.pasta),
        card: cardOf(i),
        rascunho: i.draft.key,
        noop: true as const,
        lixeira: Boolean(i.existing!.deletedAt),
      });

      const pendentes = itens.filter((i) => !i.existing);
      if (!pendentes.length) {
        const documentos = itens.map(jaAnexado);
        return {
          data: {
            noop: true,
            mensagem:
              itens.length === 1
                ? documentos[0].lixeira
                  ? "Este rascunho já foi anexado e o documento está na lixeira do card."
                  : "Este rascunho já está anexado ao card."
                : "Todos esses rascunhos já estavam anexados.",
            documento: documentos[0],
            documentos,
          },
          summary: `noop anexar ${keys.length} rascunho(s)`,
          cardIds,
        };
      }

      const out = await previewOrExecute({
        tool: "anexar_rascunho",
        args,
        // Arquivo de contrato (KIT) é o único que pede o OK antes (decisão do dono, 27/10).
        confirmacao: pendentes.some((i) => i.draft.kind === "contrato") ? "exigida" : "direta",
        estado: pendentes.map((i) => ({ rascunho: i.draft.key, cardId: i.card.id, pasta: i.pasta, anexado: false })),
        previa: {
          acao: pendentes.length === 1 ? "anexar documento" : `anexar ${pendentes.length} documentos`,
          itens: pendentes.map((i) => ({
            card: cardOf(i),
            arquivo: i.draft.fileName,
            tipo: DRAFT_KIND_LABEL[i.draft.kind],
            pasta: categoryLabel(i.pasta),
            camposEmBranco: i.draft.emBranco.map((c) => DOC_FIELD_LABELS[c] ?? c),
            ...(i.card.archiveStatus ? { aviso: `O card está arquivado (${i.card.archiveStatus}).` } : {}),
          })),
          jaAnexados: itens.filter((i) => i.existing).map((i) => i.draft.fileName),
          autor: operatorAuthor(op).name,
        },
        execute: async () => {
          const results: { item: AnexarItem; r: Awaited<ReturnType<typeof attachDraft>> }[] = [];
          for (const item of pendentes) {
            results.push({ item, r: await attachDraft({ draft: item.draft, category: item.pasta, author: operatorAuthor(op), source: "op", op: trace }) });
          }
          return results;
        },
      });
      if (!out.executed) {
        return { data: { previa: out.previa }, summary: `prévia anexar ${pendentes.length} rascunho(s)`, cardIds };
      }
      const documentos = [
        ...out.result.map(({ item, r }) => ({ id: r.documentId, nome: r.name, pasta: categoryLabel(r.category), card: cardOf(item), rascunho: item.draft.key, noop: r.noop })),
        ...itens.filter((i) => i.existing).map(jaAnexado),
      ];
      const anexados = out.result.filter((x) => !x.r.noop).length;
      // Item I (27/10): passo "anexar" dos fluxos abertos de cada card (1 a 5 ids por card).
      const progresso = (
        await Promise.all(
          cardIds.map((cid) =>
            autoProgress({ op, trace, cardId: cid, match: (s) => s.kind === "anexo", refs: out.result.filter((x) => x.item.card.id === cid).map((x) => x.r.documentId).slice(0, 5) }),
          ),
        )
      ).filter((p): p is NonNullable<typeof p> => !!p);
      return {
        data: {
          feito: anexados > 0,
          noop: anexados === 0,
          ...(progresso.length ? { progresso: progresso.length === 1 ? progresso[0] : progresso } : {}),
          documento: documentos[0],
          documentos,
          card: documentos[0].card,
        },
        summary: `${anexados ? `anexou ${anexados}` : "noop anexar"} documento(s)${keys.length > 1 ? ` (lote de ${keys.length})` : ""}`,
        cardIds,
      };
    } catch (err) {
      asOpError(err);
    }
  },
});
