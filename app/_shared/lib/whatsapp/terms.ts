import { createHash, randomBytes, randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Prisma } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { createLog, logWhatsAppEvent } from "@/app/_shared/lib/log";
import { reportCriticalError } from "@/app/_shared/lib/report-error";
import { publicBaseUrl } from "@/app/_shared/lib/signature/tokens";
import { buildTermsReceiptPdf } from "@/app/_shared/lib/terms/receipt-pdf";
import { cardUploadKey } from "@/app/_shared/utils/s3-keys";
import { parseDraftDocuments } from "@/app/_shared/utils/draft-documents";
import { parseInteractive, readFlowJson, walkComponents, type FlowJson } from "@/app/_shared/utils/wa-forms";
import { canonicalTermsRecord, formatVerificationCode, parseTermsReply } from "@/app/_shared/utils/terms";
import { getCreds } from "./numbers";
import { findActiveFormByName, sendFormToContact, syncFormCatalog } from "./forms";
import { broadcastWhatsAppEvent, whatsappChannelId } from "./service";

// Aceite de termos pelo WhatsApp (T-B40K0). Decisões do dono (13/11/2026):
// - o BOT ESPERA o aceite: quando o cérebro decide `qualify` e o cliente ainda
//   não aceitou, o código manda o formulário (Meta Flow) e a conversa fica no
//   bot; a Fila (e o aviso de lead qualificado) vem quando o aceite chega;
// - o aceite gera o comprovante em PDF, anexado na pasta PROCURAÇÃO do card;
// - a ZapSign continua obrigatória adiante (trava em utils/terms.ts).
//
// Liga com a env WA_TERMS_FORM = nome do formulário na Meta (ex.:
// "aceite_termos_servico"). Sem ela, o bot qualifica como sempre. Falha nossa
// (formulário não publicado, Meta recusou) nunca segura o lead: vai para a
// Fila com o motivo na nota.

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const COMPANY = "Brasil Benefícios e Indenizações";
const TERMS_DEFAULT_BODY =
  "Para darmos andamento ao seu pedido, preciso da sua autorização. É rapidinho: toque no botão abaixo, confira seu nome e CPF e marque \"SIM, autorizo\".";
const TERMS_DEFAULT_CTA = "Ver e autorizar";
// Reenvio só depois de 10 min e no máximo 3 por atendimento: o cliente que
// escreve "pronto" sem tocar no botão recebe o lembrete do cérebro, não um
// formulário novo a cada mensagem.
export const TERMS_RESEND_MS = 10 * 60_000;
export const TERMS_MAX_SENDS = 3;

export function termsFormName(): string | null {
  return process.env.WA_TERMS_FORM?.trim() || null;
}

/** Já aceitou (qualquer versão) por este contato, este telefone ou o card dele? */
export async function hasAcceptedTerms(c: { id: string; phone: string; userId: string | null }): Promise<boolean> {
  const row = await db.termsAcceptance.findFirst({
    where: { OR: [{ contactId: c.id }, { phone: c.phone }, ...(c.userId ? [{ userId: c.userId }] : [])] },
    select: { id: true },
  });
  return !!row;
}

/** Formulários de aceite que o BOT mandou neste atendimento (mais novo primeiro). */
async function botTermsSends(contactId: string, since: Date): Promise<Date[]> {
  const rows = await db.whatsAppMessage.findMany({
    where: {
      contactId, direction: "out", sentByBot: true, createdAt: { gte: since },
      interactive: { path: ["purpose"], equals: "terms" },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
    take: 10,
  });
  return rows.map((r) => r.createdAt);
}

/** Início do atendimento atual: o último encerramento, ou a criação da conversa. */
function attendanceStart(conv: { closedAt: Date | null; createdAt: Date } | null): Date {
  return conv?.closedAt ?? conv?.createdAt ?? new Date(0);
}

/**
 * Fato para o cérebro: formulário de aceite enviado neste atendimento e ainda
 * sem aceite. null = nada pendente (ou recurso desligado).
 */
export async function termsPendingFact(contactId: string): Promise<{ sentAt: string; sends: number } | null> {
  if (!termsFormName()) return null;
  try {
    const [contact, conv] = await Promise.all([
      db.whatsAppContact.findUnique({ where: { id: contactId }, select: { id: true, phone: true, userId: true } }),
      db.whatsAppConversation.findUnique({ where: { contactId }, select: { closedAt: true, createdAt: true } }),
    ]);
    if (!contact) return null;
    const sends = await botTermsSends(contactId, attendanceStart(conv));
    if (!sends.length || (await hasAcceptedTerms(contact))) return null;
    return { sentAt: sends[0].toISOString(), sends: sends.length };
  } catch {
    return null;
  }
}

export type TermsRequestState =
  | { state: "off" }
  | { state: "accepted" }
  | { state: "sent" }
  | { state: "waiting"; sends: number }
  | { state: "failed"; error: string };

/**
 * Chamado no `qualify` do bot. "sent"/"waiting" = a conversa fica no bot
 * esperando o aceite; "off"/"accepted"/"failed" = segue para a Fila como
 * sempre (no "failed", com o motivo na nota).
 */
export async function maybeRequestTermsAcceptance(
  contactId: string,
  opts: { queueReason?: string | null; hasCard?: boolean } = {},
): Promise<TermsRequestState> {
  const formName = termsFormName();
  if (!formName) return { state: "off" };
  // O aceite é etapa do filtro inicial de LEAD NOVO: cliente que já tem card
  // (retorno, consulta de status) segue para a Fila como sempre.
  if (opts.hasCard) return { state: "off" };
  try {
    const [contact, conv] = await Promise.all([
      db.whatsAppContact.findUnique({ where: { id: contactId }, select: { id: true, phone: true, name: true, numberId: true, userId: true } }),
      db.whatsAppConversation.findUnique({ where: { contactId }, select: { status: true, closedAt: true, createdAt: true } }),
    ]);
    if (!contact) return { state: "failed", error: "contato não encontrado" };
    // Atendente assumiu durante o turno: nada sai; o qualifyToQueue condicional
    // do bot também não move (o atendente conduz e manda o formulário se quiser).
    if (conv?.status !== "bot") return { state: "off" };
    if (await hasAcceptedTerms(contact)) return { state: "accepted" };

    const sends = await botTermsSends(contactId, attendanceStart(conv));
    if (sends.length >= TERMS_MAX_SENDS) return { state: "waiting", sends: sends.length };
    if (sends[0] && Date.now() - sends[0].getTime() < TERMS_RESEND_MS) return { state: "waiting", sends: sends.length };

    const creds = await getCreds(contact.numberId);
    if (!creds?.wabaId) return { state: "failed", error: "linha do contato sem a conta (WABA) cadastrada" };
    let form = await findActiveFormByName(creds.wabaId, formName);
    if (!form) {
      await syncFormCatalog(creds, { force: true });
      form = await findActiveFormByName(creds.wabaId, formName);
    }
    if (!form) return { state: "failed", error: `o formulário "${formName}" não está publicado nesta conta do WhatsApp` };

    const card = contact.userId
      ? await db.user.findUnique({ where: { id: contact.userId }, select: { name: true, cpf: true } })
      : null;
    const fullName = (card?.name ?? contact.name ?? "").trim();
    const sent = await sendFormToContact({
      contactId,
      versionId: form.id,
      body: form.bodyText ?? TERMS_DEFAULT_BODY,
      cta: form.cta ?? TERMS_DEFAULT_CTA,
      header: form.headerText,
      footer: form.footerText,
      // A tela de entrada do aceite cumprimenta pelo 1º nome (data.nome).
      values: { nome: fullName.split(/\s+/)[0] ?? "", nome_completo: fullName, cpf: (card?.cpf ?? "").replace(/\D/g, "") },
      authorId: null,
      sentByBot: true,
      purpose: "terms",
      queueReason: opts.queueReason ?? null,
    });
    if (!sent.ok) return { state: "failed", error: sent.error };
    broadcastWhatsAppEvent({
      id: sent.message.id,
      channelId: whatsappChannelId(contactId),
      contactId,
      waMessageId: sent.message.waMessageId,
      direction: "out",
      body: sent.message.body,
      mediaKey: null,
      mediaType: null,
      status: sent.message.status,
      sentByBot: true,
      authorId: null,
      createdAt: sent.message.createdAt.toISOString(),
      contactName: contact.name,
      contactPhone: contact.phone,
      conversationStatus: "bot",
      interactive: sent.message.interactive,
    });
    return { state: "sent" };
  } catch (err) {
    await reportCriticalError("terms_request", err, { contactId });
    return { state: "failed", error: "falha ao enviar o formulário de aceite" };
  }
}

// ─── Resposta: registro + comprovante ────────────────────────────────────────

/** Texto do termo (RichText) e a frase da caixa de autorização, do JSON do formulário. */
function termsTextOf(json: FlowJson | null): { lines: string[]; optInLabel: string | null } {
  if (!json) return { lines: [], optInLabel: null };
  let lines: string[] = [];
  let optInLabel: string | null = null;
  for (const s of json.screens) {
    walkComponents(s, (c) => {
      if (c.type === "RichText" && Array.isArray(c.text) && c.text.length > lines.length) {
        lines = (c.text as unknown[]).filter((x): x is string => typeof x === "string");
      }
      if (c.type === "OptIn" && c.name === "aceite_termos" && typeof c.label === "string") optInLabel = c.label;
    });
  }
  return { lines, optInLabel };
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

function safeFilePart(s: string): string {
  return s.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "cliente";
}

/**
 * Resposta do formulário de aceite (nfm_reply com `aceite_termos`). Chamado
 * pela ingestão DEPOIS de gravar a mensagem; nunca lança. Grava o aceite (um
 * por contato e versão), gera o PDF, anexa no card (ou no rascunho da ficha),
 * registra no histórico e, se foi o BOT que pediu e a conversa segue no bot,
 * manda para a Fila como lead qualificado (com o motivo que o cérebro deu no
 * `qualify`, guardado no formulário enviado).
 */
export async function handleTermsReply(args: {
  contact: { id: string; phone: string; name: string | null; numberId: string | null; userId: string | null };
  conversationStatus: string;
  message: { id: string; waMessageId: string | null; createdAt: Date };
  metaTimestamp?: string;
  responseJson: string | undefined;
  replyToInteractive: Prisma.JsonValue | undefined;
}): Promise<void> {
  const reply = parseTermsReply(args.responseJson);
  if (!reply?.accepted || !args.message.waMessageId) return;
  const { contact } = args;
  const sentForm = parseInteractive(args.replyToInteractive);
  const askedByBot = sentForm?.kind === "flow" && sentForm.purpose === "terms";

  try {
    const row = await db.termsAcceptance.findUnique({
      where: { contactId_termsVersion: { contactId: contact.id, termsVersion: reply.termsVersion } },
    });
    if (!row) {
      const created = await createAcceptanceRow(args, reply, sentForm?.kind === "flow" ? sentForm.formVersionId : null);
      if (created) await completeReceipt(created, args);
    } else if (!row.pdfKey && Date.now() - row.createdAt.getTime() > RECEIPT_RETRY_AFTER_MS) {
      // O comprovante do 1º toque falhou (S3/PDF): o toque seguinte completa.
      await completeReceipt(row, args);
    }
  } catch (err) {
    await reportCriticalError("terms_accept", err, { contactId: contact.id });
  }

  if (askedByBot && args.conversationStatus === "bot") {
    try {
      const bot = await import("./bot");
      await bot.queueAfterTermsAccepted(contact.id, sentForm?.kind === "flow" ? sentForm.queueReason ?? null : null);
    } catch (err) {
      await reportCriticalError("terms_accept_queue", err, { contactId: contact.id });
    }
  }
}

// Aceite sem PDF só é completado depois disto: antes, o 1º processamento pode
// ainda estar gerando (dois toques no mesmo segundo).
const RECEIPT_RETRY_AFTER_MS = 2 * 60_000;

type AcceptanceRow = NonNullable<Awaited<ReturnType<typeof db.termsAcceptance.findUnique>>>;

/** Cria a linha do aceite (código + hash do registro). null = outro toque já criou. */
async function createAcceptanceRow(
  args: Parameters<typeof handleTermsReply>[0],
  reply: NonNullable<ReturnType<typeof parseTermsReply>>,
  formVersionId: string | null,
): Promise<AcceptanceRow | null> {
  const { contact, message } = args;
  const ts = Number(args.metaTimestamp);
  const acceptedAt = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : message.createdAt;
  const [form, fresh] = await Promise.all([
    formVersionId ? db.whatsAppFormVersion.findUnique({ where: { id: formVersionId } }) : Promise.resolve(null),
    db.whatsAppContact.findUnique({ where: { id: contact.id }, select: { userId: true } }),
  ]);
  const { lines } = termsTextOf(readFlowJson(form?.flowJson));
  const id = randomUUID();
  const code = formatVerificationCode(randomBytes(12));
  const recordHash = sha256(canonicalTermsRecord({
    documentId: id,
    code,
    phone: contact.phone,
    waMessageId: message.waMessageId!,
    acceptedAt,
    termsVersion: reply.termsVersion,
    formName: form?.name ?? null,
    metaFlowId: form?.metaFlowId ?? null,
    name: reply.name,
    cpf: reply.cpf,
    termsTextHash: lines.length ? sha256(lines.join("\n")) : null,
  }));

  // Linha primeiro: a unique (contato, versão) barra o 2º toque concorrente
  // ANTES de gerar outro PDF.
  try {
    return await db.termsAcceptance.create({
      data: {
        id, code, contactId: contact.id, numberId: contact.numberId, phone: contact.phone, userId: fresh?.userId ?? null,
        termsVersion: reply.termsVersion, formVersionId, waMessageId: message.waMessageId!,
        flowToken: null, nameGiven: reply.name, cpfGiven: reply.cpf, acceptedAt, recordHash,
        responseJson: (() => { try { return JSON.parse(args.responseJson ?? "{}"); } catch { return {}; } })(),
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return null; // já registrado (toque repetido)
    throw err;
  }
}

/** Gera o PDF do aceite e anexa no card (ou no rascunho da ficha); registra e avisa a equipe. */
async function completeReceipt(row: AcceptanceRow, args: Parameters<typeof handleTermsReply>[0]): Promise<void> {
  const { contact } = args;
  const [form, freshContact] = await Promise.all([
    row.formVersionId ? db.whatsAppFormVersion.findUnique({ where: { id: row.formVersionId } }) : Promise.resolve(null),
    db.whatsAppContact.findUnique({ where: { id: contact.id }, select: { userId: true, draftDocuments: true } }),
  ]);
  const userId = freshContact?.userId ?? null;
  const card = userId ? await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, cardNumber: true } }) : null;
  const { lines, optInLabel } = termsTextOf(readFlowJson(form?.flowJson));
  const { id, code, recordHash, acceptedAt, termsVersion } = row;
  const verifyUrl = `${publicBaseUrl()}/verificar/aceite/${code}`;

  const lineLabel = (await getCreds(contact.numberId))?.label ?? null;
  const pdf = await buildTermsReceiptPdf({
    documentId: id, code, verifyUrl, recordHash, acceptedAt,
    phone: row.phone, lineLabel, waMessageId: row.waMessageId,
    formName: form?.name ?? null, formVersion: form?.version ?? null, metaFlowId: form?.metaFlowId ?? null,
    termsVersion, name: row.nameGiven, cpf: row.cpfGiven,
    healthConsent: parseTermsReply(row.responseJson)?.healthConsent ?? true,
    optInLabel, termsLines: lines, company: COMPANY,
  });
  const pdfSha256 = sha256(pdf);
  const fileName = `Comprovante de aceite dos termos ${termsVersion} - ${safeFilePart(row.nameGiven ?? card?.name ?? contact.name ?? contact.phone)}.pdf`;
  const key = card
    ? cardUploadKey(card.id, false, Date.now(), 0, fileName)
    : `whatsapp/${contact.id}/${Date.now()}-${fileName}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME!,
    Key: key,
    Body: pdf,
    ContentType: "application/pdf",
  }));

  let documentId: string | null = null;
  if (card) {
    const doc = await db.document.create({ data: { userId: card.id, processId: null, key, name: fileName, category: "PROCURACAO" } });
    documentId = doc.id;
    await createLog({
      action: "document_add",
      message: `anexou "${fileName}" (aceite dos termos pelo WhatsApp)`,
      authorId: "whatsapp-client",
      authorName: "Cliente (WhatsApp)",
      userId: card.id,
      metadata: { documents: [fileName], category: "PROCURACAO", termsAcceptanceId: id },
    });
  } else {
    // Sem card ainda: rascunho da ficha (vai para o card quando ele for criado
    // ou vinculado — migrateDraftDocuments, pasta PROCURAÇÃO).
    const drafts = parseDraftDocuments(freshContact?.draftDocuments);
    drafts.push({ key, name: fileName, uploadedAt: new Date().toISOString(), category: "PROCURACAO" });
    await db.whatsAppContact.update({ where: { id: contact.id }, data: { draftDocuments: drafts as unknown as Prisma.InputJsonValue } });
  }
  await db.termsAcceptance.update({ where: { id }, data: { pdfKey: key, pdfSha256, documentId, userId: card?.id ?? row.userId } });

  const resumo = `aceitou os termos ${termsVersion} pelo WhatsApp (código ${code})`;
  const authorName = row.nameGiven ?? contact.name ?? "Cliente (WhatsApp)";
  if (card) {
    await createLog({
      action: "terms_accept",
      message: resumo,
      authorId: "whatsapp-client",
      authorName,
      userId: card.id,
      metadata: { termsAcceptanceId: id, code, termsVersion, waMessageId: row.waMessageId, documentId },
    });
  } else {
    await logWhatsAppEvent({
      action: "terms_accept",
      message: resumo,
      authorId: "whatsapp-client",
      authorName,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { termsAcceptanceId: id, code, termsVersion },
    });
  }

  // Nota para a equipe SEM sentByBot: a Fila mostra a última nota do BOT como
  // motivo da transferência, e esta não pode tomar o lugar dela.
  const note = `✅ Termos ${termsVersion} aceitos pelo cliente. Comprovante "${fileName}" ${card
    ? `na pasta PROCURAÇÃO do card${card.cardNumber ? ` #${card.cardNumber}` : ""}`
    : "na ficha da conversa (vai para o card quando ele for criado)"}. Código de verificação: ${code}.`;
  const noteMsg = await db.whatsAppMessage.create({
    data: { contactId: contact.id, numberId: contact.numberId, direction: "out", body: note, internal: true, status: "sent" },
  });
  await db.whatsAppConversation.updateMany({ where: { contactId: contact.id }, data: { updatedAt: new Date() } });
  broadcastWhatsAppEvent({
    id: noteMsg.id,
    channelId: whatsappChannelId(contact.id),
    contactId: contact.id,
    direction: "out",
    body: note,
    mediaKey: null,
    mediaType: null,
    status: "sent",
    sentByBot: false,
    authorId: null,
    createdAt: noteMsg.createdAt.toISOString(),
    contactName: contact.name,
    contactPhone: contact.phone,
    conversationStatus: args.conversationStatus,
  });
}
