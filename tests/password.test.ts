import { describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import { hashPassword, SENHA_PADRAO_CLIENTE, verifyPassword } from "@/app/_shared/lib/password";

describe("verifyPassword na troca da senha padrão", () => {
  it("a senha padrão nova abre a conta que ainda tem o hash da antiga e pede regravação", async () => {
    const antiga = await hash("segurosparana1", 4);
    expect(await verifyPassword(SENHA_PADRAO_CLIENTE, antiga)).toEqual({ ok: true, needsRehash: true });
  });

  it("a senha padrão antiga continua valendo até o login com a nova", async () => {
    const antiga = await hash("segurosparana1", 4);
    expect(await verifyPassword("segurosparana1", antiga)).toEqual({ ok: true, needsRehash: false });
  });

  it("quem criou senha própria não entra com nenhuma das padrões", async () => {
    const propria = await hash("minha-senha-forte", 4);
    expect((await verifyPassword(SENHA_PADRAO_CLIENTE, propria)).ok).toBe(false);
    expect((await verifyPassword("segurosparana1", propria)).ok).toBe(false);
    expect((await verifyPassword("minha-senha-forte", propria)).ok).toBe(true);
  });

  it("senha errada continua recusada na conta com hash antigo", async () => {
    const antiga = await hash("segurosparana1", 4);
    expect(await verifyPassword("qualquer-outra", antiga)).toEqual({ ok: false, needsRehash: false });
  });

  it("card novo nasce com a senha padrão nova, sem regravar no login", async () => {
    const nova = await hashPassword(SENHA_PADRAO_CLIENTE);
    expect(await verifyPassword(SENHA_PADRAO_CLIENTE, nova)).toEqual({ ok: true, needsRehash: false });
  });
});
