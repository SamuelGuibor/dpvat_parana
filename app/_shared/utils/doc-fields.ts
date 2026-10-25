// Regras puras dos documentos que a IA de operação prepara (Etapa 4):
// tags `[[campo]]` de um modelo .docx, dados do card que os modelos usam,
// campos faltando, tipo do modelo e as keys do rascunho no S3.
//
// Testado em tests/doc-fields.test.ts. Sem banco, sem S3.

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
// InspectModule não tem export no index do pacote: subcaminho oficial.
import InspectModule from "docxtemplater/js/inspect-module.js";
import { sanitizeDocName } from "./doc-name";

/**
 * Tags `[[campo]]` do modelo, na ordem em que aparecem, sem repetir. Usa o
 * parser do docxtemplater (e não regex no XML): o Word costuma partir uma tag
 * entre vários `<w:r>` ("[[" num run, "cpf]]" no outro) e a regex não vê.
 */
export function templateFields(content: Buffer | Uint8Array): string[] {
  // A tipagem declara classe; em runtime é fábrica — `new` funciona nos dois.
  const inspect = new InspectModule();
  new Docxtemplater(new PizZip(content), {
    modules: [inspect],
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "[[", end: "]]" },
  });
  return Object.keys(inspect.getAllTags());
}

/** Campos do card que os modelos do grupo procuração leem. */
export interface ProcuracaoSource {
  name?: string | null;
  cpf?: string | null;
  rg?: string | null;
  nacionalidade?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  rua?: string | null;
  bairro?: string | null;
  numero?: string | null;
  cep?: string | null;
  cidade?: string | null;
  estado?: string | null;
  data_nasc?: string | null;
  hospital?: string | null;
  nome_mae?: string | null;
  data_acidente?: string | null;
}

/**
 * Dados que os modelos `[[ ]]` recebem. Era montado dentro de
 * gerarProcuracaoById; extraído sem mudar nada para a IA usar o MESMO mapa.
 * `hoje` vem pronto: a UI manda o formato antigo, a IA manda Brasília.
 */
export function buildProcuracaoData(card: ProcuracaoSource, hoje: string) {
  return {
    name: card.name || "",
    cpf: card.cpf || "",
    rg: card.rg || "",
    nacionalidade: card.nacionalidade || "brasileiro(a)",
    estado_civil: card.estado_civil || "",
    profissao: card.profissao || "",
    rua: card.rua || "",
    bairro: card.bairro || "",
    numero: card.numero || "",
    cep: card.cep || "",
    cidade: card.cidade || "",
    estado: card.estado || "",
    data_nascimento: card.data_nasc || "",
    hospital: card.hospital || "",
    nome_mae: card.nome_mae || "",
    data_acidente: card.data_acidente || "",
    data: hoje,
  };
}

export type ProcuracaoData = ReturnType<typeof buildProcuracaoData>;

/** Nome do campo como a equipe fala (e como aparece no card). */
export const DOC_FIELD_LABELS: Record<string, string> = {
  name: "nome",
  cpf: "CPF",
  rg: "RG",
  nacionalidade: "nacionalidade",
  estado_civil: "estado civil",
  profissao: "profissão",
  rua: "rua",
  bairro: "bairro",
  numero: "número",
  cep: "CEP",
  cidade: "cidade",
  estado: "estado",
  data_nascimento: "data de nascimento",
  hospital: "hospital",
  nome_mae: "nome da mãe",
  data_acidente: "data do acidente",
  data: "data de hoje",
};

export interface MissingField {
  campo: string;
  rotulo: string;
  /** true = o CRM não tem esse campo (tag do modelo fora de `dados`). */
  desconhecido: boolean;
}

/**
 * Tags do modelo que sairiam em branco: valor vazio no card ou tag que o CRM
 * nem tem. Nunca gere calado — quem chama mostra esta lista ao operador.
 */
export function missingFields(tags: string[], dados: Record<string, string>): MissingField[] {
  const out: MissingField[] = [];
  for (const tag of tags) {
    const known = Object.prototype.hasOwnProperty.call(dados, tag);
    if (known && String(dados[tag] ?? "").trim()) continue;
    out.push({ campo: tag, rotulo: DOC_FIELD_LABELS[tag] ?? tag, desconhecido: !known });
  }
  return out;
}

export type DraftKind = "procuracao" | "pedido_prontuario" | "contrato";

export const DRAFT_KIND_LABEL: Record<DraftKind, string> = {
  procuracao: "procuração",
  pedido_prontuario: "pedido de prontuário",
  contrato: "contrato (KIT)",
};

/** Ferramenta da IA que prepara cada tipo (a mensagem de erro aponta a certa). */
export const DRAFT_KIND_TOOL: Record<DraftKind, string> = {
  procuracao: "preparar_procuracao",
  pedido_prontuario: "preparar_pedido_prontuario",
  contrato: "preparar_contrato",
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Tipo do modelo pelo nome do arquivo/rótulo. O grupo "procuração" da tela de
 * modelos mistura procurações, declaração, KIT (procuração + contrato) e o
 * pedido hospitalar; não há coluna de tipo no banco.
 */
export function classifyTemplate(name: string): DraftKind {
  const n = ` ${normalize(name)} `;
  if (/ PEDIDO | HOSPITALAR | PRONTUARIO/.test(n)) return "pedido_prontuario";
  if (/ KIT | CONTRATO /.test(n)) return "contrato";
  return "procuracao";
}

/** Modelo pelo nome EXATO (arquivo com ou sem .docx, ou rótulo; sem acento/caixa). */
export function matchTemplate<T extends { filename: string; label: string }>(
  templates: T[],
  query: string,
): { exact: T | null; candidates: T[] } {
  const q = normalize(query.replace(/\.docx$/i, ""));
  const keyOf = (t: T) => [normalize(t.filename.replace(/\.docx$/i, "")), normalize(t.label)];
  const exact = templates.find((t) => keyOf(t).includes(q)) ?? null;
  if (exact) return { exact, candidates: [] };
  const candidates = q ? templates.filter((t) => keyOf(t).some((k) => k.includes(q))) : [];
  return { exact: null, candidates };
}

// ---------------------------------------------------------------------------
// Rascunho no S3: op-drafts/<cardId>/<ts>-<8 hex>.pdf
// ---------------------------------------------------------------------------

export const OP_DRAFT_PREFIX = "op-drafts/";
/** Rascunho não anexado vence em 7 dias (anexar recusa; o cron da lixeira apaga). */
export const OP_DRAFT_TTL_DAYS = 7;

const DRAFT_KEY_RE = /^op-drafts\/([A-Za-z0-9_-]{5,64})\/(\d{13})-([a-f0-9]{8})\.pdf$/;

export function opDraftKey(cardId: string, ts: number, rand: string): string {
  return `${OP_DRAFT_PREFIX}${cardId}/${ts}-${rand}.pdf`;
}

/** Key de rascunho válida → partes; qualquer outra coisa (inclusive traversal) → null. */
export function parseOpDraftKey(key: string): { cardId: string; ts: number } | null {
  const m = DRAFT_KEY_RE.exec(key);
  if (!m) return null;
  return { cardId: m[1], ts: Number(m[2]) };
}

export function isOpDraftExpired(createdAt: Date | number, now: number = Date.now()): boolean {
  const t = typeof createdAt === "number" ? createdAt : createdAt.getTime();
  return now - t > OP_DRAFT_TTL_DAYS * 86_400_000;
}

/** Nome do PDF: "<rótulo do modelo> - <cliente>.pdf", sem o que quebra o Content-Disposition. */
export function draftFileName(templateLabel: string, clientName: string | null | undefined): string {
  const base = sanitizeDocName(`${templateLabel.replace(/^-+/, "").trim()} - ${(clientName || "cliente").trim()}`)
    .replace(/\s+/g, " ")
    .slice(0, 150);
  return `${base || "documento"}.pdf`;
}
