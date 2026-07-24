// Vocabulário da revisão da IA — usado pela tela de julgamento (client) e pela
// destilação do playbook (server). Módulo neutro (sem "use server") de
// propósito, igual a close-categories.ts.
//
// As tags são o que torna a reprovação DESTILÁVEL: um comentário em texto livre
// é difícil de agrupar; "qualificou_errado" repetido 8 vezes vira uma regra.

export const REVIEW_VERDICTS = ['aprovado', 'parcial', 'reprovado'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  aprovado: 'Aprovado',
  parcial: 'Parcial',
  reprovado: 'Reprovado',
};

export const VERDICT_HINTS: Record<ReviewVerdict, string> = {
  aprovado: 'A IA conduziu do jeito certo — vira exemplo a ser seguido.',
  parcial: 'Chegou no resultado, mas o caminho tem o que melhorar.',
  reprovado: 'Errou. O comentário abaixo vira regra para não repetir.',
};

/**
 * Tipos de erro. Ficam estáveis: cada chave é o "nome" da lição no playbook,
 * então renomear uma chave quebra o agrupamento histórico — só adicione novas.
 */
export const REVIEW_ERROR_TAGS = [
  { key: 'qualificou_errado', label: 'Qualificou errado', hint: 'Qualificou quem não devia (ou desqualificou quem devia).' },
  { key: 'dado_incorreto', label: 'Informação incorreta', hint: 'Falou algo errado sobre prazo, valor, direito ou processo.' },
  { key: 'nao_entendeu', label: 'Não entendeu o cliente', hint: 'Interpretou mal a mensagem ou respondeu outra coisa.' },
  { key: 'tom_errado', label: 'Tom errado', hint: 'Formal demais, robótico, seco ou intimista demais.' },
  { key: 'perdeu_contexto', label: 'Perdeu o contexto', hint: 'Reperguntou algo que o cliente já tinha respondido.' },
  { key: 'devia_passar_humano', label: 'Devia ter passado pra humano', hint: 'Insistiu sozinha numa situação que pedia atendente.' },
  { key: 'passou_humano_atoa', label: 'Passou pra humano à toa', hint: 'Escalou algo que ela mesma resolveria.' },
  { key: 'demorou', label: 'Demorou / travou', hint: 'Deixou o cliente esperando ou ficou em silêncio.' },
  { key: 'repetitiva', label: 'Repetitiva', hint: 'Repetiu a mesma mensagem ou ficou em loop.' },
  { key: 'faltou_pedir', label: 'Faltou pedir algo', hint: 'Não coletou um dado necessário para seguir.' },
  { key: 'longa_demais', label: 'Mensagem longa demais', hint: 'Texto grande onde cabia uma frase.' },
  { key: 'perdeu_venda', label: 'Perdeu a venda', hint: 'Era um lead bom e a conversa esfriou por culpa da condução.' },
] as const;

export type ReviewErrorTag = (typeof REVIEW_ERROR_TAGS)[number]['key'];

export const REVIEW_ERROR_TAG_KEYS = REVIEW_ERROR_TAGS.map((t) => t.key) as ReviewErrorTag[];

export function errorTagLabel(key: string): string {
  return REVIEW_ERROR_TAGS.find((t) => t.key === key)?.label ?? key;
}

/** Descarta tags desconhecidas (o valor vem do client). */
export function sanitizeErrorTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(REVIEW_ERROR_TAG_KEYS);
  return [...new Set(raw.filter((t): t is string => typeof t === 'string' && valid.has(t)))];
}

/** Como o atendimento foi encerrado — quem tomou a decisão. */
export const CLOSED_REASON_LABELS: Record<string, string> = {
  bot_disqualify: 'IA desqualificou',
  bot_resolve: 'IA resolveu',
  cron_silencio: 'Encerrada por silêncio',
  manual: 'Encerrada pelo atendente',
};
