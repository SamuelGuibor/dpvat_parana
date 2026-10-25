// Envio de SMS (AWS SNS) e e-mail (AWS SES) — usa as MESMAS credenciais AWS
// que o projeto já tem para o S3 (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).
//
// Usado pelo fluxo de recuperação de senha da área do cliente (sendEmailAws) e
// pelo e-mail APROVADO da IA de operação (sendEmailRawAws, Etapa 5: cc + anexos).
//
// Requisitos no painel AWS (uma vez):
//  - SNS: liberar envio de SMS (sair do sandbox / definir spending limit).
//    O IAM user precisa da permissão sns:Publish.
//  - SES: verificar o domínio ou e-mail remetente e definir SES_FROM_EMAIL
//    (ex.: nao-responda@segurosparana.com.br). Permissão ses:SendEmail.

import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { buildMimeMessage, type MimeAttachment } from "@/app/_shared/utils/email-mime";

const REGION = process.env.AWS_REGION ?? "us-east-1";

const credentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

export function isAwsSmsConfigured(): boolean {
  return Boolean(credentials);
}

export function isAwsEmailConfigured(): boolean {
  return Boolean(credentials && process.env.SES_FROM_EMAIL);
}

export interface SendResult {
  sent: boolean;
  id?: string;
  error?: string;
}

/**
 * SMS transacional via SNS. `phoneE164Digits` no formato "55DDDNUMERO"
 * (sem "+"). Nunca lança.
 */
export async function sendSmsAws(phoneE164Digits: string, body: string): Promise<SendResult> {
  if (!isAwsSmsConfigured()) return { sent: false, error: "AWS não configurada" };
  try {
    const sns = new SNSClient({ region: REGION, credentials });
    const res = await sns.send(
      new PublishCommand({
        PhoneNumber: `+${phoneE164Digits}`,
        Message: body,
        MessageAttributes: {
          // Transactional: prioridade de entrega (código de segurança).
          "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
          "AWS.SNS.SMS.SenderID": {
            DataType: "String",
            StringValue: process.env.SNS_SMS_SENDER_ID ?? "ParanaSeg",
          },
        },
      }),
    );
    return { sent: true, id: res.MessageId };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "falha no SNS" };
  }
}

/** E-mail transacional via SES. Nunca lança. */
export async function sendEmailAws(
  to: string,
  subject: string,
  textBody: string,
  htmlBody?: string,
): Promise<SendResult> {
  if (!isAwsEmailConfigured()) return { sent: false, error: "SES não configurado (SES_FROM_EMAIL)" };
  try {
    const ses = new SESv2Client({ region: process.env.SES_REGION ?? REGION, credentials });
    const res = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_EMAIL!,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: textBody, Charset: "UTF-8" },
              ...(htmlBody ? { Html: { Data: htmlBody, Charset: "UTF-8" } } : {}),
            },
          },
        },
      }),
    );
    return { sent: true, id: res.MessageId };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "falha no SES" };
  }
}

/** Teto dos anexos somados: o SES aceita 40 MB de mensagem; base64 incha ~37%. */
export const RAW_EMAIL_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface RawEmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  /** Já lidos do S3 pelo chamador (nunca vindos do body de uma rota). */
  attachments?: MimeAttachment[];
}

/**
 * E-mail com cc e anexos (SES v2 `Raw`, MIME montado aqui). Remetente =
 * SES_FROM_EMAIL, como o sendEmailAws. Nunca lança.
 */
export async function sendEmailRawAws(input: RawEmailInput): Promise<SendResult> {
  if (!isAwsEmailConfigured()) return { sent: false, error: "SES não configurado (SES_FROM_EMAIL)" };
  const total = (input.attachments ?? []).reduce((n, a) => n + a.data.length, 0);
  if (total > RAW_EMAIL_MAX_ATTACHMENT_BYTES) return { sent: false, error: "anexos passam de 10 MB somados" };
  try {
    const raw = buildMimeMessage({ from: process.env.SES_FROM_EMAIL!, ...input });
    const ses = new SESv2Client({ region: process.env.SES_REGION ?? REGION, credentials });
    const res = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.SES_FROM_EMAIL!,
        Destination: { ToAddresses: input.to, ...(input.cc?.length ? { CcAddresses: input.cc } : {}) },
        Content: { Raw: { Data: Buffer.from(raw, "utf8") } },
      }),
    );
    return { sent: true, id: res.MessageId };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "falha no SES" };
  }
}
