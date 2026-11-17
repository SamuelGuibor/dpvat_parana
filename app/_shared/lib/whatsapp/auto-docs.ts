// T-ZAPXG (pedido do Daniel, decisão do dono 17/11): a equipe manda ao cliente
// a lista de documentos (INSS e demais) e ele responde com fotos/PDFs pelo
// WhatsApp. Antes alguém tinha de abrir a conversa e anexar um a um. Agora,
// quando o contato JÁ TEM card, cada imagem/PDF que chega é lida pela IA:
//   - não é documento (selfie, print de conversa, figurinha) → não anexa;
//   - é documento → vira Document do card na pasta que a IA escolheu
//     (DOCS INSS, IDENTIFICAÇÃO, EXAME MÉDICO…), com nome legível;
//   - o documento mostra afastamento do trabalho (benefício por incapacidade,
//     CNIS com auxílio, atestado de afastamento, carta de concessão) → comentário
//     explícito no card "AFASTADO: SIM/NÃO" com período e evidência.
// Roda DEPOIS da resposta do webhook (runAfterResponse): a Meta não espera a IA.
// Falha aqui nunca afeta a conversa: só loga. Desligável com WA_AUTO_DOCS=off.

import { db } from "../prisma";
import { createLog } from "../log";
import { callClaude, fetchS3Buffer, mediaKind, MAX_FILE_BYTES, type AiUsage } from "../ai-audit";
import { categoryLabel, inferCategory, isDocumentCategory, DOCUMENT_CATEGORIES, type DocumentCategoryId } from "../document-categories";
import { mediaDisplayName } from "@/app/_shared/utils/media-name";
import { parseAutoDocResult, type AutoDocResult } from "@/app/_shared/utils/auto-doc";

export const AUTO_DOC_AUTHOR = "🤖 IA — Documentos";
const AUTO_DOC_AUTHOR_ID = "system";
const IA_TIMEOUT_MS = 60_000;

export function autoDocsEnabled(): boolean {
  return (process.env.WA_AUTO_DOCS ?? "").toLowerCase() !== "off";
}

function prompt(): string {
  const pastas = DOCUMENT_CATEGORIES.map((c) => `${c.id} (${c.label})`).join(", ");
  return [
    "Você recebe UM arquivo que um cliente de um escritório de benefícios do INSS/DPVAT mandou pelo WhatsApp.",
    "Responda SOMENTE um JSON, sem texto fora dele, neste formato:",
    '{"ehDocumento": true|false, "tipo": "nome curto do documento em MAIÚSCULAS (ex.: CNIS, CARTA DE CONCESSÃO, RG, CNH, LAUDO MÉDICO, ATESTADO, CARTEIRA DE TRABALHO, COMPROVANTE DE RESIDÊNCIA)", "pasta": "ID da pasta", "afastamento": {"situacao": "sim"|"nao"|"indefinido", "inicio": "dd/mm/aaaa ou null", "fim": "dd/mm/aaaa ou null", "evidencia": "trecho/frase curta do documento que prova, ou null"}}',
    "",
    "ehDocumento = false para selfie, foto de pessoa/lugar, print de conversa, figurinha, imagem ilegível ou sem relação com documentação.",
    `pasta: uma de ${pastas}. Qualquer documento do INSS ou previdenciário (CNIS, extrato, carta de concessão, comunicado de decisão, perícia, Meu INSS, benefício, carteira de trabalho, PPP, CAT) vai em DOCS_INSS. Identidade/CPF/CNH/certidão em IDENTIFICACAO. Exame, laudo, prontuário, atestado médico em EXAME_MEDICO. Na dúvida, OUTROS.`,
    "afastamento: o documento mostra que a pessoa FICOU AFASTADA do trabalho (auxílio-doença/benefício por incapacidade concedido, CNIS com benefício 31/91, atestado ou laudo com dias de afastamento, CAT com afastamento)? sim = há prova de afastamento; nao = o documento é do tipo que mostraria e mostra que NÃO houve (ex.: CNIS sem nenhum benefício, indeferimento); indefinido = o documento não fala disso (RG, comprovante etc.).",
    "Não invente: datas e evidência só se estiverem escritas no documento.",
  ].join("\n");
}

/** Lê o arquivo com a IA. null = formato/tamanho que a IA não lê. */
async function readWithAi(key: string, name: string): Promise<{ result: AutoDocResult; usage: AiUsage } | null> {
  const kind = mediaKind(name);
  if (!kind) return null;
  const buf = await fetchS3Buffer(key);
  if (buf.length > MAX_FILE_BYTES) return null;
  const block = kind.kind === "image"
    ? { type: "image", source: { type: "base64", media_type: kind.mediaType, data: buf.toString("base64") } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } };
  const { result, usage } = await callClaude([block, { type: "text", text: prompt() }], { timeoutMs: IA_TIMEOUT_MS });
  return { result: parseAutoDocResult(result), usage };
}

function afastamentoComment(r: AutoDocResult, docName: string): string | null {
  const a = r.afastamento;
  if (a.situacao === "indefinido") return null;
  const periodo = a.inicio || a.fim ? ` — período: ${a.inicio ?? "?"} a ${a.fim ?? "?"}` : "";
  const evid = a.evidencia ? `\nEvidência: "${a.evidencia}"` : "";
  return a.situacao === "sim"
    ? `⚠️ AFASTADO: SIM${periodo}\nLido pela IA no documento "${docName}" (${r.tipo}) que o cliente mandou pelo WhatsApp.${evid}\nConfira o documento antes de usar.`
    : `AFASTADO: NÃO (pelo documento "${docName}" — ${r.tipo})\nLido pela IA no que o cliente mandou pelo WhatsApp.${evid}\nConfira o documento antes de usar.`;
}

/**
 * Mídia que acabou de chegar do cliente: se o contato tem card, a IA decide se
 * é documento, em que pasta fica e se mostra afastamento. Nunca lança.
 */
export async function autoAttachInboundMedia(input: {
  contactId: string;
  messageId: string;
  mediaKey: string;
  mediaType: string | null;
  createdAt: Date;
}): Promise<void> {
  if (!autoDocsEnabled()) return;
  try {
    const contact = await db.whatsAppContact.findUnique({
      where: { id: input.contactId },
      select: { id: true, name: true, userId: true },
    });
    // Só com card: lead sem card ainda está na triagem (o rascunho é do atendente).
    if (!contact?.userId) return;
    const card = await db.user.findUnique({ where: { id: contact.userId }, select: { id: true, name: true } });
    if (!card) return;

    // Já anexada (atendente foi mais rápido, ou retry): não paga IA de novo.
    const already = await db.document.findFirst({ where: { userId: card.id, key: input.mediaKey }, select: { id: true } });
    if (already) return;

    const baseName = mediaDisplayName({ key: input.mediaKey, mediaType: input.mediaType, createdAt: input.createdAt });
    let read: Awaited<ReturnType<typeof readWithAi>>;
    try {
      read = await readWithAi(input.mediaKey, baseName);
    } catch (err) {
      const usage = (err as { usage?: AiUsage })?.usage;
      await createLog({
        action: "wa_auto_doc",
        message: `IA não conseguiu ler a mídia "${baseName}" do cliente: ${err instanceof Error ? err.message : "erro"}`,
        authorId: AUTO_DOC_AUTHOR_ID,
        authorName: AUTO_DOC_AUTHOR,
        metadata: { contactId: contact.id, messageId: input.messageId, error: true, ...(usage ? { usage } : {}) },
      });
      return;
    }
    if (!read) return; // áudio/vídeo/formato que a IA não lê: fica na conversa.

    const { result, usage } = read;
    const pasta: DocumentCategoryId = isDocumentCategory(result.pasta) ? result.pasta : inferCategory(`${result.tipo} ${baseName}`);

    // Log de IA com usage SEMPRE (Canto da IA), anexando ou não. Sem userId:
    // o histórico do card recebe o document_add abaixo, não a leitura.
    await createLog({
      action: "wa_auto_doc",
      message: result.ehDocumento
        ? `IA leu "${baseName}" (${result.tipo}) e anexou em ${categoryLabel(pasta)}`
        : `IA leu "${baseName}" e não anexou (não é documento)`,
      authorId: AUTO_DOC_AUTHOR_ID,
      authorName: AUTO_DOC_AUTHOR,
      metadata: {
        contactId: contact.id, messageId: input.messageId, cardId: card.id,
        ehDocumento: result.ehDocumento, tipo: result.tipo, pasta, afastamento: result.afastamento.situacao, usage,
      },
    });
    if (!result.ehDocumento) return;

    // Nome: "CNIS - Foto 17-11-2026 14h32m05.jpeg" (tipo lido + nome da mídia).
    const name = result.tipo ? `${result.tipo} - ${baseName}`.slice(0, 200) : baseName;
    // Corrida com o atendente anexando a mesma mídia: confere de novo.
    const again = await db.document.findFirst({ where: { userId: card.id, key: input.mediaKey }, select: { id: true } });
    if (again) return;
    await db.document.create({ data: { userId: card.id, key: input.mediaKey, name, category: pasta } });
    await createLog({
      action: "document_add",
      message: `IA anexou o documento "${name}" (pasta ${categoryLabel(pasta)}) recebido pela conversa do WhatsApp`,
      authorId: AUTO_DOC_AUTHOR_ID,
      authorName: AUTO_DOC_AUTHOR,
      userId: card.id,
      metadata: { documents: [name], source: "whatsapp_auto", contactId: contact.id, category: pasta },
    });

    const text = afastamentoComment(result, name);
    if (text) {
      await db.comment.create({
        data: { text, authorName: AUTO_DOC_AUTHOR, targetName: card.name ?? "", userId: card.id },
      });
    }
  } catch (err) {
    console.error("[WA auto-docs] falhou:", input.contactId, input.messageId, err);
  }
}
