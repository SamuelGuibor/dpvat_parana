'use server';

import type { Prisma } from '@prisma/client';
import { db } from '@/app/_shared/lib/prisma';
import { requirePermission, type SessionPermissions } from '@/app/_shared/lib/permissions-server';
import type { PermissionKey } from '@/app/_shared/lib/permissions';
import { AccessError } from '@/app/_shared/utils/route-guards';
import { createLog, logWhatsAppEvent } from '@/app/_shared/lib/log';
import { runAfterResponse } from '@/app/_shared/lib/background';
import { broadcastWhatsAppEvent, whatsappChannelId, type WhatsAppMessageDTO } from '@/app/_shared/lib/whatsapp/service';
import {
  activateFormVersion, discardFormDraft, publishFormDraft, saveFormDraft, sendFormToContact, toFormVersionDTO,
} from '@/app/_shared/lib/whatsapp/forms';
import { ensureTermsReceiptForMessage } from '@/app/_shared/lib/whatsapp/terms';
import { signGetUrl } from '@/app/_shared/lib/s3-presign';
import { fileNameFromKey } from '@/app/_shared/utils/s3-keys';
import {
  FICHA_FIELD_LABELS, formFieldsToFicha, parseInteractive, readFlowJson, validateFormMessage,
  type FichaFieldFromForm, type FlowValidationError, type FormVersionDTO,
} from '@/app/_shared/utils/wa-forms';

// Formulários do WhatsApp (Meta Flows), T-7ZQH6 — escrita. A leitura (catálogo,
// detalhe) é GET em app/api/whatsapp/forms. Toda action DEVOLVE `{ error }` em
// vez de lançar: erro de server action chega mascarado em produção, e o
// atendente precisa ler o motivo da Meta (janela de 24h, Flow inválido...).

type Fail = { ok: false; error: string };

async function guard(perm: PermissionKey): Promise<SessionPermissions | Fail> {
  try {
    const ctx = await requirePermission(perm);
    if (ctx.permissions.read_only) return { ok: false, error: 'Seu acesso é somente de visualização.' };
    return ctx;
  } catch (err) {
    return { ok: false, error: err instanceof AccessError ? err.message : 'Falha ao conferir o seu acesso. Tente de novo.' };
  }
}

const isFail = (x: unknown): x is Fail => !!x && typeof x === 'object' && (x as Fail).ok === false;

function failure(err: unknown, fallback: string): Fail {
  console.error('[WA forms]', fallback, err);
  return { ok: false, error: fallback };
}

// ─── Envio ───────────────────────────────────────────────────────────────────

export async function sendWhatsAppForm(input: {
  contactId: string;
  versionId: string;
  body: string;
  cta: string;
  header?: string | null;
  footer?: string | null;
  values?: Record<string, string>;
}): Promise<{ ok: true; message: WhatsAppMessageDTO } | Fail> {
  const ctx = await guard('view_whatsapp');
  if (isFail(ctx)) return ctx;
  try {
    const sent = await sendFormToContact({ ...input, authorId: ctx.userId });
    if (!sent.ok) return sent;
    const { message, contact, version } = sent;
    const me = ctx.name ?? 'Atendente';

    // Atendente mandou = conversa dele (igual ao template).
    const conversation = await db.whatsAppConversation.upsert({
      where: { contactId: contact.id },
      update: { lastMessageAt: new Date(), status: 'human', assignedToId: ctx.userId, ...(contact.numberId ? { numberId: contact.numberId } : {}) },
      create: { contactId: contact.id, numberId: contact.numberId, status: 'human', assignedToId: ctx.userId },
    });

    // Histórico do card (com await, como todo log de card) + auditoria do
    // atendimento depois da resposta.
    if (contact.userId || contact.processId) {
      await createLog({
        action: 'wa_form',
        message: `enviou o formulário "${version.name}" pelo WhatsApp`,
        authorId: ctx.userId,
        authorName: me,
        userId: contact.userId,
        processId: contact.userId ? null : contact.processId,
        metadata: { op: 'send', formVersionId: version.id, metaFlowId: version.metaFlowId, version: version.version, messageId: message.id },
      });
    }
    const at = new Date();
    runAfterResponse('log wa_form', () => logWhatsAppEvent({
      action: 'wa_form',
      message: `enviou o formulário "${version.name}" para ${contact.name ?? contact.phone}`,
      authorId: ctx.userId,
      authorName: me,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { op: 'send', formVersionId: version.id, version: version.version },
      at,
    }));

    const dto: WhatsAppMessageDTO = {
      id: message.id,
      channelId: whatsappChannelId(contact.id),
      contactId: contact.id,
      waMessageId: message.waMessageId,
      direction: 'out',
      body: message.body,
      mediaKey: null,
      mediaType: null,
      status: message.status,
      sentByBot: false,
      authorId: ctx.userId,
      createdAt: message.createdAt.toISOString(),
      contactName: contact.name,
      contactPhone: contact.phone,
      conversationStatus: conversation.status,
      interactive: message.interactive,
    };
    broadcastWhatsAppEvent(dto);
    return { ok: true, message: dto };
  } catch (err) {
    return failure(err, 'Falha ao enviar o formulário. Atualize a página (F5) e tente de novo.');
  }
}

// ─── Edição (permissão manage_wa_forms) ──────────────────────────────────────

export async function saveWhatsAppFormDraft(input: {
  baseVersionId: string;
  flowJson: string;
}): Promise<{ ok: true; version: FormVersionDTO; validationErrors: FlowValidationError[] } | Fail> {
  const ctx = await guard('manage_wa_forms');
  if (isFail(ctx)) return ctx;
  const json = readFlowJson(input.flowJson);
  if (!json) return { ok: false, error: 'JSON inválido: precisa ser um objeto com a lista "screens".' };
  try {
    const base = await db.whatsAppFormVersion.findUnique({ where: { id: input.baseVersionId } });
    if (!base) return { ok: false, error: 'Formulário não encontrado — atualize a lista.' };
    const r = await saveFormDraft({ base, json, authorId: ctx.userId });
    if (!r.ok) return r;
    await createLog({
      action: 'wa_form',
      message: `salvou o rascunho v${r.version.version} do formulário "${r.version.name}"`,
      authorId: ctx.userId,
      authorName: ctx.name ?? 'Equipe',
      metadata: { op: 'draft', familyId: r.version.familyId, formVersionId: r.version.id, validationErrors: r.validationErrors.length },
    });
    return { ok: true, version: toFormVersionDTO(r.version, new Map([[ctx.userId, ctx.name ?? 'Equipe']])), validationErrors: r.validationErrors };
  } catch (err) {
    return failure(err, 'Falha ao salvar o rascunho do formulário.');
  }
}

export async function publishWhatsAppFormDraft(versionId: string): Promise<{ ok: true; version: FormVersionDTO } | Fail> {
  const ctx = await guard('manage_wa_forms');
  if (isFail(ctx)) return ctx;
  try {
    const v = await db.whatsAppFormVersion.findUnique({ where: { id: versionId } });
    if (!v) return { ok: false, error: 'Rascunho não encontrado — atualize a lista.' };
    const r = await publishFormDraft(v);
    if (!r.ok) return r;
    await createLog({
      action: 'wa_form',
      message: `publicou a versão v${r.version.version} do formulário "${r.version.name}"`,
      authorId: ctx.userId,
      authorName: ctx.name ?? 'Equipe',
      metadata: { op: 'publish', familyId: r.version.familyId, formVersionId: r.version.id },
    });
    return { ok: true, version: toFormVersionDTO(r.version, new Map()) };
  } catch (err) {
    return failure(err, 'Falha ao publicar o formulário.');
  }
}

export async function discardWhatsAppFormDraft(versionId: string): Promise<{ ok: true } | Fail> {
  const ctx = await guard('manage_wa_forms');
  if (isFail(ctx)) return ctx;
  try {
    const v = await db.whatsAppFormVersion.findUnique({ where: { id: versionId } });
    if (!v) return { ok: false, error: 'Rascunho não encontrado — atualize a lista.' };
    const r = await discardFormDraft(v);
    if (!r.ok) return r;
    await createLog({
      action: 'wa_form',
      message: `descartou o rascunho v${v.version} do formulário "${v.name}"`,
      authorId: ctx.userId,
      authorName: ctx.name ?? 'Equipe',
      metadata: { op: 'discard', familyId: v.familyId, formVersionId: v.id },
    });
    return { ok: true };
  } catch (err) {
    return failure(err, 'Falha ao descartar o rascunho.');
  }
}

export async function activateWhatsAppFormVersion(versionId: string): Promise<{ ok: true } | Fail> {
  const ctx = await guard('manage_wa_forms');
  if (isFail(ctx)) return ctx;
  try {
    const v = await db.whatsAppFormVersion.findUnique({ where: { id: versionId } });
    if (!v) return { ok: false, error: 'Versão não encontrada — atualize a lista.' };
    const r = await activateFormVersion(v);
    if (!r.ok) return r;
    await createLog({
      action: 'wa_form',
      message: `fez da versão v${v.version} a ativa do formulário "${v.name}"`,
      authorId: ctx.userId,
      authorName: ctx.name ?? 'Equipe',
      metadata: { op: 'activate', familyId: v.familyId, formVersionId: v.id },
    });
    return { ok: true };
  } catch (err) {
    return failure(err, 'Falha ao trocar a versão ativa.');
  }
}

/**
 * Texto padrão da mensagem que leva o formulário (não muda o Flow na Meta).
 * Vale para a FAMÍLIA: publicar um rascunho não pode perder o texto salvo.
 */
export async function saveWhatsAppFormDefaults(
  familyId: string,
  d: { bodyText: string; cta: string; headerText?: string | null; footerText?: string | null },
): Promise<{ ok: true } | Fail> {
  const ctx = await guard('manage_wa_forms');
  if (isFail(ctx)) return ctx;
  const invalid = validateFormMessage({ body: d.bodyText, cta: d.cta, header: d.headerText, footer: d.footerText });
  if (invalid) return { ok: false, error: invalid };
  try {
    const r = await db.whatsAppFormVersion.updateMany({
      where: { familyId },
      data: {
        bodyText: d.bodyText.trim(),
        cta: d.cta.trim(),
        headerText: d.headerText?.trim() || null,
        footerText: d.footerText?.trim() || null,
      },
    });
    if (!r.count) return { ok: false, error: 'Formulário não encontrado — atualize a lista.' };
    // Muda o que todo cliente recebe junto com o formulário: fica na auditoria.
    await createLog({
      action: 'wa_form',
      message: `alterou o texto padrão da mensagem do formulário (família ${familyId})`,
      authorId: ctx.userId,
      authorName: ctx.name ?? 'Equipe',
      metadata: { op: 'defaults', familyId, bodyText: d.bodyText.trim(), cta: d.cta.trim() },
    });
    return { ok: true };
  } catch (err) {
    return failure(err, 'Falha ao salvar o texto padrão da mensagem.');
  }
}

// ─── Comprovante do aceite ───────────────────────────────────────────────────

/**
 * "Baixar termo (PDF)" na bolha da resposta de aceite: o comprovante que foi
 * anexado sozinho (gera agora se ainda não existir). Devolve URL pré-assinada
 * de download — o PDF não passa pelo corpo da action (limite de 4,5 MB).
 */
export async function downloadTermsReceipt(messageId: string): Promise<{ ok: true; url: string; fileName: string } | Fail> {
  const ctx = await guard('view_whatsapp');
  if (isFail(ctx)) return ctx;
  try {
    const r = await ensureTermsReceiptForMessage(messageId);
    if (!r.ok) return r;
    const fileName = fileNameFromKey(r.key);
    const { url } = await signGetUrl(r.key, { inline: false, fileName });
    return { ok: true, url, fileName };
  } catch (err) {
    return failure(err, 'Falha ao gerar o comprovante. Atualize a página (F5) e tente de novo.');
  }
}

// ─── "Aplicar ao cadastro" ───────────────────────────────────────────────────

interface ApplyChange {
  field: FichaFieldFromForm;
  label: string;
  current: string | null;
  next: string;
}

type ApplyTarget = { kind: 'card'; label: string } | { kind: 'ficha'; label: string };

async function loadApplyContext(messageId: string) {
  const msg = await db.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: { id: true, direction: true, interactive: true, contactId: true },
  });
  const reply = msg ? parseInteractive(msg.interactive) : null;
  if (!msg || msg.direction !== 'in' || reply?.kind !== 'flow_reply') return null;
  const contact = await db.whatsAppContact.findUnique({
    where: { id: msg.contactId },
    select: { id: true, name: true, phone: true, userId: true, clientDraft: true, aiFilledFields: true },
  });
  if (!contact) return null;
  const updates = formFieldsToFicha(reply.fields);
  const fields = updates.map((u) => u.field);
  const user = contact.userId
    ? await db.user.findUnique({
      where: { id: contact.userId },
      select: { id: true, cardNumber: true, ...Object.fromEntries(fields.map((f) => [f, true])) } as Prisma.UserSelect,
    }) as (Record<string, unknown> & { id: string; cardNumber: number | null }) | null
    : null;
  const current: Record<string, unknown> = user ?? ((contact.clientDraft ?? {}) as Record<string, unknown>);
  const target: ApplyTarget = user
    ? { kind: 'card', label: user.cardNumber ? `card #${user.cardNumber}` : 'card do cliente' }
    : { kind: 'ficha', label: 'ficha da conversa (ainda sem card)' };
  const changes: ApplyChange[] = updates.map((u) => ({
    field: u.field,
    label: u.label,
    current: typeof current[u.field] === 'string' ? (current[u.field] as string) : null,
    next: u.value,
  }));
  return { msg, reply, contact, user, target, changes };
}

/** O que a resposta mudaria no cadastro (atual × novo), para o atendente escolher. */
export async function previewFormReplyApply(messageId: string): Promise<{ ok: true; target: ApplyTarget; changes: ApplyChange[] } | Fail> {
  const ctx = await guard('view_whatsapp');
  if (isFail(ctx)) return ctx;
  try {
    const c = await loadApplyContext(messageId);
    if (!c) return { ok: false, error: 'Resposta de formulário não encontrada.' };
    return { ok: true, target: c.target, changes: c.changes };
  } catch (err) {
    return failure(err, 'Falha ao ler o cadastro.');
  }
}

/** Grava os campos escolhidos no card vinculado (ou na ficha da conversa, sem card). */
export async function applyFormReplyToCadastro(
  messageId: string,
  fields: string[],
): Promise<{ ok: true; applied: string[]; target: ApplyTarget } | Fail> {
  const ctx = await guard('view_whatsapp');
  if (isFail(ctx)) return ctx;
  try {
    const c = await loadApplyContext(messageId);
    if (!c) return { ok: false, error: 'Resposta de formulário não encontrada.' };
    const chosen = c.changes.filter((ch) => fields.includes(ch.field) && ch.current !== ch.next);
    if (!chosen.length) return { ok: false, error: 'Nada a aplicar: os valores já estão no cadastro.' };
    const data: Record<string, string> = Object.fromEntries(chosen.map((ch) => [ch.field, ch.next]));

    // E-mail é unique no User: não rouba o e-mail de outro cadastro.
    if (data.email && c.user) {
      const taken = await db.user.findFirst({ where: { email: data.email, id: { not: c.user.id } }, select: { id: true } });
      if (taken) return { ok: false, error: 'Este e-mail já está em outro cadastro — desmarque o e-mail e aplique o resto.' };
    }

    if (c.user) {
      await db.user.update({ where: { id: c.user.id }, data });
    } else {
      const draft = { ...((c.contact.clientDraft ?? {}) as Record<string, unknown>), ...data };
      await db.whatsAppContact.update({ where: { id: c.contact.id }, data: { clientDraft: draft as Prisma.InputJsonValue } });
    }
    // Nome vai também para o contato (a lista do inbox mostra o nome dele), e o
    // valor confirmado pelo cliente perde o selo de "preenchido pela IA".
    const marks = { ...((c.contact.aiFilledFields ?? {}) as Record<string, string>) };
    const hadMarks = chosen.some((ch) => ch.field in marks);
    for (const ch of chosen) delete marks[ch.field];
    if (data.name || hadMarks) {
      await db.whatsAppContact.update({
        where: { id: c.contact.id },
        data: { ...(data.name ? { name: data.name } : {}), ...(hadMarks ? { aiFilledFields: marks as Prisma.InputJsonValue } : {}) },
      });
    }

    const resumo = chosen.map((ch) => FICHA_FIELD_LABELS[ch.field]).join(', ');
    const metadata = {
      op: 'apply',
      messageId,
      formVersionId: c.reply.kind === 'flow_reply' ? c.reply.formVersionId : null,
      changes: chosen.map((ch) => ({ field: ch.field, from: ch.current, to: ch.next })),
    };
    if (c.user) {
      await createLog({
        action: 'wa_form',
        message: `aplicou ao cadastro a resposta do formulário${c.reply.kind === 'flow_reply' && c.reply.flowName ? ` "${c.reply.flowName}"` : ''}: ${resumo}`,
        authorId: ctx.userId,
        authorName: ctx.name ?? 'Equipe',
        userId: c.user.id,
        metadata,
      });
    } else {
      await logWhatsAppEvent({
        action: 'wa_form',
        message: `aplicou à ficha da conversa a resposta do formulário: ${resumo}`,
        authorId: ctx.userId,
        authorName: ctx.name ?? 'Equipe',
        contactId: c.contact.id,
        contactName: c.contact.name,
        contactPhone: c.contact.phone,
        metadata,
      });
    }
    return { ok: true, applied: chosen.map((ch) => ch.field), target: c.target };
  } catch (err) {
    return failure(err, 'Falha ao aplicar ao cadastro. Atualize a página (F5) e tente de novo.');
  }
}
