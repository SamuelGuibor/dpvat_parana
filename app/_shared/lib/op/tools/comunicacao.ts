// Etapa 5: comunicação externa APROVADA (L4). `preparar_email` /
// `preparar_whatsapp` montam o conteúdo final e gravam a aprovação pendente
// (op_approvals) com um código; nada sai. `executar_aprovado` só envia se o
// OPERADOR digitou "aprovo <código>" (última mensagem dele na mesma conversa),
// o hash bate e não passou de 30 min. As três nascem com interruptor
// desligado (op/switches.ts) e exigem op_approve (canRun no L4).
// Ajuste A (26/10): `preparar_acao_irreversivel` usa o mesmo contrato para o
// que não se desfaz no card (excluir, arquivar em destino que encerra).
// Decisão do dono (27/10): LOTE — `cards` (WhatsApp) e `lote` (e-mail) preparam
// N envios com UM código; o envio sai um a um e cada card recebe o registro.
// Libs: app/_shared/lib/op/{approvals,comms,irreversivel}.ts.

import { z } from "zod/v4";
import { defineTool, OpToolError } from "../registry";
import { cardRefSchema } from "./obter-card";
import { brDateTime } from "../resolve";
import { createApproval, executeApproval, loadApproval } from "../approvals";
import { getOpSwitches } from "../switches";
import { autoProgress } from "../progress";
import {
  isLote,
  precheckEmail,
  precheckEmailLote,
  precheckWhatsapp,
  precheckWhatsappLote,
  prepareEmail,
  prepareEmailLote,
  prepareWhatsapp,
  prepareWhatsappLote,
  sendApprovedEmail,
  sendApprovedEmailLote,
  sendApprovedWhatsapp,
  sendApprovedWhatsappLote,
  EMAIL_MAX_ATTACHMENTS,
  EMAIL_MAX_CC,
  type EmailApprovalArgs,
  type LoteApprovalArgs,
  type WhatsappApprovalArgs,
} from "../comms";
import { ACOES_IRREVERSIVEIS, precheckIrreversivel, prepareIrreversivel, runApprovedIrreversivel, type CardApprovalArgs } from "../irreversivel";
import { DESTRUCTIVE_ARCHIVE, ARCHIVE_LABELS } from "../../archive-catalog";
import { CARGOS_MEMBRO, precheckMembro, prepareMembro, runApprovedMembro, type MembroApprovalArgs } from "../membro";
import { LOTE_EMAIL_MAX, LOTE_WHATSAPP_MAX, previaTextoLote, type LoteItemPrevia, type LotePulado } from "@/app/_shared/utils/op-lote";

const COMO_APROVAR = (code: string) =>
  `Mostre ao operador o previaTexto INTEIRO, sem resumir (destino, texto, anexos, avisos), e peça para ele digitar, sozinho na mensagem: aprovo ${code}. ` +
  "Nunca digite o código por ele, nunca chame executar_aprovado antes de ele digitar, e se ele pedir qualquer mudança prepare de novo (código novo).";

/**
 * Prévia já em texto, montada no servidor: a skill cola sem reescrever (o
 * modelo não resume nem esconde o aviso de destino fora do cadastro).
 */
function previaTexto(p: Record<string, unknown>): string {
  if (p.lote === true) {
    return previaTextoLote({
      canal: p.canal === "e-mail" ? "e-mail" : "WhatsApp",
      itens: (p.itens as LoteItemPrevia[]) ?? [],
      pulados: (p.pulados as LotePulado[]) ?? [],
      assunto: typeof p.assunto === "string" ? p.assunto : undefined,
    });
  }
  const avisos = (p.avisos as string[] | undefined) ?? [];
  const card = p.card as { cardNumber?: number | null; nome?: string | null } | undefined;
  const linhas: string[] = [];
  if (p.canal === "equipe") {
    linhas.push(
      `${String(p.acao)} — ${String(p.nome)} (${String(p.cargo)})`,
      `E-mail: ${String(p.email)} · CPF: ${String(p.cpf)}${p.telefone ? ` · telefone: ${String(p.telefone)}` : ""}`,
    );
  } else if (p.canal === "card") {
    linhas.push(`${String(p.acao)} — card ${card?.cardNumber ?? "?"} (${card?.nome ?? ""})`, `Coluna: ${String(p.coluna ?? "?")}`);
    if (p.de) linhas.push(`Arquivo atual: ${String(p.de)}`);
    else if (p.arquivado) linhas.push(`Arquivado em: ${String(p.arquivado)}`);
  } else if (p.canal === "e-mail") {
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

const VARS_DICA = "Variáveis no texto: [[nome]], [[primeiro_nome]], [[numero]] (nº do card), [[hospital]].";

// ---------------------------------------------------------------------------
// preparar_email
// ---------------------------------------------------------------------------

const loteEmailItem = z.object({
  card: cardRefSchema,
  para: z.string().min(3).max(254).optional().describe("Destinatário deste card (omitido = e-mail do hospital do card)."),
  anexos: z
    .array(z.string().min(1).max(300))
    .max(EMAIL_MAX_ATTACHMENTS)
    .optional()
    .describe("Anexos deste card: key de rascunho (op-drafts/…) ou id/nome EXATO de documento do card."),
});

const emailSchema = z
  .object({
    card: cardRefSchema.optional(),
    lote: z
      .array(loteEmailItem)
      .min(1)
      .max(LOTE_EMAIL_MAX)
      .optional()
      .describe(`LOTE: até ${LOTE_EMAIL_MAX} cards com o mesmo assunto/corpo (${VARS_DICA}) e anexos por card; UM código para tudo. Card que falhar fica em pulados.`),
    para: z.string().min(3).max(254).optional().describe("Destinatário. Omitido = e-mail do hospital do card (cadastro do GHOST ou nota publicada). Endereço digitado sai marcado como FORA DO CADASTRO."),
    cc: z.array(z.string().min(3).max(254)).max(EMAIL_MAX_CC).optional().describe("Cópias (e-mails)."),
    assunto: z.string().min(1).max(200).describe("Assunto, sem quebra de linha."),
    corpo: z.string().min(1).max(20_000).describe(`Corpo em texto puro, exatamente como vai sair. ${VARS_DICA}`),
    anexos: z
      .array(z.string().min(1).max(300))
      .max(EMAIL_MAX_ATTACHMENTS)
      .optional()
      .describe("Até 5: key de rascunho (op-drafts/… devolvida por preparar_*) ou id/nome EXATO de documento do card (listar_documentos). Soma ≤ 10 MB. No lote vale para os cards sem anexos próprios."),
  })
  .refine((a) => Boolean(a.card) !== Boolean(a.lote), { message: "mande card OU lote (um dos dois)" });

export const prepararEmail = defineTool({
  name: "preparar_email",
  description:
    "ENVIO. Prepara um e-mail (ao hospital do card, por padrão) com anexos do card ou rascunhos — NADA é enviado. Com `lote`, prepara N e-mails (um por card, mesmo texto com variáveis, anexos por card) para UM código só. Devolve a prévia completa e um código: o operador precisa DIGITAR \"aprovo <código>\" e só então chame executar_aprovado. Mudou qualquer coisa = prepare de novo.",
  level: 4,
  permission: "op_approve",
  schema: emailSchema,
  async run({ op, trace, previewOnly }, args) {
    if (args.lote) {
      const r = await prepareEmailLote({ op, lote: args.lote, cc: args.cc, assunto: args.assunto, corpo: args.corpo, anexos: args.anexos });
      const out = previewOnly
        ? null
        : await createApproval({ operatorId: op.userId, sessionId: trace.sessionId, tool: "preparar_email", canal: "email", args: r.args, cardId: r.cardIds[0] ?? null });
      return {
        data: { ...prepared(out, r.previa), lote: { preparados: r.args.itens.length, pulados: r.pulados } },
        summary: `e-mail em lote preparado: ${r.args.itens.length} card(s), ${r.pulados.length} pulado(s)`,
        cardIds: r.cardIds,
      };
    }
    const { args: approvalArgs, previa, cardId } = await prepareEmail({ op, card: args.card!, para: args.para, cc: args.cc, assunto: args.assunto, corpo: args.corpo, anexos: args.anexos });
    const out = previewOnly
      ? null
      : await createApproval({ operatorId: op.userId, sessionId: trace.sessionId, tool: "preparar_email", canal: "email", args: approvalArgs, cardId });
    const progresso = out ? await autoProgress({ op, trace, cardId, match: (s) => s.kind === "aprovacao" && s.aprovacao === "preparar_email", refs: [out.approvalId] }) : null;
    return {
      data: { ...prepared(out, previa), ...(progresso ? { progresso } : {}) },
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
    card: cardRefSchema.optional(),
    cards: z
      .array(cardRefSchema)
      .min(1)
      .max(LOTE_WHATSAPP_MAX)
      .optional()
      .describe(`LOTE: até ${LOTE_WHATSAPP_MAX} cards com a mesma mensagem (${VARS_DICA}); UM código para tudo. Card bloqueado (opt-out, janela…) fica em pulados e o resto segue.`),
    contato: z.string().min(1).max(60).optional().describe("Id do contato quando o card tem conversa em mais de uma linha (a recusa `ambiguo` traz as opções). Só com card único."),
    texto: z.string().min(1).max(4000).optional().describe(`Texto livre (só com a janela de 24 h aberta). ${VARS_DICA}`),
    template: z.string().min(1).max(200).optional().describe("Nome EXATO de um template APROVADO da linha do contato (fora da janela)."),
    variaveis: z.array(z.string().max(500)).max(10).optional().describe(`Variáveis do corpo do template, na ordem {{1}}, {{2}}… ${VARS_DICA}`),
  })
  .refine((a) => Boolean(a.card) !== Boolean(a.cards), { message: "mande card OU cards (um dos dois)" })
  .refine((a) => Boolean(a.texto) !== Boolean(a.template), { message: "mande texto OU template (um dos dois)" });

export const prepararWhatsapp = defineTool({
  name: "preparar_whatsapp",
  description:
    "ENVIO. Prepara uma mensagem de WhatsApp ao cliente do card (ou a VÁRIOS cards, com `cards`), pela linha de cada contato — NADA é enviado. Já recusa o que seria bloqueado (opt-out, janela de 24 h fechada sem template, template não aprovado, templates pausados); no lote, o card bloqueado fica em `pulados` e o resto segue. Texto/variáveis aceitam [[nome]], [[primeiro_nome]], [[numero]], [[hospital]]. Devolve a prévia e UM código para tudo: o operador precisa DIGITAR \"aprovo <código>\" e só então chame executar_aprovado.",
  level: 4,
  permission: "view_whatsapp",
  schema: whatsappSchema,
  async run({ op, trace, previewOnly }, args) {
    if (args.cards) {
      const r = await prepareWhatsappLote({ op, cards: args.cards, texto: args.texto, template: args.template, variaveis: args.variaveis });
      const out = previewOnly
        ? null
        : await createApproval({ operatorId: op.userId, sessionId: trace.sessionId, tool: "preparar_whatsapp", canal: "whatsapp", args: r.args, cardId: r.cardIds[0] ?? null });
      return {
        data: { ...prepared(out, r.previa), lote: { preparados: r.args.itens.length, pulados: r.pulados } },
        summary: `WhatsApp em lote preparado: ${r.args.itens.length} card(s), ${r.pulados.length} pulado(s)`,
        cardIds: r.cardIds,
      };
    }
    const { args: approvalArgs, previa, cardId } = await prepareWhatsapp({ op, card: args.card!, contato: args.contato, texto: args.texto, template: args.template, variaveis: args.variaveis });
    const out = previewOnly
      ? null
      : await createApproval({ operatorId: op.userId, sessionId: trace.sessionId, tool: "preparar_whatsapp", canal: "whatsapp", args: approvalArgs, cardId });
    const progresso = out ? await autoProgress({ op, trace, cardId, match: (s) => s.kind === "aprovacao" && s.aprovacao === "preparar_whatsapp", refs: [out.approvalId] }) : null;
    return {
      data: { ...prepared(out, previa), ...(progresso ? { progresso } : {}) },
      summary: `WhatsApp preparado (${approvalArgs.via === "template" ? `template ${approvalArgs.template}` : "texto"}, linha ${approvalArgs.linha})`,
      cardIds: [cardId],
    };
  },
});

// ---------------------------------------------------------------------------
// preparar_acao_irreversivel
// ---------------------------------------------------------------------------

const irreversivelSchema = z
  .object({
    card: cardRefSchema,
    acao: z.enum(ACOES_IRREVERSIVEIS).describe("excluir_card (apaga o card de vez) | arquivar_definitivo (destino que encerra o cliente)."),
    destino: z
      .string()
      .min(1)
      .max(80)
      .optional()
      .describe(`Só em arquivar_definitivo: ${DESTRUCTIVE_ARCHIVE.map((k) => ARCHIVE_LABELS[k]).join(", ")}.`),
  })
  .refine((a) => (a.acao === "arquivar_definitivo") === Boolean(a.destino), { message: "destino só (e sempre) com arquivar_definitivo" });

export const prepararAcaoIrreversivel = defineTool({
  name: "preparar_acao_irreversivel",
  description:
    "APROVAÇÃO. Prepara uma ação que NÃO se desfaz no card — excluir o card (com documentos, comentários e histórico) ou arquivar num destino que encerra o cliente (perdeu contato definitivo, desistiu, descartado). NADA é feito: devolve a prévia e um código; o operador precisa DIGITAR \"aprovo <código>\" e só então chame executar_aprovado. Excluir exige a permissão de excluir cards.",
  level: 4,
  permission: "op_approve",
  schema: irreversivelSchema,
  async run({ op, trace, previewOnly }, args) {
    const { args: approvalArgs, previa, cardId } = await prepareIrreversivel({ op, ...args });
    const out = previewOnly
      ? null
      : await createApproval({ operatorId: op.userId, sessionId: trace.sessionId, tool: "preparar_acao_irreversivel", canal: "card", args: approvalArgs, cardId });
    return {
      data: prepared(out, previa),
      summary: `${args.acao} preparado (card ${approvalArgs.cardNumber ?? "?"})`,
      cardIds: [cardId],
    };
  },
});

// ---------------------------------------------------------------------------
// preparar_membro_equipe (decisão do dono de 30/10)
// ---------------------------------------------------------------------------

export const prepararMembroEquipe = defineTool({
  name: "preparar_membro_equipe",
  description:
    "APROVAÇÃO. Prepara a criação de um MEMBRO DA EQUIPE (acesso ao CRM): nome, e-mail, CPF, telefone opcional e cargo ADMIN ou ADMIN+ (ADMIN++ só pelo site). Exige a permissão de gerenciar a equipe. NADA é criado: devolve a prévia e um código; o operador precisa DIGITAR \"aprovo <código>\" e só então chame executar_aprovado. O membro nasce sem senha e entra pelo \"Esqueci minha senha\". Card de cliente é criar_card.",
  level: 4,
  permission: "op_approve",
  schema: z.object({
    nome: z.string().min(3).max(160),
    email: z.email().max(160),
    cpf: z.string().min(11).max(18),
    telefone: z.string().min(10).max(20).optional().describe("Com DDD (para o código de senha por SMS)."),
    cargo: z.enum(CARGOS_MEMBRO).describe("ADMIN (padrão da equipe) ou ADMIN+."),
  }),
  async run({ op, trace, previewOnly }, args) {
    const { args: approvalArgs, previa } = await prepareMembro({ op, ...args });
    const out = previewOnly
      ? null
      : await createApproval({ operatorId: op.userId, sessionId: trace.sessionId, tool: "preparar_membro_equipe", canal: "equipe", args: approvalArgs, cardId: null });
    return { data: prepared(out, previa), summary: `membro da equipe preparado (${approvalArgs.cargo})` };
  },
});

// ---------------------------------------------------------------------------
// executar_aprovado
// ---------------------------------------------------------------------------

const executarSchema = z.object({
  approvalId: z.string().min(4).max(60).describe("approvalId devolvido pelo preparar_*."),
  hash: z.string().regex(/^[a-f0-9]{64}$/).describe("hash devolvido pelo preparar_*, sem mudar nada."),
});

const CANAL_TOOL: Record<string, string> = { email: "preparar_email", whatsapp: "preparar_whatsapp", card: "preparar_acao_irreversivel", equipe: "preparar_membro_equipe" };
const CANAL_NOME: Record<string, string> = { email: "e-mail", whatsapp: "WhatsApp", card: "ação no card", equipe: "membro da equipe" };

type LoteResult = { sent: boolean; enviados?: number; naoEnviados?: number; itens?: unknown[]; aviso?: string };

export const executarAprovado = defineTool({
  name: "executar_aprovado",
  description:
    "ENVIO. Envia/executa o que foi preparado (preparar_email/preparar_whatsapp/preparar_acao_irreversivel/preparar_membro_equipe, inclusive em lote) DEPOIS que o operador digitou \"aprovo <código>\" como última mensagem. Sem isso recusa com aprovacao_nao_digitada; conteúdo mudado = hash_diferente; mais de 30 min = aprovacao_expirada. Repetir não envia de novo. No lote devolve o resultado por card.",
  level: 4,
  permission: "op_approve",
  schema: executarSchema,
  async run({ op, trace }, args) {
    // O orçamento do lote conta desde aqui (auth e prechecks incluídos): o MCP corta em 55 s.
    const startedAt = Date.now();
    const approval = await loadApproval(args.approvalId);
    if (CANAL_TOOL[approval.canal] !== approval.tool) throw new OpToolError("aprovacao_encerrada", "Aprovação inválida.", 409);
    // Interruptor por canal: desligar o preparar_* também segura o que já foi preparado.
    const switches = await getOpSwitches();
    if (switches[approval.tool] !== true) {
      throw new OpToolError("ferramenta_desligada", `${CANAL_NOME[approval.canal]}: está desligado no Espaço de Trabalho (IA de operação).`, 403);
    }
    if (approval.canal === "whatsapp" && !op.permissions.view_whatsapp) {
      throw new OpToolError("sem_permissao", "Você não tem permissão para o WhatsApp.", 403);
    }
    if (approval.canal === "card") {
      const acao = (approval.args as CardApprovalArgs).acao;
      if (acao === "excluir_card" ? !op.permissions.delete_cards : !op.permissions.archive_cards) {
        throw new OpToolError("sem_permissao", "Você não tem mais permissão para esta ação no card.", 403);
      }
    }

    if (approval.canal === "equipe" && !op.permissions.manage_team) {
      throw new OpToolError("sem_permissao", "Você não tem mais permissão para gerenciar a equipe.", 403);
    }

    const out = await executeApproval({
      approvalId: args.approvalId,
      hash: args.hash,
      operatorId: op.userId,
      sessionId: trace.sessionId,
      precheck: (a) => {
        if (isLote(a.args)) {
          return a.canal === "email"
            ? precheckEmailLote(a.args as LoteApprovalArgs<EmailApprovalArgs>)
            : precheckWhatsappLote(a.args as LoteApprovalArgs<WhatsappApprovalArgs>);
        }
        return a.canal === "email"
          ? precheckEmail(a.args as EmailApprovalArgs)
          : a.canal === "equipe"
            ? precheckMembro(a.args as MembroApprovalArgs)
            : a.canal === "card"
            ? precheckIrreversivel(a.args as CardApprovalArgs)
            : precheckWhatsapp(a.args as WhatsappApprovalArgs);
      },
      send: (a) => {
        if (isLote(a.args)) {
          return a.canal === "email"
            ? sendApprovedEmailLote({ args: a.args as LoteApprovalArgs<EmailApprovalArgs>, op, trace, approvalId: a.id, startedAt })
            : sendApprovedWhatsappLote({ args: a.args as LoteApprovalArgs<WhatsappApprovalArgs>, op, trace, approvalId: a.id, startedAt });
        }
        return a.canal === "email"
          ? sendApprovedEmail({ args: a.args as EmailApprovalArgs, op, trace, approvalId: a.id })
          : a.canal === "equipe"
            ? runApprovedMembro({ args: a.args as MembroApprovalArgs, op, trace })
            : a.canal === "card"
            ? runApprovedIrreversivel({ args: a.args as CardApprovalArgs, op, trace })
            : sendApprovedWhatsapp({ args: a.args as WhatsappApprovalArgs, op, trace, approvalId: a.id });
      },
    });
    const canal = CANAL_NOME[out.approval.canal] ?? out.approval.canal;

    if (isLote(out.approval.args)) {
      const r = out.result as LoteResult;
      const itens = (out.approval.args as LoteApprovalArgs<{ cardId: string }>).itens;
      const cardIds = [...new Set(itens.map((i) => i.cardId))];
      const total = itens.length;
      return {
        data: {
          enviado: r.sent,
          lote: true,
          canal,
          noop: out.noop,
          enviados: r.enviados ?? 0,
          naoEnviados: r.naoEnviados ?? total,
          itens: r.itens ?? [],
          aviso: out.noop ? "Este lote já tinha sido enviado; nada saiu de novo." : r.aviso ?? (r.sent ? undefined : "Nada saiu. A aprovação foi encerrada: corrija os motivos e prepare de novo."),
          registro: r.sent && !out.noop ? "comentário e histórico gravados em cada card que recebeu, com o autor \"(via IA)\"" : null,
        },
        summary: out.noop ? `${canal} em lote já enviado (noop)` : `${canal} em lote: ${r.enviados ?? 0}/${total} enviado(s) (aprovação ${out.approval.code})`,
        cardIds,
      };
    }

    const cardIds = out.approval.cardId ? [out.approval.cardId] : [];
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
    // Item I (27/10): passo "enviar" do fluxo aberto do card.
    const progresso =
      out.approval.cardId && (out.approval.tool === "preparar_email" || out.approval.tool === "preparar_whatsapp")
        ? await autoProgress({ op, trace, cardId: out.approval.cardId, match: (s) => s.kind === "envio" && s.aprovacao === out.approval.tool, refs: [out.approval.id] })
        : null;
    return {
      data: {
        enviado: true,
        noop: out.noop,
        canal,
        ...(progresso ? { progresso } : {}),
        ...(out.noop ? { aviso: "Já tinha sido enviado; nada saiu de novo." } : {}),
        resultado: out.result,
        registro: out.noop
          ? null
          : out.approval.canal === "equipe"
            ? "histórico da equipe gravado com o autor \"(via IA)\""
            : "comentário e histórico do card gravados com o autor \"(via IA)\"",
      },
      // Membro da equipe não é entrega da operação: o summary sem "enviado (aprova…"
      // fica fora da contagem do rendimento (SQL de op/metrics.ts).
      summary: out.noop
        ? `${canal} já enviado (noop)`
        : out.approval.canal === "equipe"
          ? `${canal} criado (aprovação ${out.approval.code})`
          : `${canal} enviado (aprovação ${out.approval.code})`,
      cardIds,
    };
  },
});
