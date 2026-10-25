import { describe, it, expect } from "vitest";
import {
  WORKFLOWS,
  block,
  campoKey,
  checkStep,
  containsPii,
  currentStep,
  finish,
  isStale,
  markDone,
  newState,
  nextStep,
  parseWorkflowState,
  resumePlan,
  workflowStateSchema,
  type ResumeFacts,
  type WorkflowState,
} from "@/app/_shared/utils/workflows";

const agora = new Date("2026-10-25T13:00:00Z");
const KEY_PEDIDO = "op-drafts/cmsp9hqlk0001l904y4fyvnku/1792900329052-11fe030d.pdf";
const KEY_PROC = "op-drafts/cmsp9hqlk0001l904y4fyvnku/1792900329999-0a1b2c3d.pdf";
const APR = "apr0123456789abcdef0123"; // hex com 11+ dígitos seguidos não é CPF
const DOC = "0f1e2d3c-4b5a-4968-8776-a12345678901"; // Document.id é uuid (11 dígitos seguidos no fim)

function base(workflow: WorkflowState["workflow"] = "prontuario"): WorkflowState {
  return newState({ workflow, card: { id: "cmsp9hqlk0001l904y4fyvnku", cardNumber: 4967, colunaId: "lab1" }, agora });
}

function fatos(over: Partial<ResumeFacts> = {}): ResumeFacts {
  return { rascunhos: {}, documentos: {}, aprovacoes: {}, registrosMudaram: [], card: { existe: true, arquivado: false, colunaMudou: false }, ...over };
}

/** prontuário até o e-mail preparado. */
function ateEmail(): WorkflowState {
  let s = base();
  s = markDone(s, "pendencias", { agora });
  s = markDone(s, "pedido", { refs: [KEY_PEDIDO], modelo: "PEDIDO_HOSPITALAR", agora });
  s = markDone(s, "anexar", { refs: [DOC], agora });
  s = markDone(s, "modo", { refs: ["email"], agora });
  s = markDone(s, "preparar_email", { refs: [APR], agora });
  return s;
}

describe("WORKFLOWS", () => {
  it("ordem dos passos é contrato com as skills", () => {
    expect(WORKFLOWS.prontuario.passos.map((p) => p.id)).toEqual([
      "card",
      "hospital",
      "pendencias",
      "pedido",
      "procuracao",
      "anexar",
      "modo",
      "preparar_email",
      "enviar",
      "tag",
      "mover",
    ]);
    expect(WORKFLOWS.procuracao.passos.map((p) => p.id)).toEqual(["card", "procuracao", "anexar"]);
    expect(WORKFLOWS.pedido_prontuario.passos.map((p) => p.id)).toEqual(["card", "hospital", "pedido", "anexar"]);
    expect(WORKFLOWS.contrato.passos.map((p) => p.id)).toEqual(["card", "contrato", "anexar", "zapsign", "comentar", "preparar_whatsapp", "enviar"]);
  });

  it("todo requer/quando aponta para passo anterior do mesmo workflow", () => {
    for (const def of Object.values(WORKFLOWS)) {
      const ids = def.passos.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      def.passos.forEach((p, i) => {
        for (const r of [...(p.requer ?? []), ...(p.quando ? [p.quando.passo] : [])]) {
          expect(ids.indexOf(r)).toBeGreaterThanOrEqual(0);
          expect(ids.indexOf(r)).toBeLessThan(i);
        }
        if (p.kind === "rascunho") expect(p.rascunho).toBeTruthy();
        if (p.kind === "aprovacao" || p.kind === "envio") expect(p.aprovacao).toBeTruthy();
      });
    }
  });
});

describe("estado", () => {
  it("schema aceita o estado normal e recusa versão desconhecida", () => {
    expect(workflowStateSchema.safeParse(ateEmail()).success).toBe(true);
    expect(parseWorkflowState({ ...ateEmail(), v: 2 })).toBeNull();
    expect(parseWorkflowState(null)).toBeNull();
  });

  it("recusa dado pessoal óbvio (CPF, e-mail, telefone) em ref de texto", () => {
    const tel = markDone(base(), "pedido", { refs: ["41 99999-1234"], agora });
    expect(workflowStateSchema.safeParse(tel).success).toBe(false);
    const cpf = markDone(base(), "pedido", { refs: ["123.456.789-09"], agora });
    expect(workflowStateSchema.safeParse(cpf).success).toBe(false);
    const mail = markDone(base(), "pedido", { refs: ["joao@x.com"], agora });
    expect(workflowStateSchema.safeParse(mail).success).toBe(false);
    expect(containsPii("12345678909")).toBe(true);
    expect(containsPii(KEY_PEDIDO)).toBe(false);
  });

  it("bloqueio sem texto livre: campos e código só das listas fechadas", () => {
    const ok = block(base(), { passo: "pendencias", tipo: "dado_faltante", campos: ["data_acidente", "nome_mae"] }, agora);
    expect(workflowStateSchema.safeParse(ok).success).toBe(true);
    const nome = block(base(), { passo: "pendencias", tipo: "dado_faltante", campos: ["Maria"] }, agora);
    expect(workflowStateSchema.safeParse(nome).success).toBe(false);
    const cod = { ...block(base(), { passo: "pedido", tipo: "erro_externo" }, agora) };
    expect(workflowStateSchema.safeParse({ ...cod, bloqueio: { ...cod.bloqueio, codigo: "joao_silva" } }).success).toBe(false);
    expect(workflowStateSchema.safeParse({ ...cod, bloqueio: { ...cod.bloqueio, detalhe: "texto" } }).success).toBe(true); // chave extra é descartada pelo zod
    expect(workflowStateSchema.parse({ ...cod, bloqueio: { ...cod.bloqueio, detalhe: "texto" } }).bloqueio).not.toHaveProperty("detalhe");
    expect(campoKey("estado civil")).toBe("estado_civil");
    expect(campoKey("Data do Acidente")).toBe("data_acidente");
    expect(campoKey("nome_mae")).toBe("nome_mae");
    expect(campoKey("Maria")).toBeNull();
  });

  it("ids do CRM (approvalId hex, key, cuid, uuid de Document) não contam como CPF", () => {
    const s = markDone(markDone(base(), "pedido", { refs: [KEY_PEDIDO], agora }), "modo", { refs: ["email"], agora });
    const withApr = markDone(s, "preparar_email", { refs: ["apr12345678901234567890"], agora });
    expect(workflowStateSchema.safeParse(withApr).success).toBe(true);
    const uuid = markDone(s, "anexar", { refs: ["0f1e2d3c-4b5a-4968-8776-a12345678901"], agora });
    expect(workflowStateSchema.safeParse(uuid).success).toBe(true);
  });
});

describe("ordem e marcação", () => {
  it("passo desconhecido, fora da ordem ou que não se aplica → recusa", () => {
    expect(checkStep(base(), "xpto").ok).toBe(false);
    expect(checkStep(base(), "anexar").ok).toBe(false); // requer pedido
    expect(checkStep(base(), "enviar").ok).toBe(false);
    const s = markDone(markDone(base(), "pedido", { refs: [KEY_PEDIDO], agora }), "modo", { refs: ["outro"], agora });
    expect(checkStep(s, "preparar_email").ok).toBe(false); // canal não é e-mail
    expect(checkStep(s, "tag").ok).toBe(true); // enviar não se aplica = satisfeito
  });

  it("opcional pode ficar para trás; reler não precisa estar salvo", () => {
    const s = markDone(base(), "pedido", { refs: [KEY_PEDIDO], agora });
    expect(checkStep(s, "modo").ok).toBe(true); // procuracao/anexar opcionais
    expect(nextStep(s)?.id).toBe("procuracao");
  });

  it("markDone é idempotente e limpa o bloqueio", () => {
    let s = block(base(), { passo: "pedido", tipo: "erro_externo", codigo: "conversor_indisponivel" }, agora);
    expect(s.status).toBe("bloqueado");
    s = markDone(s, "pedido", { refs: [KEY_PEDIDO], agora });
    s = markDone(s, "pedido", { refs: [KEY_PEDIDO], agora });
    expect(s.feitos.filter((f) => f.passo === "pedido")).toHaveLength(1);
    expect(s.bloqueio).toBeNull();
    expect(s.status).toBe("em_andamento");
  });

  it("parado: o passo atual é o bloqueado, não o seguinte", () => {
    const s = block(base(), { passo: "pendencias", tipo: "dado_faltante" }, agora);
    expect(currentStep(s)?.id).toBe("pendencias");
    expect(currentStep(finish(s, "concluido", agora))).toBeNull();
  });

  it("bloqueio não apaga o que já foi feito", () => {
    const s = block(markDone(base(), "pedido", { refs: [KEY_PEDIDO], agora }), { passo: "preparar_email", tipo: "erro_externo", codigo: "sem_destinatario" }, agora);
    expect(s.feitos.map((f) => f.passo)).toEqual(["pedido"]);
  });

  it("depois do envio, preparar de novo é recusado", () => {
    const s = markDone(ateEmail(), "enviar", { refs: [APR], agora });
    expect(checkStep(s, "preparar_email").ok).toBe(false);
  });

  it("último passo feito = concluído; fim manual", () => {
    let s = markDone(ateEmail(), "enviar", { refs: [APR], agora });
    expect(nextStep(s)?.id).toBe("tag");
    s = markDone(s, "mover", { refs: ["AGUARDANDO PRONTUÁRIO"], agora });
    expect(s.status).toBe("concluido");
    expect(finish(base(), "abandonado", agora).status).toBe("abandonado");
  });

  it("isStale: mais de 14 dias de calendário em Brasília", () => {
    const s = { ...base(), atualizadoEm: "2026-10-11T02:00:00Z" }; // 10/10 23h em Brasília
    expect(isStale(s, new Date("2026-10-24T15:00:00Z"))).toBe(false); // 14 dias
    expect(isStale(s, new Date("2026-10-25T15:00:00Z"))).toBe(true); // 15 dias
  });
});

describe("resumePlan", () => {
  it("parado nas pendências: relê e segue do pedido", () => {
    const s = block(markDone(base(), "hospital", { agora }), { passo: "pendencias", tipo: "dado_faltante", campos: ["data_acidente"] }, agora);
    const p = resumePlan(s, fatos(), agora);
    expect(p.reler).toEqual(["card", "hospital", "pendencias"]);
    expect(p.proximo?.passo).toBe("pedido");
    expect(p.refazer).toEqual([]);
  });

  it("rascunho válido não é refeito; aprovação pendente/expirada volta ao preparar_email (nunca reaproveita)", () => {
    for (const st of ["cancelada", "expirada", "falhou", "sumiu"] as const) {
      const p = resumePlan(ateEmail(), fatos({ rascunhos: { [KEY_PEDIDO]: "ok" }, documentos: { [DOC]: "ok" }, aprovacoes: { [APR]: st } }), agora);
      expect(p.proximo?.passo).toBe("preparar_email");
      expect(p.refazer.map((r) => r.passo)).toEqual(["preparar_email"]);
      expect(p.feitos.map((f) => f.passo)).toEqual(["pendencias", "pedido", "anexar", "modo"]);
      expect(p.estado.feitos.some((f) => f.passo === "preparar_email")).toBe(false);
    }
  });

  it("rascunho vencido sem anexo refaz só o pedido", () => {
    let s = markDone(base(), "pedido", { refs: [KEY_PEDIDO], agora });
    s = markDone(s, "procuracao", { refs: [KEY_PROC], agora });
    const p = resumePlan(s, fatos({ rascunhos: { [KEY_PEDIDO]: "vencido", [KEY_PROC]: "ok" } }), agora);
    expect(p.refazer.map((r) => r.passo)).toEqual(["pedido"]);
    expect(p.proximo?.passo).toBe("pedido");
    expect(p.feitos.map((f) => f.passo)).toEqual(["procuracao"]);
  });

  it("rascunho vencido mas já anexado: não refaz, avisa para usar o documento", () => {
    const p = resumePlan(ateEmail(), fatos({ rascunhos: { [KEY_PEDIDO]: "vencido" }, documentos: { [DOC]: "ok" }, aprovacoes: { [APR]: "cancelada" } }), agora);
    expect(p.refazer.map((r) => r.passo)).toEqual(["preparar_email"]);
    expect(p.avisos.join(" ")).toMatch(/já está anexado/);
  });

  it("anexo foi para a lixeira: refaz o anexar (e o rascunho vencido)", () => {
    const p = resumePlan(ateEmail(), fatos({ rascunhos: { [KEY_PEDIDO]: "vencido" }, documentos: { [DOC]: "apagado" }, aprovacoes: { [APR]: "cancelada" } }), agora);
    expect(p.refazer.map((r) => r.passo)).toEqual(["pedido", "anexar", "preparar_email"]);
    expect(p.proximo?.passo).toBe("pedido");
  });

  it("aprovação executada: envio feito, nunca repete (mesmo sem o passo enviar salvo)", () => {
    const p = resumePlan(ateEmail(), fatos({ rascunhos: { [KEY_PEDIDO]: "ok" }, documentos: { [DOC]: "ok" }, aprovacoes: { [APR]: "executada" } }), agora);
    expect(p.feitos.map((f) => f.passo)).toContain("enviar");
    expect(p.proximo?.passo).toBe("tag");
    expect(p.avisos.join(" ")).toMatch(/já foi enviado/);
  });

  it("envio executado com aprovação nova não salva (preparou de novo e caiu): conta como feito", () => {
    const p = resumePlan(
      ateEmail(),
      fatos({ rascunhos: { [KEY_PEDIDO]: "ok" }, documentos: { [DOC]: "ok" }, aprovacoes: { [APR]: "expirada" }, enviosExecutados: { preparar_email: "aprNOVA0000000000000000" } }),
      agora,
    );
    expect(p.refazer).toEqual([]);
    expect(p.feitos.find((f) => f.passo === "enviar")?.refs).toEqual(["aprNOVA0000000000000000"]);
    expect(p.proximo?.passo).toBe("tag");
  });

  it("aprovação enviando: para e manda conferir", () => {
    const p = resumePlan(ateEmail(), fatos({ rascunhos: { [KEY_PEDIDO]: "ok" }, documentos: { [DOC]: "ok" }, aprovacoes: { [APR]: "enviando" } }), agora);
    expect(p.parar?.codigo).toBe("envio_em_andamento");
    expect(p.proximo).toBeNull();
    expect(p.estado.status).toBe("bloqueado");
  });

  it("card arquivado ou movido desde a pausa: avisa; card sumiu: para", () => {
    const a = resumePlan(base(), fatos({ card: { existe: true, arquivado: true, colunaMudou: true } }), agora);
    expect(a.avisos).toHaveLength(2);
    expect(a.parar).toBeNull();
    const b = resumePlan(base(), fatos({ card: { existe: false, arquivado: false, colunaMudou: false } }), agora);
    expect(b.parar?.codigo).toBe("card_sumiu");
  });

  it("contrato: passo do navegador fica feito, com aviso de que foi o operador quem confirmou", () => {
    let s = base("contrato");
    s = markDone(s, "contrato", { refs: [KEY_PEDIDO], agora });
    s = markDone(s, "zapsign", { agora });
    const p = resumePlan(s, fatos({ rascunhos: { [KEY_PEDIDO]: "ok" } }), agora);
    expect(p.proximo?.passo).toBe("comentar");
    expect(p.avisos.join(" ")).toMatch(/confirmado pelo operador/);
  });
});
