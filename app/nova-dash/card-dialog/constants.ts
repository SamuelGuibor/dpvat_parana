export const DPVAT_STATUS_ORDER = [
  'DPVAT_S1',
  'DPVAT_S2',
  'DPVAT_S3',
  'DPVAT_S4',
  'DPVAT_S5',
  'DPVAT_S6',
  'DPVAT_S7',
] as const;

export const DPVAT_STATUS_LABELS: Record<typeof DPVAT_STATUS_ORDER[number], string> = {
  DPVAT_S1: 'Processo iniciado',
  DPVAT_S2: 'Prontuário',
  DPVAT_S3: 'Boletim de Ocorrência',
  DPVAT_S4: 'Análise documental',
  DPVAT_S5: 'Perícia médica',
  DPVAT_S6: 'Pagamento',
  DPVAT_S7: 'Processo finalizado',
};

export const INSS_STATUS_ORDER = [
  'INSS_S1',
  'INSS_S2',
  'INSS_S3',
  'INSS_S4',
  'INSS_S5',
  'INSS_S6',
  'INSS_S7',
  'INSS_S8',
] as const;

export const INSS_STATUS_LABELS: Record<typeof INSS_STATUS_ORDER[number], string> = {
  INSS_S1: 'Processo iniciado',
  INSS_S2: 'Documentação médica hospitalar',
  INSS_S3: 'Documentos INSS',
  INSS_S4: 'Aguardando perícia administrativa',
  INSS_S5: 'Perícia realizada',
  INSS_S6: 'Enviado ao departamento jurídico',
  INSS_S7: 'Acompanhamento judicial',
  INSS_S8: 'Processo finalizado',
};

// Fallback genérico para demais serviços (Seguro de Vida, RCF, SPVAT, etc.)
export const GENERIC_STATUS_ORDER = [
  'INICIADO',
  'AGUARDANDO_ASSINATURA',
  'SOLICITAR_DOCUMENTOS',
  'COLETA_DOCUMENTOS',
  'ANALISE_DOCUMENTOS',
  'PERICIAL',
  'AGUARDANDO_PERICIAL',
  'PAGAMENTO_HONORARIO',
  'PROCESSO_ENCERRADO',
] as const;

export const GENERIC_STATUS_LABELS: Record<typeof GENERIC_STATUS_ORDER[number], string> = {
  INICIADO: 'Processo iniciado',
  AGUARDANDO_ASSINATURA: 'Aguardando assinatura',
  SOLICITAR_DOCUMENTOS: 'Fase de solicitação de documentos',
  COLETA_DOCUMENTOS: 'Coleta de documentos',
  ANALISE_DOCUMENTOS: 'Análise de documentos',
  PERICIAL: 'Fase Pericial',
  AGUARDANDO_PERICIAL: 'Aguardando resultado pericial',
  PAGAMENTO_HONORARIO: 'Pagamento de honorários',
  PROCESSO_ENCERRADO: 'Processo encerrado',
};

export function getStatusOrderByService(service?: string | null): readonly string[] {
  switch (service) {
    case 'DPVAT': return DPVAT_STATUS_ORDER;
    case 'INSS': return INSS_STATUS_ORDER;
    default: return GENERIC_STATUS_ORDER;
  }
}

export function getStatusLabelsByService(service?: string | null): Record<string, string> {
  switch (service) {
    case 'DPVAT': return DPVAT_STATUS_LABELS;
    case 'INSS': return INSS_STATUS_LABELS;
    default: return GENERIC_STATUS_LABELS;
  }
}

// ─── Descrições amigáveis por status (texto plano) ───────────────────────────
// Mesmo texto que o cliente vê na timeline de status (status-progress.tsx),
// aqui em versão de string pura para reuso no bot de WhatsApp: quando o cliente
// pergunta "em que etapa estou?", a IA responde com o título + esta explicação,
// em vez do nome interno da coluna do Trello.

export const DPVAT_STATUS_DESCRIPTIONS: Record<string, string> = {
  DPVAT_S1: 'Juntamos toda a documentação necessária para dar início ao seu processo. Nossa equipe já está trabalhando para garantir que tudo esteja em ordem.',
  DPVAT_S2: 'Nossos procuradores estão solicitando o seu prontuário médico junto ao hospital ou clínica em que você foi atendido. Conforme o prazo do Conselho Regional de Medicina (CRM), isso leva em média 30 dias.',
  DPVAT_S3: 'O Boletim de Ocorrência precisa ser validado pela entidade que atendeu a ocorrência — Polícia Militar, Polícia Civil ou Polícia Rodoviária Federal. Nossa equipe está acompanhando.',
  DPVAT_S4: 'Seus documentos foram enviados para análise pela Caixa Econômica Federal, responsável pelo seguro DPVAT. Essa fase pode levar até 30 dias e acompanhamos qualquer pendência de perto.',
  DPVAT_S5: 'Reta final! Seu processo chegou à fase de perícia médica. Aguardamos a data e o horário do agendamento.',
  DPVAT_S6: 'A perícia foi concluída com sucesso. O pagamento leva em torno de 7 dias para ser realizado e em breve você recebe os valores devidos.',
  DPVAT_S7: 'Seu processo foi finalizado.',
};

export const INSS_STATUS_DESCRIPTIONS: Record<string, string> = {
  INSS_S1: 'Estamos analisando seus dados e documentos para dar seguimento ao seu processo de Auxílio-Acidente no INSS.',
  INSS_S2: 'Solicitamos sua documentação médica e hospitalar junto às instituições que prestaram atendimento. Conforme o prazo do CRM, essa etapa leva em média 30 dias e é fundamental para comprovar o acidente e as sequelas.',
  INSS_S3: 'Solicitamos ao INSS o seu dossiê com todo o histórico previdenciário.',
  INSS_S4: 'Seu processo aguarda a perícia médica administrativa no INSS. Assim que houver data confirmada, entramos em contato com as orientações.',
  INSS_S5: 'A fase administrativa foi concluída. Estamos preparando os próximos passos junto à equipe jurídica.',
  INSS_S6: 'Nossa equipe de advogados vai formular o pedido do seu benefício na esfera judicial. A partir daqui o processo segue para os tribunais.',
  INSS_S7: 'Você já pode acompanhar o processo pelas plataformas oficiais do governo. Nossa equipe continua acompanhando cada movimentação.',
  INSS_S8: 'Seu processo foi finalizado.',
};

export const GENERIC_STATUS_DESCRIPTIONS: Record<string, string> = {
  INICIADO: 'Confirmado o envio dos seus documentos iniciais. Nossa equipe está preparando o protocolo de entrada.',
  AGUARDANDO_ASSINATURA: 'Enviamos o contrato e a procuração e agora aguardamos a sua assinatura.',
  SOLICITAR_DOCUMENTOS: 'Nossa equipe está solicitando os documentos necessários junto às instituições responsáveis. Essa fase pode levar de 30 a 60 dias.',
  COLETA_DOCUMENTOS: 'Com os documentos prontos, nossa equipe vai retirá-los e organizar tudo para envio.',
  ANALISE_DOCUMENTOS: 'Os documentos foram enviados e aguardam análise. O prazo de resposta é de até 30 dias.',
  PERICIAL: 'Seu processo chegou à fase de perícia. Aguardamos a data e o horário do agendamento.',
  AGUARDANDO_PERICIAL: 'Após a perícia, o resultado é liberado em até 7 dias.',
  PAGAMENTO_HONORARIO: 'Aguardando o pagamento dos honorários pelo trabalho realizado.',
  PROCESSO_ENCERRADO: 'Seu processo foi encerrado.',
};

export function getStatusDescriptionsByService(service?: string | null): Record<string, string> {
  switch (service) {
    case 'DPVAT': return DPVAT_STATUS_DESCRIPTIONS;
    case 'INSS': return INSS_STATUS_DESCRIPTIONS;
    default: return GENERIC_STATUS_DESCRIPTIONS;
  }
}

// Chave normalizada de serviço para a config de mensagens de status. Vários
// serviços "genéricos" (Seguro de Vida, RCF, SPVAT...) compartilham a mesma
// grade de status, então compartilham a mesma config sob "GENERIC".
export function statusServiceKey(service?: string | null): 'DPVAT' | 'INSS' | 'GENERIC' {
  if (service === 'DPVAT') return 'DPVAT';
  if (service === 'INSS') return 'INSS';
  return 'GENERIC';
}

/** Título amigável de um status (ex.: DPVAT_S5 → "Perícia médica"). */
export function getStatusLabel(service: string | null | undefined, status: string | null | undefined): string | null {
  if (!status) return null;
  return getStatusLabelsByService(service)[status] ?? null;
}

/** Explicação amigável de um status para o cliente (texto plano). */
export function getStatusDescription(service: string | null | undefined, status: string | null | undefined): string | null {
  if (!status) return null;
  return getStatusDescriptionsByService(service)[status] ?? null;
}

export const ROLE_OPTIONS = [
  'Filtro de Cartões',
  'Gerar Procuração Automática',
  'Coletar Assinatura em Cartório',
  'Coletar Assinatura Digital',
  'Agendar Coleta com Motoboy',
  'Acompanhar Rota do Motoboy',
  'Fazer Protocolo no Hospital',
  'Protocolar Pasta – Hospital Presencial',
  'Solicitar Prontuário por E-mail',
  'Solicitar Prontuário Cajuru por E-mail',
  'Acompanhar Cajuru – Solicitado',
  'Solicitar Prontuário – Outros Hospitais',
  'Acompanhar Prontuário – Outros Solicitados',
  'Solicitar Prontuário – Ponta Grossa',
  'Aguardar Prontuário – Recebimento Online',
  'Aguardar Prontuário PG – Recebimento Online',
  'Aguardar Prontuário PG – Presencial',
  'Aguardar Retirada de Prontuário – Presencial',
  'Retirar Prontuário – Pronto para Retirar',
  'Solicitar B.O. ao Cliente – Acidente',
  'Solicitar Siate',
  'Aguardar Retorno do Siate',
  'Enviar Mensagem – Previdenciário',
  'Registrar Óbito – Nova Lei',
  'Protocolar SPVAT',
  'Protocolar DPVAT – Caixa',
  'Enviar para Reanálise',
  'Manter SPVAT em Standby',
  'Aguardar Análise da Caixa',
  'Acompanhar Pendências – Protocolado',
  'Protocolar Pendência de B.O.',
  'Avisar Sobre Perícia Administrativa',
  'Aguardar Resultado da Perícia',
  'Cobrar Honorários – Resultado Perícia',
  'Aguardar Pagamento – Honorários Cobrados',
  'Encerrar Processo – DPVAT',
  'Descartaveis',
];

export const SERVICE_OPTIONS = ['INSS', 'Seguro de Vida', 'RCF', 'DPVAT', 'SPVAT', 'TRABALHISTA'];

export const ESTADOS = [
  'Acre',
  'Alagoas',
  'Amapá',
  'Amazonas',
  'Bahia',
  'Ceará',
  'Distrito Federal',
  'Espírito Santo',
  'Goiás',
  'Maranhão',
  'Mato Grosso',
  'Mato Grosso do Sul',
  'Minas Gerais',
  'Pará',
  'Paraíba',
  'Paraná',
  'Pernambuco',
  'Piauí',
  'Rio de Janeiro',
  'Rio Grande do Norte',
  'Rio Grande do Sul',
  'Rondônia',
  'Roraima',
  'Santa Catarina',
  'São Paulo',
  'Sergipe',
  'Tocantins',
];

export const ESTADO_CIVIL = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'];

export const NACIONALIDADES = [
  'Brasileiro(a)', 'Venezuelano(a)', 'Colombiano(a)', 'Uruguaio(a)',
  'Argentino(a)', 'Peruano(a)', 'Boliviano(a)',
];

export const ATENDIMENTO_VIA = [
  { value: 'Siate', label: 'SIATE' },
  { value: 'Samu', label: 'SAMU/OUTRAS AMBULÂNCIAS' },
  { value: 'Procura_Direta', label: 'PROCURA DIRETA' },
  { value: 'Arteris', label: 'ARTERIS' },
];

export const mentionsStyles = {
  control: { backgroundColor: '#fff', fontSize: 14, fontWeight: 'normal' },
  '&multiLine': {
    control: { fontFamily: 'inherit', minHeight: 80 },
    highlighter: { padding: 9, border: '1px solid transparent' },
    input: { padding: 9, border: '1px solid #e5e7eb', borderRadius: '0.5rem', outline: 'none' },
  },
  suggestions: {
    // zIndex alto: o dropdown de @menção precisa flutuar sobre dialogs/sheets
    // (antes ficava cortado/escondido atrás de outros elementos).
    zIndex: 80,
    list: {
      backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.12)',
      fontSize: 14, borderRadius: '0.75rem',
      boxShadow: '0 12px 32px -8px rgb(0 0 0 / 0.25)',
      maxHeight: 220, overflowY: 'auto' as const,
      padding: 4, minWidth: 220,
    },
    item: {
      padding: '8px 12px', borderRadius: '0.5rem',
      '&focused': { backgroundColor: '#eff6ff', color: '#1d4ed8' },
    },
  },
};