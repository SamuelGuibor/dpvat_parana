import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/app/_shared/lib/prisma";
import { broadcastToRelay } from "@/app/_shared/lib/chat-relay";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { sendText, sendMedia } from "./client";
import { whatsappChannelId, whatsappRecipients, type WhatsAppMessageDTO } from "./service";

// Execução de um fluxo pré-setado (WhatsAppFlow) do lado do SERVIDOR — usada
// pelo bot de IA quando ele decide que um fluxo cadastrado se encaixa na
// situação do cliente (ex.: explicar uma etapa do processo). No inbox, quem
// executa é o navegador do atendente; aqui é o bot, sem sessão.

type FlowStepKind = "text" | "image" | "video" | "audio" | "document";
interface FlowStep {
  kind: FlowStepKind;
  body: string;
  mediaKey?: string | null;
  mediaType?: string | null;
  fileName?: string | null;
  delayMs: number;
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Delay entre passos quando o BOT dispara o fluxo: respeita o configurado, mas
// com teto baixo para não estourar a duração da função (webhook serverless).
const MAX_BOT_STEP_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fluxos disponíveis para a IA escolher (nome + descrição). */
export async function listFlowsForBot(): Promise<{ name: string; description: string }[]> {
  const flows = await db.whatsAppFlow.findMany({
    orderBy: { name: "asc" },
    select: { name: true, description: true },
  });
  return flows
    .filter((f) => f.description && f.description.trim())
    .map((f) => ({ name: f.name, description: f.description!.trim() }));
}

async function persistAndBroadcast(
  contact: { id: string; phone: string; name: string | null },
  waMessageId: string,
  body: string | null,
  mediaKey: string | null,
  mediaType: string | null,
): Promise<void> {
  const message = await db.whatsAppMessage.create({
    data: {
      contactId: contact.id,
      waMessageId,
      direction: "out",
      body,
      mediaKey,
      mediaType,
      status: "sent",
      sentByBot: true,
    },
  });
  const conversation = await db.whatsAppConversation.update({
    where: { contactId: contact.id },
    data: { lastMessageAt: new Date() },
  });

  const dto: WhatsAppMessageDTO = {
    id: message.id,
    channelId: whatsappChannelId(contact.id),
    contactId: contact.id,
    direction: "out",
    body,
    mediaKey,
    mediaType,
    status: "sent",
    sentByBot: true,
    authorId: null,
    createdAt: message.createdAt.toISOString(),
    contactName: contact.name,
    contactPhone: contact.phone,
    conversationStatus: conversation.status,
  };
  const recipients = await whatsappRecipients();
  await broadcastToRelay({ channelId: dto.channelId, recipients, message: dto });
}

/**
 * Dispara um fluxo cadastrado (por NOME) para o contato, passo a passo,
 * respeitando o delay (com teto). Retorna true se enviou ao menos um passo.
 * Nunca lança — falha vira log/console e não derruba o fluxo do bot.
 */
export async function runFlowForContact(
  flowName: string,
  contact: { id: string; phone: string; name: string | null },
): Promise<boolean> {
  try {
    const flow = await db.whatsAppFlow.findUnique({ where: { name: flowName } });
    if (!flow) {
      console.warn(`[FLOW BOT] Fluxo "${flowName}" não encontrado.`);
      return false;
    }
    const steps = (flow.steps as unknown as FlowStep[]) ?? [];
    if (!steps.length) return false;

    let sentAny = false;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (i > 0) await sleep(Math.min(step.delayMs || 0, MAX_BOT_STEP_DELAY_MS));

      if (step.kind === "text") {
        if (!step.body?.trim()) continue;
        const res = await sendText(contact.phone, step.body);
        if (res.waMessageId) {
          await persistAndBroadcast(contact, res.waMessageId, step.body, null, null);
          sentAny = true;
        }
        continue;
      }

      // Passo de mídia: presigned GET do S3 → a Meta baixa e entrega.
      if (!step.mediaKey) continue;
      const link = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: step.mediaKey }),
        { expiresIn: 3600 },
      );
      const kind = step.kind as "image" | "video" | "audio" | "document";
      const res = await sendMedia(contact.phone, kind, link, step.body?.trim() || undefined, step.fileName ?? undefined);
      if (res.waMessageId) {
        await persistAndBroadcast(contact, res.waMessageId, step.body?.trim() || null, step.mediaKey, step.mediaType ?? null);
        sentAny = true;
      }
    }

    if (sentAny) {
      await logWhatsAppEvent({
        action: "wa_flow",
        message: `bot disparou o fluxo "${flow.name}" para ${contact.name ?? contact.phone}`,
        authorId: "whatsapp-bot",
        authorName: "🤖 Bot WhatsApp",
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { flowName: flow.name, automated: true },
      });
    }
    return sentAny;
  } catch (err) {
    console.error(`[FLOW BOT] Falha ao disparar fluxo "${flowName}":`, err);
    return false;
  }
}
