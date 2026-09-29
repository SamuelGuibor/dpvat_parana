'use server';

import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { requireTeam, type SessionPermissions } from '@/app/_shared/lib/permissions-server';
import { createLog } from '@/app/_shared/lib/log';
import { inferCategory, isDocumentCategory, type DocumentCategoryId } from '@/app/_shared/lib/document-categories';
import { batchMediaNames, cleanBaseName, mediaDisplayName } from '@/app/_shared/utils/media-name';
import { parseDraftDocuments, planDraftMigration, type DraftDocument } from '@/app/_shared/utils/draft-documents';
import { ATTACH_BATCH_MAX } from '@/app/_shared/utils/contact-files';
import { updateDocumentName } from '@/app/_actions/documents/update-name-doc';
import { loadClientDocuments } from '@/app/_shared/lib/whatsapp/copilot-data';
import type { AttachMediaBatchResult, ClientDocumentDTO } from '@/app/_shared/lib/whatsapp/copilot-types';

// Documentos pessoais anexados na ficha do cliente (dentro do atendimento de
// WhatsApp). Se o contato já tem User vinculado, viram Document de verdade
// (mesma tabela usada pelo restante do sistema, sem processId — documento
// pessoal, não de um processo específico). Sem vínculo ainda, ficam como
// rascunho em whatsapp_contacts.draftDocuments e migram pro User quando o
// contato for vinculado a um card (pelo telefone ao abrir a conversa ou pelo
// "Adicionar cliente" — migrateDraftDocuments em copilot-data.ts).
//
// A LISTA sai de `loadClientDocuments` (app/_shared/lib/whatsapp/copilot-data.ts,
// URL de leitura já assinada): o inbox a recebe junto com a ficha por GET
// /api/whatsapp/inbox/copilot/<contactId>, e cada mutação daqui devolve a
// lista nova para o Copiloto trocar no cache sem buscar de novo. A mídia da
// conversa ainda não anexada (a grade da aba Arquivos) vem de GET
// /api/whatsapp/inbox/contact-files.

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

interface DraftDoc { key: string; name: string; uploadedAt: string }

/**
 * @deprecated bundle antigo: os documentos vêm junto com a ficha de GET
 * /api/whatsapp/inbox/copilot/<contactId>. Fica por UM deploy só para as abas
 * abertas com o bundle antigo; no deploy seguinte, remover se ficar sem uso
 * (npx knip).
 */
export async function listClientDocuments(contactId: string): Promise<ClientDocumentDTO[]> {
  await requireTeam();
  return loadClientDocuments(contactId);
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
    await db.document.create({ data: { userId: contact.userId, key, name, category: inferCategory(name) } });
  } else {
    if (!key.startsWith(`whatsapp/${contactId}/docs/`)) throw new Error('Anexo inválido.');
    const drafts = (contact.draftDocuments as unknown as DraftDoc[]) ?? [];
    drafts.push({ key, name, uploadedAt: new Date().toISOString() });
    await db.whatsAppContact.update({ where: { id: contactId }, data: { draftDocuments: drafts as unknown as object } });
  }

  return loadClientDocuments(contactId);
}

/** O que o "Anexar no card" lê do contato (vínculo e rascunho). */
const ATTACH_CONTACT_SELECT = { id: true, userId: true, draftDocuments: true } as const;

interface MediaToAttach {
  /** Mesma key S3 da mensagem: o documento aponta para o objeto que já existe. */
  key: string;
  name: string;
  /** Pasta escolhida no lote; ausente = pelo nome (inferCategory). */
  category?: DocumentCategoryId;
}

interface AttachOutcome {
  /** Viraram documento agora (novos ou restaurados da lixeira). */
  added: number;
  /** Já estavam no card/ficha. */
  alreadyAttached: number;
}

/**
 * Núcleo do "Anexar no card" — o unitário (menu da mídia na thread) e o lote
 * (aba Arquivos do Copiloto) passam por aqui. NÃO exportado: num arquivo "use
 * server" todo export vira endpoint público.
 *
 * - Contato com card: o Document aponta para a MESMA key da mensagem, sem
 *   baixar e subir de novo. Key que o card já tem ativa fica como está; key só
 *   na lixeira é RESTAURADA em vez de ganhar uma 2ª linha (a purga da linha
 *   antiga apagaria o objeto usado pela nova) — mesma regra da migração do
 *   rascunho (planDraftMigration). Um log `document_add` no histórico do card
 *   com os nomes, nos dois caminhos (antes só o upload do card registrava).
 * - Sem card: entra no rascunho da conversa (draftDocuments), que vira
 *   Document no vínculo (migrateDraftDocuments), com a pasta escolhida.
 */
async function attachMedia(
  contact: { id: string; userId: string | null; draftDocuments: unknown },
  items: MediaToAttach[],
  author: SessionPermissions,
  opts: { overrideOnRestore: boolean },
): Promise<AttachOutcome> {
  if (!items.length) return { added: 0, alreadyAttached: 0 };

  if (contact.userId) {
    const userId = contact.userId;
    const existing = await db.document.findMany({
      where: { userId, key: { in: items.map((i) => i.key) } },
      select: { id: true, key: true, deletedAt: true },
    });
    const plan = planDraftMigration(
      items.map((i) => ({ key: i.key, name: i.name, ...(i.category ? { category: i.category } : {}) })),
      existing,
    );

    if (plan.create.length) {
      await db.document.createMany({
        data: plan.create.map((d) => ({ userId, key: d.key, name: d.name, category: d.category ?? inferCategory(d.name) })),
      });
    }

    const keyById = new Map(existing.map((e) => [e.id, e.key]));
    const itemByKey = new Map(items.map((i) => [i.key, i]));
    const restoredNames = await Promise.all(plan.restoreIds.map(async (id) => {
      const item = itemByKey.get(keyById.get(id) ?? '');
      // Lote com nome/pasta escolhidos: o arquivo que volta da lixeira segue a
      // escolha do atendente. O unitário restaura como estava (como antes).
      const data = opts.overrideOnRestore && item
        ? { deletedAt: null, deletedBy: null, name: item.name, category: item.category ?? inferCategory(item.name) }
        : { deletedAt: null, deletedBy: null };
      const row = await db.document.update({ where: { id }, data, select: { name: true } });
      return row.name;
    }));

    const addedNames = [...plan.create.map((d) => d.name), ...restoredNames];
    if (addedNames.length) {
      // Histórico do card: com await (regra do createLog do kanban), mesmo
      // formato do upload pela aba Arquivos (POST /api/documents).
      await createLog({
        action: 'document_add',
        message: addedNames.length === 1
          ? `adicionou o documento "${addedNames[0]}" pela conversa do WhatsApp`
          : `adicionou ${addedNames.length} documentos pela conversa do WhatsApp`,
        authorId: author.userId,
        authorName: author.name ?? 'Usuário',
        userId,
        metadata: { documents: addedNames, source: 'whatsapp', contactId: contact.id },
      });
    }
    return { added: addedNames.length, alreadyAttached: plan.alreadyInCard };
  }

  // Rascunho: lido com a linha do contato travada (FOR UPDATE), como a
  // migração — dois anexos juntos, ou o anexo durante o vínculo, não perdem
  // um ao outro.
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ draftDocuments: unknown }[]>(Prisma.sql`
      SELECT "draftDocuments" FROM whatsapp_contacts WHERE id = ${contact.id} FOR UPDATE
    `);
    const drafts: DraftDocument[] = parseDraftDocuments(rows[0]?.draftDocuments);
    const have = new Set(drafts.map((d) => d.key));
    const uploadedAt = new Date().toISOString();
    let added = 0;
    let alreadyAttached = 0;
    for (const item of items) {
      if (have.has(item.key)) { alreadyAttached++; continue; }
      have.add(item.key);
      drafts.push({ key: item.key, name: item.name, uploadedAt, ...(item.category ? { category: item.category } : {}) });
      added++;
    }
    if (added) {
      await tx.whatsAppContact.update({
        where: { id: contact.id },
        data: { draftDocuments: drafts as unknown as Prisma.InputJsonValue },
      });
    }
    return { added, alreadyAttached };
  });
}

/**
 * "Anexar no card" de UMA mídia (menu da mídia na thread): transforma a mídia
 * recebida/enviada na conversa em documento da ficha do cliente. Contato ainda
 * sem User vinculado cai no rascunho e migra junto quando o card for criado.
 */
export async function attachConversationMediaToCard(messageId: string): Promise<ClientDocumentDTO[]> {
  const ctx = await requireTeam();

  const msg = await db.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: { contactId: true, mediaKey: true, mediaType: true, createdAt: true },
  });
  if (!msg?.mediaKey) throw new Error('Esta mensagem não tem anexo.');

  const contact = await db.whatsAppContact.findUnique({ where: { id: msg.contactId }, select: ATTACH_CONTACT_SELECT });
  if (!contact) throw new Error('Contato não encontrado.');

  // Mesmo nome que a bolha e a lista do Copiloto mostram: "midia.jpeg" vira
  // "Foto 24-09-2026 14h32m05.jpeg"; o nome que o cliente deu ao PDF fica.
  // A pasta continua saindo do nome (o rótulo padrão cai em OUTROS).
  const name = mediaDisplayName({ key: msg.mediaKey, mediaType: msg.mediaType, createdAt: msg.createdAt });
  await attachMedia(contact, [{ key: msg.mediaKey, name }], ctx, { overrideOnRestore: false });

  return loadClientDocuments(msg.contactId);
}

/**
 * "Anexar selecionadas" da aba Arquivos do Copiloto: várias mídias da conversa
 * de uma vez, na pasta e com o nome-base escolhidos ("DOCUMENTO PESSOAL 1.jpeg",
 * "DOCUMENTO PESSOAL 2.jpeg"…, da mais antiga para a mais nova). Sem nome-base,
 * o nome legível de cada mídia; sem pasta, pelo nome.
 *
 * Toda mídia precisa ser DESTE contato (o id vem do navegador). Recusa
 * esperada volta como `ok: false` com o texto: erro lançado por server action
 * chega mascarado em produção.
 */
export async function attachConversationMediaBatch(
  contactId: string,
  messageIds: string[],
  opts?: { category?: DocumentCategoryId; baseName?: string },
): Promise<AttachMediaBatchResult> {
  const ctx = await requireTeam();

  const ids = Array.isArray(messageIds)
    ? [...new Set(messageIds.filter((id): id is string => typeof id === 'string' && !!id))]
    : [];
  if (!ids.length) return { ok: false, error: 'Selecione ao menos uma mídia.' };
  if (ids.length > ATTACH_BATCH_MAX) {
    return { ok: false, error: `Selecione no máximo ${ATTACH_BATCH_MAX} mídias por vez.` };
  }

  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId }, select: ATTACH_CONTACT_SELECT });
  if (!contact) return { ok: false, error: 'Contato não encontrado. Recarregue a conversa.' };

  const msgs = await db.whatsAppMessage.findMany({
    where: { id: { in: ids } },
    select: { id: true, contactId: true, mediaKey: true, mediaType: true, createdAt: true, deletedAt: true },
  });
  if (msgs.length !== ids.length || msgs.some((m) => m.contactId !== contactId || !m.mediaKey || m.deletedAt)) {
    return { ok: false, error: 'Alguma mídia selecionada não está mais nesta conversa. Atualize a lista e tente de novo.' };
  }

  // Da mais antiga para a mais nova: "… 1" é a primeira que o cliente mandou
  // (a frente do RG antes do verso). A mesma key em duas mensagens vira um
  // documento só.
  msgs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  const seenKeys = new Set<string>();
  const unique = msgs.filter((m) => {
    const key = m.mediaKey as string;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const names = batchMediaNames(
    unique.map((m) => ({ key: m.mediaKey as string, mediaType: m.mediaType, createdAt: m.createdAt })),
    opts?.baseName,
  );
  const category = isDocumentCategory(opts?.category) ? opts.category : undefined;
  const outcome = await attachMedia(
    contact,
    unique.map((m, i) => ({ key: m.mediaKey as string, name: names[i], ...(category ? { category } : {}) })),
    ctx,
    { overrideOnRestore: !!category || !!cleanBaseName(opts?.baseName) },
  );

  return {
    ok: true,
    documents: await loadClientDocuments(contactId),
    added: outcome.added,
    alreadyAttached: outcome.alreadyAttached,
  };
}

/**
 * Renomeia um documento do cliente. Registrado (com User vinculado) reaproveita
 * o rename do resto do sistema (`updateDocumentName`: troca só o nome de
 * exibição e preserva a extensão; a key do S3 fica igual porque pode ser a
 * mesma da mensagem da conversa). Rascunho (ainda sem User) só troca o nome no
 * JSON — também sem mexer no S3.
 */
export async function renameClientDocument(contactId: string, docId: string, newName: string): Promise<ClientDocumentDTO[]> {
  await requireTeamMember();
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Nome inválido.');

  if (contact.userId) {
    await updateDocumentName({ id: docId, newName: trimmed });
  } else {
    const drafts = (contact.draftDocuments as unknown as DraftDoc[]) ?? [];
    const idx = drafts.findIndex((d) => d.key === docId);
    if (idx === -1) throw new Error('Documento não encontrado.');
    drafts[idx] = { ...drafts[idx], name: trimmed };
    await db.whatsAppContact.update({ where: { id: contactId }, data: { draftDocuments: drafts as unknown as object } });
  }

  return loadClientDocuments(contactId);
}

/**
 * Exclusão pela aba Arquivos do Copiloto. Registrado: a mesma lixeira de 30
 * dias da aba Arquivos do card, com quem excluiu (`deletedBy`, que a lixeira
 * mostra) e o log `document_remove` no histórico do card — antes a exclusão
 * pelo Copiloto saía como "excluído por —" e sem rastro. Rascunho: só sai do
 * JSON (não há card para registrar).
 */
export async function deleteClientDocument(contactId: string, ref: string): Promise<ClientDocumentDTO[]> {
  const ctx = await requireTeam();
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId } });
  if (!contact) throw new Error('Contato não encontrado.');

  if (contact.userId) {
    const doc = await db.document.findUnique({
      where: { id: ref },
      select: { userId: true, processId: true, name: true, key: true, deletedAt: true },
    });
    if (doc && doc.userId === contact.userId && !doc.deletedAt) {
      // Mesmo registro do deletDoc (aba Arquivos do card). O objeto no S3 não
      // é tocado: a key pode ser a mesma da mensagem da conversa.
      await db.document.update({
        where: { id: ref },
        data: { deletedAt: new Date(), deletedBy: ctx.name ?? null },
      });
      await createLog({
        action: 'document_remove',
        message: `moveu o documento "${doc.name}" para a lixeira`,
        authorId: ctx.userId,
        authorName: ctx.name ?? 'Usuário',
        userId: doc.processId ? null : doc.userId,
        processId: doc.processId ?? null,
        metadata: { name: doc.name, key: doc.key, source: 'whatsapp' },
      });
    }
  } else {
    const drafts = (contact.draftDocuments as unknown as DraftDoc[]) ?? [];
    const filtered = drafts.filter((d) => d.key !== ref);
    await db.whatsAppContact.update({ where: { id: contactId }, data: { draftDocuments: filtered as unknown as object } });
  }

  return loadClientDocuments(contactId);
}
