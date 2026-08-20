import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/app/_shared/lib/prisma";
import { sendSystemWhatsApp } from "@/app/_shared/lib/whatsapp/outbound";
import { postInternalNote } from "@/app/_shared/lib/whatsapp/bot";

// Código de 6 dígitos enviado no WhatsApp do próprio cliente.
//
// É a prova de AUTORIA da assinatura: quem assinou tinha o celular que a
// empresa já vinha usando pra falar com o cliente. Guardamos só o hash — o
// código em claro nunca fica no banco.
//
// Em desenvolvimento (SIGNATURE_OTP_DEV=true) o código também volta na resposta
// e aparece no console, pra dar pra testar a página sem depender do WhatsApp.

const OTP_TTL_MS = 10 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_MS = 60_000;
// Template de autenticação aprovado na Meta (fora da janela de 24h).
const OTP_TEMPLATE = "codigo_assinatura";

export const OTP_DEV = process.env.SIGNATURE_OTP_DEV === "true";

function newCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export type SendOtpResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: string; retryInSeconds?: number };

/** Gera e envia o código. Respeita o intervalo de reenvio de 60s. */
export async function sendOtp(requestId: string): Promise<SendOtpResult> {
  const request = await db.signatureRequest.findUnique({
    where: { id: requestId },
    include: { contact: { select: { id: true, phone: true, name: true } } },
  });
  if (!request) return { ok: false, error: "Documento não encontrado." };
  if (request.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Muitas tentativas. Um atendente vai te chamar no WhatsApp para ajudar." };
  }
  if (request.otpSentAt && Date.now() - request.otpSentAt.getTime() < OTP_RESEND_MS) {
    const faltam = Math.ceil((OTP_RESEND_MS - (Date.now() - request.otpSentAt.getTime())) / 1000);
    return { ok: false, error: `Aguarde ${faltam}s para pedir outro código.`, retryInSeconds: faltam };
  }

  const code = newCode();
  await db.signatureRequest.update({
    where: { id: requestId },
    data: {
      otpHash: await bcrypt.hash(code, 10),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      otpSentAt: new Date(),
    },
  });

  if (OTP_DEV) {
    console.log(`\n[SIGN][DEV] Código de assinatura de ${request.contact.name ?? request.contact.phone}: ${code}\n`);
    return { ok: true, devCode: code };
  }

  const sent = await sendSystemWhatsApp({
    // O contato do ciclo, não a resolução por telefone: garante que o código
    // sai pela MESMA linha da empresa que conversa com este cliente.
    contactId: request.contactId,
    phone: request.contact.phone,
    clientName: request.contact.name,
    text: `Seu código para assinar os documentos é ${code}. Ele vale por 10 minutos. Não compartilhe com ninguém.`,
    templateName: OTP_TEMPLATE,
    templateVars: [code],
    authorId: "whatsapp-bot",
    authorName: "🖊️ Assinatura eletrônica",
    source: "signature_otp",
    // O cliente está na página esperando o código — nunca segurar pelo
    // cooldown anti-spam de proativas.
    transactional: true,
  });
  if (!sent.sent) {
    await postInternalNote(
      request.contactId,
      `⚠️ Não consegui enviar o CÓDIGO de assinatura pelo WhatsApp (${sent.reason ?? "motivo não informado"}). ➡️ O cliente está com o documento aberto e travado no código — falar com ele.`,
    ).catch(() => {});
    return { ok: false, error: "Não consegui enviar o código agora. Um atendente já foi avisado e vai te chamar." };
  }
  return { ok: true };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; error: string; bloqueado?: boolean };

/** Confere o código digitado. Erra 5x → trava o ciclo (o chamador avisa a equipe). */
export async function verifyOtp(requestId: string, code: string): Promise<VerifyOtpResult> {
  const request = await db.signatureRequest.findUnique({ where: { id: requestId } });
  if (!request?.otpHash || !request.otpExpiresAt) {
    return { ok: false, error: "Peça um código antes de confirmar." };
  }
  if (request.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Muitas tentativas erradas.", bloqueado: true };
  }
  if (request.otpExpiresAt.getTime() < Date.now()) {
    return { ok: false, error: "Esse código venceu. Toque em “reenviar código”." };
  }

  const limpo = code.replace(/\D/g, "");
  if (!(await bcrypt.compare(limpo, request.otpHash))) {
    const attempts = request.otpAttempts + 1;
    await db.signatureRequest.update({ where: { id: requestId }, data: { otpAttempts: attempts } });
    if (attempts >= OTP_MAX_ATTEMPTS) {
      return { ok: false, error: "Muitas tentativas erradas.", bloqueado: true };
    }
    return { ok: false, error: `Código não confere. Você ainda tem ${OTP_MAX_ATTEMPTS - attempts} tentativa(s).` };
  }

  // Consome o código: ele não vale duas vezes.
  await db.signatureRequest.update({
    where: { id: requestId },
    data: { otpHash: null, otpExpiresAt: null },
  });
  return { ok: true };
}
