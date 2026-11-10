// Ordem manual dos cards dentro de uma coluna do Kanban (`boardOrder`).
//
// Por que existe: o `reorderCards` grava índice → boardOrder para a lista que
// recebe. Com busca ou filtro ativos o board só mostra parte da coluna, e a
// versão antiga montava a lista só com os cards VISÍVEIS: os escondidos
// ficavam com o boardOrder velho e colidiam com os índices novos (a coluna
// embaralhava ao limpar o filtro). Aqui a ordem é calculada sobre TODOS os
// cards da coluna e o movido entra logo acima do card de referência.

export interface OrderRef { id: string; isProcess: boolean }
export interface OrderedCard extends OrderRef { boardOrder?: number | null }

const sameCard = (a: OrderRef, b: OrderRef) => a.id === b.id && !!a.isProcess === !!b.isProcess;

/**
 * Ordem de exibição: boardOrder crescente, sem ordem no fim. Sort estável, então
 * os sem ordem mantêm a ordem de chegada (a mesma regra das colunas do board).
 */
export function sortByBoardOrder<T extends { boardOrder?: number | null }>(cards: readonly T[]): T[] {
  return [...cards].sort(
    (a, b) => (a.boardOrder ?? Number.MAX_SAFE_INTEGER) - (b.boardOrder ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Nova ordem completa da coluna de destino.
 * - `columnCards`: TODOS os cards da coluna de destino (visíveis ou não), em
 *   qualquer ordem; o movido pode estar entre eles (reordenar na mesma coluna).
 * - `beforeCardId`: card visível acima do qual o movido foi solto; null (ou
 *   card que não está mais na coluna) = fim da coluna.
 */
export function computeColumnOrder(
  columnCards: readonly OrderedCard[],
  moved: OrderRef,
  beforeCardId: string | null,
): OrderRef[] {
  const rest = sortByBoardOrder(columnCards)
    .filter((c) => !sameCard(c, moved))
    .map((c) => ({ id: c.id, isProcess: !!c.isProcess }));
  let at = beforeCardId ? rest.findIndex((c) => c.id === beforeCardId) : -1;
  if (at === -1) at = rest.length;
  rest.splice(at, 0, { id: moved.id, isProcess: !!moved.isProcess });
  return rest;
}

/** Mapa "isProcess:id" → índice novo, para espelhar o boardOrder no estado local. */
export function orderIndexMap(order: readonly OrderRef[]): Map<string, number> {
  return new Map(order.map((c, i) => [orderKey(c), i]));
}

export function orderKey(c: OrderRef): string {
  return `${c.isProcess ? 'p' : 'u'}:${c.id}`;
}
