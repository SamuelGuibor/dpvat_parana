'use server';

import { getServerSession } from 'next-auth';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';

// Fluxos de mensagens pré-setadas do atendimento: sequência de passos (texto,
// imagem, vídeo, áudio ou documento) com delay antes de cada envio. As mídias
// ficam no S3 sob "whatsapp/flows/" e são reutilizadas em todo envio do fluxo.
// Áudio .ogg (opus) chega como mensagem de voz no celular do cliente.
//
// A execução acontece no client (WhatsAppComposer), que chama as actions de
// envio passo a passo respeitando o delay — o atendente vê cada mensagem
// entrando na thread e pode cancelar no meio.

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
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!me || !TEAM_ROLES.includes(me.role)) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
}

export type FlowStepKind = 'text' | 'image' | 'video' | 'audio' | 'document';

export interface WhatsAppFlowStep {
  kind: FlowStepKind;
  body: string; // texto da mensagem ou legenda da mídia
  mediaKey?: string | null;
  mediaType?: string | null;
  fileName?: string | null;
  delayMs: number; // espera ANTES de enviar este passo (0 no primeiro)
}

export interface WhatsAppFlowDTO {
  id: string;
  name: string;
  description: string | null;
  steps: WhatsAppFlowStep[];
}

const KINDS: FlowStepKind[] = ['text', 'image', 'video', 'audio', 'document'];

function sanitizeSteps(steps: WhatsAppFlowStep[]): WhatsAppFlowStep[] {
  const clean: WhatsAppFlowStep[] = [];
  for (const s of steps) {
    const kind = KINDS.includes(s.kind) ? s.kind : 'text';
    const body = String(s.body ?? '').trim().slice(0, 4000);
    const mediaKey = typeof s.mediaKey === 'string' && s.mediaKey.startsWith('whatsapp/flows/') ? s.mediaKey : null;
    if (kind === 'text' && !body) continue;
    if (kind !== 'text' && !mediaKey) continue;
    clean.push({
      kind,
      body,
      mediaKey,
      mediaType: mediaKey ? String(s.mediaType ?? 'application/octet-stream') : null,
      fileName: mediaKey ? String(s.fileName ?? 'arquivo') : null,
      delayMs: Math.min(Math.max(Math.round(Number(s.delayMs) || 0), 0), 120_000),
    });
  }
  if (!clean.length) throw new Error('O fluxo precisa de ao menos um passo válido.');
  if (clean.length > 30) throw new Error('Máximo de 30 passos por fluxo.');
  return clean;
}

export async function listWhatsAppFlows(): Promise<WhatsAppFlowDTO[]> {
  await requireTeamMember();
  const flows = await db.whatsAppFlow.findMany({ orderBy: { name: 'asc' } });
  return flows.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description ?? null,
    steps: (f.steps as unknown as WhatsAppFlowStep[]) ?? [],
  }));
}

export async function saveWhatsAppFlow(input: { id?: string; name: string; description?: string; steps: WhatsAppFlowStep[] }): Promise<WhatsAppFlowDTO> {
  await requireTeamMember();

  const name = input.name.trim();
  if (!name) throw new Error('Dê um nome ao fluxo.');
  const description = input.description?.trim() || null;
  const steps = sanitizeSteps(input.steps);
  const data = { name, description, steps: steps as unknown as object };

  const flow = input.id
    ? await db.whatsAppFlow.update({ where: { id: input.id }, data })
    : await db.whatsAppFlow.create({ data });

  return { id: flow.id, name: flow.name, description: flow.description ?? null, steps };
}

export async function deleteWhatsAppFlow(id: string): Promise<void> {
  await requireTeamMember();
  await db.whatsAppFlow.delete({ where: { id } });
}

/**
 * Registra no histórico que um atendente disparou um fluxo para um contato.
 * Chamado pelo composer no início da execução do fluxo (os passos individuais
 * também geram seus próprios logs de texto/mídia).
 */
export async function logFlowDispatched(contactId: string, flowName: string, steps: number): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return;
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, role: true } });
  if (!me || !TEAM_ROLES.includes(me.role)) return;
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId }, select: { name: true, phone: true } });
  await logWhatsAppEvent({
    action: 'wa_flow',
    message: `disparou o fluxo "${flowName}" (${steps} passo${steps === 1 ? '' : 's'}) para ${contact?.name ?? contact?.phone ?? 'contato'}`,
    authorId: me.id,
    authorName: me.name ?? 'Atendente',
    contactId,
    contactName: contact?.name,
    contactPhone: contact?.phone,
    metadata: { flowName, steps },
  });
}

/**
 * Presigned PUT pro navegador subir a mídia de um passo do fluxo direto ao S3
 * (mesmo esquema dos anexos da conversa; contorna o limite de 4.5 MB da Vercel).
 */
export async function getFlowMediaUploadUrl(
  fileName: string,
  mimeType: string,
): Promise<{ url: string; key: string }> {
  await requireTeamMember();

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `whatsapp/flows/${Date.now()}-${safeName}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 600 });
  return { url, key };
}
