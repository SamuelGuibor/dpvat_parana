// Extração de contatos (e-mail, telefone BR, link) de texto livre, sem
// dependência de Node: usada no navegador (quadro Cérebro APP) e pelo vault
// (app/_shared/utils/vault.ts re-exporta). Testado em tests/vault.test.ts.

export type Contatos = { email: string[]; telefone: string[]; site: string[] };

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()"'`\]]+/gi;
// Telefone BR: (41) 3333-4444 · 41 99999-9999 · +55 41 3333 4444 · 0800 123 4567.
// Exige separador ou DDD para não pegar número de protocolo/CNPJ solto. O
// separador do meio aceita espaço em volta do hífen ("3174 - 3100"), comum nas
// automações digitadas à mão.
const PHONE_RE =
  /(?<![\d/])(?:\+?55[\s.-]?)?(?:\(\d{2}\)\s?|\d{2}[\s.-])(?:9[\s.]?)?\d{4}(?:\s?[.-]\s?|\s)?\d{4}(?![\d/])|(?<!\d)0800[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)|(?<![\d/])9?\d{4}-\d{4}(?![\d/])/g;

const trimUrl = (u: string) => u.replace(/[.,;:!?*_]+$/, "");

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** Extrai e-mails, telefones e links literais de um texto (ordem de aparição, sem repetir). */
export function extractContacts(text: string): Contatos {
  // O comentário das automações chega com quebra de linha ESCAPADA ("\n" como
  // barra + n): sem trocar por espaço, o "n" gruda no contato vizinho
  // ("atendimento\n(11)…" virava link, "\nhsfa@" virava "nhsfa@").
  const t = (text ?? "").replace(/\\[nrt]/g, " ");
  const email = uniq((t.match(EMAIL_RE) ?? []).map((e) => e.replace(/[.]+$/, "")));
  // Link sem o e-mail (o "dominio.com" de um e-mail não é link).
  const site = uniq((t.match(URL_RE) ?? []).map(trimUrl));
  const telefone = uniq((t.replace(URL_RE, " ").match(PHONE_RE) ?? []).map((p) => p.trim()));
  return { email, telefone, site };
}

export const normEmail = (e: string) => e.trim().toLowerCase();
export const normPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
};
export const normUrl = (u: string) =>
  trimUrl(u.trim().toLowerCase())
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");

