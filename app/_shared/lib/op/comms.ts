// Comunicação externa preparada pela IA de operação (Etapa 5, L4).
//
// prepare*: monta o conteúdo FINAL (destino, texto, anexos com ETag), confere
// tudo o que o envio vai conferir e devolve a prévia + os args que vão para
// op_approvals (o hash amarra a aprovação a eles). Nada sai daqui.
// sendApproved*: só chamados por executeApproval depois do "aprovo <código>":
// despacham pelo canal (SES Raw / sendSystemWhatsApp com TODAS as travas
// anti-spam), e no sucesso comentam no card + log `op_send` com o autor
// "<nome> (via IA)", metadata.source = "op" e o approvalId.
//
// Sem "use server": quem chama (ferramentas em op/tools) já passou pelo token.

import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../prisma";
import { createLog } from "../log";
import { TEAM_ROLES } from "../permissions";
import { addCardComment } from "../cards/comment";
import { isAwsEmailConfigured, sendEmailRawAws, RAW_EMAIL_MAX_ATTACHMENT_BYTES } from "../aws-messaging";
import { getDraft, DraftError } from "../docs/drafts";
import { isWindowOpen, sendSystemWhatsApp, systemSendBlockReason } from "../whatsapp/outbound";
import { renderTemplateThreadText } from "../whatsapp/template-text";
import { OpToolError } from "./registry";
import { resolveOneCardId } from "./cards";
import { hospitalContactFor } from "./hospitais";
import { contactIdsForCard } from "./tools/consultar-conversa";
import { brDateTime } from "./resolve";
import type { OperatorContext } from "./auth";
import type { OpTrace } from "../cards/types";
import { hasHeaderBreak, isValidEmail, mimeTypeFor, normalizeEmail } from "@/app/_shared/utils/email-mime";
import { OP_DRAFT_PREFIX } from "@/app/_shared/utils/doc-fields";
import { planWhatsAppSend, samePhoneBR } from "@/app/_shared/utils/wa-send-plan";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = () => process.env.AWS_S3_BUCKET_NAME;

export const EMAIL_MAX_CC = 5;
export const EMAIL_MAX_ATTACHMENTS = 5;

function viaIa(op: OperatorContext) {
  return { id: op.userId, name: `${op.name ?? op.email} (via IA)` };
}

async function loadCard(ref: string) {
  const id = await resolveOneCardId(ref);
  return db.user.findUniqueOrThrow({
    where: { id },
    select: { id: true, cardNumber: true, name: true, hospital: true, archiveStatus: true, telefone: true, telefone_secundario: true },
  });
}

/** ETag + tamanho do objeto; sumido → null. */
async function headObject(key: string): Promise<{ etag: string; bytes: number } | null> {
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET(), Key: key })).catch((err: { name?: string; $metadata?: { httpStatusCode?: number } }) => {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  });
  if (!head) return null;
  return { etag: String(head.ETag ?? ""), bytes: Number(head.ContentLength ?? 0) };
}

async function readObject(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`anexo vazio: ${key}`);
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// E-mail
// ---------------------------------------------------------------------------

export interface EmailAttachmentArg {
  origem: "rascunho" | "documento";
  key: string;
  nome: string;
  bytes: number;
  etag: string;
}

export interface EmailApprovalArgs extends Record<string, unknown> {
  cardId: string;
  cardNumber: number | null;
  de: string;
  para: string;
  cc: string[];
  assunto: string;
  corpo: string;
  anexos: EmailAttachmentArg[];
  /** Destino ou cc fora do cadastro do hospital (e da equipe): a prévia destaca. */
  destinoLivre: boolean;
}

/** Um anexo pedido pelo modelo: key de rascunho (op-drafts/), id ou nome EXATO de documento do card. */
async function resolveAttachment(ref: string, cardId: string, op: OperatorContext): Promise<EmailAttachmentArg> {
  const r = ref.trim();
  if (r.startsWith(OP_DRAFT_PREFIX)) {
    let draft;
    try {
      draft = await getDraft(r);
    } catch (err) {
      if (err instanceof DraftError) throw new OpToolError(err.code === "rascunho_expirado" ? "rascunho_expirado" : "rascunho_invalido", err.message, 400);
      throw err;
    }
    if (draft.cardId !== cardId) throw new OpToolError("anexo_invalido", "Este rascunho é de outro card.", 400);
    if (draft.operatorId !== op.userId) throw new OpToolError("sem_permissao", "Este rascunho foi preparado por outra pessoa.", 403);
    const head = await headObject(r);
    if (!head) throw new OpToolError("rascunho_expirado", "O rascunho não existe mais. Prepare de novo.", 404);
    return { origem: "rascunho", key: r, nome: draft.fileName, bytes: head.bytes, etag: head.etag };
  }
  const docs = await db.document.findMany({
    where: { userId: cardId, deletedAt: null, OR: [{ id: r }, { name: r }] },
    select: { id: true, key: true, name: true },
    take: 3,
  });
  if (docs.length === 0) throw new OpToolError("anexo_invalido", `Nenhum documento do card com id ou nome exato "${r}" (use listar_documentos).`, 404);
  if (docs.length > 1) throw new OpToolError("ambiguo", `Mais de um documento chamado "${r}". Use o id.`, 409, docs.map((d) => ({ id: d.id, nome: d.name })));
  const doc = docs[0];
  // Só arquivo do próprio card em uploads/ (nada de chave arbitrária do bucket).
  if (!doc.key.startsWith("uploads/")) throw new OpToolError("anexo_invalido", `O documento "${doc.name}" não está na pasta de arquivos do card.`, 400);
  const head = await headObject(doc.key);
  if (!head) throw new OpToolError("anexo_invalido", `O arquivo de "${doc.name}" não existe mais no armazenamento.`, 404);
  return { origem: "documento", key: doc.key, nome: doc.name, bytes: head.bytes, etag: head.etag };
}

export async function prepareEmail(input: {
  op: OperatorContext;
  card: string;
  para?: string;
  cc?: string[];
  assunto: string;
  corpo: string;
  anexos?: string[];
}): Promise<{ args: EmailApprovalArgs; previa: Record<string, unknown>; cardId: string }> {
  if (!isAwsEmailConfigured()) throw new OpToolError("email_nao_configurado", "O envio de e-mail (SES) não está configurado no CRM.", 503);
  const card = await loadCard(input.card);
  const avisos: string[] = [];
  if (card.archiveStatus) avisos.push(`card arquivado (${card.archiveStatus})`);

  const contato = card.hospital?.trim() ? await hospitalContactFor(card.hospital) : null;
  let para: string;
  if (input.para?.trim()) {
    para = normalizeEmail(input.para);
  } else if (contato?.email) {
    para = contato.email;
  } else {
    throw new OpToolError(
      "sem_destinatario",
      `O hospital do card (${card.hospital ?? "não cadastrado"}) não tem e-mail no cadastro nem em nota publicada. Pergunte ao operador para quem mandar (vai como "fora do cadastro").`,
      422,
    );
  }
  if (hasHeaderBreak(para) || !isValidEmail(para)) throw new OpToolError("argumentos_invalidos", `E-mail inválido: ${para}`, 400);

  const cc = [...new Set((input.cc ?? []).map(normalizeEmail))].filter((e) => e !== para);
  if (cc.length > EMAIL_MAX_CC) throw new OpToolError("argumentos_invalidos", `No máximo ${EMAIL_MAX_CC} e-mails em cópia.`, 400);
  for (const e of cc) if (hasHeaderBreak(e) || !isValidEmail(e)) throw new OpToolError("argumentos_invalidos", `E-mail inválido em cópia: ${e}`, 400);
  const team = cc.length ? await db.user.findMany({ where: { role: { in: [...TEAM_ROLES] } }, select: { email: true } }) : [];
  const teamEmails = new Set(team.map((t) => normalizeEmail(t.email)));

  const assunto = input.assunto.trim();
  const corpo = input.corpo.replace(/\r\n/g, "\n").trim();
  if (!assunto || hasHeaderBreak(assunto)) throw new OpToolError("argumentos_invalidos", "Assunto vazio ou com quebra de linha.", 400);
  if (!corpo) throw new OpToolError("argumentos_invalidos", "Corpo do e-mail vazio.", 400);

  const refs = [...new Set((input.anexos ?? []).map((a) => a.trim()).filter(Boolean))];
  if (refs.length > EMAIL_MAX_ATTACHMENTS) throw new OpToolError("argumentos_invalidos", `No máximo ${EMAIL_MAX_ATTACHMENTS} anexos.`, 400);
  const anexos: EmailAttachmentArg[] = [];
  for (const ref of refs) anexos.push(await resolveAttachment(ref, card.id, input.op));
  const total = anexos.reduce((n, a) => n + a.bytes, 0);
  if (total > RAW_EMAIL_MAX_ATTACHMENT_BYTES) throw new OpToolError("anexos_grandes", "Os anexos passam de 10 MB somados. Tire algum.", 413);

  const cadastroEmail = contato?.email ? normalizeEmail(contato.email) : null;
  const paraLivre = para !== cadastroEmail;
  const ccLivre = cc.filter((e) => e !== cadastroEmail && !teamEmails.has(e));
  const destinoLivre = paraLivre || ccLivre.length > 0;
  if (paraLivre) avisos.push(`DESTINO FORA DO CADASTRO: ${para}${cadastroEmail ? ` (o cadastro do hospital é ${cadastroEmail})` : " (hospital sem e-mail cadastrado)"}`);
  if (ccLivre.length) avisos.push(`cópia fora do cadastro e da equipe: ${ccLivre.join(", ")}`);
  if (contato?.fonteEmail === "nota") avisos.push(`e-mail do hospital tirado da nota publicada ${contato.notaCaminho} (o GHOST ainda não tem cadastro)`);
  if (!card.hospital?.trim()) avisos.push("card sem hospital cadastrado");

  const args: EmailApprovalArgs = {
    cardId: card.id,
    cardNumber: card.cardNumber,
    de: process.env.SES_FROM_EMAIL ?? "",
    para,
    cc,
    assunto,
    corpo,
    anexos,
    destinoLivre,
  };
  const previa = {
    canal: "e-mail",
    card: { cardNumber: card.cardNumber, nome: card.name, hospital: card.hospital },
    de: args.de,
    para,
    cc,
    assunto,
    corpo,
    anexos: anexos.map((a) => ({ nome: a.nome, origem: a.origem, tamanhoKb: Math.ceil(a.bytes / 1024) })),
    destinoForaDoCadastro: destinoLivre,
    avisos,
  };
  return { args, previa, cardId: card.id };
}

/** Anexo mudou ou sumiu desde a preparação → hash_diferente (prepare de novo). */
export async function precheckEmail(args: EmailApprovalArgs): Promise<void> {
  for (const a of args.anexos) {
    const head = await headObject(a.key);
    if (!head || head.etag !== a.etag) {
      throw new OpToolError("hash_diferente", `O anexo "${a.nome}" mudou ou sumiu desde a preparação. Prepare de novo.`, 409);
    }
  }
}

export async function sendApprovedEmail(input: {
  args: EmailApprovalArgs;
  op: OperatorContext;
  trace: OpTrace;
  approvalId: string;
}): Promise<{ sent: boolean; id?: string; error?: string }> {
  const { args, op } = input;
  const attachments = [];
  for (const a of args.anexos) attachments.push({ name: a.nome, contentType: mimeTypeFor(a.nome), data: await readObject(a.key) });
  const res = await sendEmailRawAws({ to: [args.para], cc: args.cc, subject: args.assunto, text: args.corpo, attachments });
  if (!res.sent) return { sent: false, error: res.error };

  const author = viaIa(op);
  const anexosTxt = args.anexos.length ? `\nAnexos: ${args.anexos.map((a) => a.nome).join(", ")}` : "";
  const texto = `E-mail enviado (aprovado por ${op.name ?? op.email} no app).\nPara: ${args.para}${args.cc.length ? `\nCc: ${args.cc.join(", ")}` : ""}\nAssunto: ${args.assunto}${anexosTxt}${args.destinoLivre ? "\nObs.: destino fora do cadastro do hospital." : ""}`;
  // Falha no comentário/log não desfaz o envio (já saiu): só registra no console.
  await addCardComment({ cardId: args.cardId, isProcess: false, author, source: "op", op: input.trace, text: texto, notify: false }).catch((err) =>
    console.error("[op] e-mail enviado, mas o comentário falhou:", err),
  );
  await createLog({
    action: "op_send",
    message: `enviou e-mail para ${args.para} (aprovado no app)`,
    authorId: author.id,
    authorName: author.name,
    userId: args.cardId,
    metadata: {
      source: "op",
      op: input.trace,
      canal: "email",
      approvalId: input.approvalId,
      para: args.para,
      cc: args.cc,
      assunto: args.assunto,
      anexos: args.anexos.map((a) => a.nome),
      destinoLivre: args.destinoLivre,
      sesMessageId: res.id ?? null,
    },
  });
  return { sent: true, id: res.id };
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export interface WhatsappApprovalArgs extends Record<string, unknown> {
  cardId: string;
  cardNumber: number | null;
  contactId: string;
  numberId: string | null;
  linha: string;
  telefone: string;
  modo: "texto" | "template";
  template: string | null;
  variaveis: string[];
  /** O que sai: o texto, ou o template preenchido (dentro da janela sai como texto). */
  textoFinal: string;
  via: "text" | "template";
}

async function sendingNumber(numberId: string | null) {
  return numberId
    ? db.whatsAppNumber.findUnique({ where: { id: numberId }, select: { id: true, label: true, active: true, templatesPaused: true } })
    : db.whatsAppNumber.findFirst({ where: { isDefault: true }, select: { id: true, label: true, active: true, templatesPaused: true } });
}

export async function prepareWhatsapp(input: {
  op: OperatorContext;
  card: string;
  contato?: string;
  texto?: string;
  template?: string;
  variaveis?: string[];
}): Promise<{ args: WhatsappApprovalArgs; previa: Record<string, unknown>; cardId: string }> {
  const card = await loadCard(input.card);
  const ids = await contactIdsForCard(card.id);
  if (!ids.length) throw new OpToolError("sem_contato", "Este card não tem conversa de WhatsApp ligada. Fale pelo inbox.", 404);
  const contacts = await db.whatsAppContact.findMany({
    where: { id: { in: ids } },
    select: { id: true, phone: true, name: true, optedOut: true, optedInAt: true, numberId: true, userId: true },
  });
  let contact = contacts[0];
  if (input.contato) {
    const found = contacts.find((c) => c.id === input.contato);
    if (!found) throw new OpToolError("argumentos_invalidos", "Este contato não é do card.", 400);
    contact = found;
  } else if (contacts.length > 1) {
    const numbers = await db.whatsAppNumber.findMany({ select: { id: true, label: true } });
    const label = new Map(numbers.map((n) => [n.id, n.label]));
    throw new OpToolError(
      "ambiguo",
      "O card tem conversa em mais de uma linha. Por qual contato mandar? (mande `contato` com o id)",
      409,
      contacts.map((c) => ({ contato: c.id, telefone: c.phone, linha: c.numberId ? label.get(c.numberId) ?? c.numberId : "padrão" })),
    );
  }

  // O vínculo automático (contactIdsForCard) casa só os 8 últimos dígitos:
  // serve para ler, não para mandar mensagem a alguém. Sem vínculo manual ao
  // card, o telefone do contato tem que ser o do card (DDD + 8 últimos).
  const manual = contact.userId === card.id;
  const telefoneConfere = samePhoneBR(contact.phone, card.telefone) || samePhoneBR(contact.phone, card.telefone_secundario);
  if (!manual && !telefoneConfere) {
    throw new OpToolError(
      "contato_nao_confirmado",
      `A conversa (${contact.phone}) não está vinculada a este card e o telefone não bate com o do cadastro. Vincule o contato ao card pelo inbox ou corrija o telefone do card.`,
      422,
    );
  }

  const number = await sendingNumber(contact.numberId);
  const block = await systemSendBlockReason(contact.id);
  const windowOpen = await isWindowOpen(contact.id);
  const modo: "texto" | "template" = input.template ? "template" : "texto";
  const variaveis = (input.variaveis ?? []).map((v) => v.trim());

  // Mesmo critério do sendSystemWhatsApp: template da linha do contato; cai no
  // catálogo legado (numberId null). Nome exato.
  const template = input.template
    ? await db.whatsAppTemplate.findFirst({
        where: { name: input.template, OR: [{ numberId: contact.numberId }, { numberId: null }] },
        orderBy: { numberId: { sort: "desc", nulls: "last" } },
      })
    : null;

  const plan = planWhatsAppSend({
    contact: { optedOut: contact.optedOut, optedInAt: contact.optedInAt },
    number: number ? { active: number.active, templatesPaused: number.templatesPaused } : null,
    inCooldown: block === "cooldown",
    windowOpen,
    mode: modo,
    template: template
      ? {
          name: template.name,
          status: template.status,
          category: template.category,
          headerText: template.headerText,
          headerFormat: template.headerFormat,
          headerMediaKey: template.headerMediaKey,
          bodyVars: template.bodyVars,
          bodyPreview: template.bodyPreview,
        }
      : null,
    varsCount: variaveis.length,
  });
  if (!plan.ok) throw new OpToolError(plan.code, plan.message, 422);

  let textoFinal: string;
  if (modo === "texto") {
    textoFinal = (input.texto ?? "").trim();
    if (!textoFinal) throw new OpToolError("argumentos_invalidos", "Texto vazio.", 400);
  } else {
    textoFinal = renderTemplateThreadText(template!, variaveis);
  }

  const lastIn = await db.whatsAppMessage.findFirst({
    where: { contactId: contact.id, direction: "in" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const args: WhatsappApprovalArgs = {
    cardId: card.id,
    cardNumber: card.cardNumber,
    contactId: contact.id,
    numberId: contact.numberId,
    linha: number?.label ?? "padrão",
    telefone: contact.phone,
    modo,
    template: modo === "template" ? template!.name : null,
    variaveis: modo === "template" ? variaveis : [],
    textoFinal,
    via: plan.via,
  };
  const avisos = [
    plan.aviso,
    card.archiveStatus ? `card arquivado (${card.archiveStatus})` : null,
    manual ? null : "contato ligado ao card pelo telefone do cadastro (sem vínculo manual no inbox)",
  ].filter((x): x is string => !!x);
  const previa = {
    canal: "WhatsApp",
    card: { cardNumber: card.cardNumber, nome: card.name },
    contato: { nome: contact.name, telefone: contact.phone },
    linha: args.linha,
    janela24hAberta: windowOpen,
    ultimaMensagemDoCliente: lastIn ? brDateTime(lastIn.createdAt) : null,
    saiComo: plan.via === "template" ? `template "${args.template}"` : "texto",
    texto: textoFinal,
    avisos,
  };
  return { args, previa, cardId: card.id };
}

/** Contato trocou de linha desde a preparação → hash_diferente. */
export async function precheckWhatsapp(args: WhatsappApprovalArgs): Promise<void> {
  const c = await db.whatsAppContact.findUnique({ where: { id: args.contactId }, select: { numberId: true, phone: true } });
  if (!c || c.numberId !== args.numberId || c.phone !== args.telefone) {
    throw new OpToolError("hash_diferente", "O contato mudou desde a preparação. Prepare de novo.", 409);
  }
}

export async function sendApprovedWhatsapp(input: {
  args: WhatsappApprovalArgs;
  op: OperatorContext;
  trace: OpTrace;
  approvalId: string;
}): Promise<{ sent: boolean; via: string | null; reason?: string }> {
  const { args, op } = input;
  const author = viaIa(op);
  // Todas as travas do envio de sistema valem de novo agora (opt-out,
  // cooldown, janela, opt-in, template APPROVED da WABA, templatesPaused no
  // sendTemplate). `source: "op"` conta no mesmo cooldown das proativas.
  const res = await sendSystemWhatsApp({
    phone: args.telefone,
    contactId: args.contactId,
    text: args.textoFinal,
    templateName: args.modo === "template" ? args.template : null,
    templateVars: args.variaveis,
    authorId: author.id,
    authorName: author.name,
    source: "op",
  });
  if (!res.sent) return { sent: false, via: res.via, reason: res.reason };

  const texto = `WhatsApp enviado ao cliente (aprovado por ${op.name ?? op.email} no app), linha ${args.linha}, como ${res.via === "template" ? `template "${args.template}"` : "texto"}:\n${args.textoFinal}`;
  await addCardComment({ cardId: args.cardId, isProcess: false, author, source: "op", op: input.trace, text: texto, notify: false }).catch((err) =>
    console.error("[op] WhatsApp enviado, mas o comentário falhou:", err),
  );
  await createLog({
    action: "op_send",
    message: `enviou WhatsApp ao cliente (aprovado no app)`,
    authorId: author.id,
    authorName: author.name,
    userId: args.cardId,
    metadata: {
      source: "op",
      op: input.trace,
      canal: "whatsapp",
      approvalId: input.approvalId,
      contactId: args.contactId,
      numberId: args.numberId,
      via: res.via,
      template: args.template,
      preview: args.textoFinal.slice(0, 140),
    },
  });
  return { sent: true, via: res.via };
}
