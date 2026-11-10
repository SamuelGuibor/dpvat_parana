// Tipos do contato do hospital (arquivo "use server" só exporta funções async).

export interface HospitalContactInput {
  email: string;
  telefone: string;
  modo: string;
  obs: string;
}

export interface HospitalContactDTO extends HospitalContactInput {
  hospital: string;
  /** Já existe GHOST (catálogo) para esse hospital. Sem ele, salvar cria. */
  noCatalogo: boolean;
  podeEditar: boolean;
}
