// Análise de documentos pela IA de operação (decisão do dono, 27/10): o que a
// IA leu nos arquivos do card × o que está no cadastro. Puro e testado em
// tests/doc-extract.test.ts. A leitura em si (S3 + Claude) fica em
// app/_shared/lib/op/doc-analysis.ts; aqui só a consolidação e a comparação.
//
// Regra: o valor extraído é o que está ESCRITO no documento; a IA não corrige
// nem completa. CPF só vira sugestão se passar no dígito verificador.

import { isValidCpf } from "./format";
import { CADASTRO_CAMPOS, type CadastroCampo } from "./cadastro-ia";

export const DOC_TIPOS = ["RG", "CNH", "CIN", "CPF", "CTPS", "comprovante_endereco", "certidao", "laudo", "procuracao", "outro"] as const;
export type DocTipo = (typeof DOC_TIPOS)[number];

/** Documentos de identidade: têm prioridade para nome, CPF, RG, nascimento e filiação. */
const IDENTIDADE = new Set<DocTipo>(["RG", "CNH", "CIN", "CPF"]);

export interface ExtractedEndereco {
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}

export interface ExtractedDoc {
  arquivo: string;
  tipo: DocTipo;
  legivel: boolean;
  nome?: string | null;
  cpf?: string | null;
  rg?: string | null;
  orgao_emissor?: string | null;
  data_expedicao?: string | null;
  data_nascimento?: string | null;
  nome_mae?: string | null;
  nacionalidade?: string | null;
  estado_civil?: string | null;
  profissao?: string | null;
  endereco?: ExtractedEndereco | null;
  observacoes?: string | null;
}

/** Campos do cadastro que a análise compara (todos editáveis por editar_cadastro). */
export const CAMPOS_COMPARADOS = [
  "name",
  "cpf",
  "rg",
  "data_nasc",
  "nome_mae",
  "nacionalidade",
  "estado_civil",
  "profissao",
  "rua",
  "numero",
  "bairro",
  "cidade",
  "estado",
  "cep",
] as const satisfies readonly CadastroCampo[];
export type CampoComparado = (typeof CAMPOS_COMPARADOS)[number];

export type CardCadastro = Partial<Record<CampoComparado, string | null>>;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && s.toLowerCase() !== "null" ? s : null;
};

/** Aceita o JSON da IA com tolerância: lista garantida, tipo válido, strings limpas. */
export function parseExtracted(raw: unknown): ExtractedDoc[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { documentos?: unknown }).documentos)
      ? (raw as { documentos: unknown[] }).documentos
      : [];
  const out: ExtractedDoc[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;
    const tipoRaw = str(d.tipo)?.toLowerCase() ?? "outro";
    const tipo = (DOC_TIPOS.find((t) => t.toLowerCase() === tipoRaw) ?? "outro") as DocTipo;
    const e = d.endereco && typeof d.endereco === "object" ? (d.endereco as Record<string, unknown>) : null;
    out.push({
      arquivo: str(d.arquivo) ?? "?",
      tipo,
      legivel: d.legivel !== false,
      nome: str(d.nome),
      cpf: str(d.cpf),
      rg: str(d.rg),
      orgao_emissor: str(d.orgao_emissor),
      data_expedicao: str(d.data_expedicao),
      data_nascimento: str(d.data_nascimento),
      nome_mae: str(d.nome_mae),
      nacionalidade: str(d.nacionalidade),
      estado_civil: str(d.estado_civil),
      profissao: str(d.profissao),
      endereco: e ? { rua: str(e.rua), numero: str(e.numero), bairro: str(e.bairro), cidade: str(e.cidade), estado: str(e.estado), cep: str(e.cep) } : null,
      observacoes: str(d.observacoes),
    });
  }
  return out;
}

export interface Consolidado {
  valores: Partial<Record<CampoComparado, string>>;
  /** De qual arquivo veio cada valor. */
  fontes: Partial<Record<CampoComparado, string>>;
}

const digits = (s: string) => s.replace(/\D/g, "");

/** "01/05/1990", "1990-05-01", "01.05.90" → "01/05/1990" (dd/mm/aaaa); irreconhecível → o texto como veio. */
export function normalizeDateBR(s: string): string {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 30 ? `19${m[3]}` : `20${m[3]}`) : m[3];
    return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${y}`;
  }
  return t;
}

function pick(
  docs: ExtractedDoc[],
  get: (d: ExtractedDoc) => string | null | undefined,
  preferir: (d: ExtractedDoc) => boolean,
): { valor: string; fonte: string } | null {
  const ordered = [...docs.filter((d) => d.legivel && preferir(d)), ...docs.filter((d) => d.legivel && !preferir(d))];
  for (const d of ordered) {
    const v = get(d);
    if (v) return { valor: v, fonte: d.arquivo };
  }
  return null;
}

/** Um valor por campo: identidade vem do RG/CNH/CIN/CPF; endereço, do comprovante. */
export function consolidate(docs: ExtractedDoc[]): Consolidado {
  const valores: Consolidado["valores"] = {};
  const fontes: Consolidado["fontes"] = {};
  const set = (campo: CampoComparado, r: { valor: string; fonte: string } | null) => {
    if (!r) return;
    valores[campo] = r.valor;
    fontes[campo] = r.fonte;
  };
  const ident = (d: ExtractedDoc) => IDENTIDADE.has(d.tipo);
  const endereco = (d: ExtractedDoc) => d.tipo === "comprovante_endereco";
  set("name", pick(docs, (d) => d.nome, ident));
  set("cpf", pick(docs, (d) => (d.cpf && isValidCpf(digits(d.cpf)) ? digits(d.cpf) : null), ident));
  set("rg", pick(docs, (d) => d.rg, ident));
  set("data_nasc", pick(docs, (d) => (d.data_nascimento ? normalizeDateBR(d.data_nascimento) : null), ident));
  set("nome_mae", pick(docs, (d) => d.nome_mae, ident));
  set("nacionalidade", pick(docs, (d) => d.nacionalidade, ident));
  set("estado_civil", pick(docs, (d) => d.estado_civil, ident));
  set("profissao", pick(docs, (d) => d.profissao, ident));
  set("rua", pick(docs, (d) => d.endereco?.rua, endereco));
  set("numero", pick(docs, (d) => d.endereco?.numero, endereco));
  set("bairro", pick(docs, (d) => d.endereco?.bairro, endereco));
  set("cidade", pick(docs, (d) => d.endereco?.cidade, endereco));
  set("estado", pick(docs, (d) => (d.endereco?.estado ? d.endereco.estado.toUpperCase().slice(0, 2) : null), endereco));
  set("cep", pick(docs, (d) => (d.endereco?.cep && digits(d.endereco.cep).length === 8 ? digits(d.endereco.cep) : null), endereco));
  return { valores, fontes };
}

const normText = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Igualdade por campo: dígitos (CPF/CEP/RG), data normalizada, ou texto sem acento/caixa. */
export function sameValue(campo: CampoComparado, a: string, b: string): boolean {
  if (campo === "cpf" || campo === "cep") return digits(a) === digits(b);
  if (campo === "rg") return digits(a) === digits(b) && digits(a).length > 0;
  if (campo === "data_nasc") return normalizeDateBR(a) === normalizeDateBR(b);
  return normText(a) === normText(b);
}

export interface Divergencia {
  campo: CampoComparado;
  rotulo: string;
  noDocumento: string;
  noCard: string | null;
  fonte: string;
}

export interface Comparacao {
  divergencias: Divergencia[];
  /** Campo vazio no card que o documento preenche (editar_cadastro grava direto). */
  preencher: Partial<Record<CampoComparado, string>>;
  /** Campo já preenchido que o documento contradiz (editar_cadastro exige confirmar_trocas). */
  trocar: Partial<Record<CampoComparado, string>>;
  iguais: CampoComparado[];
  /** Pronto para `editar_cadastro.campos`: preencher + trocar. */
  sugestoes: Partial<Record<CampoComparado, string>>;
}

export function compareWithCard(c: Consolidado, card: CardCadastro): Comparacao {
  const divergencias: Divergencia[] = [];
  const preencher: Comparacao["preencher"] = {};
  const trocar: Comparacao["trocar"] = {};
  const iguais: CampoComparado[] = [];
  for (const campo of CAMPOS_COMPARADOS) {
    const doc = c.valores[campo];
    if (!doc) continue;
    const atual = str(card[campo]);
    if (!atual) {
      preencher[campo] = doc;
      continue;
    }
    if (sameValue(campo, atual, doc)) {
      iguais.push(campo);
      continue;
    }
    trocar[campo] = doc;
    divergencias.push({ campo, rotulo: CADASTRO_CAMPOS[campo], noDocumento: doc, noCard: atual, fonte: c.fontes[campo] ?? "?" });
  }
  return { divergencias, preencher, trocar, iguais, sugestoes: { ...preencher, ...trocar } };
}
