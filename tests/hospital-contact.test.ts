import { describe, it, expect } from "vitest";
import { ghostContactFromNote } from "@/app/_shared/utils/hospital-contact";

describe("contato do GHOST a partir da nota", () => {
  it("nota publicada com contato único preenche", () => {
    const c = ghostContactFromNote({
      status: "publicado",
      modo: ["email", "presencial"],
      contatos: { email: ["SameLaudos@Hospital.org.br"], telefone: ["(41) 3333-4444"], site: [] },
    });
    expect(c).toEqual({ email: "samelaudos@hospital.org.br", telefone: "(41) 3333-4444", modo: "email,presencial", problemas: [] });
  });

  it("rascunho nunca preenche", () => {
    const c = ghostContactFromNote({ status: "rascunho", contatos: { email: ["a@b.com"], telefone: [], site: [] } });
    expect(c.email).toBeNull();
    expect(c.problemas[0]).toMatch(/só publicada/);
  });

  it("dois e-mails = escolha humana; modo desconhecido sai", () => {
    const c = ghostContactFromNote({ status: "publicado", modo: ["fax"], contatos: { email: ["a@b.com", "c@d.com"], telefone: ["1", "2"], site: [] } });
    expect(c.email).toBeNull();
    expect(c.telefone).toBeNull();
    expect(c.modo).toBeNull();
    expect(c.problemas).toHaveLength(2);
  });

  it("e-mail inválido não entra", () => {
    const c = ghostContactFromNote({ status: "publicado", contatos: { email: ["sem-arroba"] } });
    expect(c.email).toBeNull();
    expect(c.problemas[0]).toMatch(/inválido/);
  });
});
