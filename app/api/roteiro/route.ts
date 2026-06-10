/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { db } from "@/app/_lib/prisma";

const CONVERTER_URL = process.env.DOCX_CONVERTER_URL || "http://localhost:3001";
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

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
          rg: true, nome_mae: true, data_nasc: true,
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
        rg: true, nome_mae: true, data_nasc: true,
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

export const maxDuration = 120;

const HEARTBEAT_CHAR = "​";
const HEARTBEAT_INTERVAL_MS = 4000;

export async function POST(request: Request) {
  const body = await request.json();
  const { messages, cardId, isProcess, attachments, attachment } = body;

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

      try {
        heartbeatTimer = setInterval(() => {
          controller.enqueue(encoder.encode(HEARTBEAT_CHAR));
        }, HEARTBEAT_INTERVAL_MS);

        const cardData = cardId ? await getCardContext(cardId, !!isProcess) : null;
        const contextMessage = buildContextMessage(cardData);

        const aiResponse = await fetch(`${CONVERTER_URL}/ai/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
          },
          body: JSON.stringify({
            messages,
            contextMessage,
            attachments,
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
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}