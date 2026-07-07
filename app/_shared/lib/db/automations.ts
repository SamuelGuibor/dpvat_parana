import { db } from "../prisma";

export type AutomationCondition = {
  field: string;
  operator: "equals" | "contains" | "startsWith" | "endsWith" | "notEquals" | "isEmpty" | "isNotEmpty";
  value: string;
};

export type AutomationAction = {
  type: "comment" | "file";
  templateText?: string;
  templateFileKey?: string;
  templateFileName?: string;
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
