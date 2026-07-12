import { timingSafeEqual } from "crypto";
import { hash, compare } from "bcryptjs";

// Senhas agora são armazenadas como hash bcrypt. O banco ainda tem senhas
// legadas em texto puro: verifyPassword aceita as duas formas e sinaliza
// (needsRehash) para o caller re-gravar como hash no primeiro login válido.
// Para migrar tudo de uma vez, rode: node scripts/hash-passwords.mjs

const BCRYPT_PREFIX = /^\$2[aby]\$/;
const SALT_ROUNDS = 10;

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
    return { ok: await compare(plain, stored), needsRehash: false };
  }
  // Legado em texto puro: comparação em tempo constante pra não vazar por timing.
  const a = Buffer.from(plain);
  const b = Buffer.from(stored);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return { ok, needsRehash: ok };
}
