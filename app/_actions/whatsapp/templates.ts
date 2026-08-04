'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { broadcastToRelay } from '@/app/_shared/lib/chat-relay';
import {
  sendTemplate, fetchMetaTemplates, createMetaTemplate, deleteMetaTemplate, countTemplateVars,
} from '@/app/_shared/lib/whatsapp/client';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import {
  whatsappChannelId, whatsappRecipients, type WhatsAppMessageDTO,
} from '@/app/_shared/lib/whatsapp/service';
import { renderTemplateThreadText } from '@/app/_shared/lib/whatsapp/template-text';

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
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  category: string;
  rejectedReason: string | null;
  headerText: string | null;
  footerText: string | null;
}

function toDTO(t: {
  id: string; name: string; language: string; bodyVars: number; bodyPreview: string | null;
  status: string; category: string; rejectedReason: string | null;
  headerText: string | null; footerText: string | null;
}): WhatsAppTemplateDTO {
  return {
    id: t.id, name: t.name, language: t.language, bodyVars: t.bodyVars, bodyPreview: t.bodyPreview,
    status: t.status, category: t.category, rejectedReason: t.rejectedReason,
    headerText: t.headerText, footerText: t.footerText,
  };
}

/**
 * Lista o cadastro local. Por padrão devolve TODOS os status (a tela de
 * gerenciamento acompanha o ciclo da Meta); `onlyApproved` é o que o envio
 * usa — mandar template não aprovado a Meta recusa na hora.
 */
export async function listWhatsAppTemplates(onlyApproved = false): Promise<WhatsAppTemplateDTO[]> {
  await requireTeamMember();
  const templates = await db.whatsAppTemplate.findMany({
    where: onlyApproved ? { status: 'APPROVED' } : undefined,
    orderBy: { name: 'asc' },
  });
  return templates.map(toDTO);
}

/**
 * CRIA o template na Meta e o submete para aprovação — nasce "Em análise".
 * O nome segue a regra da Meta (minúsculas, números e _) e cada variável
 * precisa de um exemplo, senão a Graph API recusa.
 */
export async function createWhatsAppTemplate(input: {
  name: string; language: string; category: string;
  headerText?: string; headerExample?: string;
  bodyText: string; bodyExamples: string[]; footerText?: string;
}): Promise<{ template?: WhatsAppTemplateDTO; error?: string }> {
  await requireTeamMember();

  const name = input.name.trim().toLowerCase().replace(/\s+/g, '_');
  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    return { error: 'O nome só aceita letras minúsculas, números e _ (sem acento e sem espaço).' };
  }
  const bodyText = input.bodyText.trim();
  if (!bodyText) return { error: 'Escreva o corpo da mensagem.' };

  const varCount = countTemplateVars(bodyText);
  const examples = input.bodyExamples.slice(0, varCount).map((e) => e.trim());
  if (examples.length < varCount || examples.some((e) => !e)) {
    return { error: `A Meta exige um exemplo para cada variável — preencha as ${varCount} variável(is).` };
  }

  // Regras da Meta para cabeçalho de TEXTO: no máximo 60 caracteres, no
  // máximo 1 variável, e ela tem que ser {{1}}.
  const headerText = input.headerText?.trim() || null;
  const headerExample = input.headerExample?.trim() || null;
  if (headerText) {
    if (headerText.length > 60) {
      return { error: 'O cabeçalho pode ter no máximo 60 caracteres.' };
    }
    const headerVars = countTemplateVars(headerText);
    if (headerVars > 1) {
      return { error: 'O cabeçalho aceita no máximo 1 variável — use apenas {{1}}.' };
    }
    if (headerVars === 1 && !/\{\{\s*1\s*\}\}/.test(headerText)) {
      return { error: 'A variável do cabeçalho precisa ser {{1}}.' };
    }
    if (headerVars === 1 && !headerExample) {
      return { error: 'A Meta exige um exemplo para a variável do cabeçalho.' };
    }
  }

  if (await db.whatsAppTemplate.findUnique({ where: { name } })) {
    return { error: `Já existe um template chamado "${name}".` };
  }

  const language = input.language.trim() || 'pt_BR';
  const category = ['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(input.category)
    ? input.category
    : 'UTILITY';
  const footerText = input.footerText?.trim() || null;

  // Erro da Graph API volta como campo (não throw): em produção o Next mascara
  // exception de server action com 500 genérico e a equipe precisa ler o motivo.
  const created = await createMetaTemplate({
    name, language, category, headerText, headerExample, bodyText, bodyExamples: examples, footerText,
  });
  if (created.error) return { error: created.error };

  const template = await db.whatsAppTemplate.create({
    data: {
      name, language, category, headerText, footerText,
      bodyVars: varCount,
      bodyPreview: bodyText,
      status: created.status || 'PENDING',
      metaId: created.metaId,
    },
  });
  return { template: toDTO(template) };
}

/**
 * Sincroniza o cadastro local com a Meta (fonte da verdade). Traz TODOS os
 * status — antes só os aprovados entravam, e quem criava um template não
 * conseguia acompanhar a análise nem ler o motivo da reprovação.
 * Requer WHATSAPP_WABA_ID no ambiente.
 */
export async function syncWhatsAppTemplatesFromMeta(): Promise<{
  imported: number; approved: number; pending: number; rejected: number; error?: string;
}> {
  await requireTeamMember();

  const empty = { imported: 0, approved: 0, pending: 0, rejected: 0 };
  let metaTemplates;
  try {
    metaTemplates = await fetchMetaTemplates();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao consultar os templates na Meta.';
    console.error('[WHATSAPP TEMPLATES] Sincronização falhou:', message);
    return { ...empty, error: message };
  }

  const result = { ...empty };
  for (const t of metaTemplates) {
    const data = {
      language: t.language,
      bodyVars: t.bodyVars,
      bodyPreview: t.bodyText,
      headerText: t.headerText,
      footerText: t.footerText,
      status: t.status,
      category: t.category,
      rejectedReason: t.rejectedReason,
      metaId: t.metaId,
    };
    await db.whatsAppTemplate.upsert({
      where: { name: t.name },
      update: data,
      create: { name: t.name, ...data },
    });
    result.imported++;
    if (t.status === 'APPROVED') result.approved++;
    else if (t.status === 'PENDING') result.pending++;
    else if (t.status === 'REJECTED') result.rejected++;
  }

  // Template apagado na Meta sai do cadastro: se ficasse, apareceria enviável
  // e o envio falharia só na hora de falar com o cliente.
  const names = metaTemplates.map((t) => t.name);
  if (names.length) {
    await db.whatsAppTemplate.deleteMany({ where: { name: { notIn: names } } });
  }

  return result;
}

/** Exclui o template — na Meta e no cadastro local. */
export async function deleteWhatsAppTemplate(id: string): Promise<{ error?: string }> {
  await requireTeamMember();
  const template = await db.whatsAppTemplate.findUnique({ where: { id } });
  if (!template) return {};

  const { error } = await deleteMetaTemplate(template.name);
  if (error) return { error };

  await db.whatsAppTemplate.delete({ where: { id } });
  return {};
}

/**
 * Envia um template aprovado — funciona mesmo com a janela de 24h expirada
 * (é o único tipo de mensagem que a Meta aceita nesse caso).
 */
export async function sendWhatsAppTemplateMessage(
  contactId: string,
  templateId: string,
  vars: string[],
  headerVar?: string,
): Promise<WhatsAppMessageDTO> {
  const me = await requireTeamMember();

  const [contact, template] = await Promise.all([
    db.whatsAppContact.findUnique({ where: { id: contactId } }),
    db.whatsAppTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!contact) throw new Error('Contato não encontrado.');
  if (contact.optedOut) throw new Error('Este contato pediu para não receber mensagens.');
  if (!template) throw new Error('Template não encontrado.');
  if (template.status !== 'APPROVED') {
    throw new Error(`Este template está "${template.status}" na Meta — só templates aprovados podem ser enviados.`);
  }
  if (vars.length !== template.bodyVars) throw new Error(`Este template espera ${template.bodyVars} variável(is).`);

  const headerVars = countTemplateVars(template.headerText);
  if (headerVars > 0 && !headerVar?.trim()) {
    throw new Error('Este template tem uma variável no cabeçalho — preencha antes de enviar.');
  }

  const result = await sendTemplate(contact.phone, template.name, vars, template.language, headerVar);
  if (!result.waMessageId) {
    throw new Error(result.error ?? 'Falha ao enviar o template pela WhatsApp API.');
  }

  // Texto de referência só pra thread da equipe (a Meta renderiza o template
  // de verdade no celular do cliente, mas queremos ver o que foi enviado).
  const preview = renderTemplateThreadText(template, vars, headerVar);

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
