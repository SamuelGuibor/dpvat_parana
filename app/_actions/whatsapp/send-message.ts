'use server';

import { getServerSession } from 'next-auth';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { broadcastToRelay } from '@/app/_shared/lib/chat-relay';
import { sendText, sendMedia } from '@/app/_shared/lib/whatsapp/client';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import {
  whatsappChannelId,
  whatsappRecipients,
  type WhatsAppMessageDTO,
} from '@/app/_shared/lib/whatsapp/service';

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function requireTeamMember(): Promise<{ id: string; name: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true },
  });
  if (!me || !TEAM_ROLES.includes(me.role)) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
  return { id: me.id, name: me.name ?? 'Atendente' };
}

async function requireContact(contactId: string) {
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');
  if (contact.optedOut) throw new Error('Este contato pediu para não receber mensagens.');
  return contact;
}

/**
 * Grava a mensagem enviada, atualiza a conversa (humano respondeu → conversa
 * passa a ser dele) e faz o broadcast pro relay SSE.
 */
async function persistOutbound(params: {
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  waMessageId: string;
  body: string | null;
  mediaKey?: string | null;
  mediaType?: string | null;
  authorId: string;
  replyTo?: { id: string; body: string | null; direction: string } | null;
}): Promise<WhatsAppMessageDTO> {
  const message = await db.whatsAppMessage.create({
    data: {
      contactId: params.contactId,
      waMessageId: params.waMessageId,
      direction: 'out',
      body: params.body,
      mediaKey: params.mediaKey ?? null,
      mediaType: params.mediaType ?? null,
      status: 'sent',
      authorId: params.authorId,
      replyToId: params.replyTo?.id ?? null,
      replyToBody: params.replyTo ? params.replyTo.body ?? '📎 Anexo' : null,
      replyToDirection: params.replyTo?.direction ?? null,
    },
  });

  const conversation = await db.whatsAppConversation.upsert({
    where: { contactId: params.contactId },
    update: { lastMessageAt: new Date(), status: 'human', assignedToId: params.authorId },
    create: { contactId: params.contactId, status: 'human', assignedToId: params.authorId },
  });

  const dto: WhatsAppMessageDTO = {
    id: message.id,
    channelId: whatsappChannelId(params.contactId),
    contactId: params.contactId,
    direction: 'out',
    body: message.body,
    mediaKey: message.mediaKey,
    mediaType: message.mediaType,
    status: message.status,
    sentByBot: false,
    authorId: params.authorId,
    createdAt: message.createdAt.toISOString(),
    contactName: params.contactName,
    contactPhone: params.contactPhone,
    conversationStatus: conversation.status,
    replyToId: message.replyToId,
    replyToBody: message.replyToBody,
    replyToDirection: message.replyToDirection,
  };

  const recipients = await whatsappRecipients();
  await broadcastToRelay({ channelId: dto.channelId, recipients, message: dto });

  return dto;
}

/** Resolve o reply: nossa mensagem → waMessageId pro context da Meta. */
async function resolveReply(contactId: string, replyToId?: string | null) {
  if (!replyToId) return null;
  const target = await db.whatsAppMessage.findUnique({
    where: { id: replyToId },
    select: { id: true, body: true, direction: true, waMessageId: true, contactId: true },
  });
  if (!target || target.contactId !== contactId) return null;
  return target;
}

interface SendInput {
  contactId: string;
  body: string;
  replyToId?: string | null;
}

/**
 * Atendente responde um cliente pelo WhatsApp.
 *
 * Só grava no banco se a Meta aceitou o envio (waMessageId retornado) — assim
 * a thread nunca mostra mensagem que o cliente não recebeu. Se a janela de
 * 24h tiver expirado, a Graph API rejeita e o erro chega legível ao usuário.
 */
export async function sendWhatsAppMessage({ contactId, body, replyToId }: SendInput): Promise<WhatsAppMessageDTO> {
  const me = await requireTeamMember();

  const text = body.trim();
  if (!text) throw new Error('Mensagem vazia.');
  if (text.length > 4000) throw new Error('Mensagem muito longa.');

  const contact = await requireContact(contactId);
  const replyTo = await resolveReply(contactId, replyToId);

  const result = await sendText(contact.phone, text, replyTo?.waMessageId ?? undefined);
  if (!result.waMessageId) {
    throw new Error(result.error ?? 'Falha ao enviar pela WhatsApp API.');
  }

  const dto = await persistOutbound({
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    waMessageId: result.waMessageId,
    body: text,
    authorId: me.id,
    replyTo,
  });

  await logWhatsAppEvent({
    action: 'wa_text',
    message: `enviou uma mensagem de texto para ${contact.name ?? contact.phone}`,
    authorId: me.id,
    authorName: me.name,
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { preview: text.slice(0, 120) },
  });

  return dto;
}

/**
 * Presigned PUT para o navegador subir o anexo direto ao S3 (contorna o
 * limite de 4.5 MB de body das functions da Vercel, igual ao roteiro).
 */
export async function getWhatsAppUploadUrl(
  contactId: string,
  fileName: string,
  mimeType: string,
): Promise<{ url: string; key: string }> {
  await requireTeamMember();
  await requireContact(contactId);

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `whatsapp/${contactId}/out-${Date.now()}-${safeName}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 600 });
  return { url, key };
}

interface SendMediaInput {
  contactId: string;
  key: string; // chave no S3 (retornada por getWhatsAppUploadUrl / getFlowMediaUploadUrl)
  mimeType: string;
  fileName?: string;
  caption?: string;
  replyToId?: string | null;
}

/**
 * Envia um anexo já hospedado no S3: gera um presigned GET e manda o link
 * pra Meta baixar. Mesma regra do texto — só persiste se a Meta aceitou.
 * Áudio .ogg (opus) chega como mensagem de voz no celular do cliente.
 */
export async function sendWhatsAppMedia({ contactId, key, mimeType, fileName, caption, replyToId }: SendMediaInput): Promise<WhatsAppMessageDTO> {
  const me = await requireTeamMember();
  const contact = await requireContact(contactId);

  // Aceita anexos da própria conversa e mídias dos fluxos pré-setados.
  if (!key.startsWith(`whatsapp/${contactId}/`) && !key.startsWith('whatsapp/flows/')) {
    throw new Error('Anexo inválido.');
  }

  const kind = mimeType.startsWith('image/') ? 'image'
    : mimeType.startsWith('video/') ? 'video'
      : mimeType.startsWith('audio/') ? 'audio' : 'document';

  const link = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key }),
    { expiresIn: 3600 },
  );

  const replyTo = await resolveReply(contactId, replyToId);
  const result = await sendMedia(contact.phone, kind, link, caption?.trim() || undefined, fileName, replyTo?.waMessageId ?? undefined);
  if (!result.waMessageId) {
    throw new Error(result.error ?? 'Falha ao enviar o anexo pela WhatsApp API.');
  }

  const dto = await persistOutbound({
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    waMessageId: result.waMessageId,
    body: caption?.trim() || null,
    mediaKey: key,
    mediaType: mimeType,
    authorId: me.id,
    replyTo,
  });

  const isFlowMedia = key.startsWith('whatsapp/flows/');
  const label = fileName ?? key.split('/').pop() ?? 'arquivo';
  await logWhatsAppEvent({
    action: kind === 'document' ? 'wa_document' : 'wa_media',
    message: kind === 'document'
      ? `enviou o documento "${label}" para ${contact.name ?? contact.phone}`
      : `enviou ${kind === 'image' ? 'uma imagem' : kind === 'video' ? 'um vídeo' : 'um áudio'} para ${contact.name ?? contact.phone}`,
    authorId: me.id,
    authorName: me.name,
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { fileName: label, mimeType, kind, fromFlow: isFlowMedia },
  });

  return dto;
}

/**
 * Edição LOCAL: a Cloud API da Meta não permite editar mensagem já entregue —
 * a alteração vale pra equipe (histórico); o celular do cliente mantém o texto
 * original.
 */
export async function editWhatsAppMessage(messageId: string, newBody: string): Promise<void> {
  const me = await requireTeamMember();
  const text = newBody.trim();
  if (!text) throw new Error('Mensagem vazia.');
  if (text.length > 4000) throw new Error('Mensagem muito longa.');

  const msg = await db.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: { direction: true, authorId: true, deletedAt: true },
  });
  if (!msg || msg.direction !== 'out') throw new Error('Só é possível editar mensagens enviadas por você.');
  if (msg.authorId !== me.id) throw new Error('Só o autor pode editar a mensagem.');
  if (msg.deletedAt) throw new Error('Mensagem já apagada.');

  await db.whatsAppMessage.update({
    where: { id: messageId },
    data: { body: text, editedAt: new Date() },
  });
}

/**
 * Exclusão LOCAL (soft delete): some da thread da equipe, mas a Cloud API não
 * revoga a mensagem no celular do cliente.
 */
export async function deleteWhatsAppMessage(messageId: string): Promise<void> {
  const me = await requireTeamMember();
  const msg = await db.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: { direction: true, authorId: true },
  });
  if (!msg || msg.direction !== 'out') throw new Error('Só é possível apagar mensagens enviadas por você.');
  if (msg.authorId !== me.id) throw new Error('Só o autor pode apagar a mensagem.');

  await db.whatsAppMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
}
