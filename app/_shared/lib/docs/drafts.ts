// Rascunho de documento preparado pela IA de operação (Etapa 4).
//
// Preparar (L2) NÃO toca o card: lê os campos, gera o PDF e grava só em
// `op-drafts/<cardId>/<ts>-<aleatório>.pdf` com os metadados no próprio objeto
// (sem tabela nova). Anexar (L3, prévia + "sim") copia para `uploads/` e cria o
// `Document` com log `document_add`, autor explícito. Vence em 7 dias sem
// anexar; o cron da lixeira apaga só esse prefixo.
//
// Sem "use server": quem chama (ferramentas em op/tools) já passou pelo token
// e pelas permissões do operador.

import { randomBytes } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { db } from "../prisma";
import { createLog } from "../log";
import { listVisibleDocTemplates, loadDocTemplateBuffer, type DocTemplateInfo } from "../doc-templates";
import { inferCategory, isDocumentCategory, type DocumentCategoryId } from "../document-categories";
import { signOpDraftUrl } from "../s3-presign";
import { sourceMeta, type WriteAuthor, type WriteSource, type OpTrace } from "../cards/types";
import { convertDocxToPdf } from "./converter";
import { brDateBR } from "@/app/_shared/utils/date-br";
import { cardUploadKey } from "@/app/_shared/utils/s3-keys";
import {
  buildProcuracaoData,
  classifyTemplate,
  draftFileName,
  isOpDraftExpired,
  missingFields,
  opDraftKey,
  parseOpDraftKey,
  templateFields,
  OP_DRAFT_PREFIX,
  OP_DRAFT_TTL_DAYS,
  type DraftKind,
  type MissingField,
} from "@/app/_shared/utils/doc-fields";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = () => process.env.AWS_S3_BUCKET_NAME;

/** Erro esperado da lib; a ferramenta traduz para OpToolError. */
export class DraftError extends Error {
  constructor(
    public code:
      | "modelo_nao_encontrado"
      | "card_nao_encontrado"
      | "rascunho_invalido"
      | "rascunho_expirado"
      | "rascunho_de_outro_operador"
      | "modelo_invalido",
    message: string,
  ) {
    super(message);
    this.name = "DraftError";
  }
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------

export interface DraftTemplate extends DocTemplateInfo {
  tipo: DraftKind;
  campos: string[];
}

// Tags por modelo: ler o .docx do S3 a cada listagem custaria 6+ GETs. 5 min
// por instância — modelo trocado pela tela de modelos vale em até 5 min.
const tagCache = new Map<string, { campos: string[]; at: number }>();
const TAG_TTL_MS = 5 * 60_000;

async function fieldsOf(filename: string): Promise<string[]> {
  const hit = tagCache.get(filename);
  if (hit && Date.now() - hit.at < TAG_TTL_MS) return hit.campos;
  const campos = templateFields(await loadDocTemplateBuffer(filename, "procuracao"));
  tagCache.set(filename, { campos, at: Date.now() });
  return campos;
}

/** Modelos visíveis do grupo procuração (o mesmo seletor da aba Integrações), com tipo e tags. */
export async function listDraftTemplates(kind?: DraftKind): Promise<DraftTemplate[]> {
  const visible = await listVisibleDocTemplates("procuracao");
  const wanted = visible
    .map((t) => ({ ...t, tipo: classifyTemplate(`${t.filename} ${t.label}`) }))
    .filter((t) => !kind || t.tipo === kind);
  // Em paralelo: com o cache frio são até 7 GETs no S3, e o MCP corta em 55 s.
  // Modelo ilegível não derruba a lista: sai sem campos (a geração dele falha com mensagem).
  return Promise.all(wanted.map(async (t) => ({ ...t, campos: await fieldsOf(t.filename).catch(() => [] as string[]) })));
}

// ---------------------------------------------------------------------------
// Preparar
// ---------------------------------------------------------------------------

const CARD_SELECT = {
  id: true,
  cardNumber: true,
  name: true,
  cpf: true,
  rg: true,
  nacionalidade: true,
  estado_civil: true,
  profissao: true,
  rua: true,
  bairro: true,
  numero: true,
  cep: true,
  cidade: true,
  estado: true,
  data_nasc: true,
  hospital: true,
  nome_mae: true,
  data_acidente: true,
} as const;

export interface DraftCheck {
  card: { id: string; cardNumber: number | null; name: string | null };
  template: DraftTemplate;
  faltando: MissingField[];
}

/**
 * Lê os campos que o modelo usa e diz o que sairia em branco (não gera nada).
 * Relê o .docx (sem o cache da listagem): a lista de faltantes é a do arquivo
 * que vai ser renderizado.
 */
export async function checkDraft(input: { cardId: string; template: DraftTemplate }): Promise<DraftCheck & { dados: Record<string, string>; content: Buffer }> {
  const card = await db.user.findUnique({ where: { id: input.cardId }, select: CARD_SELECT });
  if (!card) throw new DraftError("card_nao_encontrado", "Card não encontrado.");
  let content: Buffer;
  let campos: string[];
  try {
    content = await loadDocTemplateBuffer(input.template.filename, "procuracao");
    campos = templateFields(content);
  } catch (err) {
    console.warn("[OP DOCS] modelo ilegível:", input.template.filename, err instanceof Error ? err.message : err);
    throw new DraftError("modelo_invalido", `O modelo "${input.template.label}" não abriu (arquivo ausente ou tag quebrada). Avise quem cuida dos modelos.`);
  }
  tagCache.set(input.template.filename, { campos, at: Date.now() });
  const dados = buildProcuracaoData(card, brDateBR());
  const faltando = missingFields(campos, dados);
  return {
    card: { id: card.id, cardNumber: card.cardNumber, name: card.name },
    template: { ...input.template, campos },
    faltando,
    dados,
    content,
  };
}

export interface CreatedDraft {
  key: string;
  fileName: string;
  previewUrl: string;
  previewExpiresAt: string;
  expiresAt: string;
  emBranco: MissingField[];
  pastaSugerida: DocumentCategoryId;
}

/** Pasta padrão ao anexar: procuração/KIT na PROCURAÇÃO; o resto pelo nome. */
export function defaultDraftFolder(kind: DraftKind, fileName: string): DocumentCategoryId {
  return kind === "pedido_prontuario" ? inferCategory(fileName) : "PROCURACAO";
}

/**
 * Gera o PDF e grava em op-drafts/. Quem chama já decidiu que pode gerar com
 * campos em branco (`faltando` vazio, ou o operador disse "gerar mesmo assim").
 * Falha do conversor lança ConverterError antes de gravar qualquer coisa.
 */
export async function createDraft(input: {
  check: DraftCheck & { dados: Record<string, string>; content: Buffer };
  author: WriteAuthor;
}): Promise<CreatedDraft> {
  const { check, author } = input;
  let docx: Buffer;
  try {
    const doc = new Docxtemplater(new PizZip(check.content), {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "[[", end: "]]" },
      // Tag que o CRM não tem sai em branco (e já foi listada em `faltando`),
      // nunca "undefined" no documento.
      nullGetter: () => "",
    });
    doc.render(check.dados);
    docx = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  } catch (err) {
    console.warn("[OP DOCS] falha ao preencher o modelo:", check.template.filename, err instanceof Error ? err.message : err);
    throw new DraftError("modelo_invalido", `Não deu para preencher o modelo "${check.template.label}". Avise quem cuida dos modelos.`);
  }
  const pdf = await convertDocxToPdf(docx);

  const ts = Date.now();
  const key = opDraftKey(check.card.id, ts, randomBytes(4).toString("hex"));
  const fileName = draftFileName(check.template.label, check.card.name);
  // Metadado do S3 só aceita ASCII: texto livre vai com encodeURIComponent.
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: pdf,
      ContentType: "application/pdf",
      Metadata: {
        operator: author.id,
        card: check.card.id,
        kind: check.template.tipo,
        template: encodeURIComponent(check.template.filename),
        name: encodeURIComponent(fileName),
        blank: encodeURIComponent(JSON.stringify(check.faltando.map((f) => f.campo))),
      },
    }),
  );
  const signed = await signOpDraftUrl(key, fileName);
  return {
    key,
    fileName,
    previewUrl: signed.url,
    previewExpiresAt: signed.expiresAt,
    expiresAt: new Date(ts + OP_DRAFT_TTL_DAYS * 86_400_000).toISOString(),
    emBranco: check.faltando,
    pastaSugerida: defaultDraftFolder(check.template.tipo, fileName),
  };
}

// ---------------------------------------------------------------------------
// Ler / anexar
// ---------------------------------------------------------------------------

export interface DraftInfo {
  key: string;
  cardId: string;
  operatorId: string;
  kind: DraftKind;
  template: string;
  fileName: string;
  emBranco: string[];
  createdAt: Date;
  /** Key do Document que o anexo cria (determinística: anexar duas vezes = mesma key). */
  targetKey: string;
}

const decode = (v: string | undefined) => {
  try {
    return v ? decodeURIComponent(v) : "";
  } catch {
    return "";
  }
};

/** Metadados do rascunho (HeadObject). Key fora do formato, sumida ou vencida → DraftError. */
export async function getDraft(key: string): Promise<DraftInfo> {
  const parts = parseOpDraftKey(key);
  if (!parts) throw new DraftError("rascunho_invalido", "Isto não é um rascunho preparado pela IA.");
  if (isOpDraftExpired(parts.ts)) {
    throw new DraftError("rascunho_expirado", `O rascunho venceu (${OP_DRAFT_TTL_DAYS} dias). Prepare de novo.`);
  }
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET(), Key: key })).catch((err: { name?: string; $metadata?: { httpStatusCode?: number } }) => {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  });
  if (!head) throw new DraftError("rascunho_expirado", "O rascunho não existe mais. Prepare de novo.");
  const m = head.Metadata ?? {};
  // O card do metadado tem que ser o da key (ninguém reaproveita rascunho de outro card).
  if (m.card !== parts.cardId) throw new DraftError("rascunho_invalido", "Rascunho inconsistente.");
  let emBranco: string[] = [];
  try {
    const parsed = JSON.parse(decode(m.blank) || "[]") as unknown;
    if (Array.isArray(parsed)) emBranco = parsed.map(String);
  } catch {
    emBranco = [];
  }
  const fileName = decode(m.name) || "documento.pdf";
  const kind = (["procuracao", "pedido_prontuario", "contrato"] as const).find((k) => k === m.kind) ?? "procuracao";
  return {
    key,
    cardId: parts.cardId,
    operatorId: m.operator ?? "",
    kind,
    template: decode(m.template),
    fileName,
    emBranco,
    createdAt: new Date(parts.ts),
    targetKey: cardUploadKey(parts.cardId, false, parts.ts, 0, fileName),
  };
}

/** Document já criado a partir deste rascunho (inclusive na lixeira). */
export async function attachedDocument(draft: DraftInfo) {
  return db.document.findFirst({
    where: { key: draft.targetKey, userId: draft.cardId },
    select: { id: true, name: true, category: true, deletedAt: true },
  });
}

/**
 * Copia o PDF para uploads/ e cria o Document + log `document_add`.
 * Idempotente: a key de destino é derivada do rascunho e a criação roda sob
 * advisory lock dessa key — repetir (ou dois "sim" juntos) não duplica.
 */
export async function attachDraft(input: {
  draft: DraftInfo;
  category: DocumentCategoryId;
  author: WriteAuthor;
  source?: WriteSource;
  op?: OpTrace | null;
}): Promise<{ noop: boolean; documentId: string; name: string; category: string }> {
  const { draft, author, source, op } = input;
  const category = isDocumentCategory(input.category) ? input.category : inferCategory(draft.fileName);
  const already = await attachedDocument(draft);
  if (already) return { noop: true, documentId: already.id, name: already.name, category: already.category ?? category };

  // Antes do banco: se a cópia falhar, nada fica pela metade (sem Document apontando para objeto inexistente).
  // A key do rascunho é ASCII (op-drafts/<id>/<ts>-<hex>.pdf), então o CopySource dispensa encode.
  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET(),
      Key: draft.targetKey,
      CopySource: `${BUCKET()}/${draft.key}`,
      ContentType: "application/pdf",
      MetadataDirective: "REPLACE",
    }),
  );

  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${draft.targetKey}))`;
    const again = await tx.document.findFirst({ where: { key: draft.targetKey, userId: draft.cardId }, select: { id: true, name: true, category: true } });
    if (again) return { doc: again, noop: true };
    const doc = await tx.document.create({
      data: { userId: draft.cardId, processId: null, key: draft.targetKey, name: draft.fileName, category },
      select: { id: true, name: true, category: true },
    });
    return { doc, noop: false };
  });
  if (created.noop) return { noop: true, documentId: created.doc.id, name: created.doc.name, category: created.doc.category ?? category };

  await createLog({
    action: "document_add",
    message: `adicionou o documento "${draft.fileName}"`,
    authorId: author.id,
    authorName: author.name,
    userId: draft.cardId,
    processId: null,
    metadata: { documents: [draft.fileName], category, draftKey: draft.key, template: draft.template, emBranco: draft.emBranco, ...sourceMeta(source, op) },
  });
  return { noop: false, documentId: created.doc.id, name: draft.fileName, category };
}

// ---------------------------------------------------------------------------
// Purga (cron diário da lixeira)
// ---------------------------------------------------------------------------

/**
 * Apaga rascunhos com mais de 7 dias — SÓ no prefixo op-drafts/ (o anexado já
 * foi copiado para uploads/ e não depende deste objeto). Sem log por item: o
 * rascunho nunca foi documento do card.
 */
export async function purgeExpiredOpDrafts(now: number = Date.now()): Promise<{ deleted: number; failed: number }> {
  let token: string | undefined;
  let deleted = 0;
  let failed = 0;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: OP_DRAFT_PREFIX, ContinuationToken: token }));
    const expired = (page.Contents ?? [])
      .filter((o) => o.Key && o.Key.startsWith(OP_DRAFT_PREFIX) && o.LastModified && isOpDraftExpired(o.LastModified, now))
      .map((o) => ({ Key: o.Key! }));
    if (expired.length) {
      const res = await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET(), Delete: { Objects: expired, Quiet: true } }));
      failed += res.Errors?.length ?? 0;
      deleted += expired.length - (res.Errors?.length ?? 0);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { deleted, failed };
}
