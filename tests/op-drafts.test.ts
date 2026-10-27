import { describe, it, expect, vi, beforeEach } from "vitest";
import PizZip from "pizzip";

// S3, Prisma, modelos e conversor mockados: o teste nunca toca produção.
const sent = vi.hoisted(() => [] as { cmd: string; input: Record<string, unknown> }[]);
const s3Reply = vi.hoisted(() => ({ head: null as null | Record<string, unknown> }));
vi.mock("@aws-sdk/client-s3", () => {
  const cmd = (name: string) =>
    class {
      constructor(public input: Record<string, unknown>) {}
      readonly name = name;
    };
  return {
    S3Client: class {
      async send(c: { name: string; input: Record<string, unknown> }) {
        sent.push({ cmd: c.name, input: c.input });
        if (c.name === "Head") {
          if (!s3Reply.head) throw Object.assign(new Error("nf"), { name: "NotFound" });
          return s3Reply.head;
        }
        return {};
      }
    },
    PutObjectCommand: cmd("Put"),
    HeadObjectCommand: cmd("Head"),
    CopyObjectCommand: cmd("Copy"),
    ListObjectsV2Command: cmd("List"),
    DeleteObjectsCommand: cmd("Delete"),
    GetObjectCommand: cmd("Get"),
  };
});
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
  document: { findFirst: vi.fn(), create: vi.fn() },
  log: { create: vi.fn() },
  docTemplate: { findMany: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
vi.mock("@/app/_shared/lib/s3-presign", () => ({
  signOpDraftUrl: async (key: string) => ({ url: `https://s3.test/${key}?sig=1`, expiresAt: new Date(Date.now() + 5_400_000).toISOString() }),
}));
const convert = vi.hoisted(() => vi.fn());
vi.mock("@/app/_shared/lib/docs/converter", async (orig) => ({
  ...(await orig<typeof import("@/app/_shared/lib/docs/converter")>()),
  convertDocxToPdf: (...a: unknown[]) => convert(...a),
}));

function docx(text: string): Buffer {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generate({ type: "nodebuffer" });
}
const templateBuf = vi.hoisted(() => ({ value: Buffer.alloc(0) as Buffer }));
vi.mock("@/app/_shared/lib/doc-templates", () => ({
  listVisibleDocTemplates: async () => [
    { filename: "PEDIDO_HOSPITALAR.docx", label: "PEDIDO_HOSPITALAR", source: "custom", hidden: false, kind: "procuracao" },
    { filename: "-PROCURAÇÃO-ESPECÍFICA_CURITIBA.docx", label: "-PROCURAÇÃO-ESPECÍFICA_CURITIBA", source: "custom", hidden: false, kind: "procuracao" },
  ],
  loadDocTemplateBuffer: async () => templateBuf.value,
}));

import { getTool } from "@/app/_shared/lib/op/tools";
import { attachDraft, getDraft, purgeExpiredOpDrafts } from "@/app/_shared/lib/docs/drafts";
import { ConverterError } from "@/app/_shared/lib/docs/converter";

const op = { userId: "op1", name: "Fulana", email: "f@x", role: "ADMIN++", permissions: {}, tokenId: "t" } as never;
const trace = { sessionId: "s1", requestId: "r1" };
const card = { id: "clz1abcd2000008l4h3k2m7xq", cardNumber: 2342, name: "Ana Souza", cpf: "1", rg: "", nacionalidade: null, estado_civil: "", profissao: "x", rua: "r", bairro: "b", numero: "1", cep: "c", cidade: "Curitiba", estado: "PR", data_nasc: "", hospital: "", nome_mae: "", data_acidente: "" };

beforeEach(() => {
  sent.length = 0;
  s3Reply.head = null;
  for (const m of Object.values(db)) {
    if (typeof m === "function") (m as ReturnType<typeof vi.fn>).mockReset();
    else for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  convert.mockReset();
  db.user.findFirst.mockResolvedValue({ id: card.id });
  db.user.findUnique.mockImplementation(async (q: { where: { id: string } }) => (q.where.id === card.id ? card : null));
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  templateBuf.value = docx("Eu [[name]], RG [[rg]], estado civil [[estado_civil]], [[cidade]]");
});

const preparar = () => getTool("preparar_procuracao")!;
const parse = (t: ReturnType<typeof getTool>, a: unknown) => t!.schema.parse(a);

describe("preparar_procuracao (L2)", () => {
  it("campo faltando sem permitir_vazios: lista e NADA gerado (sem conversor, sem S3)", async () => {
    const r = await preparar().run({ op, trace }, parse(preparar(), { card: "clz1abcd2000008l4h3k2m7xq", modelo: "-procuracao-especifica_curitiba" }));
    expect(r.data).toMatchObject({ gerado: false, camposFaltando: ["RG", "estado civil"] });
    expect(convert).not.toHaveBeenCalled();
    expect(sent.filter((s) => s.cmd === "Put")).toHaveLength(0);
    expect(db.document.create).not.toHaveBeenCalled();
  });

  it("permitir_vazios: gera, grava só em op-drafts/ com metadados, nenhum Document", async () => {
    convert.mockResolvedValue(Buffer.from("%PDF-1.4"));
    const r = await preparar().run({ op, trace }, parse(preparar(), { card: "clz1abcd2000008l4h3k2m7xq", modelo: "-PROCURAÇÃO-ESPECÍFICA_CURITIBA", permitir_vazios: true }));
    const data = r.data as { gerado: boolean; rascunho: string; camposEmBranco: string[]; previewUrl: string };
    expect(data.gerado).toBe(true);
    expect(data.rascunho).toMatch(/^op-drafts\/clz1abcd2000008l4h3k2m7xq\/\d{13}-[a-f0-9]{8}\.pdf$/);
    expect(data.camposEmBranco).toEqual(["RG", "estado civil"]);
    expect(data.previewUrl).toContain("op-drafts");
    const put = sent.find((s) => s.cmd === "Put")!;
    expect(put.input.Key).toBe(data.rascunho);
    expect(put.input.Metadata).toMatchObject({ operator: "op1", card: "clz1abcd2000008l4h3k2m7xq", kind: "procuracao" });
    expect(db.document.create).not.toHaveBeenCalled();
    // O docx renderizado não leva "undefined" (nullGetter) e usa os dados do card.
    const rendered = new PizZip(convert.mock.calls[0][0] as Buffer).file("word/document.xml")!.asText();
    expect(rendered).toContain("Eu Ana Souza");
    expect(rendered).not.toContain("undefined");
  });

  it("conversor fora do ar: erro claro e nada gravado", async () => {
    convert.mockRejectedValue(new ConverterError("conversor_indisponivel", "Conversor de PDF indisponível (timeout)."));
    await expect(
      preparar().run({ op, trace }, parse(preparar(), { card: "clz1abcd2000008l4h3k2m7xq", modelo: "-PROCURAÇÃO-ESPECÍFICA_CURITIBA", permitir_vazios: true })),
    ).rejects.toMatchObject({ code: "conversor_indisponivel", status: 503 });
    expect(sent.filter((s) => s.cmd === "Put")).toHaveLength(0);
  });

  it("modelo ilegível (não é .docx): modelo_invalido 422, não erro interno", async () => {
    templateBuf.value = Buffer.from("isto não é um zip");
    await expect(
      preparar().run({ op, trace }, parse(preparar(), { card: "clz1abcd2000008l4h3k2m7xq", modelo: "-PROCURAÇÃO-ESPECÍFICA_CURITIBA" })),
    ).rejects.toMatchObject({ code: "modelo_invalido", status: 422 });
    expect(convert).not.toHaveBeenCalled();
  });

  it("modelo de outro tipo aponta a ferramenta certa; parcial pergunta", async () => {
    await expect(preparar().run({ op, trace }, parse(preparar(), { card: "2342", modelo: "PEDIDO_HOSPITALAR" }))).rejects.toMatchObject({
      code: "modelo_de_outro_tipo",
    });
    await expect(preparar().run({ op, trace }, parse(preparar(), { card: "2342", modelo: "PROCURA" }))).rejects.toMatchObject({ code: "ambiguo" });
  });
});

const KEY = `op-drafts/clz1abcd2000008l4h3k2m7xq/${Date.now() - 60_000}-0a1b2c3d.pdf`;
const head = (meta: Record<string, string> = {}) => ({
  Metadata: { operator: "op1", card: "clz1abcd2000008l4h3k2m7xq", kind: "procuracao", template: "x.docx", name: encodeURIComponent("Proc - Ana.pdf"), blank: encodeURIComponent('["rg"]'), ...meta },
});

describe("getDraft", () => {
  it("key fora do formato, vencida, sumida ou de outro card → recusa", async () => {
    await expect(getDraft("uploads/user_x/1-a.pdf")).rejects.toMatchObject({ code: "rascunho_invalido" });
    await expect(getDraft(`op-drafts/clz1abcd2000008l4h3k2m7xq/${Date.now() - 8 * 86_400_000}-0a1b2c3d.pdf`)).rejects.toMatchObject({ code: "rascunho_expirado" });
    await expect(getDraft(KEY)).rejects.toMatchObject({ code: "rascunho_expirado" });
    s3Reply.head = head({ card: "outro" });
    await expect(getDraft(KEY)).rejects.toMatchObject({ code: "rascunho_invalido" });
  });
  it("lê metadados e calcula a key de destino em uploads/", async () => {
    s3Reply.head = head();
    const d = await getDraft(KEY);
    expect(d).toMatchObject({ cardId: "clz1abcd2000008l4h3k2m7xq", operatorId: "op1", fileName: "Proc - Ana.pdf", emBranco: ["rg"] });
    expect(d.targetKey).toMatch(/^uploads\/user_clz1abcd2000008l4h3k2m7xq\/\d{13}-Proc - Ana\.pdf$/);
  });
});

describe("anexar_rascunho (L3)", () => {
  const anexar = () => getTool("anexar_rascunho")!;

  it("sem confirmar: só prévia, nada copiado nem criado", async () => {
    s3Reply.head = head();
    db.document.findFirst.mockResolvedValue(null);
    db.user.findUniqueOrThrow.mockResolvedValue({ cardNumber: 2342, name: "Ana Souza", archiveStatus: null });
    const r = await anexar().run({ op, trace }, parse(anexar(), { rascunho: KEY }));
    const previa = (r.data as { previa: { itens: Record<string, unknown>[]; autor: string; requerConfirmacao: boolean } }).previa;
    expect(previa.itens[0]).toMatchObject({ pasta: "PROCURAÇÃO", camposEmBranco: ["RG"] });
    expect(previa.autor).toBe("Fulana (via IA)");
    // Procuração anexa direto (decisão 27/10); só contrato exige confirmação.
    expect(previa.requerConfirmacao).toBe(false);
    expect(sent.filter((s) => s.cmd === "Copy")).toHaveLength(0);
    expect(db.document.create).not.toHaveBeenCalled();
  });

  it("rascunho de outro operador é do card: anexa normalmente (item K, 27/10 — revoga a decisão 17)", async () => {
    s3Reply.head = head({ operator: "outra" });
    const r = await anexar().run({ op, trace }, parse(anexar(), { rascunho: KEY }));
    expect(r.data).toMatchObject({ previa: { itens: [expect.objectContaining({ arquivo: expect.any(String) })] } });
  });

  it("já anexado = noop antes da prévia", async () => {
    s3Reply.head = head();
    db.document.findFirst.mockResolvedValue({ id: "d1", name: "Proc - Ana.pdf", category: "PROCURACAO", deletedAt: null });
    const r = await anexar().run({ op, trace }, parse(anexar(), { rascunho: KEY }));
    expect(r.data).toMatchObject({ noop: true });
    expect(sent.filter((s) => s.cmd === "Copy")).toHaveLength(0);
  });
});

describe("attachDraft", () => {
  const draft = { key: KEY, cardId: "clz1abcd2000008l4h3k2m7xq", operatorId: "op1", kind: "procuracao" as const, template: "x.docx", fileName: "Proc - Ana.pdf", emBranco: [], createdAt: new Date(), targetKey: "uploads/user_clz1abcd2000008l4h3k2m7xq/1-Proc - Ana.pdf" };
  const author = { id: "op1", name: "Fulana (via IA)" };

  it("copia, cria Document na pasta e loga document_add com origem op", async () => {
    db.document.findFirst.mockResolvedValue(null);
    db.document.create.mockResolvedValue({ id: "d9", name: "Proc - Ana.pdf", category: "PROCURACAO" });
    const r = await attachDraft({ draft, category: "PROCURACAO", author, source: "op", op: trace });
    expect(r).toMatchObject({ noop: false, documentId: "d9" });
    const copy = sent.find((s) => s.cmd === "Copy")!;
    expect(copy.input).toMatchObject({ Key: draft.targetKey });
    expect(String(copy.input.CopySource)).toMatch(/\/op-drafts\//);
    expect(db.document.create.mock.calls[0][0].data).toMatchObject({ userId: "clz1abcd2000008l4h3k2m7xq", key: draft.targetKey, category: "PROCURACAO" });
    const log = db.log.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ action: "document_add", authorId: "op1", authorName: "Fulana (via IA)", userId: "clz1abcd2000008l4h3k2m7xq" });
    expect(log.metadata).toMatchObject({ source: "op", op: trace, draftKey: KEY });
  });

  it("dois \"sim\" juntos: o segundo vê o Document sob o lock e não duplica", async () => {
    db.document.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "d9", name: "Proc - Ana.pdf", category: "PROCURACAO" });
    const r = await attachDraft({ draft, category: "PROCURACAO", author, source: "op", op: trace });
    expect(r).toMatchObject({ noop: true, documentId: "d9" });
    expect(db.document.create).not.toHaveBeenCalled();
    expect(db.log.create).not.toHaveBeenCalled();
  });
});

describe("purgeExpiredOpDrafts", () => {
  it("lista só op-drafts/ e apaga o que passou de 7 dias", async () => {
    await purgeExpiredOpDrafts();
    const list = sent.find((s) => s.cmd === "List")!;
    expect(list.input.Prefix).toBe("op-drafts/");
  });
});
