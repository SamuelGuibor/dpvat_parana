// Mover card de coluna — o único caminho que grava a tripla
// labelId/role/statusStartedAt e o log `move` (nunca purgado).
//
// A origem é o `labelId` atual (o `role` é só cópia do nome e pode estar
// desatualizado). Mesma coluna = noop: sem zerar o timer, sem log, sem
// automação — a UI antiga zerava o timer ao soltar o card no mesmo lugar.

import { db } from "../prisma";
import { createLog } from "../log";
import { runAfterResponse } from "../background";
import { reportCriticalError } from "../report-error";
import { runAutomations, type SkippableActionType } from "../automation-executor";
import { CardWriteError, cardRef, sourceMeta, type WriteCommon } from "./types";

export interface MoveCardInput extends WriteCommon {
  labelId: string;
  /**
   * "background" (UI/IA): automações da coluna depois da resposta, via
   * runAfterResponse. "await": dentro do executor (encadeamento por depth).
   * "none": não dispara.
   */
  automations?: "background" | "await" | "none";
  /** Profundidade do encadeamento de `move` das automações. */
  depth?: number;
  /** Tipos de ação das automações a NÃO executar (IA: operador disse "sem WhatsApp"). */
  skipActionTypes?: SkippableActionType[];
  /** Automação que moveu (vai para a mensagem e o metadata do log). */
  automation?: { id: string; name: string } | null;
  /**
   * Nome repassado às automações da coluna nova quando difere do autor do log
   * (executor: o log diz "Bot (Automação)", a cadeia segue com quem moveu).
   */
  automationAuthorName?: string;
}

export interface MoveCardResult {
  noop: boolean;
  from: string | null;
  to: string;
  toLabelId: string;
}

export async function moveCardToLabel(input: MoveCardInput): Promise<MoveCardResult> {
  const { cardId, isProcess, labelId, author, source, op, automation = null } = input;
  const label = await db.label.findUnique({ where: { id: labelId }, select: { id: true, name: true } });
  if (!label) throw new CardWriteError("coluna_nao_encontrada", "Coluna não encontrada.");

  const select = { labelId: true, role: true, name: true, service: true, label: { select: { name: true } } } as const;
  const current = isProcess
    ? await db.process.findUnique({ where: { id: cardId }, select })
    : await db.user.findUnique({ where: { id: cardId }, select });
  if (!current) throw new CardWriteError("card_nao_encontrado", "Card não encontrado.");

  const from = current.label?.name ?? current.role ?? null;
  if (current.labelId === label.id) return { noop: true, from, to: label.name, toLabelId: label.id };

  const data = { labelId: label.id, role: label.name, statusStartedAt: new Date() };
  if (isProcess) await db.process.update({ where: { id: cardId }, data });
  else await db.user.update({ where: { id: cardId }, data });

  const suffix = automation ? ` (automação: ${automation.name})` : "";
  await createLog({
    action: "move",
    message: (from ? `moveu de "${from}" para "${label.name}"` : `moveu para "${label.name}"`) + suffix,
    authorId: author.id,
    authorName: author.name,
    ...cardRef(isProcess, cardId),
    metadata: {
      from,
      to: label.name,
      cardName: current.name ?? null,
      service: current.service ?? null,
      ...(automation ? { automationId: automation.id, automationName: automation.name } : {}),
      ...sourceMeta(source, op),
    },
  });

  const mode = input.automations ?? "background";
  if (mode !== "none") {
    const run = () =>
      runAutomations({
        cardId,
        isProcess,
        newLabelId: label.id,
        authorId: author.id,
        authorName: input.automationAuthorName ?? author.name,
        depth: input.depth ?? 0,
        skipActionTypes: input.skipActionTypes,
      });
    if (mode === "await") await run();
    else runAfterResponse("card_move_automations", () => run().catch((err) => reportCriticalError("AUTOMATION", err)));
  }

  return { noop: false, from, to: label.name, toLabelId: label.id };
}
