'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { broadcastToRelay } from '@/app/_shared/lib/chat-relay';
import { sendTemplate, fetchApprovedTemplates } from '@/app/_shared/lib/whatsapp/client';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import {
  whatsappChannelId, whatsappRecipients, type WhatsAppMessageDTO,
} from '@/app/_shared/lib/whatsapp/service';

// Templates aprovados na Meta Business Manager — único jeito de iniciar
// mensagem fora da janela de 24h. O nome/idioma/nº de variáveis aqui só
// espelham o que já foi aprovado lá; cadastrar aqui não aprova nada na Meta.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

async function requireTeamMember(): Promise<{ id: string; name: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true },
  });
  if (!me || !TEAM_ROLES.includes(me.role)) throw new Error('Sem permissão para o atendimento de WhatsApp.');
  return { id: me.id, name: me.name ?? 'Atendente' };
}

export interface WhatsAppTemplateDTO {
  id: string;
  name: string;
  language: string;
  bodyVars: number;
  bodyPreview: string | null;
}

export async function listWhatsAppTemplates(): Promise<WhatsAppTemplateDTO[]> {
  await requireTeamMember();
  const templates = await db.whatsAppTemplate.findMany({ orderBy: { name: 'asc' } });
  return templates.map((t) => ({
    id: t.id, name: t.name, language: t.language, bodyVars: t.bodyVars, bodyPreview: t.bodyPreview,
  }));
}

export async function saveWhatsAppTemplate(input: {
  id?: string; name: string; language: string; bodyVars: number; bodyPreview?: string;
}): Promise<WhatsAppTemplateDTO> {
  await requireTeamMember();
  const name = input.name.trim();
  if (!name) throw new Error('Informe o nome exato do template aprovado na Meta.');
  const language = input.language.trim() || 'pt_BR';
  const bodyVars = Math.min(Math.max(Math.round(Number(input.bodyVars) || 0), 0), 20);
  const bodyPreview = input.bodyPreview?.trim() || null;

  const data = { name, language, bodyVars, bodyPreview };
  const template = input.id
    ? await db.whatsAppTemplate.update({ where: { id: input.id }, data })
    : await db.whatsAppTemplate.create({ data });

  return {
    id: template.id, name: template.name, language: template.language,
    bodyVars: template.bodyVars, bodyPreview: template.bodyPreview,
  };
}

/**
 * Sincroniza o cadastro local com os templates realmente aprovados na Meta
 * (fonte da verdade). Puxa nome, idioma e nº de variáveis direto da Graph API,
 * então o envio nunca falha por divergência de variáveis/idioma.
 * Requer WHATSAPP_WABA_ID no ambiente.
 */
export async function syncWhatsAppTemplatesFromMeta(): Promise<{ imported: number; skipped: number }> {
  await requireTeamMember();
  const metaTemplates = await fetchApprovedTemplates();

  let imported = 0;
  let skipped = 0;
  for (const t of metaTemplates) {
    if (t.status !== 'APPROVED') { skipped++; continue; }
    await db.whatsAppTemplate.upsert({
      where: { name: t.name },
      update: { language: t.language, bodyVars: t.bodyVars, bodyPreview: t.bodyText },
      create: { name: t.name, language: t.language, bodyVars: t.bodyVars, bodyPreview: t.bodyText },
    });
    imported++;
  }
  return { imported, skipped };
}

export async function deleteWhatsAppTemplate(id: string): Promise<void> {
  await requireTeamMember();
  await db.whatsAppTemplate.delete({ where: { id } });
}

/**
 * Envia um template aprovado — funciona mesmo com a janela de 24h expirada
 * (é o único tipo de mensagem que a Meta aceita nesse caso).
 */
export async function sendWhatsAppTemplateMessage(
  contactId: string,
  templateId: string,
  vars: string[],
): Promise<WhatsAppMessageDTO> {
  const me = await requireTeamMember();

  const [contact, template] = await Promise.all([
    db.whatsAppContact.findUnique({ where: { id: contactId } }),
    db.whatsAppTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!contact) throw new Error('Contato não encontrado.');
  if (contact.optedOut) throw new Error('Este contato pediu para não receber mensagens.');
  if (!template) throw new Error('Template não encontrado.');
  if (vars.length !== template.bodyVars) throw new Error(`Este template espera ${template.bodyVars} variável(is).`);

  const result = await sendTemplate(contact.phone, template.name, vars, template.language);
  if (!result.waMessageId) {
    throw new Error(result.error ?? 'Falha ao enviar o template pela WhatsApp API.');
  }

  // Texto de referência só pra thread da equipe (a Meta renderiza o template
  // de verdade no celular do cliente, mas queremos ver o que foi enviado).
  const preview = template.bodyPreview
    ? vars.reduce((acc, v, i) => acc.replaceAll(`{{${i + 1}}}`, v), template.bodyPreview)
    : `[Template: ${template.name}]${vars.length ? ` (${vars.join(', ')})` : ''}`;

  const message = await db.whatsAppMessage.create({
    data: {
      contactId,
      waMessageId: result.waMessageId,
      direction: 'out',
      body: preview,
      status: 'sent',
      authorId: me.id,
    },
  });

  await logWhatsAppEvent({
    action: 'wa_template',
    message: `enviou o template "${template.name}" para ${contact.name ?? contact.phone}`,
    authorId: me.id,
    authorName: me.name,
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { templateName: template.name, vars },
  });

  const conversation = await db.whatsAppConversation.upsert({
    where: { contactId },
    update: { lastMessageAt: new Date(), status: 'human', assignedToId: me.id },
    create: { contactId, status: 'human', assignedToId: me.id },
  });

  const dto: WhatsAppMessageDTO = {
    id: message.id,
    channelId: whatsappChannelId(contactId),
    contactId,
    direction: 'out',
    body: message.body,
    mediaKey: null,
    mediaType: null,
    status: message.status,
    sentByBot: false,
    authorId: me.id,
    createdAt: message.createdAt.toISOString(),
    contactName: contact.name,
    contactPhone: contact.phone,
    conversationStatus: conversation.status,
  };

  const recipients = await whatsappRecipients();
  await broadcastToRelay({ channelId: dto.channelId, recipients, message: dto });

  return dto;
}
