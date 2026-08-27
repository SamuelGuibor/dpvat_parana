import { db } from "../prisma";

export type AutomationCondition = {
  // Campo do card, o campo especial "tags" (tags do card, com os operadores
  // hasTag/notHasTag — o value guarda o NOME da tag), ou um dos campos
  // especiais de tempo abaixo — esses não nascem de um movimento de card,
  // então só são avaliados pelo cron de verificação periódica.
  // "__time_in_column__": tempo (dias) que o card está na coluna atual
  //   (statusStartedAt) — value = nº de dias, operator more/lessThanDays.
  // "__due_date__": posição de hoje em relação a um campo de data do card
  //   (dateField, padrão "afastadoAte") — value = nº de dias de folga,
  //   operator before/afterDueDate.
  field: string;
  operator:
    | "equals" | "contains" | "startsWith" | "endsWith" | "notEquals"
    | "isEmpty" | "isNotEmpty"
    | "hasTag" | "notHasTag"
    | "moreThanDays" | "lessThanDays"
    | "beforeDueDate" | "afterDueDate";
  value: string;
  // Só para field === "__due_date__": qual campo de data do card comparar.
  dateField?: string;
};

export type AutomationAction = {
  // "ai_audit": auditoria de documentos por IA (Claude) — o tipo específico
  // vai em `auditType` (documento pessoal ou documentação do INSS).
  // "sheets": registra uma linha numa planilha do Google quando o card entra
  // na coluna (ex.: ENVIADO EMAIL CAIQUE → base de dados externa).
  type: "comment" | "file" | "whatsapp" | "move" | "ai_audit" | "sheets" | "add_tag";
  // "inss_roteiro" é o PRÉ-ROTEIRO (chave legada, ver ai-audit.ts);
  // "inss_pre_envio" é a auditoria da pasta antes do envio.
  auditType?: "documento_pessoal" | "inss_roteiro" | "inss_pre_envio";
  sheetsSpreadsheetId?: string; // ID ou URL completa da planilha
  sheetsTab?: string;           // nome da aba (vazio = primeira)
  sheetsColumns?: string[];     // valores das colunas, com [[variáveis]] do card
  templateText?: string;
  templateFileKey?: string;
  templateFileName?: string;
  // Ação "whatsapp": mensagem para o telefone do card quando ele entra na
  // coluna. `waText` (com [[variáveis]]) vale na janela de 24h; fora dela a
  // Meta só aceita template aprovado — `waTemplateName` + `waTemplateVars`.
  waText?: string;
  waTemplateName?: string;
  waTemplateVars?: string[];
  // Linha da empresa (WhatsAppNumber.id) que envia. Vazio = a linha é deduzida
  // do dono do template (o catálogo é por WABA) e, sem template, vale a linha
  // do contato / o número default.
  waNumberId?: string;
  // Ação "move": coluna de destino. É uma ação TERMINAL — depois de mover,
  // nada mais roda para a coluna antiga; as automações da coluna de destino
  // disparam em seguida (com limite de encadeamento contra loops).
  moveLabelId?: string;
  // Ação "add_tag": adiciona uma tag ao card quando ele entra na coluna.
  tagId?: string;
};

export type AutomationWithLabel = Awaited<ReturnType<typeof fetchAutomations>>[number];

export async function fetchAutomations() {
  return db.automation.findMany({
    include: { triggerLabel: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function fetchAutomationsByLabel(labelId: string) {
  return db.automation.findMany({
    where: { triggerLabelId: labelId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createAutomation(data: {
  name: string;
  category?: string | null;
  triggerLabelId: string;
  cardType: string;
  conditionLogic: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}) {
  return db.automation.create({
    data: {
      name: data.name,
      category: data.category?.trim() || null,
      triggerLabelId: data.triggerLabelId,
      cardType: data.cardType,
      conditionLogic: data.conditionLogic,
      conditions: data.conditions as object[],
      actions: data.actions as object[],
    },
  });
}

export async function updateAutomation(
  id: string,
  data: Partial<{
    name: string;
    category: string | null;
    isActive: boolean;
    triggerLabelId: string;
    cardType: string;
    conditionLogic: string;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
  }>
) {
  const payload: Record<string, unknown> = { ...data };
  if (data.conditions) payload.conditions = data.conditions as object[];
  if (data.actions) payload.actions = data.actions as object[];
  if ("category" in data) payload.category = data.category?.trim() || null;
  return db.automation.update({ where: { id }, data: payload });
}

export async function deleteAutomation(id: string) {
  return db.automation.delete({ where: { id } });
}

// Automações ativas com pelo menos uma condição de tempo (__time_in_column__
// ou __due_date__) — essas não disparam por movimento de card, então o cron
// de verificação periódica é quem precisa encontrá-las.
export async function fetchTimeConditionAutomations() {
  const all = await db.automation.findMany({
    where: { isActive: true },
    include: { triggerLabel: true },
  });
  return all.filter((a) =>
    ((a.conditions as unknown as AutomationCondition[]) ?? []).some(
      (c) => c.field === "__time_in_column__" || c.field === "__due_date__"
    )
  );
}
