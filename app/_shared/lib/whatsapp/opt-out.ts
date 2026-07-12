// Detecção de pedido de descadastro (opt-out) e de reativação (opt-in) a partir
// do texto do cliente. Honrar opt-out é exigência das políticas anti-spam da
// Meta: quem pede para parar NÃO pode continuar recebendo mensagens.
//
// Conservador de propósito: preferimos deixar passar um caso ambíguo (o
// atendente resolve) a fechar por engano uma conversa boa. Só marcamos opt-out
// quando a intenção de parar é clara.

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove acentos
    .trim();
}

// Só termos TÉCNICOS inequívocos de descadastro (a mensagem inteira). Palavras
// ambíguas como "sair"/"parar"/"chega" NÃO entram aqui de propósito: soltas,
// elas dependem de contexto (ex.: "vou sair mas volto") — nesse caso quem
// decide é a IA (que lê a conversa), não o regex.
// "sair" sozinho entra porque é o comando que o rodapé das mensagens
// automáticas ensina ("responda SAIR") — como mensagem inteira é inequívoco.
const OPT_OUT_EXACT = /^(descadastr\w*|stop|unsubscribe|sair|cancelar\s+inscricao)[.!\s]*$/;

// Frases claras de descadastro em qualquer ponto do texto.
const OPT_OUT_PATTERNS: RegExp[] = [
  /\b(pare?|para|parem|parar)\s+(de\s+)?(me\s+)?(mandar|enviar|manda|envia|encaminhar|receber)/,
  /\b(nao|nunca)\s+quero\s+(mais\s+)?(receber|essas mensagens|ser incomodad)/,
  /\b(nao|nunca)\s+me\s+(mande|manda|mandem|envie|envia|enviem|perturbe|perturbem|procure|procurem)/,
  /\bsair\s+d(a|essa)\s+lista/,
  /\b(me\s+)?(tir[ae]|remov[ae]|retir[ae])\s+(da\s+lista|dessa\s+lista|do\s+grupo|meu\s+numero|meu\s+contato|dessa\s+divulgacao)/,
  /\bdescadastr/,
  /\bcancelar?\s+(a\s+)?(inscri|recebimento|as\s+mensagens|o\s+recebimento)/,
  /\bnao\s+perturbe/,
  /\bpare\s+de\s+spam/,
  /\bme\s+deixe?\s+em\s+paz/,
];

// Reativação: cliente que estava opt-out quer voltar a receber/ser atendido.
const OPT_IN_PATTERNS: RegExp[] = [
  /\bquero\s+(voltar\s+a\s+)?receber/,
  /\bvoltar\s+a\s+receber/,
  /\b(quero|preciso|gostaria)\s+(de\s+)?(atendimento|ajuda|falar|voltar)/,
  /\breativar/,
  /\bme\s+(cadastr|reinscrev)/,
  /\bmudei\s+de\s+ideia/,
];

/** Cliente pediu claramente para PARAR de receber mensagens. */
export function isOptOutMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = normalize(text);
  if (!t) return false;
  if (OPT_OUT_EXACT.test(t)) return true;
  return OPT_OUT_PATTERNS.some((re) => re.test(t));
}

/** Cliente (que estava opt-out) sinalizou que quer voltar a ser atendido. */
export function isOptInMessage(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = normalize(text);
  if (!t) return false;
  return OPT_IN_PATTERNS.some((re) => re.test(t));
}

// Confirmação enviada UMA vez quando o cliente pede opt-out (dentro da janela
// de 24h, pois ele acabou de escrever). Sem emoji excessivo, tom respeitoso.
export const OPT_OUT_CONFIRMATION =
  'Tudo bem! Não vamos mais te enviar mensagens por aqui. '
  + 'Se precisar de algo no futuro, é só mandar uma mensagem que a gente te atende.';

// Rodapé anexado a toda mensagem PROATIVA em texto livre (automações e avisos
// de progresso): saída fácil reduz denúncias de spam — quem denuncia derruba o
// quality rating da conta; quem responde SAIR só vira opt-out.
export const OPT_OUT_FOOTER = '\n\nPara não receber mais avisos, responda SAIR.';
