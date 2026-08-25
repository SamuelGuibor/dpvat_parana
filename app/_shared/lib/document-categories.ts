// Categorias (pastas) dos anexos do card — estilo Google Drive: a aba Arquivos
// abre nas pastas e só mostra os PDFs depois de entrar em uma delas.
//
// O id é o que vai gravado em Document.category (texto livre no banco, mas só
// estes valores são aceitos pela API). Documentos antigos/importados ficam com
// category null e caem em OUTROS — a não ser que o nome deixe a pasta óbvia,
// e aí inferCategory() resolve (também usado no backfill da migration).

export const DOCUMENT_CATEGORIES = [
  { id: 'PROCURACAO', label: 'PROCURAÇÃO' },
  { id: 'HIPOSSUFICIENCIA', label: 'DECLARAÇÃO DE HIPOSSUFICIÊNCIA' },
  { id: 'IDENTIFICACAO', label: 'DOCUMENTO DE IDENTIFICAÇÃO' },
  { id: 'EXAME_MEDICO', label: 'EXAME MÉDICO' },
  { id: 'DOCS_INSS', label: 'DOCS INSS' },
  { id: 'PROCESSO', label: 'PROCESSO' },
  { id: 'ROTEIRO', label: 'ROTEIRO' },
  { id: 'OUTROS', label: 'OUTROS' },
] as const;

export type DocumentCategoryId = (typeof DOCUMENT_CATEGORIES)[number]['id'];

export const DEFAULT_DOCUMENT_CATEGORY: DocumentCategoryId = 'OUTROS';

const IDS = DOCUMENT_CATEGORIES.map((c) => c.id) as readonly string[];

export function isDocumentCategory(value: unknown): value is DocumentCategoryId {
  return typeof value === 'string' && IDS.includes(value);
}

export function categoryLabel(id: string | null | undefined): string {
  return DOCUMENT_CATEGORIES.find((c) => c.id === id)?.label ?? 'OUTROS';
}

/** Tira acento e caixa pra casar "PROCURAÇÃO", "procuracao" e "Procuração". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    // "_", "-", "." e afins viram espaço para "cnh_joao.pdf" casar com CNH.
    .replace(/[^A-Z0-9]+/g, ' ');
}

// Ordem IMPORTA: o primeiro padrão que casar decide a pasta. "ROTEIRO" vem
// antes de tudo porque o roteiro costuma citar processo/INSS no nome.
const PATTERNS: { id: DocumentCategoryId; re: RegExp }[] = [
  { id: 'ROTEIRO', re: /ROTEIRO/ },
  { id: 'PROCURACAO', re: /PROCURA/ },
  { id: 'HIPOSSUFICIENCIA', re: /HIPOSSUFICI|HIPO SUFICI|DECLARACAO DE HIPO/ },
  { id: 'DOCS_INSS', re: /\bINSS\b|\bCNIS\b|MEU ?INSS|CARTA DE CONCESSAO|EXTRATO PREVIDENCIARIO|SENHA GOV/ },
  { id: 'EXAME_MEDICO', re: /EXAME|LAUDO|PRONTUARIO|ATESTADO|MEDIC|RAIO ?X|RESSONANCIA|TOMOGRAFIA|ULTRASSOM|RECEITUARIO/ },
  { id: 'IDENTIFICACAO', re: /\bRG\b|\bCNH\b|IDENTIDADE|IDENTIFICACAO|\bCPF\b|DOC(UMENTO)? PESSOAL|CERTIDAO DE (NASCIMENTO|CASAMENTO)/ },
  { id: 'PROCESSO', re: /PROCESSO|PETICAO|SENTENCA|DESPACHO|ACAO JUDICIAL|CONTRATO/ },
];

/**
 * Adivinha a pasta pelo nome do arquivo. Usado no upload (pré-seleção do
 * "Tipo de documento"), nos documentos gerados por automação/assinatura/
 * WhatsApp e como fallback de leitura pros anexos anteriores à feature.
 */
export function inferCategory(fileName: string): DocumentCategoryId {
  const name = normalize(fileName);
  for (const { id, re } of PATTERNS) {
    if (re.test(name)) return id;
  }
  return DEFAULT_DOCUMENT_CATEGORY;
}
