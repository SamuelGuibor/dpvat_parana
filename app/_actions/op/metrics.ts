"use server";

import { unstable_noStore as noStore } from "next/cache";
import { z } from "zod";
import { requirePermission, requireTeam } from "@/app/_shared/lib/permissions-server";
import { getOpMetrics, getOpPrompts, listOpOperators, type OpMetricsView, type OpPromptItem } from "@/app/_shared/lib/op/metrics";
import { OP_METRIC_DEFINITIONS, OpPeriodError, resolveOpPeriod } from "@/app/_shared/utils/op-metrics";

// Painel "Operação por IA" (Espaço de Trabalho → IA de operação, Etapa 7).
// Leitura só por server action (as rotas /api/op são públicas no middleware e
// só têm opAuth: a tela nunca lê por lá). Números: manager_dashboard vê a
// equipe; quem só tem op_use vê SÓ o próprio (decisão 5 do dono, 26/10 — o
// servidor força o operatorId, a UI não escolhe). Texto dos prompts (decisão
// 7) continua só com manager_dashboard.
// Sem poll: carrega ao abrir e no botão "Atualizar".

const periodSchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dias: z.number().int().min(1).max(90).optional(),
  operatorId: z.string().min(1).max(64).nullable().optional(),
});

function periodOf(input: z.infer<typeof periodSchema>) {
  try {
    return resolveOpPeriod(input);
  } catch (err) {
    if (err instanceof OpPeriodError) throw new Error(err.message);
    throw err;
  }
}

export interface OpMetricsPayload {
  metrics: OpMetricsView;
  operadores: { id: string; nome: string }[];
  definicoes: typeof OP_METRIC_DEFINITIONS;
  /** "equipe" = Visão do Gestor; "proprio" = só os números de quem está logado. */
  escopo: "equipe" | "proprio";
}

export async function getOpMetricsAction(raw: z.input<typeof periodSchema>): Promise<OpMetricsPayload> {
  noStore();
  const ctx = await requireTeam();
  const gestor = ctx.permissions.manager_dashboard === true;
  if (!gestor && !ctx.permissions.op_use) throw new Error("Você não tem permissão para esta ação.");
  const input = periodSchema.parse(raw ?? {});
  const periodo = periodOf(input);
  if (!gestor) {
    const metrics = await getOpMetrics({ periodo, operatorId: ctx.userId });
    return { metrics, operadores: [{ id: ctx.userId, nome: ctx.name ?? ctx.email }], definicoes: OP_METRIC_DEFINITIONS, escopo: "proprio" };
  }
  const [metrics, operadores] = await Promise.all([getOpMetrics({ periodo, operatorId: input.operatorId ?? null }), listOpOperators(periodo)]);
  return { metrics, operadores, definicoes: OP_METRIC_DEFINITIONS, escopo: "equipe" };
}

const promptsSchema = periodSchema.extend({
  pagina: z.number().int().min(1).max(10).optional(),
});

export async function getOpPromptsAction(
  raw: z.input<typeof promptsSchema>,
): Promise<{ itens: OpPromptItem[]; total: number; pagina: number; paginas: number; cortado: boolean }> {
  noStore();
  await requirePermission("manager_dashboard");
  const input = promptsSchema.parse(raw ?? {});
  const periodo = periodOf(input);
  return getOpPrompts({ periodo, operatorId: input.operatorId ?? null, pagina: input.pagina });
}
