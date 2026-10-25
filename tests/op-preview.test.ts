import { describe, it, expect } from "vitest";
import { actionArgs, previewHash, previewOrExecute } from "@/app/_shared/lib/op/preview";
import { parseOpSwitches, isToolEnabled } from "@/app/_shared/lib/op/switches";

describe("prévia das ferramentas L3", () => {
  it("hash estável, independe da ordem e dos campos de controle", () => {
    const a = previewHash("mover_card", { card: "2342", coluna: "AUDITORIA" }, { labelId: "l1", archiveStatus: null });
    const b = previewHash("mover_card", actionArgs({ coluna: "AUDITORIA", card: "2342", confirmar: true, previa_hash: "x" }), {
      archiveStatus: null,
      labelId: "l1",
    });
    expect(a).toBe(b);
  });

  it("muda com o estado e com os args", () => {
    const base = previewHash("mover_card", { card: "1", coluna: "A" }, { labelId: "l1" });
    expect(previewHash("mover_card", { card: "1", coluna: "A" }, { labelId: "l2" })).not.toBe(base);
    expect(previewHash("mover_card", { card: "1", coluna: "B" }, { labelId: "l1" })).not.toBe(base);
    expect(previewHash("adicionar_tag", { card: "1", coluna: "A" }, { labelId: "l1" })).not.toBe(base);
  });

  it("sem confirmar não executa e devolve o hash", async () => {
    let ran = false;
    const out = await previewOrExecute({
      tool: "t",
      args: { card: "1", confirmar: false },
      estado: { x: 1 },
      previa: { acao: "teste" },
      execute: async () => { ran = true; },
    });
    expect(ran).toBe(false);
    expect(out.executed).toBe(false);
    if (!out.executed) expect(out.previa.previa_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("confirmar sem hash → argumentos_invalidos; hash velho → estado_mudou com a prévia nova", async () => {
    const exec = async () => "ok";
    await expect(previewOrExecute({ tool: "t", args: { confirmar: true }, estado: {}, previa: {}, execute: exec })).rejects.toMatchObject({
      code: "argumentos_invalidos",
    });
    const err = await previewOrExecute({ tool: "t", args: { confirmar: true, previa_hash: "velho" }, estado: { x: 2 }, previa: {}, execute: exec }).catch((e) => e);
    expect(err.code).toBe("estado_mudou");
    expect(err.status).toBe(409);
    expect(err.details.previa.previa_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hash certo executa", async () => {
    const hash = previewHash("t", { card: "1" }, { x: 1 });
    const out = await previewOrExecute({ tool: "t", args: { card: "1", confirmar: true, previa_hash: hash }, estado: { x: 1 }, previa: {}, execute: async () => 42 });
    expect(out).toEqual({ executed: true, result: 42 });
  });
});

describe("interruptores", () => {
  it("ausente/lixo = desligado; só true liga", () => {
    expect(parseOpSwitches(null)).toEqual({});
    expect(parseOpSwitches("não é json")).toEqual({});
    expect(parseOpSwitches("[1]")).toEqual({});
    expect(parseOpSwitches('{"mover_card":true,"comentar_card":"sim"}')).toEqual({ mover_card: true, comentar_card: false });
  });

  it("L1 não tem interruptor; L3 só ligada", () => {
    expect(isToolEnabled({}, { name: "obter_card", level: 1 })).toBe(true);
    expect(isToolEnabled({}, { name: "mover_card", level: 3 })).toBe(false);
    expect(isToolEnabled({ mover_card: true }, { name: "mover_card", level: 3 })).toBe(true);
  });
});
