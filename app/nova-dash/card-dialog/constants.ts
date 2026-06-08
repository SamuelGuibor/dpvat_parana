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

export const MENTIONABLE_USERS = [
  { id: 'cmazuwrcj0000iav499hqf5ij', display: 'Thomaz Martinez' },
  { id: 'cmaztbktw0000ld04ivltlu5g', display: 'Nikolas Fellipe Kosien' },
  { id: 'cmb07q4i40000jr04pze42w3r', display: 'Eduardo Camargo Martinez' },
  { id: 'cmc0t0os30000iaigoxy03waw', display: 'Andre Martinez' },
  { id: 'cmc9hwnuc0000js04zpjdyfeb', display: 'Kauan Fernandes' },
  { id: 'cmg18v4ni0000jp04lw9fqdi1', display: 'Lincoln Marcondes' },
  { id: 'cmiz5zzdv0000l404208mum30', display: 'Vittor Ferraz' },
  { id: 'cmazo6j870000ia0gw5ppb486', display: 'Samuel' },
  { id: 'cmpwucq210001jv041oc9twsr', display: 'Daniel Meira' },
  { id: 'cmmxqposd0000jx04jrkittsl', display: 'Taynara Magalhaes' },
];

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
    list: {
      backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.15)',
      fontSize: 14, borderRadius: '0.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    },
    item: {
      padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.05)',
      '&focused': { backgroundColor: '#eff6ff', color: '#1d4ed8' },
    },
  },
};