import { describe, it, expect, vi, beforeEach } from "vitest";

// Tudo mockado: banco, S3, SES e WhatsApp. Nada sai, nada é gravado.
const s3 = vi.hoisted(() => ({ heads: {} as Record<string, { ETag: string; ContentLength: number } | null>, gets: [] as string[] }));
vi.mock("@aws-sdk/client-s3", () => {
  const cmd = (name: string) =>
    class {
      constructor(public input: { Key: string }) {}
      readonly name = name;
    };
  return {
    S3Client: class {
      async send(c: { name: string; input: { Key: string } }) {
        if (c.name === "Head") {
          const h = s3.heads[c.input.Key];
          if (!h) throw Object.assign(new Error("nf"), { name: "NotFound" });
          return h;
        }
        s3.gets.push(c.input.Key);
        return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } };
      }
    },
    HeadObjectCommand: cmd("Head"),
    GetObjectCommand: cmd("Get"),
  };
});
const db = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
  document: { findMany: vi.fn() },
  whatsAppContact: { findMany: vi.fn(), findUnique: vi.fn() },
  whatsAppNumber: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  whatsAppTemplate: { findFirst: vi.fn() },
  whatsAppMessage: { findFirst: vi.fn() },
}));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
const ses = vi.hoisted(() => ({ configured: true, sendRaw: vi.fn() }));
vi.mock("@/app/_shared/lib/aws-messaging", () => ({
  isAwsEmailConfigured: () => ses.configured,
  sendEmailRawAws: (...a: unknown[]) => ses.sendRaw(...a),
  RAW_EMAIL_MAX_ATTACHMENT_BYTES: 10 * 1024 * 1024,
}));
const wa = vi.hoisted(() => ({ block: null as null | string, window: true, send: vi.fn() }));
vi.mock("@/app/_shared/lib/whatsapp/outbound", () => ({
  systemSendBlockReason: async () => wa.block,
  isWindowOpen: async () => wa.window,
  sendSystemWhatsApp: (...a: unknown[]) => wa.send(...a),
}));
const hosp = vi.hoisted(() => ({ email: "samelaudos@hosp.org.br" as string | null }));
vi.mock("@/app/_shared/lib/op/hospitais", () => ({
  hospitalContactFor: async () => ({ ghost: null, cadastro: null, email: hosp.email, fonteEmail: hosp.email ? "cadastro" : null, notaCaminho: null }),
}));
vi.mock("@/app/_shared/lib/op/cards", () => ({ resolveOneCardId: async () => "card1" }));
const contacts = vi.hoisted(() => ({ ids: ["ct1"] as string[] }));
vi.mock("@/app/_shared/lib/op/tools/consultar-conversa", () => ({ contactIdsForCard: async () => contacts.ids }));
const drafts = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/app/_shared/lib/docs/drafts", () => ({
  getDraft: (...a: unknown[]) => drafts.get(...a),
  DraftError: class extends Error { code = "rascunho_invalido"; },
}));
const writes = vi.hoisted(() => ({ comment: vi.fn(), log: vi.fn() }));
vi.mock("@/app/_shared/lib/cards/comment", () => ({ addCardComment: (...a: unknown[]) => writes.comment(...a) }));
vi.mock("@/app/_shared/lib/log", () => ({ createLog: (...a: unknown[]) => writes.log(...a) }));

import { precheckEmail, prepareEmail, prepareWhatsapp, sendApprovedEmail, sendApprovedWhatsapp } from "@/app/_shared/lib/op/comms";

const op = { userId: "op1", name: "Fulana", email: "f@x", role: "ADMIN++", permissions: {}, tokenId: "t" } as never;
const trace = { sessionId: "s1", requestId: "r1" };
const DRAFT = "op-drafts/card1/1761350400000-0a1b2c3d.pdf";

beforeEach(() => {
  for (const m of Object.values(db)) for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockReset();
  ses.configured = true;
  ses.sendRaw.mockReset().mockResolvedValue({ sent: true, id: "ses-1" });
  wa.block = null;
  wa.window = true;
  wa.send.mockReset().mockResolvedValue({ sent: true, via: "text" });
  hosp.email = "samelaudos@hosp.org.br";
  contacts.ids = ["ct1"];
  drafts.get.mockReset().mockResolvedValue({ key: DRAFT, cardId: "card1", operatorId: "op1", fileName: "Pedido Ana.pdf" });
  writes.comment.mockReset().mockResolvedValue({ id: "cm1" });
  writes.log.mockReset();
  s3.heads = { [DRAFT]: { ETag: '"e1"', ContentLength: 2048 } };
  s3.gets = [];
  db.user.findUniqueOrThrow.mockResolvedValue({ id: "card1", cardNumber: 2342, name: "Ana", hospital: "HOSP X", archiveStatus: null, telefone: "41999990000" });
  db.user.findMany.mockResolvedValue([{ email: "equipe@segurosparana.com.br" }]);
  db.whatsAppContact.findMany.mockResolvedValue([{ id: "ct1", phone: "5541999990000", name: "Ana", optedOut: false, optedInAt: new Date("2026-09-01"), numberId: "n1" }]);
  db.whatsAppNumber.findUnique.mockResolvedValue({ id: "n1", label: "Seguros Paraná IA", active: true, templatesPaused: false });
  db.whatsAppMessage.findFirst.mockResolvedValue({ createdAt: new Date() });
});

const email = (over: Record<string, unknown> = {}) => prepareEmail({ op, card: "2342", assunto: "Pedido de prontuário", corpo: "Bom dia.", anexos: [DRAFT], ...over });

describe("preparar e-mail", () => {
  it("padrão = e-mail do cadastro do hospital, anexo com ETag, sem aviso de fora do cadastro", async () => {
    const { args, previa } = await email();
    expect(args).toMatchObject({ para: "samelaudos@hosp.org.br", destinoLivre: false, cc: [] });
    expect(args.anexos).toEqual([{ origem: "rascunho", key: DRAFT, nome: "Pedido Ana.pdf", bytes: 2048, etag: '"e1"' }]);
    expect(previa.destinoForaDoCadastro).toBe(false);
  });

  it("endereço digitado diferente do cadastro sai marcado e avisado", async () => {
    const { args, previa } = await email({ para: "Outro@Gmail.com" });
    expect(args).toMatchObject({ para: "outro@gmail.com", destinoLivre: true });
    expect((previa.avisos as string[]).join(" ")).toMatch(/FORA DO CADASTRO/);
  });

  it("cc da equipe não é fora do cadastro; cc de fora é", async () => {
    expect((await email({ cc: ["equipe@segurosparana.com.br"] })).args.destinoLivre).toBe(false);
    expect((await email({ cc: ["alguem@gmail.com"] })).args.destinoLivre).toBe(true);
  });

  it("sem cadastro e sem para → sem_destinatario; SES desligado → email_nao_configurado", async () => {
    hosp.email = null;
    await expect(email()).rejects.toMatchObject({ code: "sem_destinatario" });
    ses.configured = false;
    await expect(email()).rejects.toMatchObject({ code: "email_nao_configurado" });
  });

  it("anexo: rascunho de outro operador, documento fora de uploads/, soma > 10 MB", async () => {
    drafts.get.mockResolvedValue({ key: DRAFT, cardId: "card1", operatorId: "op2", fileName: "x.pdf" });
    await expect(email()).rejects.toMatchObject({ code: "sem_permissao" });
    db.document.findMany.mockResolvedValue([{ id: "d1", key: "whatsapp/ct1/x.jpg", name: "foto.jpg" }]);
    await expect(email({ anexos: ["foto.jpg"] })).rejects.toMatchObject({ code: "anexo_invalido" });
    drafts.get.mockResolvedValue({ key: DRAFT, cardId: "card1", operatorId: "op1", fileName: "x.pdf" });
    s3.heads[DRAFT] = { ETag: '"e1"', ContentLength: 11 * 1024 * 1024 };
    await expect(email()).rejects.toMatchObject({ code: "anexos_grandes" });
  });

  it("assunto com quebra de linha é recusado", async () => {
    await expect(email({ assunto: "Oi\nBcc: x@y.com" })).rejects.toMatchObject({ code: "argumentos_invalidos" });
  });
});

describe("enviar e-mail aprovado", () => {
  it("anexo mudou desde a preparação → hash_diferente", async () => {
    const { args } = await email();
    s3.heads[DRAFT] = { ETag: '"e2"', ContentLength: 2048 };
    await expect(precheckEmail(args)).rejects.toMatchObject({ code: "hash_diferente" });
  });

  it("lê os anexos do S3, manda pelo SES Raw e registra comentário + op_send com o approvalId", async () => {
    const { args } = await email({ cc: ["equipe@segurosparana.com.br"] });
    const r = await sendApprovedEmail({ args, op, trace, approvalId: "apr1" });
    expect(r).toEqual({ sent: true, id: "ses-1" });
    expect(s3.gets).toEqual([DRAFT]);
    expect(ses.sendRaw.mock.calls[0][0]).toMatchObject({ to: ["samelaudos@hosp.org.br"], cc: ["equipe@segurosparana.com.br"], subject: "Pedido de prontuário" });
    expect(writes.comment.mock.calls[0][0]).toMatchObject({ cardId: "card1", source: "op", author: { id: "op1", name: "Fulana (via IA)" } });
    expect(writes.log.mock.calls[0][0]).toMatchObject({ action: "op_send", userId: "card1", metadata: { source: "op", canal: "email", approvalId: "apr1" } });
  });

  it("SES recusou → nada registrado no card", async () => {
    ses.sendRaw.mockResolvedValue({ sent: false, error: "bounce" });
    const { args } = await email();
    expect(await sendApprovedEmail({ args, op, trace, approvalId: "apr1" })).toEqual({ sent: false, error: "bounce" });
    expect(writes.comment).not.toHaveBeenCalled();
    expect(writes.log).not.toHaveBeenCalled();
  });
});

describe("preparar WhatsApp", () => {
  it("texto na janela: pela linha do contato", async () => {
    const { args, previa } = await prepareWhatsapp({ op, card: "2342", texto: "Oi Ana, segue o link." });
    expect(args).toMatchObject({ contactId: "ct1", numberId: "n1", modo: "texto", via: "text", textoFinal: "Oi Ana, segue o link.", linha: "Seguros Paraná IA" });
    expect(previa.janela24hAberta).toBe(true);
  });

  it("opt-out, cooldown e janela fechada barram na prévia", async () => {
    db.whatsAppContact.findMany.mockResolvedValue([{ id: "ct1", phone: "5541999990000", name: "Ana", optedOut: true, optedInAt: null, numberId: "n1" }]);
    await expect(prepareWhatsapp({ op, card: "2342", texto: "x" })).rejects.toMatchObject({ code: "opt_out" });
    db.whatsAppContact.findMany.mockResolvedValue([{ id: "ct1", phone: "5541999990000", name: "Ana", optedOut: false, optedInAt: new Date(), numberId: "n1" }]);
    wa.block = "cooldown";
    await expect(prepareWhatsapp({ op, card: "2342", texto: "x" })).rejects.toMatchObject({ code: "cooldown" });
    wa.block = "janela";
    wa.window = false;
    await expect(prepareWhatsapp({ op, card: "2342", texto: "x" })).rejects.toMatchObject({ code: "janela_fechada" });
  });

  it("template fora da janela na linha com templatesPaused → templates_pausados", async () => {
    wa.window = false;
    db.whatsAppNumber.findUnique.mockResolvedValue({ id: "n1", label: "DPVAT BOT", active: true, templatesPaused: true });
    db.whatsAppTemplate.findFirst.mockResolvedValue({ name: "aviso", status: "APPROVED", category: "UTILITY", headerText: null, headerFormat: null, headerMediaKey: null, bodyVars: 0, bodyPreview: "Olá", footerText: null });
    await expect(prepareWhatsapp({ op, card: "2342", template: "aviso" })).rejects.toMatchObject({ code: "templates_pausados" });
    // o catálogo consultado é o da linha do contato (ou o legado)
    expect(db.whatsAppTemplate.findFirst.mock.calls[0][0].where).toEqual({ name: "aviso", OR: [{ numberId: "n1" }, { numberId: null }] });
  });

  it("contato sem vínculo manual e telefone diferente do card → contato_nao_confirmado", async () => {
    db.whatsAppContact.findMany.mockResolvedValue([{ id: "ct1", phone: "5511999990000", name: "Outro", optedOut: false, optedInAt: null, numberId: "n1", userId: null }]);
    await expect(prepareWhatsapp({ op, card: "2342", texto: "x" })).rejects.toMatchObject({ code: "contato_nao_confirmado" });
    // vínculo manual ao card vale mesmo com telefone diferente
    db.whatsAppContact.findMany.mockResolvedValue([{ id: "ct1", phone: "5511999990000", name: "Ana", optedOut: false, optedInAt: null, numberId: "n1", userId: "card1" }]);
    const { previa } = await prepareWhatsapp({ op, card: "2342", texto: "x" });
    expect((previa.avisos as string[]).some((a) => a.includes("sem vínculo manual"))).toBe(false);
  });

  it("card com conversa em duas linhas → ambiguo com as opções", async () => {
    contacts.ids = ["ct1", "ct2"];
    db.whatsAppContact.findMany.mockResolvedValue([
      { id: "ct1", phone: "55", name: "Ana", optedOut: false, optedInAt: null, numberId: "n1" },
      { id: "ct2", phone: "55", name: "Ana", optedOut: false, optedInAt: null, numberId: "n2" },
    ]);
    db.whatsAppNumber.findMany.mockResolvedValue([]);
    await expect(prepareWhatsapp({ op, card: "2342", texto: "x" })).rejects.toMatchObject({ code: "ambiguo" });
  });
});

describe("enviar WhatsApp aprovado", () => {
  it("vai pelo sendSystemWhatsApp (todas as travas), contato exato, source op, sem pular cooldown", async () => {
    const { args } = await prepareWhatsapp({ op, card: "2342", texto: "Oi" });
    const r = await sendApprovedWhatsapp({ args, op, trace, approvalId: "apr2" });
    expect(r).toEqual({ sent: true, via: "text" });
    const input = wa.send.mock.calls[0][0];
    expect(input).toMatchObject({ contactId: "ct1", source: "op", text: "Oi", templateName: null, authorName: "Fulana (via IA)" });
    expect(input.transactional).toBeUndefined();
    expect(writes.log.mock.calls[0][0]).toMatchObject({ action: "op_send", metadata: { canal: "whatsapp", approvalId: "apr2" } });
  });

  it("bloqueado na hora do envio → sent false, nada no card", async () => {
    wa.send.mockResolvedValue({ sent: false, via: null, reason: "intervalo mínimo" });
    const { args } = await prepareWhatsapp({ op, card: "2342", texto: "Oi" });
    expect(await sendApprovedWhatsapp({ args, op, trace, approvalId: "apr2" })).toMatchObject({ sent: false });
    expect(writes.comment).not.toHaveBeenCalled();
  });
});
