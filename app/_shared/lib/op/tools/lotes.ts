// Item O (27/10): lote em segundo plano. iniciar_lote grava o pedido e
// responde na hora; o cron processa; resultado_lote lê. Lib: op/jobs.ts.

import { z } from "zod/v4";
import { defineTool } from "../registry";
import { operatorAuthor } from "./_escrita";
import { cardRefSchema } from "./obter-card";
import { DOCUMENT_CATEGORIES, type DocumentCategoryId } from "../../document-categories";
import { JOB_KICK_BUDGET_MS, JOB_KICK_RESERVE_MS, JOB_MAX_ITENS, JOB_TIPOS, createJob, jobItens, jobSummary, listJobsFor, loadJobFor, runJobsTick } from "../jobs";
import { runAfterResponse } from "../../background";
import { brDateTime } from "../resolve";

const PASTAS = DOCUMENT_CATEGORIES.map((c) => c.id) as [DocumentCategoryId, ...DocumentCategoryId[]];

const iniciarSchema = z.object({
  tipo: z.enum(JOB_TIPOS).default("analisar_documentos").describe("analisar_documentos = ler com IA os documentos de cada card (igual à ferramenta, só que em segundo plano)."),
  cards: z.array(cardRefSchema).min(1).max(JOB_MAX_ITENS).describe(`Cards do lote (nº, CPF ou telefone; até ${JOB_MAX_ITENS}).`),
  objetivo: z.enum(["cadastro", "resumo"]).default("cadastro").optional(),
  pastas: z.array(z.enum(PASTAS)).max(PASTAS.length).optional(),
});

export const iniciarLote = defineTool({
  name: "iniciar_lote",
  description:
    `LOTE EM SEGUNDO PLANO — só quando o operador pedir "em segundo plano"/"depois" (o padrão é analisar na hora, em paralelo). Grava o pedido e responde na hora; o CRM processa sozinho (começa na hora, ~1 min por card) e o resultado aparece em resultado_lote ou no meu_dia. Hoje: analisar_documentos (leitura dos documentos com IA, custo por card). Não altera nenhum card. Diga ao operador o id do lote e que ele pode seguir trabalhando.`,
  level: 1,
  permission: "run_ai_audit",
  // Custa IA (um analisar_documentos por card): nasce desligada como a ferramenta direta.
  switchable: true,
  schema: iniciarSchema,
  async run({ op, trace }, args) {
    const r = await createJob({
      operatorId: op.userId,
      sessionId: trace.sessionId,
      tipo: args.tipo,
      cards: args.cards,
      args: { objetivo: args.objetivo ?? "cadastro", pastas: args.pastas, autor: operatorAuthor(op) },
    });
    // Primeiro item sai na hora (depois da resposta, dentro do maxDuration 60 da
    // rota); o cron de 5 min continua o resto. Claim atômico: não briga com o cron.
    runAfterResponse("op_jobs_kick", () => runJobsTick(JOB_KICK_BUDGET_MS, JOB_KICK_RESERVE_MS));
    return {
      data: {
        lote: r.jobId,
        tipo: args.tipo,
        total: r.total,
        pulados: r.pulados,
        previsao: `o primeiro card sai agora; o resto roda em segundo plano, ~1 min por card (${r.total} card(s))`,
        proximoPasso: `Diga ao operador: lote ${r.jobId} rodando; o resultado vem em resultado_lote (ou no /meu-dia). Ele pode seguir com outra coisa.`,
      },
      summary: `lote ${args.tipo} com ${r.total} card(s) na fila${r.pulados.length ? ` (${r.pulados.length} pulado(s))` : ""}`,
    };
  },
});

const resultadoSchema = z.object({
  lote: z.string().min(5).max(64).optional().describe("Id do lote (de iniciar_lote). Sem ele: seus últimos lotes."),
});

export const resultadoLote = defineTool({
  name: "resultado_lote",
  description:
    "Resultado de um lote em segundo plano (iniciar_lote): status, quantos cards já foram, e por card o que a análise achou (arquivos lidos, divergências, sugestões para editar_cadastro). Sem `lote`: lista os seus últimos lotes. Só os seus (o de colega não aparece). Só leitura.",
  level: 1,
  permission: "op_use",
  schema: resultadoSchema,
  async run({ op }, args) {
    if (!args.lote) {
      const rows = await listJobsFor(op.userId);
      return {
        data: { lotes: rows.map((r) => ({ ...jobSummary(r), criadoEm: brDateTime(r.createdAt), terminadoEm: r.finishedAt ? brDateTime(r.finishedAt) : null })) },
        summary: `${rows.length} lote(s) do operador`,
      };
    }
    const row = await loadJobFor(args.lote, op.userId);
    const itens = jobItens(row);
    const s = jobSummary(row);
    return {
      data: {
        ...s,
        criadoEm: brDateTime(row.createdAt),
        terminadoEm: row.finishedAt ? brDateTime(row.finishedAt) : null,
        andamento: row.status === "pendente" ? "na fila (segue em até 5 min)" : row.status === "rodando" ? `processando (${row.feitos}/${row.total})` : null,
        itens: itens.map((i) => ({ card: i.cardNumber ?? i.card, nome: i.nome ?? null, status: i.status, ...(i.code ? { code: i.code } : {}), ...(i.resumo ? { resumo: i.resumo } : {}), ...(i.data ? { resultado: i.data } : {}) })),
        proximoPasso:
          row.status === "concluido" || row.status === "falhou"
            ? "Mostre por card o que mudou (divergências/sugestões) e ofereça editar_cadastro; campo vazio grava direto, troca exige o OK."
            : "Ainda rodando: diga o andamento e siga com outra coisa; consulte de novo depois.",
      },
      summary: `lote ${row.id}: ${row.status} ${row.feitos}/${row.total}`,
      cardIds: itens.map((i) => i.cardId).filter((x): x is string => !!x),
    };
  },
});
