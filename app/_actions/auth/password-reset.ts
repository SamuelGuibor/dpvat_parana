"use server";

import { hash, compare } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { hashPassword } from "@/app/_shared/lib/password";
import { sendSms as sendSmsTwilio, isSmsConfigured as isTwilioConfigured } from "@/app/_shared/lib/sms";
import {
  sendSmsAws,
  sendEmailAws,
  isAwsSmsConfigured,
  isAwsEmailConfigured,
} from "@/app/_shared/lib/aws-messaging";
import { normalizePhoneBR } from "@/app/_shared/lib/whatsapp/outbound";
import { sendText, isWhatsAppConfigured } from "@/app/_shared/lib/whatsapp/client";

// Fluxo "esqueci minha senha" da área do cliente:
//   1. getRecoveryChannels(cpf) — canais disponíveis (SMS/WhatsApp e e-mail),
//      com destino MASCARADO para o cliente confirmar que é dele.
//   2. requestPasswordReset(cpf, canal) — gera código de 6 dígitos, grava o
//      HASH com expiração de 10 min e envia pelo canal escolhido.
//      SMS: AWS SNS → Twilio (se configurado) → WhatsApp (fallback).
//      E-mail: AWS SES (exige SES_FROM_EMAIL verificado).
//   3. confirmPasswordReset(cpf, code, novaSenha) — valida (máx. 5 tentativas)
//      e troca a senha (bcrypt).

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minuto entre reenvios
const MAX_ATTEMPTS = 5;

function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * E-mail real do cliente? O cadastro gera placeholders quando falta e-mail:
 * "cpf@inserir-email.com" (CRM) e "inserir_email-...@gmail.com" (bot) —
 * ambos contam como "sem e-mail".
 */
function isRealEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (e.includes("inserir-email") || e.includes("inserir_email")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function maskPhoneDisplay(e164Digits: string): string {
  // 55 + DDD(2) + número(8|9) → (DD) •••••-1234
  const ddd = e164Digits.slice(2, 4);
  const last4 = e164Digits.slice(-4);
  return `(${ddd}) •••••-${last4}`;
}

function maskEmailDisplay(email: string): string {
  const [user, domain] = email.split("@");
  const visible = user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

async function findAccountByCpf(cpfRaw: string) {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11) return null;
  // O cadastro guarda CPF com ou sem máscara — compara pelos dígitos no SQL.
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "User"
    WHERE cpf IS NOT NULL
      AND role <> 'GHOST'
      AND regexp_replace(cpf, '\\D', '', 'g') = ${cpf}
    LIMIT 1
  `);
  if (!rows.length) return null;
  return db.user.findUnique({
    where: { id: rows[0].id },
    select: { id: true, name: true, cpf: true, telefone: true, email: true },
  });
}

export type RecoveryChannel = "sms" | "email";

export interface RecoveryChannelInfo {
  id: RecoveryChannel;
  /** Destino mascarado para exibição — ex.: "(41) •••••-2323" / "sa•••@gmail.com". */
  destination: string;
  /** false = aparece desabilitado (ex.: e-mail placeholder "inserir-email"). */
  available: boolean;
  /** Motivo exibido quando indisponível. */
  reason?: string;
}

export interface RecoveryChannelsResult {
  found: boolean;
  firstName: string | null;
  channels: RecoveryChannelInfo[];
}

/** Canais de recuperação disponíveis para o CPF informado. */
export async function getRecoveryChannels(cpfRaw: string): Promise<RecoveryChannelsResult> {
  const user = await findAccountByCpf(cpfRaw);
  if (!user) return { found: false, firstName: null, channels: [] };

  const channels: RecoveryChannelInfo[] = [];

  const phone = user.telefone ? normalizePhoneBR(user.telefone) : null;
  channels.push(
    phone
      ? { id: "sms", destination: maskPhoneDisplay(phone), available: true }
      : { id: "sms", destination: "sem telefone cadastrado", available: false, reason: "Não há telefone no seu cadastro." },
  );

  const emailOk = isRealEmail(user.email);
  const emailDeliverable = emailOk && isAwsEmailConfigured();
  channels.push(
    emailOk
      ? {
          id: "email",
          destination: maskEmailDisplay(user.email!.trim()),
          available: emailDeliverable,
          reason: emailDeliverable ? undefined : "Envio por e-mail indisponível no momento.",
        }
      : {
          id: "email",
          destination: "sem e-mail cadastrado",
          available: false,
          reason: "Seu cadastro não tem um e-mail válido — fale com o atendimento para incluir.",
        },
  );

  return {
    found: true,
    firstName: user.name?.trim().split(" ")[0] ?? null,
    channels,
  };
}

export async function requestPasswordReset(
  cpfRaw: string,
  channel: RecoveryChannel = "sms",
): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await findAccountByCpf(cpfRaw);
    if (!user) return { ok: false, message: "CPF não encontrado. Confira os dígitos." };

    // Cooldown de reenvio: se acabou de pedir, não gera/envia outro.
    const existing = await db.passwordResetCode.findUnique({ where: { userId: user.id } });
    if (
      existing &&
      !existing.usedAt &&
      Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      return { ok: true, message: "Código já enviado há pouco — aguarde um instante ou confira sua caixa de entrada/SMS." };
    }

    // 6 dígitos criptograficamente aleatórios.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hash(code, 8);

    await db.passwordResetCode.upsert({
      where: { userId: user.id },
      update: {
        codeHash,
        attempts: 0,
        usedAt: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
      create: {
        userId: user.id,
        codeHash,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    const smsBody = `Parana Seguros: seu codigo de recuperacao de senha e ${code}. Ele expira em 10 minutos. Se nao foi voce, ignore esta mensagem.`;

    if (channel === "email") {
      if (!isRealEmail(user.email)) {
        return { ok: false, message: "Seu cadastro não tem um e-mail válido." };
      }
      const res = await sendEmailAws(
        user.email!.trim(),
        "Código de recuperação de senha — Paraná Seguros",
        `Olá${user.name ? `, ${user.name.split(" ")[0]}` : ""}!\n\nSeu código de recuperação de senha é: ${code}\n\nEle expira em 10 minutos. Se não foi você quem pediu, ignore este e-mail.\n\nParaná Seguros`,
        `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1e3a8a;margin:0 0 8px">Paraná Seguros</h2>
          <p style="color:#374151">Olá${user.name ? `, <strong>${user.name.split(" ")[0]}</strong>` : ""}! Use o código abaixo para redefinir sua senha:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e3a8a;background:#eff6ff;border-radius:12px;padding:16px;text-align:center">${code}</p>
          <p style="color:#6b7280;font-size:13px">O código expira em 10 minutos. Se não foi você quem pediu, ignore este e-mail.</p>
        </div>`,
      );
      if (!res.sent) {
        console.error("[PASSWORD RESET] SES falhou:", res.error);
        return { ok: false, message: "Não foi possível enviar o e-mail agora. Tente por SMS." };
      }
      return { ok: true, message: "Código enviado para o seu e-mail!" };
    }

    // channel === "sms"
    const phone = user.telefone ? normalizePhoneBR(user.telefone) : null;
    if (!phone) return { ok: false, message: "Não há telefone no seu cadastro." };

    let delivered = false;
    // 1º AWS SNS (mesmas credenciais do S3), 2º Twilio, 3º WhatsApp.
    if (isAwsSmsConfigured()) {
      const res = await sendSmsAws(phone, smsBody);
      delivered = res.sent;
      if (!res.sent) console.error("[PASSWORD RESET] SNS falhou:", res.error);
    }
    if (!delivered && isTwilioConfigured()) {
      const res = await sendSmsTwilio(phone, smsBody);
      delivered = res.sent;
      if (!res.sent) console.error("[PASSWORD RESET] Twilio falhou:", res.error);
    }
    if (!delivered && isWhatsAppConfigured()) {
      const wa = await sendText(phone, `Paraná Seguros: seu código de recuperação de senha é *${code}*. Ele expira em 10 minutos. Se não foi você, ignore esta mensagem.`);
      delivered = Boolean(wa.waMessageId);
      if (!delivered) console.error("[PASSWORD RESET] WhatsApp falhou:", wa.error);
    }

    if (!delivered) {
      console.error("[PASSWORD RESET] Nenhum canal entregou o código para o usuário", user.id);
      return { ok: false, message: "Não foi possível enviar o código agora. Tente novamente em instantes." };
    }
    return { ok: true, message: "Código enviado por SMS/WhatsApp para o seu telefone!" };
  } catch (err) {
    console.error("[PASSWORD RESET] requestPasswordReset:", err);
    return { ok: false, message: "Não foi possível enviar o código agora. Tente novamente." };
  }
}

export async function confirmPasswordReset(
  cpfRaw: string,
  code: string,
  newPassword: string,
): Promise<{ ok: boolean; message: string }> {
  const cleanCode = onlyDigits(code);
  if (cleanCode.length !== 6) return { ok: false, message: "Código inválido." };
  if ((newPassword ?? "").length < 7) {
    return { ok: false, message: "A nova senha precisa ter pelo menos 7 caracteres." };
  }

  const user = await findAccountByCpf(cpfRaw);
  if (!user) return { ok: false, message: "Código inválido ou expirado." };

  const record = await db.passwordResetCode.findUnique({ where: { userId: user.id } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return { ok: false, message: "Código inválido ou expirado. Solicite um novo." };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, message: "Muitas tentativas. Solicite um novo código." };
  }

  const match = await compare(cleanCode, record.codeHash);
  if (!match) {
    await db.passwordResetCode.update({
      where: { userId: user.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, message: "Código incorreto. Confira e tente novamente." };
  }

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(newPassword) },
    }),
    db.passwordResetCode.update({
      where: { userId: user.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true, message: "Senha redefinida com sucesso! Faça login com a nova senha." };
}
