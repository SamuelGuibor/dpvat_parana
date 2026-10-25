"use server";

import { unstable_noStore as noStore } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/app/_shared/lib/permissions-server";
import { getOpMetrics, getOpPrompts, listOpOperators, type OpMetricsView, type OpPromptItem } from "@/app/_shared/lib/op/metrics";
import { OP_METRIC_DEFINITIONS, OpPeriodError, resolveOpPeriod } from "@/app/_shared/utils/op-metrics";

// Painel "Operação por IA" (Espaço de Trabalho → IA de operação, Etapa 7).
// Leitura só por server action (as rotas /api/op são públicas no middleware e
// só têm opAuth: a tela nunca lê por lá). Tudo exige manager_dashboard no
// servidor; o texto dos prompts (decisão 7) também — a UI só esconde.
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
}

export async function getOpMetricsAction(raw: z.input<typeof periodSchema>): Promise<OpMetricsPayload> {
  noStore();
  await requirePermission("manager_dashboard");
  const input = periodSchema.parse(raw ?? {});
  const periodo = periodOf(input);
  const [metrics, operadores] = await Promise.all([getOpMetrics({ periodo, operatorId: input.operatorId ?? null }), listOpOperators(periodo)]);
  return { metrics, operadores, definicoes: OP_METRIC_DEFINITIONS };
}

const promptsSchema = periodSchema.extend({
  incluirConversas: z.boolean().optional(),
  pagina: z.number().int().min(1).max(10).optional(),
});

export async function getOpPromptsAction(
  raw: z.input<typeof promptsSchema>,
): Promise<{ itens: OpPromptItem[]; total: number; pagina: number; paginas: number; cortado: boolean }> {
  noStore();
  await requirePermission("manager_dashboard");
  const input = promptsSchema.parse(raw ?? {});
  const periodo = periodOf(input);
  return getOpPrompts({ periodo, operatorId: input.operatorId ?? null, incluirConversas: input.incluirConversas, pagina: input.pagina });
}
