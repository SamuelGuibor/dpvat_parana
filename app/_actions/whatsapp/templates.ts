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

/**
 * Catálogo por número (18/08/2026): todo template pertence a UMA WABA — o
 * catálogo é escopado pelo WhatsAppNumber. `numberId` null é legado e conta
 * como catálogo do número default.
 */
async function defaultNumberId(): Promise<string | null> {
  const row = await db.whatsAppNumber.findFirst({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Filtro do catálogo de um número (null legado conta como default). */
async function catalogWhere(numberId: string | null): Promise<{ OR: { numberId: string | null }[] }> {
  const def = await defaultNumberId();
  const target = numberId ?? def;
  const keys: { numberId: string | null }[] = [{ numberId: target }];
  if (target === def) keys.push({ numberId: null });
  return { OR: keys };
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
  // Número dono do catálogo (null = legado/default) + rótulo pra UI.
  numberId: string | null;
  numberLabel: string | null;
  headerText: string | null;
  // TEXT | IMAGE | VIDEO | DOCUMENT | null (sem cabeçalho)
  headerFormat: string | null;
  // Cabeçalho de mídia: se true, o envio já tem a mídia padrão no S3.
  hasHeaderMedia: boolean;
  footerText: string | null;
}

function toDTO(t: {
  id: string; name: string; language: string; bodyVars: number; bodyPreview: string | null;
  status: string; category: string; rejectedReason: string | null; numberId: string | null;
  headerText: string | null; headerFormat: string | null; headerMediaKey: string | null;
  footerText: string | null;
}, numberLabel: string | null = null): WhatsAppTemplateDTO {
  return {
    id: t.id, name: t.name, language: t.language, bodyVars: t.bodyVars, bodyPreview: t.bodyPreview,
    status: t.status, category: t.category, rejectedReason: t.rejectedReason,
    numberId: t.numberId, numberLabel,
    headerText: t.headerText, headerFormat: t.headerFormat, hasHeaderMedia: !!t.headerMediaKey,
    footerText: t.footerText,
  };
}

/**
 * Lista o cadastro local. Por padrão devolve TODOS os status (a tela de
 * gerenciamento acompanha o ciclo da Meta); `onlyApproved` é o que o envio
 * usa — mandar template não aprovado a Meta recusa na hora.
 *
 * `contactId` limita ao CATÁLOGO do número que atende o contato — enviar
 * template de outra WABA a Meta recusa (é o que o modal de envio usa).
 */
export async function listWhatsAppTemplates(onlyApproved = false, contactId?: string): Promise<WhatsAppTemplateDTO[]> {
  await requireTeamMember();

  let catalog: { OR: { numberId: string | null }[] } | undefined;
  if (contactId) {
    const contact = await db.whatsAppContact.findUnique({ where: { id: contactId }, select: { numberId: true } });
    catalog = await catalogWhere(contact?.numberId ?? null);
  }

  const [templates, numbers] = await Promise.all([
    db.whatsAppTemplate.findMany({
      where: { ...(onlyApproved ? { status: 'APPROVED' } : {}), ...(catalog ?? {}) },
      orderBy: { name: 'asc' },
    }),
    db.whatsAppNumber.findMany({ select: { id: true, label: true } }),
  ]);
  const labelOf = new Map(numbers.map((n) => [n.id, n.label]));
  return templates.map((t) => toDTO(t, t.numberId ? labelOf.get(t.numberId) ?? null : 'Número principal'));
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
  // Em qual NÚMERO (WABA) criar — ausente = número default.
  numberId?: string | null;
}): Promise<{ template?: WhatsAppTemplateDTO; error?: string }> {
  await requireTeamMember();
  const targetNumberId = input.numberId ?? (await defaultNumberId());

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

  // Duplicidade é POR CATÁLOGO — o mesmo nome pode existir em WABAs diferentes.
  if (await db.whatsAppTemplate.findFirst({ where: { name, ...(await catalogWhere(targetNumberId)) } })) {
    return { error: `Já existe um template chamado "${name}" neste número.` };
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
      targetNumberId,
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
  }, targetNumberId);
  if (created.error) return { error: created.error };

  const template = await db.whatsAppTemplate.create({
    data: {
      name, language, category, headerText, footerText,
      numberId: targetNumberId,
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
  const result = { imported: 0, approved: 0, pending: 0, rejected: 0 };
  const errors: string[] = [];

  const numbers = await db.whatsAppNumber.findMany({
    where: { active: true, wabaId: { not: null } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, label: true, isDefault: true },
  });
  if (!numbers.length) return { ...result, error: 'Nenhum número com WABA cadastrada.' };

  // Normalização do legado: linhas numberId null pertencem ao número default.
  // (O adopt do ensureDefaultNumber cobre isto, mas syncs antigos recriavam
  // linhas nulas — funde as duplicadas preservando a mídia de cabeçalho.)
  const defId = numbers[0].id;
  const legacy = await db.whatsAppTemplate.findMany({ where: { numberId: null } });
  for (const row of legacy) {
    const twin = await db.whatsAppTemplate.findFirst({ where: { name: row.name, numberId: defId } });
    if (twin) {
      if (!twin.headerMediaKey && row.headerMediaKey) {
        await db.whatsAppTemplate.update({
          where: { id: twin.id },
          data: { headerMediaKey: row.headerMediaKey, headerMediaType: row.headerMediaType },
        });
      }
      await db.whatsAppTemplate.delete({ where: { id: row.id } });
    } else {
      await db.whatsAppTemplate.update({ where: { id: row.id }, data: { numberId: defId } });
    }
  }

  // Um catálogo por número: cada WABA é fonte da verdade do próprio catálogo.
  for (const number of numbers) {
    let metaTemplates;
    try {
      // "hello_world" é o template de demonstração que a Meta pré-cria e não
      // deixa excluir — não serve pra nada no atendimento, então fica de fora
      // (e o stale-delete abaixo remove qualquer resquício dele no cadastro).
      metaTemplates = (await fetchMetaTemplates(number.id)).filter((t) => t.name !== 'hello_world');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao consultar os templates na Meta.';
      console.error(`[WHATSAPP TEMPLATES] Sincronização falhou (${number.label}):`, message);
      errors.push(`${number.label}: ${message}`);
      continue;
    }

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
      const existing = await db.whatsAppTemplate.findFirst({
        where: { name: t.name, numberId: number.id }, select: { id: true },
      });
      if (existing) {
        await db.whatsAppTemplate.update({ where: { id: existing.id }, data });
      } else {
        await db.whatsAppTemplate.create({ data: { name: t.name, numberId: number.id, ...data } });
      }
      result.imported++;
      if (t.status === 'APPROVED') result.approved++;
      else if (t.status === 'PENDING') result.pending++;
      else if (t.status === 'REJECTED') result.rejected++;
    }

    // Template apagado na Meta sai do cadastro DESTE número: se ficasse,
    // apareceria enviável e o envio falharia só na hora de falar com o cliente.
    const names = metaTemplates.map((t) => t.name);
    if (names.length) {
      await db.whatsAppTemplate.deleteMany({ where: { name: { notIn: names }, numberId: number.id } });
    }
  }

  return errors.length ? { ...result, error: errors.join(' · ') } : result;
}

/** Exclui o template — na Meta (WABA do número dono) e no cadastro local. */
export async function deleteWhatsAppTemplate(id: string): Promise<{ error?: string }> {
  await requireTeamMember();
  const template = await db.whatsAppTemplate.findUnique({ where: { id } });
  if (!template) return {};

  const { error } = await deleteMetaTemplate(template.name, template.numberId);
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
  // Catálogo × número: template de outra WABA a Meta recusa — barra aqui com
  // mensagem clara em vez de falhar na Graph API.
  const def = await defaultNumberId();
  const templateOwner = template.numberId ?? def;
  const contactOwner = contact.numberId ?? def;
  if (templateOwner !== contactOwner) {
    throw new Error('Este template pertence a outro número — use um template do número que atende este contato.');
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
      numberId: contact.numberId,
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
    update: { lastMessageAt: new Date(), status: 'human', assignedToId: me.id, ...(contact.numberId ? { numberId: contact.numberId } : {}) },
    create: { contactId, numberId: contact.numberId, status: 'human', assignedToId: me.id },
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
