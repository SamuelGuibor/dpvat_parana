'use server';

import { getServerSession } from 'next-auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';

// Documentos pessoais anexados na ficha do cliente (dentro do atendimento de
// WhatsApp). Se o contato já tem User vinculado, viram Document de verdade
// (mesma tabela usada pelo restante do sistema, sem processId — documento
// pessoal, não de um processo específico). Sem vínculo ainda, ficam como
// rascunho em whatsapp_contacts.draftDocuments e migram pro User quando
// "Adicionar cliente" for usado.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function requireTeamMember(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (!me || !TEAM_ROLES.includes(me.role)) throw new Error('Sem permissão para o atendimento de WhatsApp.');
}

export interface ClientDocumentDTO {
  id: string; // id do Document (registrado) ou key (rascunho)
  key: string;
  name: string;
  uploadedAt: string;
}

interface DraftDoc { key: string; name: string; uploadedAt: string }

export async function listClientDocuments(contactId: string): Promise<ClientDocumentDTO[]> {
  await requireTeamMember();
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');

  if (contact.userId) {
    const docs = await db.document.findMany({
      where: { userId: contact.userId, processId: null },
      orderBy: { createdAt: 'asc' },
    });
    return docs.map((d) => ({ id: d.id, key: d.key, name: d.name, uploadedAt: d.uploadedAt.toISOString() }));
  }

  const drafts = (contact.draftDocuments as unknown as DraftDoc[]) ?? [];
  return drafts.map((d) => ({ id: d.key, key: d.key, name: d.name, uploadedAt: d.uploadedAt }));
}

/** Presigned PUT pro navegador subir o documento direto ao S3. */
export async function getClientDocumentUploadUrl(
  contactId: string,
  fileName: string,
  mimeType: string,
): Promise<{ url: string; key: string }> {
  await requireTeamMember();
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = contact.userId
    ? `uploads/user_${contact.userId}/${Date.now()}-${safeName}`
    : `whatsapp/${contactId}/docs/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 600 });
  return { url, key };
}

/** Confirma o upload: registra o Document (cliente cadastrado) ou anexa ao rascunho. */
export async function confirmClientDocumentUpload(contactId: string, key: string, name: string): Promise<ClientDocumentDTO[]> {
  await requireTeamMember();
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');

  if (contact.userId) {
    if (!key.startsWith(`uploads/user_${contact.userId}/`)) throw new Error('Anexo inválido.');
    await db.document.create({ data: { userId: contact.userId, key, name } });
  } else {
    if (!key.startsWith(`whatsapp/${contactId}/docs/`)) throw new Error('Anexo inválido.');
    const drafts = (contact.draftDocuments as unknown as DraftDoc[]) ?? [];
    drafts.push({ key, name, uploadedAt: new Date().toISOString() });
    await db.whatsAppContact.update({ where: { id: contactId }, data: { draftDocuments: drafts as unknown as object } });
  }

  return listClientDocuments(contactId);
}

export async function deleteClientDocument(contactId: string, ref: string): Promise<ClientDocumentDTO[]> {
  await requireTeamMember();
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');

  if (contact.userId) {
    const doc = await db.document.findUnique({ where: { id: ref } });
    if (doc && doc.userId === contact.userId) {
      await db.document.delete({ where: { id: ref } });
    }
  } else {
    const drafts = (contact.draftDocuments as unknown as DraftDoc[]) ?? [];
    const filtered = drafts.filter((d) => d.key !== ref);
    await db.whatsAppContact.update({ where: { id: contactId }, data: { draftDocuments: filtered as unknown as object } });
  }

  return listClientDocuments(contactId);
}
