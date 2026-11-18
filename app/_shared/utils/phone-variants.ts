// Telefone BR: normalização e variantes com/sem o 9º dígito do celular.
//
// Puro (sem banco): usado pela API externa de mensagens (T-WOJYR) para achar o
// contato do WhatsApp por IGUALDADE em WhatsAppContact.phone (índice [phone]).
// O mesmo celular aparece gravado com e sem o 9 (a Meta às vezes manda o wa_id
// antigo, de 12 dígitos), então a busca tenta as duas formas. Não use
// "últimos 8 dígitos" (contactIdsForCard) para isso: ignora o DDD e acha o
// celular de outra cidade.

/** Normaliza telefone BR para o formato E.164 sem "+" (55 + DDD + número). */
export function normalizePhoneBR(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Remove zeros de operadora à esquerda (ex: 041...).
  digits = digits.replace(/^0+/, "");
  if (!digits.startsWith("55")) digits = `55${digits}`;
  // 55 + DDD(2) + número(8 ou 9)
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

/**
 * Formas do MESMO telefone que podem estar gravadas no contato, a partir do
 * número já normalizado (55 + DDD + 8/9 dígitos). O par com/sem o 9 só vale
 * quando o núcleo de 8 dígitos (sem o 9) NÃO tem cara de fixo:
 *  - núcleo começando por 6–9: celular antigo; a Meta grava muitos sem o 9
 *    (no banco, 12 dígitos começam por 7/8/9);
 *  - núcleo começando por 0–1: só existe como celular "9 1xxx" (gravado com
 *    13 dígitos); quem manda sem o 9 errou, e não há fixo assim;
 *  - núcleo começando por 2–5: tem cara de fixo → só a forma exata. Pôr ou
 *    tirar o 9 aqui acharia a conversa de OUTRA pessoa (fixo × celular).
 * O DDD nunca muda. Entrada fora do formato → [] (a rota responde 400).
 */
export function phoneVariantsBR(normalized: string): string[] {
  if (!/^55\d{10,11}$/.test(normalized)) return [];
  const ddd = normalized.slice(2, 4);
  const local = normalized.slice(4);
  // 9 dígitos sem o 9 na frente não é celular válido: só a forma exata.
  if (local.length === 9 && !local.startsWith("9")) return [normalized];
  const core = local.length === 9 ? local.slice(1) : local;
  if (/^[2-5]/.test(core)) return [normalized];
  const com9 = `55${ddd}9${core}`;
  const sem9 = `55${ddd}${core}`;
  return local.length === 9 ? [com9, sem9] : [sem9, com9];
}
