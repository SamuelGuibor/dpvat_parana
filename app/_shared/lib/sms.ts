// Envio de SMS via Twilio (REST direto, sem SDK). Usado hoje pelo fluxo de
// recuperação de senha da área do cliente.
//
// Env necessárias (ver .env.example):
//   TWILIO_ACCOUNT_SID  — SID da conta (começa com AC)
//   TWILIO_AUTH_TOKEN   — token de autenticação
//   TWILIO_FROM_NUMBER  — número remetente em E.164 (ex: +15017122661)
//     ou TWILIO_MESSAGING_SERVICE_SID (SID de Messaging Service, começa com MG)
//
// Sem essas variáveis o módulo se reporta como não configurado e o caller
// decide o fallback (ex.: enviar o código pelo WhatsApp Cloud API).

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID),
  );
}

export interface SmsResult {
  sent: boolean;
  sid?: string;
  error?: string;
}

/**
 * Envia um SMS. `phoneE164Digits` no formato "55DDDNUMERO" (sem "+" — mesmo
 * formato do normalizePhoneBR do WhatsApp). Nunca lança.
 */
export async function sendSms(phoneE164Digits: string, body: string): Promise<SmsResult> {
  if (!isSmsConfigured()) return { sent: false, error: "SMS não configurado (TWILIO_*)" };

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;

  const params = new URLSearchParams();
  params.set("To", `+${phoneE164Digits}`);
  params.set("Body", body);
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    params.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    params.set("From", process.env.TWILIO_FROM_NUMBER!);
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        cache: "no-store",
      },
    );
    const data = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
    if (!res.ok) {
      return { sent: false, error: data?.message ?? `Twilio HTTP ${res.status}` };
    }
    return { sent: true, sid: data?.sid };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "falha de rede" };
  }
}
