import type { KanbanCard } from '../KanbanBoard';

export interface ExtendedKanbanCard extends KanbanCard {
  id: string;
  cpf?: string;
  data_nasc?: string;
  email?: string;
  rua?: string;
  bairro?: string;
  numero?: string;
  cep?: string;
  rg?: string;
  nome_mae?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  estado_civil?: string;
  profissao?: string;
  nacionalidade?: string;
  data_acidente?: string;
  atendimento_via?: string;
  hospital?: string;
  outro_hospital?: string;
  lesoes?: string;
  role?: string;
  service?: string;
  obs?: string;
  nome_res?: string;
  rg_res?: string;
  cpf_res?: string;
  estado_civil_res?: string;
  profissao_res?: string;
  status?: string | undefined;
  statusStartedAt?: string | null;
  attachments: { id?: string; key: string; name: string; size?: number; uploadedAt: Date }[];
}

export interface FileWithBase64 {
  name: string;
  type: string;
  base64: string;
}