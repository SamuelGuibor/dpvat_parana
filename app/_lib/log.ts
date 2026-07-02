/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "./prisma";

export type LogAction =
  | "update"
  | "move"
  | "document_add"
  | "document_remove"
  | "comment_add"
  | "create";

interface CreateLogInput {
  action: LogAction;
  message: string;
  authorId: string;
  authorName: string;
  userId?: string | null;
  processId?: string | null;
  metadata?: any;
}

/**
 * Registra um evento de histórico do card.
 *
 * O log NUNCA pode quebrar a operação principal: qualquer falha aqui é apenas
 * logada no console e engolida, para não impedir a edição/movimentação do card.
 */
export async function createLog(input: CreateLogInput): Promise<void> {
  try {
    await db.log.create({
      data: {
        action: input.action,
        message: input.message,
        authorId: input.authorId,
        authorName: input.authorName,
        userId: input.userId ?? null,
        processId: input.processId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (err) {
    console.error("[LOG] Falha ao registrar log:", err);
  }
}

/**
 * Compara os dados recebidos com o registro anterior e devolve os rótulos
 * amigáveis dos campos que realmente mudaram.
 *
 * - `labels`: mapa campo -> rótulo em PT-BR (também define quais campos monitorar)
 * - `keyMap`: quando a coluna no banco tem nome diferente do campo recebido
 *   (ex.: `obs` no client mapeia para `observacao` no Process)
 */
export function diffFields(
  data: Record<string, any>,
  before: Record<string, any> | null,
  labels: Record<string, string>,
  keyMap: Record<string, string> = {},
): string[] {
  const changed: string[] = [];

  for (const key of Object.keys(labels)) {
    if (!(key in data)) continue;
    const newVal = data[key];
    if (newVal === undefined) continue;

    const dbKey = keyMap[key] ?? key;
    const oldVal = before?.[dbKey];

    const a = newVal === null ? "" : String(newVal).trim();
    const b = oldVal === null || oldVal === undefined ? "" : String(oldVal).trim();

    if (a !== b) changed.push(labels[key]);
  }

  return changed;
}

/** Rótulos amigáveis dos campos editáveis de User/Process (compartilhado). */
export const CARD_FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  cpf: "CPF",
  data_nasc: "Data de nascimento",
  email: "E-mail",
  rua: "Rua",
  bairro: "Bairro",
  numero: "Número",
  cep: "CEP",
  rg: "RG",
  nome_mae: "Nome da mãe",
  telefone: "Telefone",
  cidade: "Cidade",
  estado: "Estado",
  estado_civil: "Estado civil",
  profissao: "Profissão",
  nacionalidade: "Nacionalidade",
  data_acidente: "Data do acidente",
  atendimento_via: "Atendimento via",
  hospital: "Hospital",
  outro_hospital: "Outro hospital",
  lesoes: "Lesões",
  status: "Status",
  service: "Serviço",
  obs: "Observação",
  otherObs: "Outra observação",
  senha_inss: "Senha INSS",
  nome_res: "Nome do responsável",
  rg_res: "RG do responsável",
  cpf_res: "CPF do responsável",
  estado_civil_res: "Estado civil do responsável",
  profissao_res: "Profissão do responsável",
};

/** Monta a frase do log de atualização de campos. */
export function buildUpdateMessage(changed: string[]): string {
  if (changed.length === 1) return `alterou o campo ${changed[0]}`;
  return `alterou os campos ${changed.join(", ")}`;
}
