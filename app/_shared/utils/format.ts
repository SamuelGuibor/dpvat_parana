// Formatação e validação de dados brasileiros (CPF, telefone, CEP).
// Fonte única — antes cada tela tinha sua própria máscara (ou nenhuma).

export function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/** 04812345678 -> 048.123.456-78 (parcial enquanto digita). */
export function maskCpf(v: string): string {
  return onlyDigits(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** Valida os dígitos verificadores do CPF. */
export function isValidCpf(v: string): boolean {
  const cpf = onlyDigits(v);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const factor of [10, 11]) {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) sum += parseInt(cpf[i]) * (factor - i);
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== parseInt(cpf[factor - 1])) return false;
  }
  return true;
}

/** Exibe telefone BR em formato legível: 5541997862323 -> (41) 99786-2323. */
export function formatPhone(v: string | null | undefined): string {
  let d = onlyDigits(v);
  if (!d) return "";
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "";
}

/** Máscara progressiva para input de telefone (aceita fixo e celular). */
export function maskPhone(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  // Só hifeniza quando o número está completo (10 = fixo, 11 = celular);
  // antes disso a posição do hífen é ambígua.
  if (d.length < 10) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 80010010 -> 80010-010. */
export function maskCep(v: string): string {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/**
 * Normaliza um campo mascarado para gravação no banco: guarda SÓ os dígitos
 * (CPF/telefone/CEP nunca são persistidos com pontos/traços/parênteses).
 * Preserva undefined (campo não enviado) e string vazia (limpar o campo).
 */
export function stripFormat(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v.replace(/\D/g, "");
}

/** Exibe CPF com máscara completa (ou devolve como está se incompleto). */
export function formatCpf(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 11) return v ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
