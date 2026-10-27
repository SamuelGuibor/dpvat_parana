// Progresso automático dos fluxos longos (item I, 27/10). Antes cada passo
// custava uma chamada extra de salvar_progresso (6–10 por /prontuario). Agora
// a ferramenta que faz o passo (preparar_*, anexar_rascunho, preparar_email,
// executar_aprovado, adicionar_tag, mover_card, comentar_card) grava o
// progresso ela mesma, quando:
//   - o interruptor de salvar_progresso está ligado (mesmo kill switch);
//   - não é modo de teste (previewOnly);
//   - já existe um fluxo ABERTO do card cujo passo casa com o que a ferramenta
//     acabou de fazer e está na vez (checkStep). Nunca abre fluxo novo: quem
//     abre é a skill, no primeiro salvar_progresso (ou bloqueio).
// Nunca derruba a ferramenta: qualquer falha vira console.warn e `null`.
// salvar_progresso continua para bloqueio, `modo` e `fim`.

import { db } from "../prisma";
import type { OperatorContext } from "./auth";
import type { OpTrace } from "../cards/types";
import { getOpSwitches } from "./switches";
import { openFlows, saveProgress } from "./workflow";
import { checkStep, isStale, workflowDef, type WorkflowStep } from "@/app/_shared/utils/workflows";

export const PROGRESS_SWITCH = "salvar_progresso";

export interface ProgressoAuto {
  fluxo: string;
  workflow: string;
  passo: string;
  proximo: string | null;
}

export async function autoProgress(input: {
  op: OperatorContext;
  trace: OpTrace;
  previewOnly?: boolean;
  cardId: string;
  /** Qual passo esta ferramenta acabou de fazer (pelo tipo/subtipo do passo). */
  match: (step: WorkflowStep) => boolean;
  refs: string[];
  agora?: Date;
}): Promise<ProgressoAuto | null> {
  if (input.previewOnly) return null;
  try {
    const switches = await getOpSwitches();
    if (switches[PROGRESS_SWITCH] !== true) return null;
    const agora = input.agora ?? new Date();
    const flows = (await openFlows(db, { cardId: input.cardId })).filter((f) => !isStale(f.state, agora));
    for (const f of flows) {
      const def = workflowDef(f.state.workflow);
      const step = def.passos.find((s) => input.match(s) && checkStep(f.state, s.id).ok);
      if (!step) continue;
      const r = await saveProgress({ op: input.op, trace: input.trace, workflow: f.state.workflow, cardId: input.cardId, passo: step.id, refs: input.refs, agora });
      if (r.salvo) return { fluxo: r.fluxo, workflow: f.state.workflow, passo: step.id, proximo: r.proximo?.id ?? null };
    }
    return null;
  } catch (err) {
    console.warn("[op] progresso automático não gravado:", err instanceof Error ? err.message : err);
    return null;
  }
}
