// Decisão 19 do dono (26/10): prompt de desenvolvimento NUNCA aparece na
// operação. O hook grava todo prompt (o cwd é o mesmo repositório para
// operar e para desenvolver); o que não chamou ferramenta crm-op nem começou
// com skill de operação é apagado depois de 1 h. As métricas já o ignoram
// antes disso (classifyPrompt = "conversa").
//
// Fica: prompt com op_tool_calls ligada, com skill de OP_SKILLS, que foi o
// "aprovo <código>" de uma aprovação (approvedRequestId) ou que é origem de
// um fluxo (op_workflows.originRequestId) — e o state antigo da Etapa 6.
// 1 h > janela de 30 min em que uma ferramenta ainda se liga ao prompt.

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { OP_SKILLS } from "@/app/_shared/utils/op-metrics";
import { getOpSwitches } from "./switches";

export const DEV_PROMPT_TTL_MS = 60 * 60_000;

/**
 * Apaga prompts de conversa/desenvolvimento com mais de 1 h. Devolve quantos
 * (null = interruptor `purga_prompts_dev` desligado — padrão até o dono ligar).
 */
export async function purgeDevPrompts(input: { operatorId?: string; desde?: Date; limit?: number; agora?: Date } = {}): Promise<number | null> {
  if ((await getOpSwitches()).purga_prompts_dev !== true) return null;
  const corte = new Date((input.agora ?? new Date()).getTime() - DEV_PROMPT_TTL_MS);
  const limit = Math.min(Math.max(1, input.limit ?? 500), 5_000);
  const opFilter = input.operatorId ? Prisma.sql`AND r."operatorId" = ${input.operatorId}` : Prisma.empty;
  // `desde` mantém barata a rodada a cada prompt (op_tool_calls não tem índice em requestId).
  const desdeFilter = input.desde ? Prisma.sql`AND r."createdAt" >= ${input.desde}` : Prisma.empty;
  return db.$executeRaw(Prisma.sql`
    DELETE FROM op_requests
    WHERE id IN (
      SELECT r.id FROM op_requests r
      WHERE r."createdAt" < ${corte}
        ${opFilter}
        ${desdeFilter}
        AND r.state IS NULL
        AND (r.skill IS NULL OR r.skill NOT IN (${Prisma.join([...OP_SKILLS])}))
        AND NOT EXISTS (SELECT 1 FROM op_tool_calls c WHERE c."requestId" = r.id)
        AND NOT EXISTS (SELECT 1 FROM op_approvals a WHERE a."approvedRequestId" = r.id)
        AND NOT EXISTS (SELECT 1 FROM op_workflows w WHERE w."originRequestId" = r.id)
      LIMIT ${limit}
    )
  `);
}
