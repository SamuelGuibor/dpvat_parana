// Lote em segundo plano da IA de operação (item O, 27/10). Opcional: o
// operador pede "em segundo plano" quando não quer esperar (decisão do dono,
// 27/10: o padrão continua sendo a análise na hora, em paralelo — a fila
// obrigatória atrasava o fluxo). Quando usada:
//   iniciar_lote  → grava o pedido em op_jobs (status pendente) e responde na hora;
//   o próprio iniciar_lote dispara um tique curto em runAfterResponse (primeiros
//     itens saem na hora) e o cron /api/op/jobs/run (5 min, maxDuration 300)
//     continua o resto → cada tique reivindica UM job por vez
//     (updateMany atômico por status) e processa item a item dentro do
//     orçamento; o que sobrar fica para o próximo tique (status volta a pendente);
//   resultado_lote / meu_dia → leem o resultado por item.
// Cada item de IA grava o mesmo log op_doc_analysis com usage (Canto da IA):
// o custo não some por rodar no cron. Nunca escreve no card: é só leitura +
// resultado em op_jobs.

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { OpToolError } from "./registry";
import { resolveOneCardId } from "./cards";
import { analyzeCardDocuments, type AnaliseObjetivo } from "./doc-analysis";
import { getOpSwitches } from "./switches";
import { dedupeRefs, refKey } from "@/app/_shared/utils/op-lote";
import type { DocumentCategoryId } from "../document-categories";

export const JOB_TIPOS = ["analisar_documentos"] as const;
export type JobTipo = (typeof JOB_TIPOS)[number];
export const JOB_MAX_ITENS = 50;
/** Job "rodando" sem progresso há mais que isso foi perdido (função morreu): outro tique reivindica. */
export const JOB_STALE_MS = 10 * 60_000;
/** Orçamento por tique do cron (maxDuration 300 s, com folga para gravar). */
export const JOB_TICK_BUDGET_MS = 240_000;
/** Reserva por item de IA (45 s de teto na chamada + S3 + log). */
const ITEM_RESERVE_MS = 60_000;
/** Tique disparado pelo iniciar_lote dentro da rota da ferramenta (maxDuration 60): cabe um item. */
export const JOB_KICK_BUDGET_MS = 55_000;
export const JOB_KICK_RESERVE_MS = 50_000;
/** Lote terminado some depois disso (tem nome/nº de card e comparação de cadastro). */
export const JOB_RETENTION_DAYS = 30;

export type JobItemStatus = "pendente" | "concluido" | "falhou";
export interface JobItem {
  card: string;
  cardId: string | null;
  cardNumber?: number | null;
  nome?: string | null;
  status: JobItemStatus;
  code?: string;
  resumo?: string;
  /** Resultado compacto por tipo (análise: arquivos lidos, comparação, sugestões). Sem texto de documento. */
  data?: unknown;
}

export interface JobArgs {
  objetivo?: AnaliseObjetivo;
  pastas?: DocumentCategoryId[];
  /** Autor dos logs de IA ("<operador> (via IA)"): o cron não tem o token do operador. */
  autor: { id: string; name: string };
}

const JOB_SELECT = {
  id: true,
  tipo: true,
  operatorId: true,
  sessionId: true,
  args: true,
  itens: true,
  total: true,
  feitos: true,
  status: true,
  claimedAt: true,
  startedAt: true,
  finishedAt: true,
  vistoEm: true,
  erro: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OpJobSelect;
export type JobRow = Prisma.OpJobGetPayload<{ select: typeof JOB_SELECT }>;

export function jobItens(row: Pick<JobRow, "itens">): JobItem[] {
  return Array.isArray(row.itens) ? (row.itens as unknown as JobItem[]) : [];
}
function jobArgs(row: Pick<JobRow, "args">): JobArgs {
  return (row.args ?? {}) as unknown as JobArgs;
}
const toJson = (v: unknown) => v as Prisma.InputJsonValue;

// ---------------------------------------------------------------------------
// criar
// ---------------------------------------------------------------------------

export async function createJob(input: {
  operatorId: string;
  sessionId: string | null;
  tipo: JobTipo;
  cards: string[];
  args: JobArgs;
}): Promise<{ jobId: string; total: number; pulados: { card: string; code: string; message: string }[] }> {
  const refs = dedupeRefs(input.cards);
  if (refs.length > JOB_MAX_ITENS) throw new OpToolError("argumentos_invalidos", `No máximo ${JOB_MAX_ITENS} cards por lote.`, 400);
  const itens: JobItem[] = [];
  const pulados: { card: string; code: string; message: string }[] = [];
  const vistos = new Set<string>();
  for (const ref of refs) {
    try {
      const cardId = await resolveOneCardId(ref);
      if (vistos.has(cardId)) {
        pulados.push({ card: ref, code: "repetido", message: "mesmo card de outra referência do lote" });
        continue;
      }
      vistos.add(cardId);
      itens.push({ card: refKey(ref), cardId, status: "pendente" });
    } catch (err) {
      pulados.push({ card: ref, code: err instanceof OpToolError ? err.code : "erro", message: err instanceof Error ? err.message : String(err) });
    }
  }
  if (!itens.length) throw new OpToolError("lote_vazio", "Nenhum card válido no lote.", 422, { pulados });
  const row = await db.opJob.create({
    data: {
      tipo: input.tipo,
      operatorId: input.operatorId,
      sessionId: input.sessionId,
      args: toJson(input.args),
      itens: toJson(itens),
      total: itens.length,
    },
    select: { id: true },
  });
  return { jobId: row.id, total: itens.length, pulados };
}

// ---------------------------------------------------------------------------
// cron: reivindicar e processar
// ---------------------------------------------------------------------------

/** Pega o job pendente mais antigo (ou um "rodando" perdido). Claim atômico: só uma função leva. */
export async function claimJob(agora = new Date()): Promise<JobRow | null> {
  const perdido = new Date(agora.getTime() - JOB_STALE_MS);
  for (let i = 0; i < 3; i++) {
    const cand = await db.opJob.findFirst({
      where: { OR: [{ status: "pendente" }, { status: "rodando", claimedAt: { lt: perdido } }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, claimedAt: true },
    });
    if (!cand) return null;
    const r = await db.opJob.updateMany({
      where: { id: cand.id, status: cand.status, claimedAt: cand.claimedAt },
      data: { status: "rodando", claimedAt: agora, startedAt: cand.status === "pendente" ? agora : undefined },
    });
    if (r.count === 1) return db.opJob.findUnique({ where: { id: cand.id }, select: JOB_SELECT });
  }
  return null;
}

async function runItem(job: JobRow, item: JobItem, switches: Record<string, boolean>): Promise<JobItem> {
  const args = jobArgs(job);
  if (job.tipo === "analisar_documentos") {
    if (switches.analisar_documentos !== true) return { ...item, status: "falhou", code: "ferramenta_desligada", resumo: "analisar_documentos está desligada no Espaço de Trabalho" };
    const r = await analyzeCardDocuments({
      cardId: item.cardId!,
      objetivo: args.objetivo ?? "cadastro",
      pastas: args.pastas,
      author: args.autor,
      trace: { sessionId: job.sessionId, requestId: null },
    });
    const comp = r.comparacao;
    return {
      ...item,
      cardNumber: r.card.cardNumber,
      nome: r.card.nome,
      status: "concluido",
      resumo: `${r.arquivosAnalisados.length} doc(s)${comp ? `, ${comp.divergencias.length} divergência(s)` : ""}`,
      data: {
        objetivo: r.objetivo,
        arquivosAnalisados: r.arquivosAnalisados,
        naoAnalisados: r.naoAnalisados,
        ...(comp ? { comparacao: { preencher: comp.preencher, trocar: comp.trocar, divergencias: comp.divergencias }, sugestoes: comp.sugestoes } : { resumo: r.resumo }),
      },
    };
  }
  return { ...item, status: "falhou", code: "tipo_desconhecido" };
}

/** Processa os itens pendentes de UM job dentro do orçamento. Devolve quantos fez. */
export async function runJob(job: JobRow, budgetMs: number, startedAt = Date.now(), reserveMs = ITEM_RESERVE_MS): Promise<{ feitos: number; terminou: boolean }> {
  const itens = jobItens(job);
  const switches = await getOpSwitches();
  let feitos = 0;
  for (let i = 0; i < itens.length; i++) {
    if (itens[i].status !== "pendente") continue;
    if (Date.now() - startedAt + reserveMs > budgetMs) break;
    try {
      itens[i] = await runItem(job, itens[i], switches);
    } catch (err) {
      itens[i] = { ...itens[i], status: "falhou", code: err instanceof OpToolError ? err.code : "erro", resumo: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
    }
    feitos++;
    // Grava a cada item: se a função morrer, o próximo tique continua do ponto
    // certo (o item em andamento na hora da morte roda de novo: custo duplicado,
    // raro, e o usage dos dois fica no log). Preso a status "rodando": se outro
    // tique reivindicou este job como perdido, este não sobrescreve nada.
    const w = await db.opJob.updateMany({
      where: { id: job.id, status: "rodando" },
      data: { itens: toJson(itens), feitos: itens.filter((x) => x.status !== "pendente").length, claimedAt: new Date() },
    });
    if (w.count !== 1) return { feitos, terminou: false };
  }
  const restantes = itens.filter((x) => x.status === "pendente").length;
  const terminou = restantes === 0;
  await db.opJob.updateMany({
    where: { id: job.id, status: "rodando" },
    data: terminou
      ? { status: itens.every((x) => x.status === "falhou") ? "falhou" : "concluido", finishedAt: new Date(), claimedAt: null }
      : { status: "pendente", claimedAt: null },
  });
  return { feitos, terminou };
}

/** Um tique do cron: reivindica e processa jobs até o orçamento acabar. */
export async function runJobsTick(budgetMs = JOB_TICK_BUDGET_MS, reserveMs = ITEM_RESERVE_MS): Promise<{ jobs: number; itens: number; terminados: number }> {
  const startedAt = Date.now();
  let jobs = 0;
  let itens = 0;
  let terminados = 0;
  while (Date.now() - startedAt + reserveMs <= budgetMs) {
    const job = await claimJob();
    if (!job) break;
    jobs++;
    const r = await runJob(job, budgetMs, startedAt, reserveMs);
    itens += r.feitos;
    if (r.terminou) terminados++;
    if (!r.terminou) break; // orçamento acabou no meio deste
  }
  return { jobs, itens, terminados };
}

/** Retenção (cron diário de maintenance/retention): lote terminado há mais de 30 dias some. */
export async function purgeOldJobs(agora = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - JOB_RETENTION_DAYS * 86_400_000);
  const r = await db.opJob.deleteMany({ where: { status: { in: ["concluido", "falhou", "cancelado"] }, finishedAt: { lt: limite } } });
  return r.count;
}

// ---------------------------------------------------------------------------
// leitura
// ---------------------------------------------------------------------------

export function jobSummary(row: JobRow) {
  const itens = jobItens(row);
  return {
    lote: row.id,
    tipo: row.tipo,
    status: row.status,
    total: row.total,
    feitos: row.feitos,
    falhas: itens.filter((i) => i.status === "falhou").length,
    criadoEm: row.createdAt,
    terminadoEm: row.finishedAt,
    visto: !!row.vistoEm,
  };
}

/** Jobs do operador: terminados ainda não vistos + em andamento (para o meu_dia). */
export async function pendingJobsFor(operatorId: string): Promise<JobRow[]> {
  return db.opJob.findMany({
    where: { operatorId, OR: [{ status: { in: ["pendente", "rodando"] } }, { status: { in: ["concluido", "falhou"] }, vistoEm: null }] },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: JOB_SELECT,
  });
}

export async function listJobsFor(operatorId: string, take = 10): Promise<JobRow[]> {
  return db.opJob.findMany({ where: { operatorId }, orderBy: { createdAt: "desc" }, take, select: JOB_SELECT });
}

/** Job do próprio operador (o de colega não é lido: o resultado tem dado do cliente). Marca como visto quando terminou. */
export async function loadJobFor(id: string, operatorId: string, marcarVisto = true): Promise<JobRow> {
  const row = await db.opJob.findUnique({ where: { id }, select: JOB_SELECT });
  if (!row || row.operatorId !== operatorId) throw new OpToolError("nao_encontrado", "Lote não encontrado (ou é de outro operador).", 404);
  if (marcarVisto && !row.vistoEm && (row.status === "concluido" || row.status === "falhou")) {
    await db.opJob.update({ where: { id }, data: { vistoEm: new Date() } });
  }
  return row;
}
