import { describe, it, expect } from "vitest";
import { db } from "@/app/_shared/lib/prisma";
import { createSignatureFromContact } from "@/app/_shared/lib/signature/core";
import { signUrlFor } from "@/app/_shared/lib/signature/tokens";

// SEED de teste local: cria um contato fictício com a ficha completa, gera o
// contrato de verdade (docx → PDF → S3) e imprime o link /assinar/<token> pra
// você abrir no navegador com o `npm run dev` rodando.
//
//   npm run sign:seed
//
// Nada é enviado por WhatsApp (delivery "nao_enviado"). O contato de teste tem
// telefone 5541900000001 e nome "ZZ TESTE — assinatura", fácil de achar e
// apagar depois. Rodar de novo reaproveita o mesmo contato e cancela o ciclo
// anterior, então dá pra testar quantas vezes quiser.

// Roda por `npm run sign:seed` (funciona em qualquer shell) ou com a
// variável SIGNATURE_SEED=1 no ambiente.
const ativo = process.env.SIGNATURE_SEED === "1" || process.env.npm_lifecycle_event === "sign:seed";

const TELEFONE = process.env.SEED_PHONE ?? "5541900000001";
const FICHA = {
  nacionalidade: "brasileira",
  estado_civil: "casada",
  profissao: "auxiliar de limpeza",
  rg: "12.345.678-9",
  cpf: "111.444.777-35", // CPF válido de teste (passa no dígito verificador)
  rua: "Rua das Flores",
  numero: "120",
  bairro: "Boqueirão",
  cep: "81730-000",
  cidade: "Curitiba",
  estado: "Paraná",
};

describe.skipIf(!ativo)("seed de assinatura para teste local", () => {
  it("cria o ciclo e imprime o link", async () => {
    const contact = await db.whatsAppContact.upsert({
      where: { numberId_phone: { numberId: null as never, phone: TELEFONE } },
      update: { clientDraft: FICHA },
      create: {
        phone: TELEFONE,
        name: "ZZ TESTE — assinatura",
        clientDraft: FICHA,
      },
    }).catch(async () => {
      // Instalações com numberId preenchido não casam no upsert composto —
      // cai no caminho manual.
      const existente = await db.whatsAppContact.findFirst({ where: { phone: TELEFONE } });
      if (existente) {
        return db.whatsAppContact.update({ where: { id: existente.id }, data: { clientDraft: FICHA } });
      }
      return db.whatsAppContact.create({
        data: { phone: TELEFONE, name: "ZZ TESTE — assinatura", clientDraft: FICHA },
      });
    });

    await db.whatsAppConversation.upsert({
      where: { contactId: contact.id },
      update: {},
      create: { contactId: contact.id, status: "queued" },
    });

    // Um ciclo por vez: cancela o anterior pra poder testar de novo.
    await db.signatureRequest.updateMany({
      where: { contactId: contact.id, status: { in: ["coletando", "confirmando", "aguardando", "visualizado", "assinado"] } },
      data: { status: "cancelado" },
    });

    const res = await createSignatureFromContact(contact.id, {
      delivery: "nao_enviado",
      userName: "Seed de teste",
    });

    if (!res.ok) {
      console.error("Falhou:", res.error, res.missing);
    }
    expect(res.ok).toBe(true);

    const request = await db.signatureRequest.findUnique({ where: { id: res.requestId! } });
    console.log(`\n════════════════════════════════════════════════`);
    console.log(`ABRA NO NAVEGADOR (com npm run dev rodando):`);
    console.log(`  ${signUrlFor(request!.token)}`);
    console.log(`Verificação: ${signUrlFor(request!.token).replace("/assinar/", "/verificar/")}`);
    console.log(`════════════════════════════════════════════════\n`);
  }, 180_000);
});
