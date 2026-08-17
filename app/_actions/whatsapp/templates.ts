'use server';

import { getServerSession } from 'next-auth';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { broadcastToRelay } from '@/app/_shared/lib/chat-relay';
import {
  sendTemplate, fetchMetaTemplates, createMetaTemplate, deleteMetaTemplate, countTemplateVars,
  uploadTemplateHeaderMedia, type TemplateHeaderMedia,
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

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Formatos aceitos pela Meta no cabeçalho de mídia de template.
const HEADER_MEDIA_RULES: Record<string, { mimes: string[]; maxMb: number; kind: TemplateHeaderMedia['kind'] }> = {
  IMAGE: { mimes: ['image/jpeg', 'image/png'], maxMb: 5, kind: 'image' },
  VIDEO: { mimes: ['video/mp4'], maxMb: 16, kind: 'video' },
  DOCUMENT: { mimes: ['application/pdf'], maxMb: 100, kind: 'document' },
};

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
  // TEXT | IMAGE | VIDEO | DOCUMENT | null (sem cabeçalho)
  headerFormat: string | null;
  // Cabeçalho de mídia: se true, o envio já tem a mídia padrão no S3.
  hasHeaderMedia: boolean;
  footerText: string | null;
}

function toDTO(t: {
  id: string; name: string; language: string; bodyVars: number; bodyPreview: string | null;
  status: string; category: string; rejectedReason: string | null;
  headerText: string | null; headerFormat: string | null; headerMediaKey: string | null;
  footerText: string | null;
}): WhatsAppTemplateDTO {
  return {
    id: t.id, name: t.name, language: t.language, bodyVars: t.bodyVars, bodyPreview: t.bodyPreview,
    status: t.status, category: t.category, rejectedReason: t.rejectedReason,
    headerText: t.headerText, headerFormat: t.headerFormat, hasHeaderMedia: !!t.headerMediaKey,
    footerText: t.footerText,
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
/**
 * Presigned PUT para a mídia do cabeçalho de template (imagem/vídeo/PDF).
 * O navegador sobe direto ao S3 (limite de 4.5 MB da Vercel) e passa a chave
 * para createWhatsAppTemplate / setTemplateHeaderMedia.
 */
export async function getTemplateMediaUploadUrl(
  fileName: string,
  mimeType: string,
): Promise<{ url: string; key: string }> {
  await requireTeamMember();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `whatsapp/templates/${Date.now()}-${safeName}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 600 });
  return { url, key };
}

function validateHeaderMedia(headerFormat: string, mimeType: string): string | null {
  const rule = HEADER_MEDIA_RULES[headerFormat];
  if (!rule) return 'Formato de cabeçalho inválido.';
  if (!rule.mimes.includes(mimeType)) {
    return headerFormat === 'IMAGE'
      ? 'A Meta só aceita JPG ou PNG no cabeçalho de imagem.'
      : headerFormat === 'VIDEO'
        ? 'A Meta só aceita MP4 no cabeçalho de vídeo.'
        : 'A Meta só aceita PDF no cabeçalho de documento.';
  }
  return null;
}

async function s3HeaderMediaLink(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key }),
    { expiresIn: 3600 },
  );
}

export async function createWhatsAppTemplate(input: {
  name: string; language: string; category: string;
  headerText?: string; headerExample?: string;
  // Cabeçalho de mídia: formato + chave S3 (getTemplateMediaUploadUrl).
  headerFormat?: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerMediaKey?: string;
  headerMediaType?: string;
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

  // Cabeçalho de MÍDIA: valida o tipo e prepara o handle (Resumable Upload).
  const wantsMediaHeader = !!input.headerFormat && !!input.headerMediaKey;
  if (input.headerFormat && !input.headerMediaKey) {
    return { error: 'Anexe a mídia do cabeçalho antes de criar o template.' };
  }
  if (wantsMediaHeader) {
    const mediaError = validateHeaderMedia(input.headerFormat!, input.headerMediaType ?? '');
    if (mediaError) return { error: mediaError };
    if (!input.headerMediaKey!.startsWith('whatsapp/templates/')) {
      return { error: 'Mídia do cabeçalho inválida.' };
    }
  }

  // Regras da Meta para cabeçalho de TEXTO: no máximo 60 caracteres, no
  // máximo 1 variável, e ela tem que ser {{1}}.
  const headerText = wantsMediaHeader ? null : input.headerText?.trim() || null;
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

  // Tela de templates opera no catálogo do número default (numberId null —
  // legado). Catálogo por número entra quando a WABA nova tiver templates.
  if (await db.whatsAppTemplate.findFirst({ where: { name, numberId: null } })) {
    return { error: `Já existe um template chamado "${name}".` };
  }

  const language = input.language.trim() || 'pt_BR';
  const category = ['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(input.category)
    ? input.category
    : 'UTILITY';
  const footerText = input.footerText?.trim() || null;

  // Cabeçalho de mídia: baixa a mídia do S3 e sobe pela Resumable Upload API
  // da Meta para obter o header_handle exigido na criação.
  let headerHandle: string | null = null;
  if (wantsMediaHeader) {
    const link = await s3HeaderMediaLink(input.headerMediaKey!);
    const bin = await fetch(link, { cache: 'no-store' });
    if (!bin.ok) return { error: 'Falha ao ler a mídia do cabeçalho no S3.' };
    const buffer = await bin.arrayBuffer();
    const rule = HEADER_MEDIA_RULES[input.headerFormat!];
    if (buffer.byteLength > rule.maxMb * 1024 * 1024) {
      return { error: `A mídia do cabeçalho passa do limite da Meta (máx. ${rule.maxMb} MB).` };
    }
    const uploaded = await uploadTemplateHeaderMedia(
      buffer,
      input.headerMediaType!,
      input.headerMediaKey!.split('/').pop() ?? 'header',
    );
    if (!uploaded.handle) {
      return { error: uploaded.error ?? 'Falha ao subir a mídia de exemplo na Meta.' };
    }
    headerHandle = uploaded.handle;
  }

  // Erro da Graph API volta como campo (não throw): em produção o Next mascara
  // exception de server action com 500 genérico e a equipe precisa ler o motivo.
  const created = await createMetaTemplate({
    name, language, category, headerText, headerExample,
    headerFormat: wantsMediaHeader ? input.headerFormat : null,
    headerHandle,
    bodyText, bodyExamples: examples, footerText,
  });
  if (created.error) return { error: created.error };

  const template = await db.whatsAppTemplate.create({
    data: {
      name, language, category, headerText, footerText,
      headerFormat: wantsMediaHeader ? input.headerFormat : headerText ? 'TEXT' : null,
      headerMediaKey: wantsMediaHeader ? input.headerMediaKey : null,
      headerMediaType: wantsMediaHeader ? input.headerMediaType : null,
      bodyVars: varCount,
      bodyPreview: bodyText,
      status: created.status || 'PENDING',
      metaId: created.metaId,
    },
  });
  return { template: toDTO(template) };
}

/**
 * Define/troca a mídia padrão do cabeçalho de um template de mídia já
 * existente (ex.: sincronizado da Meta, que chega sem a mídia). A Meta exige
 * a mídia em TODO envio — sem ela o template de mídia não pode ser disparado.
 */
export async function setTemplateHeaderMedia(
  templateId: string,
  key: string,
  mimeType: string,
): Promise<{ error?: string }> {
  await requireTeamMember();
  const template = await db.whatsAppTemplate.findUnique({ where: { id: templateId } });
  if (!template) return { error: 'Template não encontrado.' };
  if (!template.headerFormat || !HEADER_MEDIA_RULES[template.headerFormat]) {
    return { error: 'Este template não tem cabeçalho de mídia.' };
  }
  const mediaError = validateHeaderMedia(template.headerFormat, mimeType);
  if (mediaError) return { error: mediaError };
  if (!key.startsWith('whatsapp/templates/')) return { error: 'Mídia inválida.' };

  await db.whatsAppTemplate.update({
    where: { id: templateId },
    data: { headerMediaKey: key, headerMediaType: mimeType },
  });
  return {};
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
      // headerMediaKey NÃO entra aqui: a mídia padrão definida localmente
      // sobrevive à sincronização (a Meta não devolve mídia de exemplo).
      headerFormat: t.headerFormat,
      footerText: t.footerText,
      status: t.status,
      category: t.category,
      rejectedReason: t.rejectedReason,
      metaId: t.metaId,
    };
    // name deixou de ser unique global (catálogo por número) → upsert manual
    // no catálogo default (numberId null).
    const existing = await db.whatsAppTemplate.findFirst({ where: { name: t.name, numberId: null }, select: { id: true } });
    if (existing) {
      await db.whatsAppTemplate.update({ where: { id: existing.id }, data });
    } else {
      await db.whatsAppTemplate.create({ data: { name: t.name, ...data } });
    }
    result.imported++;
    if (t.status === 'APPROVED') result.approved++;
    else if (t.status === 'PENDING') result.pending++;
    else if (t.status === 'REJECTED') result.rejected++;
  }

  // Template apagado na Meta sai do cadastro: se ficasse, apareceria enviável
  // e o envio falharia só na hora de falar com o cliente.
  const names = metaTemplates.map((t) => t.name);
  if (names.length) {
    // Só limpa o catálogo default — os catálogos dos outros números não podem
    // ser apagados por uma sincronização da WABA principal.
    await db.whatsAppTemplate.deleteMany({ where: { name: { notIn: names }, numberId: null } });
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

  // Cabeçalho de MÍDIA: a Meta exige a mídia em todo envio — vai por
  // presigned GET da mídia padrão do template (S3).
  let headerMedia: TemplateHeaderMedia | null = null;
  const mediaRule = template.headerFormat ? HEADER_MEDIA_RULES[template.headerFormat] : null;
  if (mediaRule) {
    if (!template.headerMediaKey) {
      throw new Error('Este template tem cabeçalho de mídia, mas nenhuma mídia foi definida — anexe em Templates → Gerenciar.');
    }
    headerMedia = {
      kind: mediaRule.kind,
      link: await s3HeaderMediaLink(template.headerMediaKey),
      filename: template.headerMediaKey.split('/').pop()?.replace(/^\d{10,}-/, ''),
    };
  }

  const result = await sendTemplate(
    contact.phone, template.name, vars, template.language, headerVar, contact.numberId, headerMedia,
  );
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
