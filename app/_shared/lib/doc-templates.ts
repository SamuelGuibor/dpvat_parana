import fs from "fs";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./prisma";

// Modelos .docx gerenciáveis, em dois grupos (coluna kind):
//
// - "procuracao": os modelos do "Gerar Procuração" do card (pasta templates/).
// - "assinatura": os modelos do KIT de CONTRATO que o bot manda pra assinatura
//   eletrônica (pasta templates-assinatura/, variantes com âncora
//   <<assinatura_cliente>>). O pacote assinável é montado pela lista visível
//   deste grupo — ocultar/enviar um modelo muda o que o cliente assina.
//
// Antes eram só arquivos fixos no repositório. Desde 02/09 todo modelo é
// gerenciado pelo banco: o conteúdo vive no S3 (doc_templates.s3Key) e o
// MATCH de "qual modelo é esse" é feito só pela linha do banco — nunca mais
// pelo arquivo físico em templates/ ou templates-assinatura/. Isso evita a
// "reativação fantasma": antes, excluir um modelo original só escondia a
// linha (hidden=true) e o arquivo do repositório continuava valendo como
// fallback, então reenviar um .docx com o MESMO nome (pra atualizar o
// conteúdo) ficava bloqueado — ou, se destravado, o disco voltava a aparecer
// assim que a linha do banco fosse apagada de vez. Migração pontual dos 4
// modelos de assinatura + dos de templates/: scripts/migrate-templates-to-db.mjs.
// O `filename` é o identificador estável que o front manda pro gerador — os
// nomes hardcoded do KIT (BUILTIN_SIGNATURE_TEMPLATES) continuam existindo só
// como metadado (slug/label/nome do PDF final), não como fonte de conteúdo.

export type DocTemplateKind = "procuracao" | "assinatura";

export interface DocTemplateInfo {
  filename: string;
  label: string;
  source: "builtin" | "custom";
  hidden: boolean;
  kind: DocTemplateKind;
}

/** Metadados fixos dos 4 modelos originais do KIT de assinatura. */
export const BUILTIN_SIGNATURE_TEMPLATES = [
  {
    file: "KIT_PREV_CSS_ASSINATURA.docx",
    slug: "kit",
    label: "KIT previdenciário — procuração e contrato",
    fileName: "KIT previdenciário (assinado).pdf",
  },
  {
    file: "PROCURAÇÃO-ESPECÍFICA_CURITIBA_ASSINATURA.docx",
    slug: "proc-curitiba",
    label: "Procuração específica — Curitiba",
    fileName: "Procuração específica Curitiba (assinada).pdf",
  },
  {
    file: "-PROCURAÇÃO-ESPECÍFICA-TAYNARA_ASSINATURA.docx",
    slug: "proc-taynara",
    label: "Procuração específica — Dra. Taynara",
    fileName: "Procuração específica Taynara (assinada).pdf",
  },
  {
    file: "DECLARACAO_DE_HIPOSSUFICIENCIA_ASSINATURA.docx",
    slug: "decl-hipossuficiencia",
    label: "Declaração de hipossuficiência",
    fileName: "Declaração de hipossuficiência (assinada).pdf",
  },
] as const;

function s3() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

/** Arquivos do repositório de cada grupo. */
export function builtinFilenames(kind: DocTemplateKind): string[] {
  try {
    if (kind === "assinatura") {
      // A ordem do KIT importa (é a ordem do PDF assinável) — vem do array
      // fixo, não do readdir.
      const dir = path.join(process.cwd(), "templates-assinatura");
      return BUILTIN_SIGNATURE_TEMPLATES.map((t) => t.file).filter((f) =>
        fs.existsSync(path.join(dir, f)),
      );
    }
    return fs
      .readdirSync(path.join(process.cwd(), "templates"))
      .filter((f) => f.endsWith(".docx") && !f.toUpperCase().includes("ASSINATURA"));
  } catch {
    return [];
  }
}

/** Lista completa (inclui ocultos) — para a tela de gestão. */
export async function listAllDocTemplates(
  kind: DocTemplateKind = "procuracao",
): Promise<DocTemplateInfo[]> {
  const rows = await db.docTemplate.findMany({ where: { kind } }).catch(() => []);
  const byFilename = new Map(rows.map((r) => [r.filename, r]));

  const signatureLabelOf = (filename: string) =>
    BUILTIN_SIGNATURE_TEMPLATES.find((t) => t.file === filename)?.label;

  // Fonte da verdade: a linha do banco com conteúdo em S3. É o caso normal
  // pós-migração — nenhum fallback pro arquivo físico aqui, pra não reativar
  // um modelo que já foi excluído de vez.
  const managed: DocTemplateInfo[] = rows
    .filter((r) => r.s3Key)
    .map((r) => ({
      filename: r.filename,
      label:
        r.label ||
        (kind === "assinatura" ? signatureLabelOf(r.filename) : undefined) ||
        r.filename.replace(/\.docx$/i, ""),
      source: "custom",
      hidden: r.hidden,
      kind,
    }));

  // Fallback só para o que ainda não passou pela migração pro banco (não
  // deveria sobrar nenhum depois de rodar scripts/migrate-templates-to-db.mjs).
  const unmigrated: DocTemplateInfo[] = builtinFilenames(kind)
    .filter((f) => !byFilename.get(f)?.s3Key)
    .map((filename) => {
      const row = byFilename.get(filename);
      return {
        filename,
        label:
          row?.label ||
          (kind === "assinatura" ? signatureLabelOf(filename) : undefined) ||
          filename.replace(/\.docx$/i, ""),
        source: "builtin",
        hidden: row?.hidden ?? false,
        kind,
      };
    });

  const all = [...managed, ...unmigrated];

  // Procuração: ordem alfabética (é um seletor). Assinatura: sortOrder (é a
  // ordem do PDF final do KIT).
  if (kind === "procuracao") {
    return all.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }
  const orderOf = (filename: string) => byFilename.get(filename)?.sortOrder ?? 9999;
  return all.sort((a, b) => orderOf(a.filename) - orderOf(b.filename));
}

/** Só os visíveis — seletor do "Gerar Procuração" / montagem do KIT. */
export async function listVisibleDocTemplates(
  kind: DocTemplateKind = "procuracao",
): Promise<DocTemplateInfo[]> {
  return (await listAllDocTemplates(kind)).filter((t) => !t.hidden);
}

/** Slug estável de um modelo custom do KIT (entra em SignaturePart.slug). */
export function customSignatureSlug(filename: string): string {
  return (
    "custom-" +
    filename
      .replace(/\.docx$/i, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
  ).slice(0, 60);
}

/**
 * Carrega os bytes de um modelo pelo filename: S3 quando é um modelo enviado
 * pela equipe, disco quando é do repositório.
 */
export async function loadDocTemplateBuffer(
  filename: string,
  kind: DocTemplateKind = "procuracao",
): Promise<Buffer> {
  const row = await db.docTemplate.findUnique({ where: { filename } }).catch(() => null);
  if (row?.s3Key) {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: row.s3Key }),
    );
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  // ATENÇÃO: prefixo literal em cada ramo por causa do file tracing da Vercel
  // (ver gerarProcuracao.ts) — não montar o path com variável de diretório.
  return kind === "assinatura"
    ? fs.readFileSync(path.join(process.cwd(), "templates-assinatura", filename))
    : fs.readFileSync(path.join(process.cwd(), "templates", filename));
}
