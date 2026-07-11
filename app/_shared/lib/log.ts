/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "./prisma";

export type LogAction =
  | "update"
  | "move"
  | "document_add"
  | "document_remove"
  | "comment_add"
  | "create"
  // WhatsApp (auditoria do atendimento):
  | "wa_assign"      // atendente assumiu / atribuiu a conversa
  | "wa_reopen"      // reabriu um atendimento encerrado
  | "wa_return_bot"  // devolveu a conversa pro bot
  | "wa_close"       // encerrou (qualificada / não qualificada)
  | "wa_text"        // enviou mensagem de texto
  | "wa_document"    // enviou documento/arquivo
  | "wa_media"       // enviou imagem/vídeo/áudio
  | "wa_flow"        // disparou um fluxo pré-setado
  | "wa_template"    // enviou um template aprovado na Meta
  | "wa_note"        // registrou uma nota interna na thread (só equipe vê)
  | "wa_bot";        // decisão da IA (qualify/disqualify/handoff/continue/erro)

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
 * Registra um evento de auditoria do atendimento por WhatsApp.
 *
 * Usa a mesma tabela `Log`, mas com um marcador `channel: "whatsapp"` no
 * metadata e o contato guardado ali (contactId/contactName/phone) — os campos
 * userId/processId da tabela ficam nulos, pois um contato de WhatsApp nem
 * sempre está vinculado a um card. Isso permite listar "quem fez o quê" no
 * atendimento e alimenta o dashboard do chatbot.
 *
 * NUNCA quebra a operação principal: falha aqui é só logada no console.
 */
export async function logWhatsAppEvent(input: {
  action: LogAction;
  message: string;
  authorId: string;
  authorName: string;
  contactId: string;
  contactName?: string | null;
  contactPhone?: string | null;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await db.log.create({
      data: {
        action: input.action,
        message: input.message,
        authorId: input.authorId,
        authorName: input.authorName,
        metadata: {
          channel: "whatsapp",
          contactId: input.contactId,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          ...(input.metadata ?? {}),
        },
      },
    });
  } catch (err) {
    console.error("[LOG] Falha ao registrar log de WhatsApp:", err);
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
  telefone_secundario: "Telefone secundário",
  rede_social: "Rede social",
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
