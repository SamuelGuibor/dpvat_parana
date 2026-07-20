"use server";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { db } from "../../_shared/lib/prisma";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// "use server" só permite exportar funções async — as listas ficam locais
// (espelhadas para a UI em app/nova-dash/tickets/constants.ts).
const TICKET_TYPES = ["BUG", "ALTERACAO", "MELHORIA", "OUTRO"] as const;
const TICKET_STATUSES = [
  "EM_DISTRIBUICAO",
  "EM_ANALISE",
  "EM_DESENVOLVIMENTO",
  "CONCLUIDO",
] as const;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

async function requireTeamMember() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado");
  if (!session.user.role?.startsWith("ADMIN")) {
    throw new Error("Apenas membros da equipe podem gerenciar tickets");
  }
  return session.user;
}

/**
 * Presigned PUT para a foto opcional do ticket. O navegador envia direto ao
 * S3 (prefixo dev-tickets/), contornando o limite de 4.5MB de body da Vercel.
 */
export async function getTicketImageUploadUrl(file: { name: string; type: string; size: number }) {
  try {
    await requireTeamMember();

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { success: false as const, error: "Formato inválido. Use JPEG, PNG, WEBP ou GIF." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { success: false as const, error: "Imagem excede o limite de 10MB." };
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `dev-tickets/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      ContentType: file.type,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return { success: true as const, url, key };
  } catch (error) {
    console.error("Erro ao gerar URL de upload do ticket:", error);
    return { success: false as const, error: "Falha ao preparar o upload da imagem." };
  }
}

interface CreateDevTicketProps {
  title: string;
  description: string;
  type: string;
  imageKey?: string | null;
  imageName?: string | null;
}

export async function createDevTicket({ title, description, type, imageKey, imageName }: CreateDevTicketProps) {
  const me = await requireTeamMember();

  if (!title?.trim()) throw new Error("Informe o título do ticket");
  if (!description?.trim()) throw new Error("Descreva o problema ou a alteração desejada");
  if (!TICKET_TYPES.includes(type as (typeof TICKET_TYPES)[number])) {
    throw new Error("Tipo de ticket inválido");
  }
  if (imageKey && !imageKey.startsWith("dev-tickets/")) {
    throw new Error("Imagem inválida");
  }

  return db.devTicket.create({
    data: {
      title: title.trim(),
      description: description.trim(),
      type,
      imageKey: imageKey ?? null,
      imageName: imageName ?? null,
      creatorId: me.id,
      creatorName: me.name ?? "Usuário",
    },
  });
}

/** Dev assume o ticket: vira responsável e, se ainda em distribuição, avança para análise. */
export async function assumeDevTicket(ticketId: string) {
  const me = await requireTeamMember();

  const ticket = await db.devTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket não encontrado");
  if (ticket.assigneeId && ticket.assigneeId !== me.id) {
    throw new Error(`Ticket já assumido por ${ticket.assigneeName}`);
  }

  return db.devTicket.update({
    where: { id: ticketId },
    data: {
      assigneeId: me.id,
      assigneeName: me.name ?? "Usuário",
      ...(ticket.status === "EM_DISTRIBUICAO" ? { status: "EM_ANALISE" } : {}),
    },
  });
}

export async function setDevTicketStatus(ticketId: string, status: string) {
  const me = await requireTeamMember();

  if (!TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) {
    throw new Error("Fase inválida");
  }

  const ticket = await db.devTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket não encontrado");

  const backToDistribution = status === "EM_DISTRIBUICAO";
  // Avançar sem responsável definido assume o ticket para quem moveu.
  const autoAssign = !backToDistribution && !ticket.assigneeId;

  return db.devTicket.update({
    where: { id: ticketId },
    data: {
      status,
      concludedAt: status === "CONCLUIDO" ? new Date() : null,
      // Voltar para distribuição libera o ticket para outro dev.
      ...(backToDistribution ? { assigneeId: null, assigneeName: null } : {}),
      ...(autoAssign ? { assigneeId: me.id, assigneeName: me.name ?? "Usuário" } : {}),
    },
  });
}

export async function deleteDevTicket(ticketId: string) {
  const me = await requireTeamMember();

  const ticket = await db.devTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket não encontrado");
  if (ticket.creatorId !== me.id && me.role !== "ADMIN++") {
    throw new Error("Só o criador do ticket (ou um ADMIN++) pode excluí-lo");
  }

  await db.devTicket.delete({ where: { id: ticketId } });

  // Limpa a foto no S3 (best-effort: o ticket já foi excluído do banco).
  if (ticket.imageKey) {
    try {
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: ticket.imageKey })
      );
    } catch (err) {
      console.error("Erro ao excluir imagem do ticket no S3:", err);
    }
  }

  return { ok: true };
}
