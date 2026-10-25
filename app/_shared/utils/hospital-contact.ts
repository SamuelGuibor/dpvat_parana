// Contato do hospital para o pedido de prontuário (Etapa 5 da IA de operação):
// o que pode ir para as colunas hospital_* do GHOST, tirado SÓ de nota
// publicada do vault. Puro; usado pelo scripts/vault-hospitais-para-ghost.mjs
// (backfill, dry-run padrão) e pelo preparar_email (destinatário quando o GHOST
// ainda não foi preenchido). Testado em tests/hospital-contact.test.ts.
//
// Regra conservadora: só preenche com contato ÚNICO. Dois e-mails na nota =
// a pessoa escolhe (fica de fora, com o motivo).

import { isValidEmail, normalizeEmail } from "./email-mime";
import { MODOS, type Frontmatter } from "./vault";

export interface GhostContact {
  email: string | null;
  telefone: string | null;
  /** Modos do vault (email|whatsapp|presencial|site) separados por vírgula. */
  modo: string | null;
  /** Por que algum campo ficou de fora. */
  problemas: string[];
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

export function ghostContactFromNote(fm: Frontmatter): GhostContact {
  const problemas: string[] = [];
  if (fm.status !== "publicado") {
    return { email: null, telefone: null, modo: null, problemas: [`nota com status "${String(fm.status ?? "?")}" (só publicada preenche)`] };
  }
  const contatos = (fm.contatos && typeof fm.contatos === "object" ? fm.contatos : {}) as Record<string, unknown>;
  const emails = [...new Set(strList(contatos.email).map(normalizeEmail))];
  const telefones = [...new Set(strList(contatos.telefone))];

  let email: string | null = null;
  if (emails.length === 1) {
    if (isValidEmail(emails[0])) email = emails[0];
    else problemas.push(`e-mail inválido: ${emails[0]}`);
  } else if (emails.length > 1) problemas.push(`${emails.length} e-mails na nota (escolha humana)`);

  let telefone: string | null = null;
  if (telefones.length === 1) telefone = telefones[0];
  else if (telefones.length > 1) problemas.push(`${telefones.length} telefones na nota (escolha humana)`);

  const modos = strList(fm.modo).filter((m) => (MODOS as readonly string[]).includes(m));
  return { email, telefone, modo: modos.length ? modos.join(",") : null, problemas };
}
