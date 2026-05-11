export const STATUS_ORDER = [
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

export const STATUS_LABELS: Record<typeof STATUS_ORDER[number], string> = {
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

export const MENTIONABLE_USERS = [
  { id: 'cmazuwrcj0000iav499hqf5ij', display: 'Thomaz Martinez' },
  { id: 'cmaztbktw0000ld04ivltlu5g', display: 'Nikolas Fellipe Kosien' },
  { id: 'cmb07q4i40000jr04pze42w3r', display: 'Eduardo Camargo Martinez' },
  { id: 'cmc0t0os30000iaigoxy03waw', display: 'Andre Martinez' },
  { id: 'cmc9hwnuc0000js04zpjdyfeb', display: 'Kauan Fernandes' },
  { id: 'cmg18v4ni0000jp04lw9fqdi1', display: 'Lincoln Marcondes' },
  { id: 'cmiz5zzdv0000l404208mum30', display: 'Vittor Ferraz' },
  { id: 'cmazo6j870000ia0gw5ppb486', display: 'Samuel' },
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
  'Paraná', 'Santa Catarina', 'São Paulo', 'Rio Grande do Sul',
  'Mato Grosso', 'Mato Grosso do Sul', 'Rio de Janeiro',
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