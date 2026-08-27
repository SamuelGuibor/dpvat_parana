/* eslint-disable @typescript-eslint/no-explicit-any */
// Gerador de Documento (IA) do card — backend.
//
// Duas operações num POST só (op no body):
//   • "verify"   — checagem automática ao inserir o .docx: cruza a DATA DO
//                  ACIDENTE e a LESÃO do card com a Declaração de Benefício
//                  (data de início do benefício ~20 dias depois do acidente),
//                  laudos e BO/CAT anexados ao card.
//   • "generate" — gera o texto de uma tag {{IA}} a partir dos documentos
//                  selecionados + prompt, com histórico de refinamento
//                  (o usuário valida/pede ajuste antes de aceitar).
//
// Acesso: HARDCODED via doc-ia-access.ts — fora do sistema de permissões.
// IA: Gemini (GOOGLE_API_KEY, mesma chave do chat). Sem log de consumo.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "@/app/_shared/lib/auth";
import { canUseDocIa } from "@/app/_shared/lib/doc-ia-access";
import { db } from "@/app/_shared/lib/prisma";

export const maxDuration = 300;

const MODEL = "gemini-3.6-flash";
const MAX_FILES = 12;
const MAX_TOTAL_BYTES = 14 * 1024 * 1024; // limite de request do Gemini é 20MB; base64 infla ~33%
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function fetchS3Buffer(key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key })
  );
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as any) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

type MediaKind = { kind: "image"; mediaType: string } | { kind: "pdf" } | null;

function mediaKind(name: string): MediaKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg"].includes(ext)) return { kind: "image", mediaType: "image/jpeg" };
  if (ext === "png") return { kind: "image", mediaType: "image/png" };
  if (ext === "webp") return { kind: "image", mediaType: "image/webp" };
  if (ext === "gif") return { kind: "image", mediaType: "image/gif" };
  if (ext === "pdf") return { kind: "pdf" };
  return null;
}

const CARD_FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  cpf: "CPF",
  rg: "RG",
  data_nasc: "Data de nascimento",
  nome_mae: "Nome da mãe",
  nacionalidade: "Nacionalidade / naturalidade",
  estado_civil: "Estado civil",
  profissao: "Profissão",
  rua: "Rua",
  numero: "Número",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  cep: "CEP",
  telefone: "Telefone",
  data_acidente: "Data do acidente",
  hospital: "Hospital",
  lesoes: "Lesões",
  service: "Serviço",
  obs: "Observações",
  observacao: "Observações",
  otherObs: "Outras observações",
};

function cardSummary(card: Record<string, any>): string {
  const lines: string[] = [];
  for (const [field, label] of Object.entries(CARD_FIELD_LABELS)) {
    const v = card[field];
    if (v === null || v === undefined || v === "") continue;
    lines.push(`${label}: ${v instanceof Date ? v.toLocaleDateString("pt-BR") : String(v)}`);
  }
  return lines.join("\n") || "(nenhum campo preenchido)";
}

function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("A IA não retornou JSON válido.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

interface DocRow {
  id: string;
  key: string;
  name: string;
  category: string | null;
}

/** Anexa os documentos como parts nativas do Gemini (inlineData base64). */
async function buildDocBlocks(docs: DocRow[]): Promise<{ blocks: any[]; used: string[]; skipped: string[] }> {
  const blocks: any[] = [];
  const used: string[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const doc of docs) {
    if (used.length >= MAX_FILES) { skipped.push(doc.name); continue; }
    const kind = mediaKind(doc.name);
    if (!kind) { skipped.push(doc.name); continue; }
    let buf: Buffer;
    try {
      buf = await fetchS3Buffer(doc.key);
    } catch {
      skipped.push(doc.name);
      continue;
    }
    if (buf.length > MAX_FILE_BYTES || total + buf.length > MAX_TOTAL_BYTES) {
      skipped.push(doc.name);
      continue;
    }
    total += buf.length;
    blocks.push({ text: `Arquivo: "${doc.name}"` });
    blocks.push({
      inlineData: {
        mimeType: kind.kind === "image" ? kind.mediaType : "application/pdf",
        data: buf.toString("base64"),
      },
    });
    used.push(doc.name);
  }
  return { blocks, used, skipped };
}

async function callGemini(contents: any[], maxOutputTokens: number): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: MODEL });
  const response = await model.generateContent({
    contents,
    generationConfig: { maxOutputTokens },
  });
  const text = response.response.text();
  if (!text) {
    throw new Error("A IA não retornou resposta para este conteúdo.");
  }
  return text;
}

// Filtros de nome para a checagem de datas — os 5 grupos que o Samuel pediu.
const VERIFY_DOC_PATTERNS: RegExp[] = [
  /declara|benef[ií]|cnis|concess|carta/i,       // declaração de benefício / CNIS
  /laudo|prontu[aá]|atestado|exame|m[eé]dic/i,   // laudos e docs médicos
  /\bcat\b|comunica[cç][aã]o.*acidente/i,        // CAT
  /\bb\.?o\.?\b|boletim|ocorr[eê]nc/i,           // boletim de ocorrência
];

function pickVerifyDocs(docs: DocRow[]): DocRow[] {
  const byName = docs.filter((d) => VERIFY_DOC_PATTERNS.some((re) => re.test(d.name)));
  const byCategory = docs.filter(
    (d) => (d.category === "DOCS_INSS" || d.category === "EXAME_MEDICO") && !byName.includes(d)
  );
  return [...byName, ...byCategory];
}

function verifyPrompt(card: Record<string, any>): string {
  return `Você é o auditor de documentos da Paraná Seguros (assessoria jurídica previdenciária — Auxílio-Acidente/INSS).

Sua tarefa é CRUZAR AS DATAS E AS LESÕES entre o cartão do cliente (abaixo) e os documentos anexados.

## O que verificar

1. **Data do acidente**: localize-a nos documentos (BO, CAT, laudos, prontuários, atestados). Compare com a data do acidente informada no cartão.
2. **Declaração de Benefício (INSS)**: localize a DATA DE INÍCIO do benefício (DIB / data de início). Regra prática do escritório: o cliente leva EM MÉDIA UNS 20 DIAS entre o acidente e ir ao INSS dar entrada — então o benefício deve começar por volta de 20 dias (±20) depois da data do acidente. Se houver mais de um benefício na declaração, use o que tem início igual ou mais próximo (posterior) à data do acidente.
3. **Lesão**: compare as lesões do cartão com o que consta nos laudos/documentos médicos.

## Interpretação do desvio

- Diferença entre acidente e início do benefício de 0 a ~40 dias → compatível ("ok").
- Início do benefício ANTES da data do acidente, ou mais de ~40 dias depois → "atencao" (explique: pode ser benefício de outro evento, data errada no cartão, ou documento de outro afastamento).
- Sem Declaração de Benefício ou sem data de acidente em lugar nenhum → "sem_dados".

## Formato de resposta (OBRIGATÓRIO)

Responda APENAS com um JSON válido, sem markdown, neste formato exato:
{
  "status": "ok" | "atencao" | "sem_dados",
  "data_acidente_card": "dd/mm/aaaa ou vazio",
  "data_acidente_docs": "dd/mm/aaaa ou 'Não apurado' (cite o documento de onde tirou)",
  "data_inicio_beneficio": "dd/mm/aaaa ou 'Não apurado'",
  "diff_dias": número de dias entre acidente e início do benefício (ou null),
  "lesao_card": "texto ou vazio",
  "lesao_docs": "lesões encontradas nos laudos, ou 'Não apurado'",
  "lesao_confere": true | false | null,
  "alertas": ["lista de divergências encontradas, uma por item; vazia se tudo ok"],
  "parecer": "resumo objetivo em 2-4 frases do cruzamento, citando os documentos usados"
}

Nunca invente dados: o que não encontrar é "Não apurado".

## DADOS DO CARTÃO
${cardSummary(card)}`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const sUser = session?.user as { id?: string; email?: string; name?: string } | undefined;
  if (!canUseDocIa(sUser)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { op, cardId, isProcess } = body ?? {};
  if (!op || !cardId) {
    return NextResponse.json({ error: "Parâmetros obrigatórios: op, cardId" }, { status: 400 });
  }

  const card = isProcess
    ? await db.process.findUnique({ where: { id: cardId } })
    : await db.user.findUnique({ where: { id: cardId } });
  if (!card) {
    return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
  }

  // Mesmo filtro do GET /api/documents: card de usuário lista também os docs
  // dos processos dele.
  const docs: DocRow[] = await db.document.findMany({
    where: {
      deletedAt: null,
      ...(isProcess ? { processId: cardId } : { userId: cardId }),
    },
    select: { id: true, key: true, name: true, category: true },
    orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });

  try {
    if (op === "verify") {
      const chosen = pickVerifyDocs(docs);
      if (chosen.length === 0) {
        return NextResponse.json({
          status: "sem_dados",
          alertas: ["Nenhum documento de benefício/laudo/BO/CAT encontrado no card."],
          parecer: "Não há documentos anexados que permitam cruzar a data do acidente com o início do benefício.",
          usedFiles: [],
          skipped: [],
        });
      }
      const { blocks, used, skipped } = await buildDocBlocks(chosen);
      const parts = [...blocks, { text: verifyPrompt(card as any) }];
      const text = await callGemini([{ role: "user", parts }], 2000);
      const result = extractJson(text);

      return NextResponse.json({ ...result, usedFiles: used, skipped });
    }

    if (op === "generate") {
      const { docIds, prompt, history } = body as {
        docIds?: string[];
        prompt?: string;
        history?: { role: "user" | "assistant"; text: string }[];
      };
      if (!prompt?.trim()) {
        return NextResponse.json({ error: "Prompt vazio" }, { status: 400 });
      }
      const chosen = docs.filter((d) => (docIds ?? []).includes(d.id));
      const { blocks, used, skipped } = await buildDocBlocks(chosen);

      const baseInstruction = `Você é o redator jurídico da Paraná Seguros (assessoria previdenciária — Auxílio-Acidente/INSS).

Gere o TEXTO pedido abaixo para entrar num documento oficial do escritório. Regras:
- Use os documentos anexados e os dados do cartão como fonte. NUNCA invente dados; o que não encontrar, escreva "Não apurado".
- Responda APENAS com o texto final do documento — sem preâmbulo ("Segue o texto..."), sem markdown (nada de **negrito**, títulos # ou listas com *), sem comentários seus.
- Linguagem formal e juridicamente adequada, em português do Brasil.

## DADOS DO CARTÃO (autoritativos para dados cadastrais)
${cardSummary(card as any)}

## PEDIDO
${prompt.trim()}`;

      const contents: any[] = [
        { role: "user", parts: [...blocks, { text: baseInstruction }] },
      ];
      for (const h of history ?? []) {
        contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] });
      }

      const text = await callGemini(contents, 8000);

      return NextResponse.json({ text: text.trim(), usedFiles: used, skipped });
    }

    return NextResponse.json({ error: `Operação desconhecida: ${op}` }, { status: 400 });
  } catch (err: any) {
    console.error("[DOC-IA] Erro:", err);
    return NextResponse.json(
      { error: err?.message ?? "Erro ao processar com a IA." },
      { status: 500 }
    );
  }
}
