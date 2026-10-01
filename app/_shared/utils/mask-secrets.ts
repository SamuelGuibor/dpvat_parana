// Rede de segurança de SENHA e CÓDIGO no texto que sai do CRM para a IA e
// para o S3: histórico do /reply e do cron (/followup-decision e irmãos),
// snapshot do cérebro (whatsapp/brain.ts), destilação (whatsapp/distill.ts),
// Copiloto (whatsapp/assist.ts: sugestão e resumos), ficha por IA
// (whatsapp/ficha-ai.ts) e a ficha da conversa (botMemory) em todo envio e
// na gravação.
//
// Decisão do dono (30/09/2026): a IA nunca pede, aceita nem repete a senha do
// gov.br ou o código da ZapSign; quando o cliente manda, a equipe faz o login.
// As instruções mandam a IA transferir sem repetir o valor, mas o valor em si
// continuava indo para a Anthropic em todo turno seguinte (histórico) e ficava
// gravado no snapshot do S3 para sempre. Aqui ele vira "[senha omitida]" ou
// "[código omitido]": a IA ainda sabe QUE o cliente mandou (e transfere), sem
// ver O QUE ele mandou. O banco (whatsapp_messages) continua com o texto
// original — a equipe precisa dele para fazer o login.
//
// Regras (puras, sem Prisma):
//  1. palavra-chave + valor: "senha", "senha do gov", "password", "código",
//     "codigo", "token" (com ":", "=", "é", "eh" opcionais) seguidos de um valor
//     com cara de segredo (tem dígito, símbolo ou maiúscula no meio). Com
//     separador EXPLÍCITO depois de "senha" (":", "=", "é", "eh", "era"), vale
//     qualquer valor de 4+ letras fora da lista de palavras comuns ("minha
//     senha é maria"; "a senha é errada" não mascara), e a senha com espaço
//     junta até 3 pedaços seguintes da mesma linha que sejam número, palavra
//     com maiúscula ou com cara de segredo ("Maria 2020 Nova");
//  2. numa mensagem que fala de senha, o token que mistura letra e dígito
//     ("minha senha nova é Maria2020");
//  3. numa mensagem que fala de código, senha, gov.br, ZapSign, token,
//     verificação ou SMS, a sequência solta de 4 a 8 dígitos ("chegou o 482913
//     no SMS");
//  4. resposta a uma pergunta: alguma das ÚLTIMAS 3 mensagens da conversa
//     (qualquer autor) falou de senha ou de código. Cada LINHA da mensagem que
//     é um token só com cara de segredo ("Abc@1234") é a senha — o lote do
//     webhook junta os balões com "\n", e "segue" + "Abc@1234" chegam juntos;
//     os dígitos soltos depois de "qual o código?" são o código.
// Nunca mascara CPF, data, valor em R$ nem telefone com DDD fora desse
// contexto; ano solto (1900–2099) não conta como código, porque ano de
// acidente e de carteira assinada decide a triagem (R3).
//
// LACUNAS ACEITAS (o que passa sem máscara; a regra das instruções continua
// valendo, isto é só a rede): senha só de letras SEM separador explícito
// ("minha senha maria"); valor de até 3 caracteres; senha que é uma palavra da
// lista de comuns ("minha senha é nova"); a resposta mandada mais de 3
// mensagens depois da pergunta; pedaços de senha com espaço em minúsculas.
//
// É idempotente: o texto já mascarado passa de novo sem mudar (a destilação
// lê snapshots que já saíram mascarados do brain.ts).

export const PASSWORD_MASK = "[senha omitida]";
export const CODE_MASK = "[código omitido]";

/** Quantas mensagens anteriores contam como "pergunta" na regra 4. */
export const MASK_CONTEXT_MESSAGES = 3;

// Fronteira de palavra que entende acento (o \b do JS é só ASCII) e não pega a
// palavra dentro do próprio marcador ("[senha omitida]", "[código omitido]").
const WORD_START = "(?<![\\p{L}\\p{N}\\[])";
const WORD_END = "(?![\\p{L}\\p{N}])";

// "senha do gov", "senha gov.br", "código de verificação", "código da ZapSign"…
// O qualificador é consumido antes do valor: sem ele, "gov.br" viraria o valor.
const QUALIFIER =
  "(?:\\s+(?:d[aeo]s?\\s+|no\\s+|na\\s+)?(?:meu\\s+)?" +
  "(?:gov(?:\\.br)?|inss|app|aplicativo|zap\\s?sign|verifica[çc][ãa]o|acesso|" +
  "seguran[çc]a|confirma[çc][ãa]o|valida[çc][ãa]o|sms|e-?mail))?";

// ":" / "=" colados ou com espaço; "é", "eh", "e", "era" entre espaços (com
// ":" opcional depois); ou só o espaço/quebra de linha.
const SEPARATOR = "(?:\\s*[:=]\\s*|\\s+(?:é|eh|e|era)(?:\\s*[:=])?\\s+|\\s+)";

const KEYWORD_VALUE_RE = new RegExp(
  `${WORD_START}(senha|password|c[óo]digo|token)${WORD_END}${QUALIFIER}(${SEPARATOR})(\\S{3,80})`,
  "giu",
);
// Separador que DECLARA o valor ("senha: x", "senha é x"); o "e" solto fica de
// fora ("senha e código eu passo amanhã").
const EXPLICIT_SEPARATOR_RE = /[:=]|^\s+(?:é|eh|era)(?=\s)/iu;

const PASSWORD_TOPIC_RE = new RegExp(`${WORD_START}(?:senha|password)${WORD_END}`, "iu");
// Assunto da mensagem para a regra 3 (dígitos soltos).
const CODE_TOPIC_RE = new RegExp(
  `${WORD_START}(?:c[óo]digo|senha|password|token|gov(?:\\.br)?|zap\\s?sign|verifica[çc][ãa]o|sms)${WORD_END}`,
  "iu",
);
// Assunto das mensagens ANTERIORES para a regra 4 (dígitos soltos da resposta).
const PREV_CODE_RE = new RegExp(
  `${WORD_START}(?:c[óo]digo|token|verifica[çc][ãa]o|zap\\s?sign|sms)${WORD_END}`,
  "iu",
);

// 4 a 8 dígitos que NÃO fazem parte de um número maior nem de uma palavra:
// nada de letra, dígito, ponto, vírgula, barra ou hífen colados (CPF
// 123.456.789-00, data 12/03/2024, telefone 99786-2323, valor 1.234,56, id de
// link) nem "R$" logo antes.
const LOOSE_DIGITS_RE = /(?<![\p{L}\d.,/\-_=]|R\$\s{0,2})\d{4,8}(?![\p{L}\d]|[.,/\-:]\d|\s*reais)/giu;
// Link (ZapSign, gov.br, fluxo): nunca é mexido, senão o histórico perde o link.
const URL_RE = /(?:https?:\/\/|www\.)\S+/giu;
const YEAR_RE = /^(?:19|20)\d{2}$/;

// Pontuação de fim de frase e aspas em volta do valor ficam fora da máscara.
const LEADING_WRAP_RE = /^["'“‘(]+/u;
const TRAILING_WRAP_RE = /[.,;:!?)\]}"'”’]+$/u;

// Palavras que aparecem depois de "senha"/"código" e não são o segredo.
const NOT_A_SECRET_RE = /^(?:gov(?:\.br)?|inss|meu|minha|app|zap\s?sign|sms|e-?mail|(?:https?:\/\/|www\.).*)$/iu;

// Palavras comuns depois de "senha:"/"senha é" que descrevem a senha (ou a
// falta dela) e não são o valor — sem acento e em minúsculas. A lista importa
// fora da mensagem do cliente também: fala do bot ("a senha é pessoal") e a
// ficha ("Senha gov: esqueceu") passam pela mesma regra, e o marcador no lugar
// de "esqueceu" faria a IA achar que o cliente mandou a senha.
const NOT_A_PASSWORD_WORDS = new Set([
  "nao", "sim", "ok", "nenhuma", "nenhum", "ninguem", "vazia", "vazio",
  "errada", "errado", "incorreta", "incorreto", "invalida", "invalido", "bloqueada", "bloqueado",
  "esqueci", "esqueceu", "esquecida", "esquecido", "perdi", "perdeu", "perdida", "perdido",
  "mesma", "mesmo", "igual", "nova", "novo", "antiga", "antigo", "outra", "outro", "diferente",
  "essa", "esse", "esta", "este", "isso", "isto", "aquela", "aquele", "aquilo",
  "minha", "sua", "seu", "dele", "dela", "nossa", "nosso", "deles", "delas",
  "muito", "muita", "pouco", "dificil", "facil", "forte", "fraca", "grande", "pequena", "curta", "longa",
  "simples", "complicada", "complexa", "segura", "pessoal", "secreta", "sigilosa", "intransferivel",
  "obrigatoria", "necessaria", "expirada", "vencida", "trocada", "alterada", "atualizada", "provisoria",
  "temporaria", "certa", "certo", "correta", "correto", "valida", "pendente", "solicitada", "cadastrada",
  "enviada", "recebida", "informada", "anotada", "registrada", "salva", "padrao",
  "qual", "quais", "aqui", "agora", "depois", "hoje", "ontem", "amanha", "sempre", "nunca",
  "tambem", "apenas", "somente", "tipo", "assim", "como", "onde", "quando", "porque", "pois",
  "data", "numero", "letra", "letras", "nome", "email", "celular", "telefone", "nascimento", "cliente",
  "atendente", "equipe", "govbr", "zapsign", "umas", "para", "pela", "pelo",
  "precisa", "preciso", "tenho", "temos", "possui", "possuo", "lembro", "lembra", "consigo", "consegue",
  "funciona", "entra", "chegou", "veio", "mandei", "mandou", "enviei", "enviou", "recuperar", "recuperando",
  "trocar", "resetar", "criar", "criando", "redefinir", "aguardando", "ainda", "vou", "vai", "pode",
]);

// Símbolo ASCII típico de senha (o hífen fica de fora: "e-mail", "bem-vindo").
const SECRET_SYMBOL_RE = /[!@#$%^&*_+=./\\|~?<>{}[\]]/u;

// Palavra que encerra a senha com espaço: é assunto novo, não pedaço do valor.
const STOP_TAIL_RE = /^(?:senha|password|c[óo]digo|token|cpf|rg|cnh|nb)$/iu;

/** Valor com cara de segredo: tem dígito, símbolo ou maiúscula no meio da palavra. */
function looksSecret(core: string): boolean {
  if (core.length < 4 || NOT_A_SECRET_RE.test(core)) return false;
  return /\d/.test(core) || SECRET_SYMBOL_RE.test(core) || /\p{Ll}\p{Lu}/u.test(core);
}

function normalizeWord(core: string): string {
  return core.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Valor só de letras logo depois de "senha:"/"senha é" (regra 1, separador
 * explícito): é a senha, a não ser que seja palavra comum ("errada", "nova").
 */
function looksLikeWordPassword(core: string): boolean {
  return core.length >= 4 && /^\p{L}+$/u.test(core)
    && !NOT_A_SECRET_RE.test(core) && !NOT_A_PASSWORD_WORDS.has(normalizeWord(core));
}

/**
 * Dado comum que o cliente manda perto da palavra "senha" e que NÃO é senha:
 * CPF, data, telefone, CEP formatado, valor em reais, e-mail e link. Números só de
 * dígitos, com 4 a 8 casas, continuam sendo senha (a data de nascimento é
 * senha comum no INSS).
 */
function looksLikeKnownData(token: string): boolean {
  return (
    /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(token) // CPF (11 dígitos, com ou sem pontuação)
    || /^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?$/.test(token) // data
    || /^\(?\d{2}\)?\s?9?\d{4}-\d{4}$/.test(token) // telefone com hífen
    || /^\(\d{2}\)\d{8,9}$/.test(token) // telefone "(41)997862323"
    || /^\d{10,}$/.test(token) // telefone/CPF/benefício só de dígitos
    || /^\d{5}-\d{3}$/.test(token) // CEP formatado
    || /^R\$/iu.test(token) || /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(token) // valor
    || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/iu.test(token) // e-mail
    || /^(?:https?:\/\/|www\.)/iu.test(token) // link
  );
}

/** Troca o miolo do token pela máscara, preservando aspas e pontuação em volta. */
function replaceCore(token: string, mask: string): string {
  const lead = LEADING_WRAP_RE.exec(token)?.[0] ?? "";
  const rest = token.slice(lead.length);
  const trail = TRAILING_WRAP_RE.exec(rest)?.[0] ?? "";
  return `${lead}${mask}${trail}`;
}

function coreOf(token: string): string {
  return token.replace(LEADING_WRAP_RE, "").replace(TRAILING_WRAP_RE, "");
}

/** Pedaço seguinte de uma senha com espaço: número, palavra com maiúscula ou com cara de segredo. */
function isSecretTail(core: string): boolean {
  if (!core || STOP_TAIL_RE.test(core) || looksLikeKnownData(core) || NOT_A_SECRET_RE.test(core)) return false;
  if (/^\d{1,8}$/.test(core) || looksSecret(core)) return true;
  // Com maiúscula vale mesmo se for palavra comum ("Maria 2020 Nova"): no
  // meio da frase, maiúscula depois da senha é pedaço dela.
  return /^\p{Lu}/u.test(core);
}

/**
 * Fim da senha com espaço ("senha é Maria 2020 Nova"): até 3 pedaços seguintes
 * NA MESMA LINHA, parando em pontuação de fim de frase ou num pedaço que não
 * parece senha (minúscula comum, CPF, outra palavra-chave).
 */
function secretTailEnd(text: string, from: number, firstToken: string): number {
  let end = from;
  let prev = firstToken;
  for (let i = 0; i < 3; i++) {
    if (/[.,;!?]["'”’)]*$/u.test(prev)) break;
    const m = /^[ \t]+(\S+)/u.exec(text.slice(end));
    if (!m || !isSecretTail(coreOf(m[1]))) break;
    end += m[0].length;
    prev = m[1];
  }
  return end;
}

/** Regra 1: palavra-chave + valor (com a senha de letras e a senha com espaço). */
function maskKeywordValues(text: string): string {
  let out = "";
  let cursor = 0;
  for (const m of text.matchAll(KEYWORD_VALUE_RE)) {
    const start = m.index ?? 0;
    // Pedaço já engolido pela senha com espaço do match anterior.
    if (start < cursor) continue;
    const [match, keyword, separator, value] = m;
    const valueAt = start + match.length - value.length;
    // "senha é [senha omitida]": o valor já é o marcador (texto mascarado antes).
    if (text.startsWith(PASSWORD_MASK, valueAt) || text.startsWith(CODE_MASK, valueAt)) continue;
    const isPassword = /^(?:senha|password)$/iu.test(keyword);
    const explicit = isPassword && EXPLICIT_SEPARATOR_RE.test(separator);
    const core = coreOf(value);
    if (!looksSecret(core) && !(explicit && looksLikeWordPassword(core))) continue;
    const end = explicit ? secretTailEnd(text, valueAt + value.length, value) : valueAt + value.length;
    out += text.slice(cursor, valueAt) + replaceCore(text.slice(valueAt, end), isPassword ? PASSWORD_MASK : CODE_MASK);
    cursor = end;
  }
  return out + text.slice(cursor);
}

/**
 * Regra 4 (senha), linha a linha: a linha que é um token só com cara de
 * senha, depois de uma pergunta de senha (nas mensagens anteriores ou numa
 * linha anterior do mesmo lote).
 */
function maskAnswerLines(text: string, askedBefore: boolean): string {
  let asked = askedBefore;
  return text
    .split("\n")
    .map((line) => {
      let result = line;
      const trimmed = line.trim();
      if (asked && trimmed && !/\s/.test(trimmed) && trimmed.length <= 64) {
        const core = coreOf(trimmed);
        if (looksSecret(core) && !looksLikeKnownData(core)) {
          result = line.replace(trimmed, () => replaceCore(trimmed, PASSWORD_MASK));
        }
      }
      if (PASSWORD_TOPIC_RE.test(line)) asked = true;
      return result;
    })
    .join("\n");
}

/** Regra 2: token com letra E dígito numa mensagem que fala de senha. */
function maskPasswordLikeTokens(text: string): string {
  return text.replace(/\S+/gu, (token) => {
    const core = coreOf(token);
    if (core.length < 6 || !/\p{L}/u.test(core) || !/\d/.test(core)) return token;
    if (looksLikeKnownData(core)) return token;
    return replaceCore(token, PASSWORD_MASK);
  });
}

/** Regras 3 e 4: dígitos soltos (menos ano e o que está dentro de link) viram código. */
function maskLooseDigits(text: string): string {
  const links = [...text.matchAll(URL_RE)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
  return text.replace(LOOSE_DIGITS_RE, (digits: string, offset: number) => {
    if (YEAR_RE.test(digits)) return digits;
    if (links.some(([start, end]) => offset >= start && offset < end)) return digits;
    return CODE_MASK;
  });
}

type MaskContext = string | readonly (string | null | undefined)[] | null | undefined;

function contextTexts(previous: MaskContext): string[] {
  if (!previous) return [];
  const list = typeof previous === "string" ? [previous] : previous;
  return list.filter((p): p is string => typeof p === "string" && p.length > 0);
}

/**
 * Mascara senha e código num texto que vai para a IA ou para o S3.
 * `previous` são as mensagens anteriores da conversa (qualquer autor; a
 * última por último, só as MASK_CONTEXT_MESSAGES finais contam), para pegar a
 * resposta solta a "qual a sua senha?" / "qual o código que chegou?" mesmo com
 * um "segue" no meio. Aceita uma mensagem só (string).
 */
export function maskSecrets(text: string, previous?: MaskContext): string {
  if (!text) return text;
  const context = contextTexts(previous).slice(-MASK_CONTEXT_MESSAGES);
  const passwordAsked = context.some((p) => PASSWORD_TOPIC_RE.test(p));
  const codeAsked = context.some((p) => PREV_CODE_RE.test(p));

  // Regra 1: palavra-chave + valor.
  let out = maskKeywordValues(text);

  // Regra 4 (senha): linha que é um token só com cara de senha, depois de uma
  // pergunta de senha.
  out = maskAnswerLines(out, passwordAsked);

  // Regra 2: letra + dígito numa mensagem sobre senha.
  if (PASSWORD_TOPIC_RE.test(out)) out = maskPasswordLikeTokens(out);

  // Regras 3 e 4 (código): dígitos soltos numa mensagem sobre código, ou logo
  // depois de uma mensagem que falou em código.
  if (CODE_TOPIC_RE.test(out) || codeAsked) out = maskLooseDigits(out);
  return out;
}

/**
 * Mascara uma sequência de mensagens em ordem cronológica: cada uma olha as
 * MASK_CONTEXT_MESSAGES anteriores (texto original) para a regra da resposta
 * solta. `previous` são as mensagens que vieram antes da primeira, quando se
 * sabe.
 */
export function maskSecretsInSequence(texts: readonly string[], previous?: MaskContext): string[] {
  const window = contextTexts(previous).slice(-MASK_CONTEXT_MESSAGES);
  return texts.map((text) => {
    const masked = maskSecrets(text, window);
    window.push(text);
    if (window.length > MASK_CONTEXT_MESSAGES) window.shift();
    return masked;
  });
}

/**
 * Ficha da conversa (botMemory), em todo envio à IA e antes de gravar: LINHA
 * A LINHA e sem contexto entre linhas. Cada linha é um fato; a ficha inteira
 * de uma vez faria um "Tem gov.br: sim" mascarar o CEP e o RG das outras
 * linhas como código (regra 3) — e a máscara gravada no banco não volta.
 */
export function maskMemorySecrets(memory: string | null | undefined): string | null {
  if (!memory) return memory ?? null;
  return memory
    .split("\n")
    .map((line) => maskSecrets(line))
    .join("\n");
}
