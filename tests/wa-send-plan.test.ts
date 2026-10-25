import { describe, it, expect } from "vitest";
import { planWhatsAppSend, samePhoneBR, type WaPlanInput } from "@/app/_shared/utils/wa-send-plan";

const tpl = { name: "aviso_link", status: "APPROVED", category: "UTILITY", headerText: null, headerFormat: null, headerMediaKey: null, bodyVars: 1, bodyPreview: "Olá {{1}}" };
const ok: WaPlanInput = {
  contact: { optedOut: false, optedInAt: new Date("2026-09-01") },
  number: { active: true, templatesPaused: false },
  inCooldown: false,
  windowOpen: true,
  mode: "texto",
};

describe("plano do WhatsApp preparado pela IA", () => {
  it("texto com a janela aberta sai como texto", () => {
    expect(planWhatsAppSend(ok)).toEqual({ ok: true, via: "text" });
  });

  it("opt-out, linha inativa e cooldown barram já na prévia", () => {
    expect(planWhatsAppSend({ ...ok, contact: { ...ok.contact, optedOut: true } })).toMatchObject({ ok: false, code: "opt_out" });
    expect(planWhatsAppSend({ ...ok, number: { active: false, templatesPaused: false } })).toMatchObject({ ok: false, code: "linha_inativa" });
    expect(planWhatsAppSend({ ...ok, inCooldown: true })).toMatchObject({ ok: false, code: "cooldown" });
  });

  it("janela fechada: texto não sai; só template", () => {
    expect(planWhatsAppSend({ ...ok, windowOpen: false })).toMatchObject({ ok: false, code: "janela_fechada" });
    expect(planWhatsAppSend({ ...ok, windowOpen: false, mode: "template", template: tpl, varsCount: 1 })).toEqual({ ok: true, via: "template" });
  });

  it("template: só APPROVED da WABA, variáveis exatas, opt-in, pausa e cabeçalho", () => {
    const fora = { ...ok, windowOpen: false, mode: "template" as const, varsCount: 1 };
    expect(planWhatsAppSend({ ...fora, template: null })).toMatchObject({ code: "template_nao_encontrado" });
    expect(planWhatsAppSend({ ...fora, template: { ...tpl, status: "PENDING" } })).toMatchObject({ code: "template_nao_aprovado" });
    expect(planWhatsAppSend({ ...fora, template: tpl, varsCount: 0 })).toMatchObject({ code: "variaveis_erradas" });
    expect(planWhatsAppSend({ ...fora, template: tpl, contact: { optedOut: false, optedInAt: null } })).toMatchObject({ code: "sem_opt_in" });
    expect(planWhatsAppSend({ ...fora, template: tpl, number: { active: true, templatesPaused: true } })).toMatchObject({ code: "templates_pausados" });
    expect(planWhatsAppSend({ ...fora, template: { ...tpl, headerText: "Oi {{1}}" } })).toMatchObject({ code: "template_cabecalho_variavel" });
    expect(planWhatsAppSend({ ...fora, template: { ...tpl, headerFormat: "IMAGE" } })).toMatchObject({ code: "template_sem_midia" });
    expect(planWhatsAppSend({ ...fora, template: { ...tpl, bodyPreview: null } })).toMatchObject({ code: "template_sem_texto" });
    // MARKETING foi a causa nº 1 do aviso de spam (auditoria 24/08): a IA não manda.
    expect(planWhatsAppSend({ ...fora, template: { ...tpl, category: "MARKETING" } })).toMatchObject({ code: "template_categoria" });
    expect(planWhatsAppSend({ ...ok, mode: "template", varsCount: 1, template: { ...tpl, category: "AUTHENTICATION" } })).toMatchObject({ code: "template_categoria" });
  });

  it("template com a janela aberta sai como texto preenchido (como o sendSystemWhatsApp)", () => {
    const r = planWhatsAppSend({ ...ok, mode: "template", template: tpl, varsCount: 1 });
    expect(r).toMatchObject({ ok: true, via: "text" });
  });

  it("templatesPaused não barra texto dentro da janela (pausa é só de template)", () => {
    expect(planWhatsAppSend({ ...ok, number: { active: true, templatesPaused: true } })).toEqual({ ok: true, via: "text" });
  });
});

describe("telefone do contato × telefone do card", () => {
  it("mesmo DDD e 8 últimos dígitos (com ou sem 55 e 9º dígito)", () => {
    expect(samePhoneBR("5541999990000", "(41) 99999-0000")).toBe(true);
    expect(samePhoneBR("554199990000", "41 9 9999-0000")).toBe(true);
  });
  it("outro DDD, sem DDD ou vazio não casa", () => {
    expect(samePhoneBR("5511999990000", "(41) 99999-0000")).toBe(false);
    expect(samePhoneBR("5541999990000", "99999-0000")).toBe(false);
    expect(samePhoneBR(null, "41999990000")).toBe(false);
  });
});
