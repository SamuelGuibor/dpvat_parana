/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { db } from "@/app/_shared/lib/prisma";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "@/app/api/instructions/_s3";

const CONVERTER_URL = process.env.DOCX_CONVERTER_URL; // production
// const CONVERTER_URL = "http://localhost:3001"; // local
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

interface S3KeyRef {
  key: string;
  name: string;
  type: string;
}

interface InlineAttachment {
  name: string;
  type: string;
  content: string; // base64
}

/**
 * Baixa do S3 os anexos enviados pelo navegador (prefixo roteiro-temp/) e os
 * converte para o formato base64 que o converter já espera. Os arquivos
 * trafegam navegador → S3 (direto) e S3 → backend, nunca como body de entrada
 * da serverless function — é assim que escapamos do limite de 4.5 MB da Vercel.
 */
async function buildAttachmentsFromS3(s3Keys: S3KeyRef[]): Promise<InlineAttachment[]> {
  const out: InlineAttachment[] = [];
  for (const ref of s3Keys) {
    if (!ref?.key) continue;
    const resp = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: ref.key }),
    );
    const bytes = await (resp.Body as any).transformToByteArray();
    out.push({
      name: ref.name || ref.key.split("/").pop() || "arquivo",
      type: ref.type || "application/octet-stream",
      content: Buffer.from(bytes).toString("base64"),
    });
  }
  return out;
}

/** Remove os arquivos temporários do S3 (best-effort, não bloqueia a resposta). */
async function deleteTempS3Objects(s3Keys: S3KeyRef[]): Promise<void> {
  await Promise.allSettled(
    s3Keys
      .filter((r) => r?.key)
      .map((r) =>
        s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: r.key })),
      ),
  );
}

async function getCardContext(cardId: string, isProcess: boolean) {
  try {
    if (isProcess) {
      return await db.process.findUnique({
        where: { id: cardId },
        select: {
          name: true, cpf: true, telefone: true, email: true,
          data_acidente: true, lesoes: true, hospital: true, outro_hospital: true,
          status: true, observacao: true, rua: true, bairro: true,
          cidade: true, estado: true, cep: true, estado_civil: true,
          rg: true, nome_mae: true, data_nasc: true, profissao: true,
        },
      });
    }

    return await db.user.findUnique({
      where: { id: cardId },
      select: {
        name: true, cpf: true, telefone: true, email: true,
        data_acidente: true, lesoes: true, hospital: true, outro_hospital: true,
        status: true, obs: true, rua: true, bairro: true,
        cidade: true, estado: true, cep: true, estado_civil: true,
        rg: true, nome_mae: true, data_nasc: true, profissao: true,
      },
    });
  } catch {
    return null;
  }
}

function maskSensitiveField(value: string | null | undefined): string {
  if (!value) return "não informado";
  const clean = value.replace(/\D/g, "");
  if (clean.length >= 6) return `****${clean.slice(-4)}`;
  return value;
}

function buildContextMessage(cardData: Record<string, any> | null): string {
  if (!cardData) return "";

  const fields = [
    ["Nome", cardData.name],
    ["CPF", maskSensitiveField(cardData.cpf)],
    ["RG", maskSensitiveField(cardData.rg)],
    ["Nome da mãe", cardData.nome_mae],
    ["Data de nascimento", cardData.data_nasc],
    ["Estado civil", cardData.estado_civil],
    ["Profissão", cardData.profissao],
    ["Telefone", cardData.telefone],
    ["Email", cardData.email],
    ["Data do acidente", cardData.data_acidente],
    ["Endereço", [cardData.rua, cardData.numero, cardData.bairro, cardData.cidade, cardData.estado, cardData.cep].filter(Boolean).join(", ")],
    ["Lesões", cardData.lesoes],
    ["Hospital", cardData.hospital],
    ["Outro hospital", cardData.outro_hospital],
    ["Status", cardData.status],
    ["Observações", cardData.observacao || cardData.obs],
  ];

  const lines = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`);

  if (lines.length === 0) return "";
  return `[Dados do cliente/processo atual]\n${lines.join("\n")}`;
}

// export async function POST(request: Request) {
//   try {
//     const body = await request.json();
//     const { messages, cardId, isProcess, attachments, attachment } = body;

//     if (!messages || !Array.isArray(messages)) {
//       return NextResponse.json(
//         { error: "Mensagens não fornecidas" },
//         { status: 400 }
//       );
//     }

//     // Fetch card context from DB (fast)
//     const cardData = cardId ? await getCardContext(cardId, !!isProcess) : null;
//     const contextMessage = buildContextMessage(cardData);

//     // Forward to microservice (no timeout limit)
//     const aiResponse = await fetch(`${CONVERTER_URL}/ai/chat`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
//       },
//       body: JSON.stringify({
//         messages,
//         contextMessage,
//         attachments,
//         attachment,
//       }),
//     });

//     if (!aiResponse.ok) {
//       const errorData = await aiResponse.json().catch(() => ({}));
//       return NextResponse.json(
//         { error: errorData.error || "Erro no serviço de IA" },
//         { status: aiResponse.status }
//       );
//     }

//     // Stream the response back to the client
//     return new Response(aiResponse.body, {
//       headers: { "Content-Type": "text/plain; charset=utf-8" },
//     });
//   } catch (error: any) {
//     console.log("[ROTEIRO] Erro:", error);
//     return NextResponse.json(
//       { error: "Erro ao processar mensagem com IA." },
//       { status: 500 }
//     );
//   }
// }

// 300s (teto do Pro): roteiros longos com muitos anexos passavam perto dos
// 60s do plano antigo. O heartbeat abaixo continua necessário (mantém a
// conexão do navegador/proxy viva durante o processamento da IA).
export const maxDuration = 300;

const HEARTBEAT_CHAR = "​";
const HEARTBEAT_INTERVAL_MS = 4000;

export async function POST(request: Request) {
  const body = await request.json();
  const { messages, cardId, isProcess, attachments, attachment, s3Keys } = body;

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "Mensagens não fornecidas" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const tempKeys: S3KeyRef[] = Array.isArray(s3Keys) ? s3Keys : [];

      try {
        heartbeatTimer = setInterval(() => {
          controller.enqueue(encoder.encode(HEARTBEAT_CHAR));
        }, HEARTBEAT_INTERVAL_MS);

        const cardData = cardId ? await getCardContext(cardId, !!isProcess) : null;
        const contextMessage = buildContextMessage(cardData);

        // Anexos vêm como chaves do S3 (caminho novo) ou base64 inline no
        // body (compatibilidade com clientes antigos).
        let resolvedAttachments = attachments;
        if (tempKeys.length > 0) {
          resolvedAttachments = await buildAttachmentsFromS3(tempKeys);
        }

        const aiResponse = await fetch(`${CONVERTER_URL}/ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
          },
          body: JSON.stringify({
            messages,
            contextMessage,
            attachments: resolvedAttachments,
            attachment,
          }),
        });

        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;

        if (!aiResponse.ok) {
          const errorData = await aiResponse.json().catch(() => ({}));
          const errMsg = JSON.stringify({ error: errorData.error || "Erro no serviço de IA" });
          controller.enqueue(encoder.encode(errMsg));
          controller.close();
          return;
        }

        const reader = aiResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }

        controller.close();
      } catch (error: any) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        console.log("[ROTEIRO] Erro:", error);
        try {
          controller.enqueue(encoder.encode("Erro ao processar mensagem com IA."));
          controller.close();
        } catch { /* stream already closed */ }
      } finally {
        // Limpa os anexos temporários do S3 (não falha a requisição se der erro).
        if (tempKeys.length > 0) {
          await deleteTempS3Objects(tempKeys).catch(() => {});
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}