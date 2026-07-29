// Categorias de encerramento de um atendimento de WhatsApp — usadas pela IA
// (decisão do bot) e pelo atendente (menu "Encerrar" no inbox). Módulo neutro
// (sem "use server") para poder ser importado tanto por client components
// quanto por server actions.

export const CLOSE_CATEGORY_LABELS: Record<string, string> = {
  qualificado: 'Qualificados',
  nao_qualificado: 'Não qualificados',
  perguntas: 'Perguntas / dúvidas',
  novo_acidente: 'Novo acidente (cadastrado)',
  transferido: 'Transferidos ao atendente',
  // Desfecho do ciclo de recuperação (status "standby"): 3 provocações do
  // cron sem nenhuma resposta do cliente.
  sem_resposta: 'Sem resposta (não recuperado)',
  // Lixo/spam/engano — separado dos "não qualificados" de verdade para não
  // poluir as métricas de triagem.
  descartado: 'Descartados',
};

// Opções do menu manual de "Encerrar" (rótulo no singular, na ordem de exibição).
export const CLOSE_CATEGORY_OPTIONS: { category: string; label: string }[] = [
  { category: 'qualificado', label: 'Qualificada' },
  { category: 'nao_qualificado', label: 'Não qualificada' },
  { category: 'perguntas', label: 'Perguntas / dúvidas' },
  { category: 'novo_acidente', label: 'Novo acidente' },
  { category: 'transferido', label: 'Transferido ao atendente' },
  { category: 'descartado', label: 'Descartada (spam/engano)' },
];

// Mapeia a categoria para o campo `qualified` (Boolean?) da conversa:
// qualificado=true, não qualificado=false, demais=null (não é juízo de
// qualificação, é só o motivo do encerramento).
export const QUALIFIED_BY_CATEGORY: Record<string, boolean | null> = {
  qualificado: true,
  nao_qualificado: false,
  perguntas: null,
  novo_acidente: null,
  transferido: null,
  sem_resposta: null,
  descartado: null,
};
