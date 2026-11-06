import { timingSafeEqual } from "crypto";
import { hash, compare } from "bcryptjs";

// Senhas agora são armazenadas como hash bcrypt. O banco ainda tem senhas
// legadas em texto puro: verifyPassword aceita as duas formas e sinaliza
// (needsRehash) para o caller re-gravar como hash no primeiro login válido.
// Para migrar tudo de uma vez, rode: node scripts/hash-passwords.mjs

const BCRYPT_PREFIX = /^\$2[aby]\$/;
const SALT_ROUNDS = 10;

/** Senha com que todo card de cliente nasce; é informada no fluxo "Área do cliente". */
export const SENHA_PADRAO_CLIENTE = "brasilbeneficios1";

// Troca de marca (06/11/2026): quem nunca mudou a senha ainda tem o hash da padrão
// antiga, e o fluxo do WhatsApp agora informa a nova. A nova abre essas contas e
// needsRehash faz o login regravar o hash; a antiga continua valendo até lá.
const SENHA_PADRAO_ANTIGA = "segurosparana1";

export function isHashedPassword(stored: string): boolean {
  return BCRYPT_PREFIX.test(stored);
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (isHashedPassword(stored)) {
    if (await compare(plain, stored)) return { ok: true, needsRehash: false };
    if (plain !== SENHA_PADRAO_CLIENTE) return { ok: false, needsRehash: false };
    const ok = await compare(SENHA_PADRAO_ANTIGA, stored);
    return { ok, needsRehash: ok };
  }
  // Legado em texto puro: comparação em tempo constante pra não vazar por timing.
  const a = Buffer.from(plain);
  const b = Buffer.from(stored);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return { ok, needsRehash: ok };
}
