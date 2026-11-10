import { describe, expect, it } from "vitest";
import { computeColumnOrder, orderIndexMap, sortByBoardOrder } from "@/app/_shared/utils/kanban-order";

// Arrastar com busca/filtro ativos (T-Y6ZGE): a ordem nova vale para a coluna
// INTEIRA, não só para os cards visíveis.

const card = (id: string, boardOrder: number | null, isProcess = false) => ({ id, isProcess, boardOrder });
const ids = (o: { id: string }[]) => o.map((c) => c.id);

describe("sortByBoardOrder", () => {
  it("ordena por boardOrder e manda os sem ordem para o fim, estável", () => {
    const out = sortByBoardOrder([card("x", null), card("b", 1), card("y", null), card("a", 0)]);
    expect(ids(out)).toEqual(["a", "b", "x", "y"]);
  });
});

describe("computeColumnOrder", () => {
  // Coluna real: a b c d e; com filtro só b e d aparecem.
  const column = [card("a", 0), card("b", 1), card("c", 2), card("d", 3), card("e", 4)];

  it("reordenar na mesma coluna com filtro mantém os escondidos no lugar", () => {
    // Usuário arrasta d para cima de b (único outro card visível).
    const out = computeColumnOrder(column, { id: "d", isProcess: false }, "b");
    expect(ids(out)).toEqual(["a", "d", "b", "c", "e"]);
  });

  it("card vindo de outra coluna entra acima do card de referência", () => {
    const out = computeColumnOrder(column, { id: "n", isProcess: true }, "d");
    expect(ids(out)).toEqual(["a", "b", "c", "n", "d", "e"]);
    expect(out[3]).toEqual({ id: "n", isProcess: true });
  });

  it("sem referência (soltou no corpo da coluna) vai para o fim da coluna inteira", () => {
    expect(ids(computeColumnOrder(column, { id: "n", isProcess: false }, null))).toEqual(["a", "b", "c", "d", "e", "n"]);
  });

  it("referência que sumiu da coluna cai no fim", () => {
    expect(ids(computeColumnOrder(column, { id: "a", isProcess: false }, "zz"))).toEqual(["b", "c", "d", "e", "a"]);
  });

  it("parte da ordem salva, não da ordem do array", () => {
    const shuffled = [card("c", 2), card("a", 0), card("e", null), card("b", 1)];
    expect(ids(computeColumnOrder(shuffled, { id: "e", isProcess: false }, "a"))).toEqual(["e", "a", "b", "c"]);
  });

  it("User e Process com o mesmo id não se confundem", () => {
    const col = [card("same", 0, false), card("same", 1, true), card("z", 2)];
    const out = computeColumnOrder(col, { id: "same", isProcess: true }, null);
    expect(out).toEqual([
      { id: "same", isProcess: false },
      { id: "z", isProcess: false },
      { id: "same", isProcess: true },
    ]);
    const map = orderIndexMap(out);
    expect(map.get("u:same")).toBe(0);
    expect(map.get("p:same")).toBe(2);
  });
});
