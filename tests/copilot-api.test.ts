import { describe, expect, it } from "vitest";
import type { ClientDocumentDTO, ClientInfoResult, CopilotResponse } from "@/app/_shared/lib/whatsapp/copilot-types";
import { INBOX_COPILOT_URL, copilotUrl, patchCopilot, readCopilot } from "@/app/_shared/utils/copilot-api";

// Rota da coluna Copiloto (ficha + documentos numa ida, GET): endereço, leitura
// da resposta e troca no cache depois de uma mutação. Resposta 2xx fora do
// formato LANÇA: o SWR guarda o erro e mantém a ficha que estava na tela, em
// vez de guardar lixo como "cliente sem card".

const info = (over: Partial<ClientInfoResult> = {}): ClientInfoResult => ({
  registered: true,
  userId: "u1",
  phone: "5541999990000",
  cardNumber: 12,
  fields: { name: "Cliente Teste" },
  aiFields: ["cpf"],
  hospitalHint: null,
  ...over,
});

const doc = (id: string): ClientDocumentDTO => ({
  id,
  key: `uploads/user_u1/${id}.pdf`,
  name: `${id}.pdf`,
  uploadedAt: "2026-09-26T12:00:00.000Z",
  url: null,
  urlExpiresAt: null,
});

describe("copilotUrl", () => {
  it("rota da equipe fora de /api/whatsapp/webhook, /cron e /brain-prompt (allowlists do middleware)", () => {
    expect(INBOX_COPILOT_URL.startsWith("/api/whatsapp/inbox/")).toBe(true);
    expect(copilotUrl("abc123")).toBe("/api/whatsapp/inbox/copilot/abc123");
  });

  it("o contactId vai codificado no caminho (não escapa para outra rota)", () => {
    expect(copilotUrl("a/b")).toBe("/api/whatsapp/inbox/copilot/a%2Fb");
    expect(copilotUrl("x?y=1#z")).toBe("/api/whatsapp/inbox/copilot/x%3Fy%3D1%23z");
    expect(copilotUrl("..")).toBe("/api/whatsapp/inbox/copilot/..");
  });
});

describe("readCopilot", () => {
  it("devolve a ficha e os documentos", () => {
    const body: CopilotResponse = { clientInfo: info(), documents: [doc("d1")] };
    expect(readCopilot(body)).toEqual(body);
  });

  it("aceita rascunho (sem card) e lista vazia", () => {
    const body = { clientInfo: info({ registered: false, userId: null, cardNumber: null }), documents: [] };
    expect(readCopilot(body)).toEqual(body);
  });

  it("aiFields ausente vira lista vazia (o selo some, a ficha não quebra)", () => {
    const semAi: Partial<ClientInfoResult> = info();
    delete semAi.aiFields;
    const out = readCopilot({ clientInfo: semAi, documents: [] });
    expect(out.clientInfo.aiFields).toEqual([]);
    expect(out.clientInfo.fields).toEqual({ name: "Cliente Teste" });
  });

  it.each([
    ["null", null],
    ["array cru", [info()]],
    ["{ error } com 200", { error: "Falha ao carregar. Tente de novo." }],
    ["sem documents", { clientInfo: info() }],
    ["documents não-array", { clientInfo: info(), documents: {} }],
    ["sem clientInfo", { documents: [] }],
    ["formato antigo (a ficha crua da action)", info()],
    ["registered não-booleano", { clientInfo: { ...info(), registered: "sim" }, documents: [] }],
    ["sem phone", { clientInfo: { ...info(), phone: undefined }, documents: [] }],
    ["fields não-objeto", { clientInfo: { ...info(), fields: null }, documents: [] }],
  ])("formato errado (%s) lança", (_nome, body) => {
    expect(() => readCopilot(body)).toThrow("Resposta inválida");
  });
});

describe("patchCopilot", () => {
  const base: CopilotResponse = { clientInfo: info(), documents: [doc("d1")] };

  it("sem nada no cache devolve undefined (quem chama busca de novo)", () => {
    expect(patchCopilot(undefined, { documents: [doc("d2")] })).toBeUndefined();
  });

  it("troca só os documentos e mantém a ficha", () => {
    const out = patchCopilot(base, { documents: [doc("d1"), doc("d2")] });
    expect(out?.documents.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(out?.clientInfo).toBe(base.clientInfo);
  });

  it("troca só a ficha e mantém os documentos", () => {
    const next = info({ fields: { name: "Nome Corrigido" } });
    const out = patchCopilot(base, { clientInfo: next });
    expect(out?.clientInfo).toBe(next);
    expect(out?.documents).toBe(base.documents);
  });

  it("não altera o objeto do cache (o SWR compara por referência)", () => {
    const out = patchCopilot(base, { documents: [] });
    expect(out).not.toBe(base);
    expect(base.documents).toHaveLength(1);
  });

  it("chave presente com undefined não apaga o que havia", () => {
    const out = patchCopilot(base, { documents: undefined });
    expect(out?.documents).toBe(base.documents);
  });
});
