import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Criptografia dos segredos da Meta guardados no banco (WhatsAppNumber):
// AES-256-GCM com chave derivada de WHATSAPP_CRED_KEY (ou, na falta dela,
// NEXT_AUTH_SECRET — já obrigatória no ambiente). Formato armazenado:
// "v1:<iv>:<authTag>:<cipher>" em base64. Trocar a chave invalida os tokens
// salvos — eles precisam ser recadastrados na tela de Números.

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!cachedKey) {
    const secret = process.env.WHATSAPP_CRED_KEY ?? process.env.NEXT_AUTH_SECRET;
    if (!secret) throw new Error("Configure WHATSAPP_CRED_KEY (ou NEXT_AUTH_SECRET) para criptografar credenciais.");
    cachedKey = scryptSync(secret, "whatsapp-number-creds", 32);
  }
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [v, ivB64, tagB64, dataB64] = stored.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Credencial em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
