import { db } from "../prisma";

export type AutomationCondition = {
  // Campo do card, ou o campo especial "tags" (tags do card, com os
  // operadores hasTag/notHasTag — o value guarda o NOME da tag).
  field: string;
  operator:
    | "equals" | "contains" | "startsWith" | "endsWith" | "notEquals"
    | "isEmpty" | "isNotEmpty"
    | "hasTag" | "notHasTag";
  value: string;
};

export type AutomationAction = {
  type: "comment" | "file" | "whatsapp" | "move";
  templateText?: string;
  templateFileKey?: string;
  templateFileName?: string;
  // Ação "whatsapp": mensagem para o telefone do card quando ele entra na
  // coluna. `waText` (com [[variáveis]]) vale na janela de 24h; fora dela a
  // Meta só aceita template aprovado — `waTemplateName` + `waTemplateVars`.
  waText?: string;
  waTemplateName?: string;
  waTemplateVars?: string[];
  // Ação "move": coluna de destino. É uma ação TERMINAL — depois de mover,
  // nada mais roda para a coluna antiga; as automações da coluna de destino
  // disparam em seguida (com limite de encadeamento contra loops).
  moveLabelId?: string;
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
  triggerLabelId: string;
  cardType: string;
  conditionLogic: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}) {
  return db.automation.create({
    data: {
      name: data.name,
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
  return db.automation.update({ where: { id }, data: payload });
}

export async function deleteAutomation(id: string) {
  return db.automation.delete({ where: { id } });
}
