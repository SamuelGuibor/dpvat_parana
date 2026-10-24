import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { brDate } from "../resolve";
import { resolveOneCardId } from "../cards";
import { trySignGetUrl } from "../../s3-presign";
import {
  DOCUMENT_CATEGORIES,
  categoryLabel,
  inferCategory,
  isDocumentCategory,
} from "../../document-categories";
import { cardRefSchema } from "./obter-card";

const PASTAS = DOCUMENT_CATEGORIES.map((c) => c.id) as [string, ...string[]];

const schema = z.object({
  card: cardRefSchema,
  pasta: z.enum(PASTAS).optional().describe("Só uma pasta (IDENTIFICACAO, PROCURACAO, HIPOSSUFICIENCIA, EXAME_MEDICO, DOCS_INSS, PROCESSO, ROTEIRO, OUTROS)."),
  comLinks: z.boolean().default(true).describe("Inclui link de leitura (válido ~90 min)."),
});

export const listarDocumentos = defineTool({
  name: "listar_documentos",
  description:
    "Arquivos do card por pasta (fora da lixeira), com data e link temporário para abrir. Pastas vazias aparecem com 0.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    const id = await resolveOneCardId(args.card);
    const docs = await db.document.findMany({
      where: { userId: id, deletedAt: null },
      orderBy: [{ sortOrder: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 300,
      select: { id: true, key: true, name: true, category: true, createdAt: true },
    });

    const byFolder = new Map<string, { nome: string; enviadoEm: string | null; link: string | null }[]>();
    for (const c of DOCUMENT_CATEGORIES) byFolder.set(c.id, []);
    for (const d of docs) {
      const folder = d.category && isDocumentCategory(d.category) ? d.category : inferCategory(d.name);
      if (args.pasta && folder !== args.pasta) continue;
      const signed = args.comLinks ? await trySignGetUrl(d.key, { fileName: d.name }) : null;
      byFolder.get(folder)?.push({ nome: d.name, enviadoEm: brDate(d.createdAt), link: signed?.url ?? null });
    }

    const pastas = [...byFolder.entries()]
      .filter(([folder]) => !args.pasta || folder === args.pasta)
      .map(([folder, arquivos]) => ({ pasta: folder, nome: categoryLabel(folder), total: arquivos.length, arquivos }));
    const total = pastas.reduce((n, p) => n + p.total, 0);
    return { data: { total, pastas }, summary: `${total} arquivo(s)`, cardIds: [id] };
  },
});
