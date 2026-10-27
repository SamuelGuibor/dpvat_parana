// Editar o cadastro do card pela IA de operação (decisão 15 do dono, 26/10):
// a IA preenche e corrige campos. Campo vazio → grava com a prévia normal;
// campo já preenchido → a prévia mostra "antes → depois" e a execução exige
// `confirmar_trocas` (o operador validou a troca, não só o "sim" genérico).
//
// Lista FECHADA de campos: os que a procuração/pedido usam + contato. Fora
// dela de propósito: senha/senha_inss (credencial), role/labelId (coluna é
// mover_card), status (o checklist manda WhatsApp ao cliente), email (é
// @unique e serve de login), obs (texto livre) e os do responsável
// (provisória). Puro: testado em tests/cadastro-ia.test.ts.

import { isValidCpf } from "./format";

export const CADASTRO_CAMPOS = {
  name: "nome",
  cpf: "CPF",
  rg: "RG",
  data_nasc: "data de nascimento",
  nome_mae: "nome da mãe",
  nacionalidade: "nacionalidade",
  estado_civil: "estado civil",
  profissao: "profissão",
  rua: "rua",
  numero: "número",
  bairro: "bairro",
  cep: "CEP",
  cidade: "cidade",
  estado: "estado",
  telefone: "telefone",
  telefone_secundario: "telefone secundário",
  rede_social: "rede social",
  data_acidente: "data do acidente",
  atendimento_via: "atendimento via",
  hospital: "hospital",
  outro_hospital: "outro hospital",
  lesoes: "lesões",
} as const;

export type CadastroCampo = keyof typeof CADASTRO_CAMPOS;
export const CADASTRO_CAMPO_IDS = Object.keys(CADASTRO_CAMPOS) as CadastroCampo[];

/** Pedidos que nunca passam (a mensagem diz por quê, em vez de "campo desconhecido"). */
const PROIBIDOS: Record<string, string> = {
  senha: "senha não se edita pela IA",
  password: "senha não se edita pela IA",
  senha_inss: "a senha do INSS não se edita pela IA",
  role: "coluna se muda com mover_card",
  labelid: "coluna se muda com mover_card",
  coluna: "coluna se muda com mover_card",
  status: "o status do checklist manda WhatsApp ao cliente: faça pelo site",
  email: "o e-mail do card é o login do cliente: faça pelo site",
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "data do acidente" / "data_acidente" / "Nome da Mãe" → id do campo; proibido → {proibido}. */
export function resolveCampo(input: string): { campo: CadastroCampo } | { proibido: string } | null {
  const q = norm(input);
  const key = q.replace(/ /g, "_");
  const proibido = PROIBIDOS[key] ?? (/senha/.test(key) ? PROIBIDOS.senha : undefined);
  if (proibido) return { proibido };
  for (const id of CADASTRO_CAMPO_IDS) {
    if (id === key || norm(CADASTRO_CAMPOS[id]) === q) return { campo: id };
  }
  return null;
}

const DIGITOS = new Set<CadastroCampo>(["cpf", "telefone", "telefone_secundario", "cep"]);

/** Mesma normalização do updateUser (CPF/telefone/CEP só dígitos) + validação de formato. */
export function normalizeCampo(campo: CadastroCampo, valor: string): { ok: true; valor: string } | { ok: false; motivo: string } {
  const v = valor.replace(/\s+/g, " ").trim();
  if (!v) return { ok: false, motivo: `${CADASTRO_CAMPOS[campo]} vazio: a IA não apaga campo (faça pelo site)` };
  if (/[\r\n]/.test(valor) && campo !== "lesoes") return { ok: false, motivo: `${CADASTRO_CAMPOS[campo]} com quebra de linha` };
  if (!DIGITOS.has(campo)) {
    if (v.length > (campo === "lesoes" ? 1000 : 200)) return { ok: false, motivo: `${CADASTRO_CAMPOS[campo]} longo demais` };
    if (campo === "estado" && !/^[A-Za-z]{2}$/.test(v)) return { ok: false, motivo: "estado = sigla de 2 letras (ex.: PR)" };
    return { ok: true, valor: campo === "estado" ? v.toUpperCase() : v };
  }
  const d = v.replace(/\D/g, "");
  if (campo === "cpf" && !(d.length === 11 && isValidCpf(d))) return { ok: false, motivo: "CPF inválido (dígitos verificadores não batem)" };
  if (campo === "cep" && d.length !== 8) return { ok: false, motivo: "CEP precisa de 8 dígitos" };
  if ((campo === "telefone" || campo === "telefone_secundario") && (d.length < 10 || d.length > 13)) {
    return { ok: false, motivo: `${CADASTRO_CAMPOS[campo]} precisa de DDD + número (10 a 13 dígitos)` };
  }
  return { ok: true, valor: d };
}

export interface CadastroMudanca {
  campo: CadastroCampo;
  rotulo: string;
  de: string | null;
  para: string;
  /** preencher = estava vazio; trocar = já tinha valor (precisa de confirmar_trocas). */
  tipo: "preencher" | "trocar";
}

/** Compara com o card atual: o que muda, o que já está igual. */
export function planCadastro(
  atual: Partial<Record<CadastroCampo, string | null>>,
  novos: Partial<Record<CadastroCampo, string>>,
): { mudancas: CadastroMudanca[]; iguais: CadastroCampo[] } {
  const mudancas: CadastroMudanca[] = [];
  const iguais: CadastroCampo[] = [];
  for (const campo of CADASTRO_CAMPO_IDS) {
    const para = novos[campo];
    if (para === undefined) continue;
    const de = (atual[campo] ?? "").trim();
    if (de === para) {
      iguais.push(campo);
      continue;
    }
    mudancas.push({ campo, rotulo: CADASTRO_CAMPOS[campo], de: de || null, para, tipo: de ? "trocar" : "preencher" });
  }
  return { mudancas, iguais };
}
