import { describe, it, expect } from "vitest";
import { db } from "@/app/_shared/lib/prisma";
import { createMetaTemplate } from "@/app/_shared/lib/whatsapp/client";
import { publicBaseUrl } from "@/app/_shared/lib/signature/tokens";

// CRIA na Meta (de verdade) os dois templates do ciclo de assinatura e espelha
// o cadastro local como PENDING. A aprovação da Meta chega pelo webhook
// message_template_status_update (~24h).
//
//   npm run sign:templates
//
// Template é da WABA, mas o catálogo local (e a busca do outbound) é por
// NÚMERO — então o espelho local é criado para CADA número ativo, e o POST na
// Meta acontece uma vez por WABA (repetir devolve "already exists", tolerado).
// Idempotente: número que já tem o registro local é pulado.

const ativo =
  process.env.SIGNATURE_TEMPLATES === "1" || process.env.npm_lifecycle_event === "sign:templates";

// Preview local do template de autenticação = corpo padrão que a Meta gera.
const OTP = {
  name: "codigo_assinatura",
  category: "AUTHENTICATION",
  bodyPreview: "*{{1}}* é seu código de verificação. Para sua segurança, não o compartilhe.",
};

const REMINDER = {
  name: "lembrete_assinatura",
  category: "UTILITY",
  body:
    "Olá, {{1}}! Seus documentos ainda estão aguardando a sua assinatura — falta só esse passo pra gente dar andamento no seu caso. " +
    "É rapidinho, direto pelo celular, no botão abaixo. Qualquer dificuldade, é só responder esta mensagem. 😊",
  example: "Maria",
  footer: "Paraná Seguros",
  buttonText: "Assinar documentos",
};

describe.skipIf(!ativo)("criação dos templates de assinatura na Meta", () => {
  it("cria codigo_assinatura e lembrete_assinatura em todas as WABAs/números", async () => {
    const base = publicBaseUrl();
    if (base.includes("localhost")) {
      throw new Error(
        `A URL pública é ${base} — o botão do lembrete apontaria pra localhost. ` +
        "Configure NEXTAUTH_URL (ou SIGNATURE_BASE_URL) com o domínio de produção antes de rodar.",
      );
    }

    const numbers = await db.whatsAppNumber.findMany({
      where: { active: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, label: true, wabaId: true },
    });
    expect(numbers.length).toBeGreaterThan(0);

    // "already exists" da Meta não é erro pra gente: o template já está na
    // WABA (criado pra outro número dela, ou numa rodada anterior).
    const tolerable = (e?: string) => !e || /already exists|já existe/i.test(e);

    for (const num of numbers) {
      console.log(`\n=== ${num.label} (WABA ${num.wabaId ?? "?"}) ===`);
      if (!num.wabaId) {
        console.log("  sem wabaId cadastrado — pulei (cadastre a WABA na tela de números).");
        continue;
      }

      // --- codigo_assinatura (AUTHENTICATION) ------------------------------
      const otpLocal = await db.whatsAppTemplate.findFirst({
        where: { name: OTP.name, numberId: num.id },
      });
      if (otpLocal) {
        console.log(`  ${OTP.name}: já cadastrado (${otpLocal.status}) — pulei.`);
      } else {
        const r = await createMetaTemplate({
          name: OTP.name,
          language: "pt_BR",
          category: OTP.category,
          bodyText: "",
          bodyExamples: [],
          authentication: { codeExpirationMinutes: 10 },
        }, num.id);
        if (!tolerable(r.error)) throw new Error(`${OTP.name} @ ${num.label}: ${r.error}`);
        await db.whatsAppTemplate.create({
          data: {
            name: OTP.name,
            language: "pt_BR",
            category: OTP.category,
            numberId: num.id,
            bodyVars: 1,
            bodyPreview: OTP.bodyPreview,
            status: r.status || "PENDING",
            metaId: r.metaId,
          },
        });
        console.log(`  ${OTP.name}: ok (${r.status || "PENDING"})${r.error ? ` — Meta: ${r.error}` : ""}`);
      }

      // --- lembrete_assinatura (UTILITY + botão de URL dinâmica) -----------
      const remLocal = await db.whatsAppTemplate.findFirst({
        where: { name: REMINDER.name, numberId: num.id },
      });
      if (remLocal) {
        console.log(`  ${REMINDER.name}: já cadastrado (${remLocal.status}) — pulei.`);
      } else {
        const r = await createMetaTemplate({
          name: REMINDER.name,
          language: "pt_BR",
          category: REMINDER.category,
          bodyText: REMINDER.body,
          bodyExamples: [REMINDER.example],
          footerText: REMINDER.footer,
          urlButton: {
            text: REMINDER.buttonText,
            url: `${base}/assinar/{{1}}`,
            example: `${base}/assinar/EXEMPLO-DE-TOKEN`,
          },
        }, num.id);
        if (!tolerable(r.error)) throw new Error(`${REMINDER.name} @ ${num.label}: ${r.error}`);
        await db.whatsAppTemplate.create({
          data: {
            name: REMINDER.name,
            language: "pt_BR",
            category: REMINDER.category,
            numberId: num.id,
            bodyVars: 1,
            bodyPreview: REMINDER.body,
            footerText: REMINDER.footer,
            status: r.status || "PENDING",
            metaId: r.metaId,
          },
        });
        console.log(`  ${REMINDER.name}: ok (${r.status || "PENDING"})${r.error ? ` — Meta: ${r.error}` : ""}`);
      }
    }
  }, 120_000);
});
