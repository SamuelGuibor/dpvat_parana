/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@/app/_lib/prisma";

const genAI = new GoogleGenerativeAI(
  process.env.GOOGLE_API_KEY!
);

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif",
  "audio/wav", "audio/mp3", "audio/mpeg", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac",
  "video/mp4", "video/mpeg", "video/mov", "video/avi", "video/x-flv", "video/mpg", "video/webm", "video/wmv", "video/3gpp",
  "text/plain", "text/html", "text/css", "text/javascript", "text/x-typescript",
  "text/csv", "text/markdown", "text/x-python", "text/x-java", "text/xml", "text/rtf",
]);

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif",
  txt: "text/plain", csv: "text/csv", html: "text/html", htm: "text/html",
  md: "text/markdown", markdown: "text/markdown",
  xml: "text/xml", rtf: "text/rtf",
  js: "text/javascript", ts: "text/x-typescript",
  py: "text/x-python", java: "text/x-java",
  mp3: "audio/mp3", wav: "audio/wav", ogg: "audio/ogg",
  aac: "audio/aac", flac: "audio/flac", aiff: "audio/aiff",
  mp4: "video/mp4", mov: "video/mov", avi: "video/avi",
  webm: "video/webm", wmv: "video/wmv",
};

function resolveMimeType(filename: string, declaredType: string): string | null {
  if (SUPPORTED_MIME_TYPES.has(declaredType)) return declaredType;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? null;
}

const SYSTEM_INSTRUCTION = `
Você é um assistente jurídico especializado da Seguros Paraná.
Seu papel é ajudar a equipe administrativa com análise de documentos e geração de peças relacionadas a processos de Auxílio-Acidente (DPVAT/INSS).

SUAS CAPACIDADES:
1. ANÁLISE DE DOCUMENTOS: Quando receber documentos (PDF, imagem, etc), extraia e organize claramente

2. CRIAÇÃO DE DOCUMENTOS: Com base nas informações do cliente/processo e documentos analisados, você pode gerar:
   - Roteiros

REGRAS:
- Sempre use linguagem formal e juridicamente adequada nos documentos gerados
- Ao analisar documentos, extraia TODOS os dados relevantes de forma explícita — eles serão usados para preencher o roteiro automaticamente
- Nunca invente dados — use apenas o que foi fornecido
- Se faltar informação para gerar um documento, pergunte o que precisa
- Formate suas respostas com markdown para melhor leitura
- Quando gerar um documento, apresente-o completo e pronto para uso
`;

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  systemInstruction: SYSTEM_INSTRUCTION,
});

async function getCardContext(cardId: string, isProcess: boolean) {
  try {
    if (isProcess) {
      const process = await db.process.findUnique({
        where: { id: cardId },
        select: {
          name: true,
          cpf: true,
          telefone: true,
          email: true,
          data_acidente: true,
          lesoes: true,
          hospital: true,
          outro_hospital: true,
          status: true,
          observacao: true,
          rua: true,
          bairro: true,
          cidade: true,
          estado: true,
          cep: true,
          estado_civil: true,
          rg: true,
          nome_mae: true,
          data_nasc: true,
        },
      });
      return process;
    }

    const user = await db.user.findUnique({
      where: { id: cardId },
      select: {
        name: true,
        cpf: true,
        telefone: true,
        email: true,
        data_acidente: true,
        lesoes: true,
        hospital: true,
        outro_hospital: true,
        status: true,
        obs: true,
        rua: true,
        bairro: true,
        cidade: true,
        estado: true,
        cep: true,
        estado_civil: true,
        rg: true,
        nome_mae: true,
        data_nasc: true,
      },
    });
    return user;
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
    ["Endereço", [cardData.rua, cardData.numero, cardData.bairro, cardData.cidade, cardData.estado, cardData.cep].filter(Boolean).join(", ")],
    ["Data do acidente", cardData.data_acidente],
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

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 2000;

async function sendWithRetry(
  chat: ReturnType<typeof model.startChat>,
  parts: any[],
  attempt = 1
): Promise<any> {
  try {
    return await chat.sendMessage(parts);
  } catch (error: any) {
    const status = error?.status;
    const isRetryable = status === 503 || status === 429;

    if (!isRetryable || attempt > MAX_RETRIES) {
      throw error;
    }

    const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
    console.log(
      `[ROTEIRO] Tentativa ${attempt}/${MAX_RETRIES} falhou (${status}), aguardando ${delay}ms...`
    );

    await new Promise((r) => setTimeout(r, delay));
    return sendWithRetry(chat, parts, attempt + 1);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, cardId, isProcess, attachments, attachment } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Mensagens não fornecidas" },
        { status: 400 }
      );
    }

    const cardData = cardId ? await getCardContext(cardId, !!isProcess) : null;
    const contextMessage = buildContextMessage(cardData);

    const history = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({ history });

    const parts: any[] = [];

    if (contextMessage && history.length === 0) {
      parts.push({
        text: `${contextMessage}\n\n${lastMessage.content}`,
      });
    } else {
      parts.push({ text: lastMessage.content });
    }

    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.fileUri && att.mimeType) {
          parts.push({ fileData: { fileUri: att.fileUri, mimeType: att.mimeType } });
        } else if (att.content) {
          const mimeType = resolveMimeType(att.name ?? "", att.type ?? "");
          if (mimeType) {
            parts.push({ inlineData: { mimeType, data: att.content } });
          } else {
            parts.push({ text: `[Arquivo "${att.name}" não pôde ser analisado diretamente — formato não suportado pelo modelo]` });
          }
        }
      }
    } else if (attachment?.content && attachment?.type) {
      const mimeType = resolveMimeType(attachment.name ?? "", attachment.type);
      if (mimeType) {
        parts.push({ inlineData: { mimeType, data: attachment.content } });
      }
    }

    const result = await sendWithRetry(chat, parts);
    const response = result.response;
    const text = response.text();

    const usage = response.usageMetadata;
    console.log(
      `[ROTEIRO] Tokens — Prompt: ${usage?.promptTokenCount ?? "?"} | Resposta: ${usage?.candidatesTokenCount ?? "?"} | Total: ${usage?.totalTokenCount ?? "?"}`
    );

    return NextResponse.json({
      message: text,
      tokens: {
        prompt: usage?.promptTokenCount,
        response: usage?.candidatesTokenCount,
        total: usage?.totalTokenCount,
      },
    });
  } catch (error: any) {
    console.error("[ROTEIRO] Erro:", error);

    const status = error?.status || 500;
    let message = "Erro ao processar mensagem com IA.";

    if (status === 503) {
      message = "Servidor sobrecarregado. Tentei 3 vezes mas não consegui. Tente novamente em 1 minuto.";
    } else if (status === 429) {
      message = "Limite de requisições excedido. Aguarde alguns minutos.";
    }

    return NextResponse.json({ error: message }, { status });
  }
}
