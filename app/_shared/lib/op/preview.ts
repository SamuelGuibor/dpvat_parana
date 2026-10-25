// Prévia das ferramentas de escrita (L3). Contrato (docs/ai-first/03-plano-etapa-3.md):
// sem `confirmar` a ferramenta só relê e devolve a prévia + `previa_hash`;
// com `confirmar: true` + o hash, executa só se o hash recalculado sobre o
// estado ATUAL for igual — alguém mexeu no card entre a prévia e o "sim" →
// `estado_mudou` (409) com a prévia nova, e a skill pergunta de novo.

import { z } from "zod/v4";
import { canonicalHash } from "./policy";
import { OpToolError } from "./registry";

/** Campos de controle que toda L3 aceita (fora do hash: o hash é dos args da ação). */
export const confirmSchema = {
  confirmar: z.boolean().default(false).describe("false (padrão) = só prévia, nada é gravado. true = executar, exige previa_hash."),
  previa_hash: z.string().max(80).optional().describe("Hash devolvido pela prévia. Obrigatório com confirmar: true."),
};

export function actionArgs<T extends { confirmar?: boolean; previa_hash?: string }>(args: T): Omit<T, "confirmar" | "previa_hash"> {
  const rest = { ...args } as Record<string, unknown>;
  delete rest.confirmar;
  delete rest.previa_hash;
  return rest as Omit<T, "confirmar" | "previa_hash">;
}

/** Hash da prévia: ferramenta + args da ação + só os campos do estado que a ação lê. */
export function previewHash(tool: string, args: unknown, estado: unknown): string {
  return canonicalHash(tool, { args, estado });
}

/**
 * Executa o contrato: sem confirmar → devolve a prévia; com confirmar → confere
 * o hash e chama `execute`. `estado` é relido pelo chamador logo antes.
 */
export async function previewOrExecute<P extends Record<string, unknown>, R>(input: {
  tool: string;
  args: { confirmar?: boolean; previa_hash?: string } & Record<string, unknown>;
  estado: unknown;
  previa: P;
  execute: () => Promise<R>;
}): Promise<{ executed: false; previa: P & { previa_hash: string } } | { executed: true; result: R }> {
  const hash = previewHash(input.tool, actionArgs(input.args), input.estado);
  const previa = { ...input.previa, previa_hash: hash };
  if (!input.args.confirmar) return { executed: false, previa };
  if (!input.args.previa_hash) {
    throw new OpToolError("argumentos_invalidos", "Para executar, mande o previa_hash da prévia que o operador confirmou.", 400);
  }
  if (input.args.previa_hash !== hash) {
    throw new OpToolError(
      "estado_mudou",
      "O card mudou (ou o pedido mudou) desde a prévia. Mostre a prévia nova ao operador e pergunte de novo.",
      409,
      { previa },
    );
  }
  return { executed: true, result: await input.execute() };
}
