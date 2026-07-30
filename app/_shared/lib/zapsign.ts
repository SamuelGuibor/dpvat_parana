// Cliente da API da ZapSign (assinatura eletrônica).
//
// Usado pelo fluxo de PROCURAÇÃO do WhatsApp: o CRM gera o PDF do KIT
// preenchido (docxtemplater + docx-converter), cria o documento na ZapSign
// via upload base64 e envia o sign_url ao cliente. Eventos de assinatura
// voltam pelo webhook (/api/zapsign/webhook).
//
// Env:
//   ZAPSIGN_API_TOKEN      token estático (painel ZapSign → Configurações →
//                          Integrações → API). OBRIGATÓRIO.
//   ZAPSIGN_BASE_URL       default https://api.zapsign.com.br — troque para
//                          https://sandbox.api.zapsign.com.br em testes.
//   ZAPSIGN_WEBHOOK_SECRET segredo que colocamos na URL do webhook registrado
//                          (?secret=...) para validar a origem dos eventos.

const BASE_URL = (process.env.ZAPSIGN_BASE_URL ?? "https://api.zapsign.com.br").replace(/\/$/, "");
const API_TOKEN = process.env.ZAPSIGN_API_TOKEN ?? "";

const TIMEOUT_MS = 30_000;

export function isZapSignConfigured(): boolean {
  return !!API_TOKEN;
}

async function zapsignFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ZapSign HTTP ${res.status} em ${path}: ${body.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

export interface ZapSignSigner {
  token: string;
  name: string;
  status: string; // new | link-opened | signed | ...
  sign_url: string;
  phone_number?: string | null;
}

export interface ZapSignDoc {
  token: string;
  open_id: number;
  name: string;
  status: string; // pending | signed | refused | ...
  original_file: string | null;
  signed_file: string | null;
  created_at?: string;
  signers: ZapSignSigner[];
}

export interface CreateDocInput {
  /** Nome do documento como aparece na ZapSign (ex.: "Procuração — João da Silva"). */
  name: string;
  /** PDF em base64 (sem prefixo data:). */
  base64Pdf: string;
  signer: {
    name: string;
    /** Telefone E.164 SEM o país (ex.: "41999998888"); país vai em phoneCountry. */
    phoneNumber: string;
    phoneCountry?: string; // default "55"
    email?: string;
  };
  /** Identificador nosso (id da SignatureRequest) para rastrear no painel. */
  externalId?: string;
  folderPath?: string;
}

/**
 * Cria um documento por upload de PDF (base64) com UM signatário.
 * O link de assinatura volta em signers[0].sign_url.
 *
 * auth_mode "assinaturaTela": o cliente desenha a assinatura na tela —
 * fricção mínima pra quem assina pelo celular no WhatsApp.
 * Envio automático por email/WhatsApp da ZapSign fica DESLIGADO: quem manda o
 * link é o nosso bot, dentro da conversa que o cliente já tem com a empresa.
 */
export async function createDocFromPdf(input: CreateDocInput): Promise<ZapSignDoc> {
  if (!isZapSignConfigured()) throw new Error("ZAPSIGN_API_TOKEN não configurado");
  return zapsignFetch<ZapSignDoc>("/docs/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      base64_pdf: input.base64Pdf,
      lang: "pt-br",
      disable_signer_emails: true,
      external_id: input.externalId ?? null,
      ...(input.folderPath ? { folder_path: input.folderPath } : {}),
      signers: [
        {
          name: input.signer.name,
          email: input.signer.email ?? "",
          phone_country: input.signer.phoneCountry ?? "55",
          phone_number: input.signer.phoneNumber,
          auth_mode: "assinaturaTela",
          send_automatic_email: false,
          send_automatic_whatsapp: false,
        },
      ],
    }),
  });
}

/** Detalhe/status atual do documento (usado como fonte da verdade nos webhooks e no cron). */
export async function getDoc(docToken: string): Promise<ZapSignDoc> {
  if (!isZapSignConfigured()) throw new Error("ZAPSIGN_API_TOKEN não configurado");
  return zapsignFetch<ZapSignDoc>(`/docs/${docToken}/`);
}

/**
 * Baixa o PDF assinado (signed_file é uma URL temporária da ZapSign).
 * Devolve o buffer para subirmos nossa cópia no S3.
 */
export async function downloadSignedPdf(doc: ZapSignDoc): Promise<Buffer | null> {
  if (!doc.signed_file) return null;
  const res = await fetch(doc.signed_file, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`download do PDF assinado falhou: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Registra o webhook da empresa na ZapSign apontando pro nosso endpoint.
 * Rodar UMA vez por ambiente (script scripts/zapsign-register-webhook.mjs).
 *
 * A ZapSign não assina os webhooks (sem HMAC documentado) — a validação de
 * origem é o header customizado x-zap-secret registrado aqui, conferido pelo
 * nosso endpoint. type="" = TODOS os eventos (doc_signed, doc_viewed,
 * doc_refused, doc_expired...) — o endpoint filtra o que interessa.
 */
export async function registerWebhook(url: string, secret: string): Promise<unknown> {
  if (!isZapSignConfigured()) throw new Error("ZAPSIGN_API_TOKEN não configurado");
  return zapsignFetch("/user/company/webhook/", {
    method: "POST",
    body: JSON.stringify({
      url,
      type: "",
      headers: [{ name: "x-zap-secret", value: secret }],
    }),
  });
}
