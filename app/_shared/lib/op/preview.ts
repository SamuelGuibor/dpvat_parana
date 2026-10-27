// Prévia das ferramentas de escrita (L3). Contrato (docs/ai-first/03-plano-etapa-3.md,
// revisto pela decisão do dono de 27/10 — docs/ai-first/10-decisoes-dono-27-10.md):
//
// - `confirmacao: "direta"` (padrão novo): com `confirmar: true` a ferramenta
//   EXECUTA na hora, numa chamada só, como clicar no site. Sem `confirmar` só
//   relê e devolve a prévia + `previa_hash` (serve ao script de teste e a quem
//   quiser olhar antes). Se vier um `previa_hash` velho, respeita: `estado_mudou`.
// - `confirmacao: "exigida"`: só para o que o dono listou — WhatsApp que sai
//   com a movimentação, arquivo de contrato, documento para a lixeira, troca
//   de campo já preenchido. Sem o hash devolve `requer_confirmacao` (409) com
//   a prévia: a skill mostra, o operador diz "sim" e a chamada volta com o
//   `previa_hash`. Hash recalculado sobre o estado ATUAL diferente → `estado_mudou`.
//
// Quem decide o modo é a FERRAMENTA (pelos args e pelo estado), nunca o modelo.

import { z } from "zod/v4";
import { canonicalHash } from "./policy";
import { OpToolError } from "./registry";

export type Confirmacao = "direta" | "exigida";

/** Campos de controle que toda L3 aceita (fora do hash: o hash é dos args da ação). */
export const confirmSchema = {
  confirmar: z
    .boolean()
    .default(false)
    .describe("true = executar (ação direta executa na hora; ação que exige confirmação devolve requer_confirmacao com a prévia). false = só prévia, nada é gravado."),
  previa_hash: z.string().max(80).optional().describe("Hash devolvido pela prévia/requer_confirmacao. Obrigatório só na 2ª chamada de uma ação que exige confirmação."),
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
 * Executa o contrato: sem confirmar → devolve a prévia; com confirmar → executa
 * (direta) ou confere o hash e executa (exigida). `estado` é relido pelo
 * chamador logo antes.
 */
export async function previewOrExecute<P extends Record<string, unknown>, R>(input: {
  tool: string;
  args: { confirmar?: boolean; previa_hash?: string } & Record<string, unknown>;
  estado: unknown;
  previa: P;
  execute: () => Promise<R>;
  /** Padrão "direta" (decisão do dono, 27/10). "exigida" só nos casos listados no cabeçalho. */
  confirmacao?: Confirmacao;
}): Promise<{ executed: false; previa: P & { previa_hash: string; requerConfirmacao: boolean } } | { executed: true; result: R }> {
  const modo: Confirmacao = input.confirmacao ?? "direta";
  const hash = previewHash(input.tool, actionArgs(input.args), input.estado);
  const previa = { ...input.previa, previa_hash: hash, requerConfirmacao: modo === "exigida" };
  if (!input.args.confirmar) return { executed: false, previa };
  if (input.args.previa_hash && input.args.previa_hash !== hash) {
    throw new OpToolError(
      "estado_mudou",
      "O card mudou (ou o pedido mudou) desde a prévia. Mostre a prévia nova ao operador e pergunte de novo.",
      409,
      { previa },
    );
  }
  if (modo === "exigida" && !input.args.previa_hash) {
    throw new OpToolError(
      "requer_confirmacao",
      "Esta ação precisa do OK do operador: mostre a prévia (details.previa), pergunte \"Confirma?\" e repita a chamada com confirmar: true + previa_hash.",
      409,
      { previa },
    );
  }
  return { executed: true, result: await input.execute() };
}
