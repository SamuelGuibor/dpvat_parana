// Montagem do e-mail MIME (multipart/mixed) para o SES v2 `Raw` — puro, sem
// dependência nova, testado em tests/email-mime.test.ts. Usado pelo
// sendEmailRawAws (e-mail aprovado da IA de operação, Etapa 5): o SES `Simple`
// não leva anexo nem cc.

import { randomBytes } from "crypto";
import { contentDisposition } from "./s3-keys";

export interface MimeAttachment {
  name: string;
  contentType: string;
  data: Buffer;
}

export interface MimeMessageInput {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: MimeAttachment[];
  /** Fixa o boundary (teste); padrão aleatório. */
  boundary?: string;
  /** Fixa a data (teste). */
  date?: Date;
}

// Endereço simples (sem nome de exibição): local@dominio.tld, sem espaço, sem
// vírgula, sem CR/LF. Validação de formato, não de entrega.
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** CR/LF num cabeçalho = injeção de cabeçalho (Bcc escondido etc.). */
export function hasHeaderBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

/** RFC 2047: assunto com acento vira =?UTF-8?B?...?= (em pedaços ≤ 45 bytes). */
export function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** Base64 em linhas de 76 (RFC 2045). */
export function base64Lines(data: Buffer): string {
  return (data.toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

/** Tipo do anexo pela extensão (o S3 do CRM nem sempre guarda o ContentType). */
export function mimeTypeFor(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
  };
  return map[ext] ?? "application/octet-stream";
}

function rfc2822Date(d: Date): string {
  return d.toUTCString().replace("GMT", "+0000");
}

/** Mensagem completa (cabeçalhos + corpo) com CRLF. Lança se houver cabeçalho inválido. */
export function buildMimeMessage(input: MimeMessageInput): string {
  const to = input.to.map(normalizeEmail);
  const cc = (input.cc ?? []).map(normalizeEmail);
  // SES_FROM_EMAIL pode vir como "Nome <endereco>": confere só o endereço.
  const fromAddr = input.from.match(/<([^<>]+)>\s*$/)?.[1] ?? input.from;
  if (hasHeaderBreak(input.from)) throw new Error("remetente inválido");
  for (const addr of [fromAddr, ...to, ...cc]) {
    if (hasHeaderBreak(addr) || !isValidEmail(normalizeEmail(addr))) throw new Error(`endereço inválido: ${addr}`);
  }
  if (!to.length) throw new Error("sem destinatário");
  if (hasHeaderBreak(input.subject)) throw new Error("assunto com quebra de linha");
  const boundary = input.boundary ?? `=_op_${randomBytes(12).toString("hex")}`;
  const alt = `${boundary}_alt`;

  const headers = [
    `From: ${input.from}`,
    `To: ${to.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${rfc2822Date(input.date ?? new Date())}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];

  const parts: string[] = [];
  const textPart = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(input.text, "utf8")),
  ].join("\r\n");
  if (input.html) {
    const htmlPart = [
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(Buffer.from(input.html, "utf8")),
    ].join("\r\n");
    parts.push(
      [`Content-Type: multipart/alternative; boundary="${alt}"`, "", `--${alt}`, textPart, `--${alt}`, htmlPart, `--${alt}--`].join("\r\n"),
    );
  } else {
    parts.push(textPart);
  }
  for (const a of input.attachments ?? []) {
    const type = a.contentType.replace(/[\r\n";]/g, "") || "application/octet-stream";
    parts.push(
      [
        `Content-Type: ${type}`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: ${contentDisposition(false, a.name)}`,
        "",
        base64Lines(a.data),
      ].join("\r\n"),
    );
  }

  return [...headers, "", ...parts.flatMap((p) => [`--${boundary}`, p]), `--${boundary}--`, ""].join("\r\n");
}
