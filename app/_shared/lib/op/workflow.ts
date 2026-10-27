// Workflows com retomada da IA de operação (Etapa 6).
//
// O progresso de um fluxo longo (/prontuario…) fica em op_workflows (decisão
// 21 do dono, 26/10; até então era op_requests.state do prompt de origem) e
// sobrevive à conversa e ao dia. Regras (docs/ai-first/06-plano-etapa-6.md e
// 09-decisoes-dono-26-10.md):
// - um fluxo aberto por (workflow, card), de QUALQUER operador: o caso passa
//   por vários operadores e um retoma o do colega (decisão 20). O registro
//   guarda quem começou, quem mexeu por último e todos que passaram;
// - o estado guarda só ids/keys (schema em app/_shared/utils/workflows.ts);
// - todo ref é conferido AQUI antes de virar "feito" (o servidor só confia no
//   que ele mesmo confere: key de rascunho do próprio operador e do card,
//   aprovação executada, tag/coluna que o card tem agora);
// - retomar relê a fonte (rascunho, anexo, aprovação, card) e nunca
//   reaproveita aprovação: a pendente é cancelada e o preparo é refeito.
// Escreve só em op_workflows (e cancela aprovação pendente do fluxo em
// op_approvals) — nunca no card.

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { OpToolError } from "./registry";
import type { OperatorContext } from "./auth";
import type { OpTrace } from "../cards/types";
import { CARD_WHERE, resolveOneCardId } from "./cards";
import { normalizeColumnName } from "./resolve";
import { DraftError, getDraft } from "../docs/drafts";
import { isApprovalExpired } from "@/app/_shared/utils/approval-code";
import {
  block,
  campoKey,
  checkStep,
  currentStep,
  finish,
  isBloqueioCodigo,
  isOpen,
  isStale,
  markDone,
  newState,
  parseWorkflowState,
  resumePlan,
  stepOf,
  workflowDef,
  workflowStateSchema,
  type ApprovalFact,
  type ResumeFacts,
  type ResumePlan,
  type WorkflowBloqueio,
  type WorkflowId,
  type WorkflowState,
  type WorkflowStep,
} from "@/app/_shared/utils/workflows";

type Tx = Prisma.TransactionClient;

export interface FlowRow {
  id: string;
  createdAt: Date;
  state: WorkflowState;
  startedById: string;
  lastOperatorId: string;
  operatorIds: string[];
}

const OPEN_STATUS = ["em_andamento", "bloqueado"];
const FLOW_SELECT = { id: true, createdAt: true, state: true, startedById: true, lastOperatorId: true, operatorIds: true } as const;

/**
 * Fluxos abertos (mais novo primeiro): de um card+workflow (de qualquer
 * operador), de um card, ou aqueles em que o operador mexeu.
 */
export async function openFlows(
  client: Tx | typeof db,
  filter: { workflow: WorkflowId; cardId: string } | { cardId: string } | { operatorId: string },
): Promise<FlowRow[]> {
  const where: Prisma.OpWorkflowWhereInput =
    "operatorId" in filter
      ? { operatorIds: { has: filter.operatorId } }
      : { cardId: filter.cardId, ...("workflow" in filter ? { workflow: filter.workflow } : {}) };
  const rows = await client.opWorkflow.findMany({
    where: { ...where, status: { in: OPEN_STATUS } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: FLOW_SELECT,
  });
  const out: FlowRow[] = [];
  for (const r of rows) {
    const state = parseWorkflowState(r.state);
    if (state && isOpen(state)) out.push({ ...r, state });
  }
  return out;
}

/** Lock por (workflow, card): dois operadores no mesmo caso não abrem dois fluxos. */
async function lockFlow(tx: Tx, workflow: string, cardId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`op_wf:${workflow}:${cardId}`}))`;
}

/** Dados do registro a cada gravação: status espelhado + quem mexeu por último. */
function flowWrite(estado: WorkflowState, operatorId: string, operatorIds: string[]) {
  return {
    state: toJson(estado),
    status: estado.status,
    lastOperatorId: operatorId,
    operatorIds: operatorIds.includes(operatorId) ? operatorIds : [...operatorIds, operatorId],
  };
}

function validState(state: WorkflowState): WorkflowState {
  const r = workflowStateSchema.safeParse(state);
  if (!r.success) {
    throw new OpToolError("estado_invalido", `Progresso não salvo: ${r.error.issues[0]?.message ?? "estado inválido"}. O progresso só guarda ids do CRM (nunca nome, CPF, telefone ou e-mail).`, 422);
  }
  return r.data;
}

const toJson = (s: WorkflowState) => s as unknown as Prisma.InputJsonValue;

// ---------------------------------------------------------------------------
// Conferência do ref de cada passo
// ---------------------------------------------------------------------------

interface CardFacts {
  id: string;
  cardNumber: number | null;
  name: string | null;
  labelId: string | null;
  archiveStatus: string | null;
  label: { name: string } | null;
  cardTags: { name: string }[];
}

async function loadCard(cardId: string): Promise<CardFacts | null> {
  return db.user.findFirst({
    where: { ...CARD_WHERE, id: cardId },
    select: { id: true, cardNumber: true, name: true, labelId: true, archiveStatus: true, label: { select: { name: true } }, cardTags: { select: { name: true } } },
  });
}

function refFail(msg: string): never {
  throw new OpToolError("ref_invalido", msg, 422);
}

/** Confere o ref contra a fonte e devolve o que vai para o estado (refs + modelo). */
export async function verifyStepRefs(input: {
  op: OperatorContext;
  step: WorkflowStep;
  card: CardFacts;
  refs: string[];
  /**
   * Aprovação/comentário mais antigo que isso não é deste fluxo (um e-mail de
   * semanas atrás do mesmo card não pode marcar "enviado"). Fluxo existente =
   * hora do prompt de origem; fluxo novo = 24 h.
   */
  desde: Date;
}): Promise<{ refs: string[]; modelo?: string }> {
  const { op, step, card, desde } = input;
  const refs = [...new Set(input.refs.map((r) => r.trim()).filter(Boolean))];
  const one = () => (refs.length === 1 ? refs[0] : refFail(`O passo "${step.id}" leva exatamente um ref (${refHint(step)}).`));

  switch (step.kind) {
    case "reler":
    case "operador":
      return { refs: [] };
    case "rascunho": {
      const key = one();
      try {
        const d = await getDraft(key);
        // Item K (27/10): o rascunho é do CARD — vale o de qualquer colega.
        if (d.cardId !== card.id) refFail("Este rascunho é de outro card.");
        if (d.kind !== step.rascunho) refFail(`Este rascunho é de outro tipo (${d.kind}); o passo "${step.id}" espera ${step.rascunho}.`);
        return { refs: [key], modelo: d.template || undefined };
      } catch (err) {
        if (err instanceof DraftError) refFail(`Rascunho não confere: ${err.message}`);
        throw err;
      }
    }
    case "anexo": {
      if (refs.length < 1 || refs.length > 5) refFail(`O passo "${step.id}" leva de 1 a 5 ids de documento (o "documento.id" que anexar_rascunho devolveu).`);
      const docs = await db.document.findMany({ where: { id: { in: refs }, userId: card.id, deletedAt: null }, select: { id: true } });
      if (docs.length !== refs.length) refFail("Algum documento não está no card (ou está na lixeira). Use o documento.id que anexar_rascunho devolveu.");
      return { refs };
    }
    case "aprovacao":
    case "envio": {
      const id = one();
      const a = await db.opApproval.findUnique({ where: { id }, select: { id: true, operatorId: true, cardId: true, tool: true, status: true, expiresAt: true, createdAt: true } });
      if (!a) refFail("Aprovação não encontrada. Use o approvalId que preparar_* devolveu.");
      if (a.operatorId !== op.userId) refFail("Esta aprovação é de outra pessoa.");
      if (a.cardId !== card.id) refFail("Esta aprovação é de outro card.");
      if (a.tool !== step.aprovacao) refFail(`Esta aprovação não é de ${step.aprovacao}.`);
      if (a.createdAt < desde) refFail("Esta aprovação é anterior a este fluxo. Use a que preparar_* devolveu agora.");
      if (step.kind === "envio") {
        if (a.status !== "executada") refFail(`O envio não consta como feito (aprovação "${a.status}"). Só salve "enviar" depois de executar_aprovado devolver enviado: true.`);
      } else if (a.status !== "executada" && (a.status !== "pendente" || isApprovalExpired(a.expiresAt)) && a.status !== "enviando") {
        refFail(`Esta aprovação está "${a.status === "pendente" ? "expirada" : a.status}". Prepare de novo.`);
      }
      return { refs: [id] };
    }
    case "registro": {
      const v = one();
      if (step.confere === "valor") {
        if (!step.valores?.includes(v)) refFail(`O passo "${step.id}" aceita: ${(step.valores ?? []).join(", ")}.`);
        return { refs: [v] };
      }
      if (step.confere === "tag") {
        const tag = card.cardTags.find((t) => normalizeColumnName(t.name) === normalizeColumnName(v));
        if (!tag) refFail(`O card não tem a tag "${v}". Salve depois de adicionar_tag executar.`);
        return { refs: [tag.name] };
      }
      if (step.confere === "coluna") {
        const atual = card.label?.name ?? null;
        if (!atual || normalizeColumnName(atual) !== normalizeColumnName(v)) refFail(`O card não está na coluna "${v}" (está em "${atual ?? "?"}"). Salve depois de mover_card executar.`);
        return { refs: [atual] };
      }
      if (step.confere === "comentario") {
        const c = await db.comment.findFirst({ where: { id: v, userId: card.id }, select: { id: true, createdAt: true } });
        if (!c) refFail("Comentário não encontrado no card. Use o comentarioId que comentar_card devolveu.");
        if (c.createdAt < desde) refFail("Este comentário é anterior a este fluxo. Use o comentarioId que comentar_card devolveu agora.");
        return { refs: [v] };
      }
      return { refs: [v] };
    }
  }
}

function refHint(step: WorkflowStep): string {
  switch (step.kind) {
    case "rascunho":
      return "a key op-drafts/… que preparar_* devolveu";
    case "anexo":
      return "documento.id de anexar_rascunho";
    case "aprovacao":
    case "envio":
      return "o approvalId";
    case "registro":
      return step.confere === "valor" ? (step.valores ?? []).join(" | ") : step.confere === "comentario" ? "comentarioId" : `nome exato da ${step.confere}`;
    default:
      return "sem ref";
  }
}

// ---------------------------------------------------------------------------
// salvar_progresso
// ---------------------------------------------------------------------------

export interface SaveInput {
  op: OperatorContext;
  trace: OpTrace;
  workflow: WorkflowId;
  /** Referência do operador (nº, CPF…) ou, do progresso automático, o id já resolvido. */
  cardRef?: string;
  cardId?: string;
  passo?: string;
  refs?: string[];
  /** Do modelo: campos (chave ou rótulo) e código são filtrados para as listas fechadas. */
  bloqueio?: { tipo: WorkflowBloqueio["tipo"]; campos?: string[]; codigo?: string };
  fim?: "concluido" | "abandonado";
  /** Script local: calcula o estado que gravaria, sem gravar. */
  previewOnly?: boolean;
  agora?: Date;
}

export type SaveOutcome =
  | { salvo: true; fluxo: string; novo: boolean; estado: WorkflowState; proximo: WorkflowStep | null; card: CardFacts; comecadoPor?: string }
  | { salvo: false; semRegistro: true; motivo: string; card: CardFacts }
  | { salvo: false; previewOnly: true; fluxo: string | null; estado: WorkflowState; proximo: WorkflowStep | null; card: CardFacts };

/** Só o que está nas listas fechadas vai para o estado (nada de texto do modelo). */
export function cleanBloqueio(b: NonNullable<SaveInput["bloqueio"]>, passo: string): Omit<WorkflowBloqueio, "em"> {
  const campos = [...new Set((b.campos ?? []).map(campoKey).filter((k): k is string => !!k))];
  return {
    passo,
    tipo: b.tipo,
    ...(campos.length ? { campos } : {}),
    ...(b.codigo && isBloqueioCodigo(b.codigo) ? { codigo: b.codigo } : {}),
  };
}

function applyChange(
  base: WorkflowState,
  input: SaveInput,
  card: CardFacts,
  verified: { refs: string[]; modelo?: string } | null,
  agora: Date,
): WorkflowState {
  let state: WorkflowState = { ...base, card: { id: card.id, cardNumber: card.cardNumber, colunaId: card.labelId } };
  if (input.fim) return finish(state, input.fim, agora);
  const passo = input.passo!;
  const check = checkStep(state, passo);
  if (!check.ok) throw new OpToolError("passo_invalido", check.motivo, 422);
  if (input.bloqueio) return block(state, cleanBloqueio(input.bloqueio, passo), agora);
  // Envio feito com outra aprovação (preparou de novo sem salvar): o preparo
  // passa a apontar para a aprovação executada.
  if (check.step.kind === "envio" && verified?.refs[0]) {
    const def = workflowDef(state.workflow);
    const prep = def.passos.find((p) => p.kind === "aprovacao" && check.step.requer?.includes(p.id));
    const pf = prep && state.feitos.find((f) => f.passo === prep.id);
    if (prep && pf && pf.refs?.[0] !== verified.refs[0]) {
      state = { ...state, feitos: state.feitos.map((f) => (f.passo === prep.id ? { ...f, refs: [verified.refs[0]] } : f)) };
    }
  }
  return markDone(state, passo, { refs: verified?.refs, modelo: verified?.modelo, agora });
}

export async function saveProgress(input: SaveInput): Promise<SaveOutcome> {
  const agora = input.agora ?? new Date();
  if (!input.passo && !input.fim) throw new OpToolError("argumentos_invalidos", "Mande o passo (ou fim).", 400);
  if (!input.cardId && !input.cardRef) throw new OpToolError("argumentos_invalidos", "Mande o card.", 400);
  const cardId = input.cardId ?? (await resolveOneCardId(input.cardRef!));
  const card = await loadCard(cardId);
  if (!card) throw new OpToolError("nao_encontrado", "Card não encontrado.", 404);

  // Ref conferido fora da transação (S3/banco); a ordem dos passos é conferida
  // dentro, sob o lock, com o estado relido.
  let verified: { refs: string[]; modelo?: string } | null = null;
  if (input.passo && !input.fim && !input.bloqueio) {
    const step = stepOf(workflowDef(input.workflow), input.passo);
    if (!step) {
      const ids = workflowDef(input.workflow).passos.map((p) => p.id).join(", ");
      throw new OpToolError("passo_invalido", `"${input.passo}" não é passo deste fluxo. Passos: ${ids}.`, 422);
    }
    // Ordem conferida antes do ref (erro mais útil); é conferida de novo sob o lock.
    const aberto = (await openFlows(db, { workflow: input.workflow, cardId })).find((f) => !isStale(f.state, agora));
    const pre = checkStep(aberto?.state ?? newState({ workflow: input.workflow, card: { id: card.id, cardNumber: card.cardNumber, colunaId: card.labelId }, agora }), input.passo);
    if (!pre.ok) throw new OpToolError("passo_invalido", pre.motivo, 422);
    const precisaRef = !["reler", "operador"].includes(step.kind);
    if (precisaRef && !(input.refs ?? []).length) {
      throw new OpToolError("ref_invalido", `O passo "${step.id}" só conta como feito com o ref que a ferramenta devolveu (${refHint(step)}).`, 422);
    }
    const desde = aberto ? aberto.createdAt : new Date(agora.getTime() - 24 * 3_600_000);
    verified = await verifyStepRefs({ op: input.op, step, card, refs: input.refs ?? [], desde });
  }

  if (input.previewOnly) {
    const atual = (await openFlows(db, { workflow: input.workflow, cardId })).find((f) => !isStale(f.state, agora)) ?? null;
    if (!atual && input.fim) throw new OpToolError("nao_encontrado", "Não há fluxo aberto deste tipo para este card.", 404);
    const base = atual?.state ?? newState({ workflow: input.workflow, card: { id: card.id, cardNumber: card.cardNumber, colunaId: card.labelId }, agora });
    const estado = validState(applyChange(base, input, card, verified, agora));
    return { salvo: false, previewOnly: true, fluxo: atual?.id ?? null, estado, proximo: currentStep(estado), card };
  }

  return db.$transaction(async (tx) => {
    await lockFlow(tx, input.workflow, cardId);
    const flows = await openFlows(tx, { workflow: input.workflow, cardId });
    // Parado há mais de 14 dias vira abandonado na leitura (sem cron).
    for (const f of flows.filter((x) => isStale(x.state, agora))) {
      const fim = finish(f.state, "abandonado", agora);
      await tx.opWorkflow.update({ where: { id: f.id }, data: { state: toJson(fim), status: fim.status } });
    }
    const atual = flows.find((f) => !isStale(f.state, agora)) ?? null;

    if (atual) {
      // Fluxo de colega: segue no mesmo registro (decisão 20); quem salvou
      // entra em operatorIds e vira o lastOperatorId.
      const estado = validState(applyChange(atual.state, input, card, verified, agora));
      await tx.opWorkflow.update({ where: { id: atual.id }, data: flowWrite(estado, input.op.userId, atual.operatorIds) });
      return {
        salvo: true as const,
        fluxo: atual.id,
        novo: false,
        estado,
        proximo: currentStep(estado),
        card,
        ...(atual.startedById !== input.op.userId ? { comecadoPor: atual.startedById } : {}),
      };
    }
    if (input.fim) throw new OpToolError("nao_encontrado", "Não há fluxo aberto deste tipo para este card.", 404);

    // Fluxo novo. A origem (prompt do operador, gravado pelo hook) é só
    // rastro: sem ela o fluxo é guardado do mesmo jeito. Um prompt marca no
    // máximo um fluxo como origem (coluna única).
    const estado = validState(applyChange(newState({ workflow: input.workflow, card: { id: card.id, cardNumber: card.cardNumber, colunaId: card.labelId }, agora }), input, card, verified, agora));
    const requestId = input.trace.requestId;
    const origemLivre = requestId ? !(await tx.opWorkflow.findUnique({ where: { originRequestId: requestId }, select: { id: true } })) : false;
    const created = await tx.opWorkflow.create({
      data: {
        workflow: input.workflow,
        cardId,
        startedById: input.op.userId,
        originRequestId: origemLivre ? requestId : null,
        ...flowWrite(estado, input.op.userId, []),
      },
      select: { id: true },
    });
    return { salvo: true as const, fluxo: created.id, novo: true, estado, proximo: currentStep(estado), card };
  });
}

// ---------------------------------------------------------------------------
// fluxos_abertos / retomar_fluxo
// ---------------------------------------------------------------------------

/** Abertos em que o operador mexeu, ou (com cardId) todos os do card, de qualquer operador. */
export async function listOpenFlows(
  filter: { operatorId: string } | { cardId: string },
  agora: Date = new Date(),
): Promise<{ abertos: FlowRow[]; vencidos: number }> {
  const flows = await openFlows(db, filter);
  const abertos = flows.filter((f) => !isStale(f.state, agora));
  return { abertos, vencidos: flows.length - abertos.length };
}

export type ResumeOutcome =
  | { aberto: false; motivo: string; fluxo: string | null; status?: string }
  | {
      aberto: true;
      fluxo: string;
      state: WorkflowState;
      plano: ResumePlan;
      card: CardFacts | null;
      gravado: boolean;
      /** Quem começou e quem mexeu por último antes desta retomada (ids da equipe). */
      comecadoPor: string;
      ultimoOperador: string;
    };

/** Relê a fonte de cada feito: o que o plano puro precisa saber. */
async function gatherFacts(
  row: FlowRow,
  card: CardFacts | null,
  op: OperatorContext,
  cancelarPendentes: boolean,
  agora: Date,
  /** Sessão de quem retoma: a pendente só é reaproveitada na MESMA sessão (o "aprovo" é provado por sessão). */
  sessionId: string | null = null,
): Promise<ResumeFacts> {
  const state = row.state;
  const def = workflowDef(state.workflow);
  const fatos: ResumeFacts = {
    rascunhos: {},
    documentos: {},
    aprovacoes: {},
    registrosMudaram: [],
    card: { existe: !!card, arquivado: !!card?.archiveStatus, colunaMudou: !!card && state.card.colunaId !== card.labelId },
  };
  const approvalIds: string[] = [];
  for (const f of state.feitos) {
    const step = stepOf(def, f.passo);
    const ref = f.refs?.[0];
    if (!step) continue;
    if (step.kind === "rascunho" && ref) {
      try {
        // Item K (27/10): rascunho de colega vale (é do card).
        await getDraft(ref);
        fatos.rascunhos[ref] = "ok";
      } catch (err) {
        if (!(err instanceof DraftError)) throw err;
        fatos.rascunhos[ref] = "vencido";
      }
    } else if (step.kind === "anexo" && f.refs?.length) {
      const docs = await db.document.findMany({ where: { id: { in: f.refs }, userId: state.card.id, deletedAt: null }, select: { id: true } });
      const ok = new Set(docs.map((d) => d.id));
      for (const id of f.refs) fatos.documentos[id] = ok.has(id) ? "ok" : "apagado";
    } else if ((step.kind === "aprovacao" || step.kind === "envio") && ref) {
      approvalIds.push(ref);
    } else if (step.kind === "registro" && ref && card) {
      if (step.confere === "tag" && !card.cardTags.some((t) => normalizeColumnName(t.name) === normalizeColumnName(ref))) fatos.registrosMudaram!.push(step.id);
      if (step.confere === "coluna" && normalizeColumnName(card.label?.name ?? "") !== normalizeColumnName(ref)) fatos.registrosMudaram!.push(step.id);
      if (step.confere === "comentario") {
        const c = await db.comment.findFirst({ where: { id: ref, userId: card.id }, select: { id: true } });
        if (!c) fatos.registrosMudaram!.push(step.id);
      }
    }
  }
  if (approvalIds.length) {
    // Aprovações do fluxo, de quem as preparou (o fluxo pode ser de colega).
    const rows = await db.opApproval.findMany({
      where: { id: { in: approvalIds }, cardId: state.card.id },
      select: { id: true, status: true, expiresAt: true, operatorId: true, sessionId: true, code: true },
    });
    for (const id of approvalIds) {
      const r = rows.find((x) => x.id === id);
      let st: ApprovalFact = (r?.status as ApprovalFact | undefined) ?? "sumiu";
      if (st === "pendente" && r && isApprovalExpired(r.expiresAt, agora.getTime())) st = "expirada";
      // Item J (27/10): pausa de minutos na MESMA sessão, do mesmo operador e
      // dentro dos 30 min → a aprovação continua valendo (o operador só digita
      // o código). Outra sessão ou colega: cancela, como antes.
      if (st === "pendente" && r && r.operatorId === op.userId && sessionId && r.sessionId === sessionId) {
        (fatos.aprovacoesPendentes ??= {})[id] = { codigo: r.code, expiraEm: r.expiresAt.toISOString() };
        fatos.aprovacoes[id] = st;
        continue;
      }
      // Aprovação L4 não é retomável fora disso: a pendente é cancelada para
      // nenhum "aprovo" antigo valer depois de o fluxo ter preparado de novo.
      if (st === "pendente" && cancelarPendentes) {
        // Vale também para a de um colega: quem retoma prepara de novo, com o
        // próprio código; o "aprovo" antigo não pode continuar valendo.
        await db.opApproval.updateMany({ where: { id, cardId: state.card.id, status: "pendente" }, data: { status: "cancelada" } });
        st = "cancelada";
      }
      fatos.aprovacoes[id] = st;
    }
  }
  // Envio executado depois de o fluxo começar mas não salvo (preparou de novo
  // e a conversa caiu antes do salvar): conta como feito — nunca mandar duas vezes.
  const tools = [...new Set(def.passos.filter((p) => p.kind === "envio" && p.aprovacao).map((p) => p.aprovacao as string))];
  if (tools.length) {
    const exec = await db.opApproval.findMany({
      // De qualquer operador: o colega pode ter mandado antes de parar.
      where: { cardId: state.card.id, status: "executada", tool: { in: tools }, createdAt: { gte: row.createdAt } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, tool: true },
    });
    const envios: Record<string, string> = {};
    for (const e of exec) envios[e.tool] ??= e.id;
    fatos.enviosExecutados = envios;
  }
  return fatos;
}

export async function loadForResume(input: {
  op: OperatorContext;
  fluxoId?: string;
  workflow?: WorkflowId;
  cardRef?: string;
  /** false = só lê (interruptor desligado ou script): não grava o estado. */
  write: boolean;
  /**
   * Cancela a aprovação pendente do fluxo (padrão = write). Mesmo com o
   * interruptor desligado a ferramenta cancela: o plano manda preparar de
   * novo e o código antigo não pode continuar valendo. Script = false.
   */
  cancelarPendentes?: boolean;
  /** Sessão do app de quem retoma (item J: reaproveita a pendente só da mesma sessão). */
  sessionId?: string | null;
  agora?: Date;
}): Promise<ResumeOutcome> {
  const agora = input.agora ?? new Date();
  let row: FlowRow | null = null;

  if (input.fluxoId) {
    const r = await db.opWorkflow.findUnique({ where: { id: input.fluxoId }, select: FLOW_SELECT });
    const state = r ? parseWorkflowState(r.state) : null;
    if (!r || !state) throw new OpToolError("nao_encontrado", "Fluxo não encontrado. Use fluxos_abertos para ver os abertos.", 404);
    // Qualquer operador da equipe retoma (decisão 20): sem checagem de dono.
    if (!isOpen(state)) return { aberto: false, fluxo: r.id, status: state.status, motivo: `Este fluxo está ${state.status}.` };
    row = { ...r, state };
  } else {
    if (!input.workflow || !input.cardRef) throw new OpToolError("argumentos_invalidos", "Mande fluxo, ou card + workflow.", 400);
    const cardId = await resolveOneCardId(input.cardRef);
    row = (await openFlows(db, { workflow: input.workflow, cardId }))[0] ?? null;
    if (!row) return { aberto: false, fluxo: null, motivo: "Nenhum fluxo aberto deste tipo para este card." };
  }

  if (isStale(row.state, agora)) {
    if (input.write) {
      const fim = finish(row.state, "abandonado", agora);
      await db.opWorkflow.updateMany({ where: { id: row.id, status: { in: OPEN_STATUS } }, data: { state: toJson(fim), status: fim.status } });
    }
    return { aberto: false, fluxo: row.id, status: "abandonado", motivo: "Parado há mais de 14 dias: considerado abandonado. Comece de novo." };
  }

  const card = await loadCard(row.state.card.id);
  const fatos = await gatherFacts(row, card, input.op, input.cancelarPendentes ?? input.write, agora, input.sessionId ?? null);
  const plano = resumePlan(row.state, fatos, agora);

  let gravado = false;
  if (input.write) {
    const estado = validState({
      ...plano.estado,
      card: card ? { id: card.id, cardNumber: card.cardNumber, colunaId: card.labelId } : plano.estado.card,
      atualizadoEm: agora.toISOString(),
    });
    gravado = await db.$transaction(async (tx) => {
      await lockFlow(tx, row!.state.workflow, row!.state.card.id);
      const again = await tx.opWorkflow.findUnique({ where: { id: row!.id }, select: { state: true, operatorIds: true } });
      const now = again ? parseWorkflowState(again.state) : null;
      // Outra chamada salvou no meio: não sobrescreve (o plano devolvido continua valendo como leitura).
      if (!now || now.atualizadoEm !== row!.state.atualizadoEm) return false;
      // Retomar conta como "quem continuou" (lastOperatorId + operatorIds).
      await tx.opWorkflow.update({ where: { id: row!.id }, data: flowWrite(estado, input.op.userId, again!.operatorIds) });
      return true;
    });
  }
  return { aberto: true, fluxo: row.id, state: row.state, plano, card, gravado, comecadoPor: row.startedById, ultimoOperador: row.lastOperatorId };
}
