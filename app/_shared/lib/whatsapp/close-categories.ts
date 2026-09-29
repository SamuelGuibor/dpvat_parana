// Categorias de encerramento de um atendimento de WhatsApp — usadas pela IA
// (decisão do bot) e pelo atendente (menu "Encerrar" no inbox). Módulo neutro
// (sem "use server") para poder ser importado tanto por client components
// quanto por server actions.

/**
 * Nomes EXATOS das tags-marco do funil (bot-funnel.ts): "Qualificada" é
 * aplicada pelo bot ao qualificar (e é o rótulo do desfecho `qualificado`, a
 * mesma tag); "Contratados" é aplicada pela equipe e é a régua do KPI
 * Contratados. Comparar por nome exato: `contains 'contratad'` também pegava
 * a tag de churn ("Contratado e perdido (churn)").
 */
export const QUALIFIED_TAG_NAME = 'Qualificada';
export const HIRED_TAG_NAME = 'Contratados';

export const CLOSE_CATEGORY_LABELS: Record<string, string> = {
  qualificado: QUALIFIED_TAG_NAME,
  nao_qualificado: 'Não qualificado',
  // Sub-motivos de "não qualificado" — separam no dashboard POR QUE o lead
  // não fechou (a categoria genérica continua válida para casos antigos ou
  // quando o motivo não se encaixa).
  nq_sem_cobertura: 'Não qualif. — sem cobertura INSS',
  nq_fora_prazo: 'Não qualif. — fora do prazo',
  nq_sem_lesao: 'Não qualif. — sem lesão/afastamento',
  nq_desistiu: 'Não qualif. — desistiu / sem interesse',
  // Cliente que CONTRATOU e depois foi perdido (desistência, rescisão,
  // migrou para outro escritório...) — churn pós-contrato, separado dos
  // não qualificados de triagem.
  contratado_perdido: 'Contratado e perdido (churn)',
  perguntas: 'Perguntas / dúvidas',
  novo_acidente: 'Novo acidente (cadastrado)',
  transferido: 'Transferidos ao atendente',
  // Desfecho do ciclo de recuperação (status "standby"): 5 provocações do
  // cron sem nenhuma resposta do cliente.
  sem_resposta: 'Sem resposta (não recuperado)',
  // Lixo/spam/engano — separado dos "não qualificados" de verdade para não
  // poluir as métricas de triagem.
  descartado: 'Descartados',
};

/**
 * Marca do aviso de lead qualificado pela IA no sino (Notification.message).
 * O sino (box.tsx) destaca e sobe as notificações que contêm este texto, e a
 * rota /api/notification busca as das últimas 24 h além das 50 mais novas:
 * mudar a frase aqui muda nos três lugares. As notificações antigas continuam
 * com o texto antigo (não há coluna de tipo em Notification).
 */
export const WA_QUALIFIED_MARK = 'LEAD QUALIFICADO ✅';

// Opções do menu manual de "Encerrar" (rótulo no singular, na ordem de exibição).
export const CLOSE_CATEGORY_OPTIONS: { category: string; label: string }[] = [
  { category: 'qualificado', label: 'Qualificada' },
  { category: 'nao_qualificado', label: 'Não qualificada (motivo genérico)' },
  { category: 'nq_sem_cobertura', label: 'Não qualificada — sem cobertura INSS' },
  { category: 'nq_fora_prazo', label: 'Não qualificada — fora do prazo' },
  { category: 'nq_sem_lesao', label: 'Não qualificada — sem lesão/afastamento' },
  { category: 'nq_desistiu', label: 'Não qualificada — desistiu / sem interesse' },
  { category: 'contratado_perdido', label: 'Contratado e perdido (churn)' },
  { category: 'perguntas', label: 'Perguntas / dúvidas' },
  { category: 'novo_acidente', label: 'Novo acidente' },
  { category: 'transferido', label: 'Transferido ao atendente' },
  { category: 'descartado', label: 'Descartada (spam/engano)' },
];

/** Toda categoria que representa lead NÃO qualificado (genérica + sub-motivos). */
export const NON_QUALIFIED_CATEGORIES = [
  'nao_qualificado', 'nq_sem_cobertura', 'nq_fora_prazo', 'nq_sem_lesao', 'nq_desistiu',
];

// Mapeia a categoria para o campo `qualified` (Boolean?) da conversa:
// qualificado=true, não qualificado=false, demais=null (não é juízo de
// qualificação, é só o motivo do encerramento).
export const QUALIFIED_BY_CATEGORY: Record<string, boolean | null> = {
  qualificado: true,
  nao_qualificado: false,
  nq_sem_cobertura: false,
  nq_fora_prazo: false,
  nq_sem_lesao: false,
  nq_desistiu: false,
  // Churn: o lead FOI qualificado/contratado — a perda é pós-contrato.
  contratado_perdido: true,
  perguntas: null,
  novo_acidente: null,
  transferido: null,
  sem_resposta: null,
  descartado: null,
};
