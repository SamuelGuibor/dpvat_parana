// Etapa 5: comunicação externa APROVADA (L4). `preparar_email` /
// `preparar_whatsapp` montam o conteúdo final e gravam a aprovação pendente
// (op_approvals) com um código; nada sai. `executar_aprovado` só envia se o
// OPERADOR digitou "aprovo <código>" (última mensagem dele na mesma conversa),
// o hash bate e não passou de 30 min. As três nascem com interruptor
// desligado (op/switches.ts) e exigem op_approve (canRun no L4).
// Libs: app/_shared/lib/op/{approvals,comms}.ts.

import { z } from "zod/v4";
import { defineTool, OpToolError } from "../registry";
import { cardRefSchema } from "./obter-card";
import { brDateTime } from "../resolve";
import { createApproval, executeApproval, loadApproval } from "../approvals";
import { getOpSwitches } from "../switches";
import {
  precheckEmail,
  precheckWhatsapp,
  prepareEmail,
  prepareWhatsapp,
  sendApprovedEmail,
  sendApprovedWhatsapp,
  EMAIL_MAX_ATTACHMENTS,
  EMAIL_MAX_CC,
  type EmailApprovalArgs,
  type WhatsappApprovalArgs,
} from "../comms";

const COMO_APROVAR = (code: string) =>
  `Mostre ao operador o previaTexto INTEIRO, sem resumir (destino, texto, anexos, avisos), e peça para ele digitar, sozinho na mensagem: aprovo ${code}. ` +
  "Nunca digite o código por ele, nunca chame executar_aprovado antes de ele digitar, e se ele pedir qualquer mudança prepare de novo (código novo).";

/**
 * Prévia já em texto, montada no servidor: a skill cola sem reescrever (o
 * modelo não resume nem esconde o aviso de destino fora do cadastro).
 */
function previaTexto(p: Record<string, unknown>): string {
  const avisos = (p.avisos as string[] | undefined) ?? [];
  const card = p.card as { cardNumber?: number | null; nome?: string | null } | undefined;
  const linhas: string[] = [];
  if (p.canal === "e-mail") {
    const anexos = (p.anexos as { nome: string; tamanhoKb: number }[]) ?? [];
    linhas.push(
      `E-MAIL — card ${card?.cardNumber ?? "?"} (${card?.nome ?? ""})`,
      `De: ${String(p.de)}`,
      `Para: ${String(p.para)}`,
      ...((p.cc as string[]).length ? [`Cc: ${(p.cc as string[]).join(", ")}`] : []),
      `Assunto: ${String(p.assunto)}`,
      `Anexos: ${anexos.length ? anexos.map((a) => `${a.nome} (${a.tamanhoKb} KB)`).join("; ") : "nenhum"}`,
      "",
      String(p.corpo),
    );
  } else {
    const contato = p.contato as { nome?: string | null; telefone?: string } | undefined;
    linhas.push(
      `WHATSAPP — card ${card?.cardNumber ?? "?"} (${card?.nome ?? ""})`,
      `Para: ${contato?.nome ?? ""} ${contato?.telefone ?? ""} · linha ${String(p.linha)}`,
      `Sai como: ${String(p.saiComo)} · janela de 24 h ${p.janela24hAberta ? "aberta" : "fechada"}`,
      "",
      String(p.texto),
    );
  }
  if (avisos.length) linhas.push("", ...avisos.map((a) => `⚠ ${a}`));
  return linhas.join("\n");
}

function prepared(out: { approvalId: string; code: string; hash: string; expiresAt: Date } | null, previa: Record<string, unknown>) {
  if (!out) return { previa, previaTexto: previaTexto(previa), aprovacao: null, aviso: "modo de teste (script): nada foi gravado, sem código" };
  return {
    previa,
    previaTexto: previaTexto(previa),
    aprovacao: { approvalId: out.approvalId, hash: out.hash, codigo: out.code, expiraEm: brDateTime(out.expiresAt) },
    instrucao: COMO_APROVAR(out.code),
  };
}

// ---------------------------------------------------------------------------
// preparar_email
// ---------------------------------------------------------------------------

const emailSchema = z.object({
  card: cardRefSchema,
  para: z.string().min(3).max(254).optional().describe("Destinatário. Omitido = e-mail do hospital do card (cadastro do GHOST ou nota publicada). Endereço digitado sai marcado como FORA DO CADASTRO."),
  cc: z.array(z.string().min(3).max(254)).max(EMAIL_MAX_CC).optional().describe("Cópias (e-mails)."),
  assunto: z.string().min(1).max(200).describe("Assunto, sem quebra de linha."),
  corpo: z.string().min(1).max(20_000).describe("Corpo em texto puro, exatamente como vai sair."),
  anexos: z
    .array(z.string().min(1).max(300))
    .max(EMAIL_MAX_ATTACHMENTS)
    .optional()
    .describe("Até 5: key de rascunho (op-drafts/… devolvida por preparar_*) ou id/nome EXATO de documento do card (listar_documentos). Soma ≤ 10 MB."),
});

export const prepararEmail = defineTool({
  name: "preparar_email",
  description:
    "ENVIO. Prepara um e-mail (ao hospital do card, por padrão) com anexos do card ou rascunhos — NADA é enviado. Devolve a prévia completa e um código: o operador precisa DIGITAR \"aprovo <código>\" e só então chame executar_aprovado. Mudou qualquer coisa = prepare de novo.",
  level: 4,
  permission: "op_approve",
  schema: emailSchema,
  async run({ op, trace, previewOnly }, args) {
    const { args: approvalArgs, previa, cardId } = await prepareEmail({ op, ...args });
    const out = previewOnly
      ? null
      : await createApproval({ operatorId: op.userId, sessionId: trace.sessionId, tool: "preparar_email", canal: "email", args: approvalArgs, cardId });
    return {
      data: prepared(out, previa),
      summary: `e-mail preparado para ${approvalArgs.para}${approvalArgs.destinoLivre ? " (fora do cadastro)" : ""}, ${approvalArgs.anexos.length} anexo(s)`,
      cardIds: [cardId],
    };
  },
});

// ---------------------------------------------------------------------------
// preparar_whatsapp
// ---------------------------------------------------------------------------

const whatsappSchema = z
  .object({
    card: cardRefSchema,
    contato: z.string().min(1).max(60).optional().describe("Id do contato quando o card tem conversa em mais de uma linha (a recusa `ambiguo` traz as opções)."),
    texto: z.string().min(1).max(4000).optional().describe("Texto livre (só com a janela de 24 h aberta)."),
    template: z.string().min(1).max(200).optional().describe("Nome EXATO de um template APROVADO da linha do contato (fora da janela)."),
    variaveis: z.array(z.string().max(500)).max(10).optional().describe("Variáveis do corpo do template, na ordem {{1}}, {{2}}…"),
  })
  .refine((a) => Boolean(a.texto) !== Boolean(a.template), { message: "mande texto OU template (um dos dois)" });

export const prepararWhatsapp = defineTool({
  name: "preparar_whatsapp",
  description:
    "ENVIO. Prepara uma mensagem de WhatsApp ao cliente do card, pela linha do contato — NADA é enviado. Já recusa o que seria bloqueado (opt-out, intervalo anti-spam, janela de 24 h fechada sem template, template não aprovado, templates pausados). Devolve a prévia e um código: o operador precisa DIGITAR \"aprovo <código>\" e só então chame executar_aprovado.",
  level: 4,
  permission: "view_whatsapp",
  schema: whatsappSchema,
  async run({ op, trace, previewOnly }, args) {
    const { args: approvalArgs, previa, cardId } = await prepareWhatsapp({ op, ...args });
    const out = previewOnly
      ? null
      : await createApproval({ operatorId: op.userId, sessionId: trace.sessionId, tool: "preparar_whatsapp", canal: "whatsapp", args: approvalArgs, cardId });
    return {
      data: prepared(out, previa),
      summary: `WhatsApp preparado (${approvalArgs.via === "template" ? `template ${approvalArgs.template}` : "texto"}, linha ${approvalArgs.linha})`,
      cardIds: [cardId],
    };
  },
});

// ---------------------------------------------------------------------------
// executar_aprovado
// ---------------------------------------------------------------------------

const executarSchema = z.object({
  approvalId: z.string().min(4).max(60).describe("approvalId devolvido pelo preparar_*."),
  hash: z.string().regex(/^[a-f0-9]{64}$/).describe("hash devolvido pelo preparar_*, sem mudar nada."),
});

const CANAL_TOOL: Record<string, string> = { email: "preparar_email", whatsapp: "preparar_whatsapp" };

export const executarAprovado = defineTool({
  name: "executar_aprovado",
  description:
    "ENVIO. Envia o que foi preparado (preparar_email/preparar_whatsapp) DEPOIS que o operador digitou \"aprovo <código>\" como última mensagem. Sem isso recusa com aprovacao_nao_digitada; conteúdo mudado = hash_diferente; mais de 30 min = aprovacao_expirada. Repetir não envia de novo.",
  level: 4,
  permission: "op_approve",
  schema: executarSchema,
  async run({ op, trace }, args) {
    const approval = await loadApproval(args.approvalId);
    if (CANAL_TOOL[approval.canal] !== approval.tool) throw new OpToolError("aprovacao_encerrada", "Aprovação inválida.", 409);
    // Interruptor por canal: desligar o preparar_* também segura o que já foi preparado.
    const switches = await getOpSwitches();
    if (switches[approval.tool] !== true) {
      throw new OpToolError("ferramenta_desligada", `O envio por ${approval.canal === "email" ? "e-mail" : "WhatsApp"} está desligado no Espaço de Trabalho (IA de operação).`, 403);
    }
    if (approval.canal === "whatsapp" && !op.permissions.view_whatsapp) {
      throw new OpToolError("sem_permissao", "Você não tem permissão para o WhatsApp.", 403);
    }

    const out = await executeApproval({
      approvalId: args.approvalId,
      hash: args.hash,
      operatorId: op.userId,
      sessionId: trace.sessionId,
      precheck: (a) => (a.canal === "email" ? precheckEmail(a.args as EmailApprovalArgs) : precheckWhatsapp(a.args as WhatsappApprovalArgs)),
      send: (a) =>
        a.canal === "email"
          ? sendApprovedEmail({ args: a.args as EmailApprovalArgs, op, trace, approvalId: a.id })
          : sendApprovedWhatsapp({ args: a.args as WhatsappApprovalArgs, op, trace, approvalId: a.id }),
    });
    const cardIds = out.approval.cardId ? [out.approval.cardId] : [];
    const canal = out.approval.canal === "email" ? "e-mail" : "WhatsApp";
    if (!out.result.sent) {
      return {
        data: {
          enviado: false,
          canal,
          motivo: String(out.result.error ?? out.result.reason ?? "não enviado"),
          aviso: "Nada saiu. A aprovação foi encerrada: corrija o motivo e prepare de novo.",
        },
        summary: `${canal} NÃO enviado: ${String(out.result.error ?? out.result.reason ?? "?").slice(0, 120)}`,
        cardIds,
      };
    }
    return {
      data: {
        enviado: true,
        noop: out.noop,
        canal,
        ...(out.noop ? { aviso: "Já tinha sido enviado; nada saiu de novo." } : {}),
        resultado: out.result,
        registro: out.noop ? null : "comentário e histórico do card gravados com o autor \"(via IA)\"",
      },
      summary: out.noop ? `${canal} já enviado (noop)` : `${canal} enviado (aprovação ${out.approval.code})`,
      cardIds,
    };
  },
});
