// Aprovação L4 da IA de operação (Etapa 5): e-mail ao hospital e WhatsApp ao
// cliente só saem depois de o OPERADOR digitar "aprovo <código>" no Claude Code.
//
// 1. `preparar_*` monta o conteúdo final e chama `createApproval`: a linha de
//    op_approvals guarda o conteúdo (args), o canonicalHash e um código curto.
// 2. A skill mostra a prévia e pede "digite aprovo <código>". O hook
//    UserPromptSubmit grava o prompt em op_requests (o modelo não digita prompt).
// 3. `executar_aprovado` → `executeApproval`: mesmo operador, mesma sessão,
//    hash igual, dentro de 30 min e o ÚLTIMO prompt da sessão (depois da
//    preparação) é o "aprovo <código>" — qualquer mensagem depois dele exige
//    digitar de novo. Reserva atômica pendente → enviando: duas chamadas = um
//    envio só; "enviando" preso (queda no meio) nunca reenvia.
//
// Sem "use server": quem chama (ferramentas em op/tools) já passou pelo token.

import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { canonicalHash } from "./policy";
import { OpToolError } from "./registry";
import {
  APPROVAL_TTL_MS,
  approvalCode,
  isApprovalExpired,
  typedApprovalMatches,
  type ApprovalStatus,
} from "@/app/_shared/utils/approval-code";

// "card" = ação irreversível no card (excluir, arquivar em destino que encerra).
export type ApprovalCanal = "email" | "whatsapp" | "card";

export interface ApprovalRow {
  id: string;
  operatorId: string;
  sessionId: string;
  tool: string;
  canal: string;
  args: unknown;
  hash: string;
  code: string;
  status: string;
  cardId: string | null;
  expiresAt: Date;
  createdAt: Date;
  result: unknown;
}

const APPROVAL_SELECT = {
  id: true,
  operatorId: true,
  sessionId: true,
  tool: true,
  canal: true,
  args: true,
  hash: true,
  code: true,
  status: true,
  cardId: true,
  expiresAt: true,
  createdAt: true,
  result: true,
} as const;

/** Grava a aprovação pendente. Sem sessão do app não há como provar o "aprovo". */
export async function createApproval(input: {
  operatorId: string;
  sessionId: string | null;
  tool: string;
  canal: ApprovalCanal;
  args: Record<string, unknown>;
  cardId: string | null;
}): Promise<{ approvalId: string; code: string; hash: string; expiresAt: Date }> {
  if (!input.sessionId) {
    throw new OpToolError(
      "sem_sessao",
      "O app não informou a sessão do Claude Code: sem ela a aprovação digitada não pode ser conferida. Rode diagnostico_crm.",
      409,
    );
  }
  const hash = canonicalHash(input.tool, input.args);
  // Código repetido entre aprovações pendentes da MESMA sessão faria um
  // "aprovo" valer pelas duas: sorteia outro id (chance ~1/390 mil).
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `apr${randomBytes(10).toString("hex")}`;
    const code = approvalCode(id);
    const clash = await db.opApproval.findFirst({
      where: { sessionId: input.sessionId, code, status: "pendente" },
      select: { id: true },
    });
    if (clash) continue;
    const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS);
    await db.opApproval.create({
      data: {
        id,
        operatorId: input.operatorId,
        sessionId: input.sessionId,
        tool: input.tool,
        canal: input.canal,
        args: input.args as Prisma.InputJsonValue,
        hash,
        code,
        cardId: input.cardId,
        expiresAt,
      },
    });
    return { approvalId: id, code, hash, expiresAt };
  }
  throw new OpToolError("erro_interno", "Não foi possível gerar o código de aprovação. Prepare de novo.", 500);
}

export async function loadApproval(approvalId: string): Promise<ApprovalRow> {
  const row = await db.opApproval.findUnique({ where: { id: approvalId }, select: APPROVAL_SELECT });
  if (!row) throw new OpToolError("nao_encontrado", "Aprovação não encontrada. Prepare de novo.", 404);
  return row;
}

/**
 * O operador digitou "aprovo <código>"? Vale só o ÚLTIMO prompt da sessão da
 * preparação, do mesmo operador, criado depois dela. Devolve o id do prompt.
 */
export async function findTypedApproval(approval: Pick<ApprovalRow, "sessionId" | "operatorId" | "createdAt" | "code">): Promise<string | null> {
  const last = await db.opRequest.findFirst({
    where: { sessionId: approval.sessionId, createdAt: { gt: approval.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { id: true, operatorId: true, text: true },
  });
  if (!last || last.operatorId !== approval.operatorId) return null;
  return typedApprovalMatches(last.text, approval.code) ? last.id : null;
}

export interface ExecuteOutcome {
  /** true = já tinha sido executada: devolve o resultado da primeira vez, nada sai de novo. */
  noop: boolean;
  status: ApprovalStatus;
  result: { sent: boolean; [k: string]: unknown };
  approval: ApprovalRow;
}

/**
 * Confere tudo e despacha UMA vez. `precheck` roda antes da reserva (ex.:
 * anexo mudou desde a preparação → hash_diferente); `send` nunca deve lançar
 * (as libs de envio devolvem {sent:false, …}), mas um throw vira "falhou".
 */
export async function executeApproval(input: {
  approvalId: string;
  hash: string;
  operatorId: string;
  sessionId: string | null;
  precheck?: (approval: ApprovalRow) => Promise<void>;
  send: (approval: ApprovalRow) => Promise<{ sent: boolean; [k: string]: unknown }>;
}): Promise<ExecuteOutcome> {
  const approval = await loadApproval(input.approvalId);
  if (approval.operatorId !== input.operatorId) {
    throw new OpToolError("sem_permissao", "Esta aprovação foi preparada por outra pessoa.", 403);
  }
  if (approval.status === "executada") {
    return { noop: true, status: "executada", result: (approval.result ?? { sent: true }) as ExecuteOutcome["result"], approval };
  }
  if (approval.status === "enviando") {
    throw new OpToolError(
      "envio_em_andamento",
      "Este envio já começou e o resultado não foi confirmado. NÃO prepare de novo antes de conferir no card/inbox se saiu.",
      409,
    );
  }
  if (approval.status !== "pendente") {
    throw new OpToolError("aprovacao_encerrada", `Esta aprovação está "${approval.status}". Prepare de novo se ainda precisar.`, 409);
  }
  // O hash que a skill mandou e o recalculado sobre o conteúdo guardado.
  if (input.hash !== approval.hash || canonicalHash(approval.tool, approval.args) !== approval.hash) {
    throw new OpToolError("hash_diferente", "O conteúdo não é o que foi preparado. Prepare de novo e mostre a prévia nova ao operador.", 409);
  }
  if (isApprovalExpired(approval.expiresAt)) {
    await db.opApproval.updateMany({ where: { id: approval.id, status: "pendente" }, data: { status: "expirada" } });
    throw new OpToolError("aprovacao_expirada", "A aprovação venceu (30 min). Prepare de novo e peça o código novo.", 410);
  }
  if (!input.sessionId || input.sessionId !== approval.sessionId) {
    throw new OpToolError(
      "aprovacao_nao_digitada",
      "A aprovação é de outra conversa do Claude Code. Prepare de novo nesta conversa.",
      403,
    );
  }
  const requestId = await findTypedApproval(approval);
  if (!requestId) {
    throw new OpToolError(
      "aprovacao_nao_digitada",
      `O operador ainda não digitou "aprovo ${approval.code}" (tem que ser a última mensagem dele). Mostre a prévia e espere ele digitar; nunca digite por ele.`,
      403,
    );
  }

  if (input.precheck) await input.precheck(approval);

  // Reserva atômica: só uma chamada passa de pendente para enviando.
  const claimed = await db.opApproval.updateMany({
    where: { id: approval.id, status: "pendente" },
    data: { status: "enviando", approvedRequestId: requestId },
  });
  if (claimed.count !== 1) {
    const now = await loadApproval(approval.id);
    if (now.status === "executada") {
      return { noop: true, status: "executada", result: (now.result ?? { sent: true }) as ExecuteOutcome["result"], approval: now };
    }
    throw new OpToolError("envio_em_andamento", "Outra chamada já está enviando esta aprovação.", 409);
  }

  let result: { sent: boolean; [k: string]: unknown };
  try {
    result = await input.send(approval);
  } catch (err) {
    console.error("[op] envio aprovado lançou:", err);
    result = { sent: false, error: "falha inesperada no envio" };
  }
  const status: ApprovalStatus = result.sent ? "executada" : "falhou";
  await db.opApproval.update({
    where: { id: approval.id },
    data: { status, executedAt: new Date(), result: result as Prisma.InputJsonValue },
  });
  return { noop: false, status, result, approval };
}
