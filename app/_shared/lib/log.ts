/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "./prisma";

export type LogAction =
  | "update"
  | "move"
  | "status_change"   // avanço/recuo do status de progresso (checklist do cliente)
  | "archive"         // arquivou/desarquivou o card
  | "document_add"
  | "document_remove"
  | "comment_add"
  | "create"
  | "dev_commit"     // commit de desenvolvimento (atividade do dev, via git)
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
 * Snapshot do setor do autor NO MOMENTO da ação. Gravado no metadata de todo
 * log para permitir, no futuro, contabilizar/atribuir ações por setor (mesmo
 * que a pessoa troque de setor depois, o histórico preserva onde ela estava).
 */
async function authorSectorSnapshot(authorId: string): Promise<Record<string, any> | null> {
  try {
    const u = await db.user.findUnique({
      where: { id: authorId },
      select: { sectorId: true, sector: { select: { name: true, slug: true } } },
    });
    if (!u?.sectorId) return null;
    return {
      authorSectorId: u.sectorId,
      authorSectorName: u.sector?.name ?? null,
      authorSectorSlug: u.sector?.slug ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Registra um evento de histórico do card.
 *
 * O log NUNCA pode quebrar a operação principal: qualquer falha aqui é apenas
 * logada no console e engolida, para não impedir a edição/movimentação do card.
 */
export async function createLog(input: CreateLogInput): Promise<void> {
  try {
    const sector = await authorSectorSnapshot(input.authorId);
    await db.log.create({
      data: {
        action: input.action,
        message: input.message,
        authorId: input.authorId,
        authorName: input.authorName,
        userId: input.userId ?? null,
        processId: input.processId ?? null,
        metadata: sector || input.metadata ? { ...(sector ?? {}), ...(input.metadata ?? {}) } : undefined,
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
    const sector = await authorSectorSnapshot(input.authorId);
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
          ...(sector ?? {}),
          ...(input.metadata ?? {}),
        },
      },
    });
  } catch (err) {
    console.error("[LOG] Falha ao registrar log de WhatsApp:", err);
  }
}

/** Uma alteração de campo, com o valor anterior e o novo (para o histórico). */
export interface FieldChange {
  field: string;      // nome técnico do campo (ex.: "telefone")
  label: string;      // rótulo em PT-BR (ex.: "Telefone")
  from: string | null;
  to: string | null;
}

// Campos cujo VALOR não deve ir para o log (dado sensível) — registra só que mudou.
const SENSITIVE_FIELDS = new Set(["senha_inss", "password"]);

/**
 * Compara os dados recebidos com o registro anterior e devolve as alterações
 * detalhadas (campo, rótulo, valor antigo e novo) dos campos que mudaram.
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
): FieldChange[] {
  const changed: FieldChange[] = [];

  for (const key of Object.keys(labels)) {
    if (!(key in data)) continue;
    const newVal = data[key];
    if (newVal === undefined) continue;

    const dbKey = keyMap[key] ?? key;
    const oldVal = before?.[dbKey];

    const a = newVal === null ? "" : String(newVal).trim();
    const b = oldVal === null || oldVal === undefined ? "" : String(oldVal).trim();

    if (a !== b) {
      const hide = SENSITIVE_FIELDS.has(key);
      changed.push({
        field: key,
        label: labels[key],
        // Trunca valores longos (obs etc.) para o metadata não inchar.
        from: hide ? "•••" : b ? b.slice(0, 180) : null,
        to: hide ? "•••" : a ? a.slice(0, 180) : null,
      });
    }
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

/** Monta a frase do log de atualização de campos, com o de/para quando é um só. */
export function buildUpdateMessage(changed: FieldChange[]): string {
  if (changed.length === 1) {
    const c = changed[0];
    if (c.from && c.to && !SENSITIVE_FIELDS.has(c.field)) {
      return `alterou ${c.label} de "${c.from}" para "${c.to}"`;
    }
    if (c.to && !SENSITIVE_FIELDS.has(c.field)) return `preencheu ${c.label} com "${c.to}"`;
    return `alterou o campo ${c.label}`;
  }
  return `alterou os campos ${changed.map((c) => c.label).join(", ")}`;
}
