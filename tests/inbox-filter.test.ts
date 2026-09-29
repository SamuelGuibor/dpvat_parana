import { describe, expect, it } from "vitest";
import {
  INBOX_FILTER_PAGE,
  appendFilterPage,
  buildInboxWhere,
  filterResultChanged,
  hasServerFilter,
  inboxFilterQuery,
  matchesInboxFilter,
  mergeLiveIntoFiltered,
  mergeRefreshedFirstPage,
  normalizeFilterTerm,
  parseInboxFilterParams,
  type FilterableConversation,
} from "@/app/_shared/utils/inbox-filter";

// Filtros do inbox no banco inteiro (auditoria de 24/09/2026, E3): antes a tag
// e a data filtravam só as 1.000 conversas carregadas e o contador mentia
// (Contratados 124 de 276; "Este mês" 861 de 1.608).

const NO_CTX = { cardIdsForTerm: [] as string[], userIdsForLabel: null };

describe("buildInboxWhere", () => {
  it("sem filtro nenhum devolve {}", () => {
    expect(buildInboxWhere({}, NO_CTX)).toEqual({});
    // Termo de 1 caractere não vai ao banco.
    expect(buildInboxWhere({ term: " a " }, NO_CTX)).toEqual({});
  });

  it("combina termo, tag, data, coluna, número e fila em AND", () => {
    const where = buildInboxWhere(
      {
        term: "  Maria 41 ", tagIds: ["t1", "t2"], fromDay: "2026-09-01", toDay: "2026-09-24",
        labelId: "l1", numberId: "n1", queuedOnly: true,
      },
      { cardIdsForTerm: ["u9"], userIdsForLabel: ["u1", "u2"] },
    );
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { contact: { name: { contains: "Maria 41", mode: "insensitive" } } },
            { contact: { userId: { in: ["u9"] } } },
            { contact: { phone: { contains: "41" } } },
          ],
        },
        { tags: { some: { tagId: { in: ["t1", "t2"] } } } },
        { createdAt: { gte: new Date("2026-09-01T03:00:00.000Z"), lt: new Date("2026-09-25T03:00:00.000Z") } },
        { contact: { userId: { in: ["u1", "u2"] } } },
        { numberId: "n1" },
        { status: "queued" },
      ],
    });
  });

  it("termo sem card casado e com menos de 2 dígitos: só o nome do contato", () => {
    expect(buildInboxWhere({ term: "Ana" }, NO_CTX)).toEqual({
      AND: [{ OR: [{ contact: { name: { contains: "Ana", mode: "insensitive" } } }] }],
    });
  });

  it("coluna sem nenhum card devolve userId in [] (resultado vazio, não 'tudo')", () => {
    expect(buildInboxWhere({ labelId: "vazia" }, { cardIdsForTerm: [], userIdsForLabel: [] })).toEqual({
      AND: [{ contact: { userId: { in: [] } } }],
    });
    // Sem os cards resolvidos (erro de quem chama) também é vazio, nunca "tudo".
    expect(buildInboxWhere({ labelId: "l1" }, NO_CTX)).toEqual({
      AND: [{ contact: { userId: { in: [] } } }],
    });
  });

  it("um dia só: de = até", () => {
    expect(buildInboxWhere({ fromDay: "2026-09-26", toDay: "2026-09-26" }, NO_CTX)).toEqual({
      AND: [{ createdAt: { gte: new Date("2026-09-26T03:00:00.000Z"), lt: new Date("2026-09-27T03:00:00.000Z") } }],
    });
  });
});

describe("hasServerFilter / normalizeFilterTerm", () => {
  it("termo vale no banco só com 2+ caracteres, aparado", () => {
    expect(normalizeFilterTerm("  jo ")).toBe("jo");
    expect(normalizeFilterTerm(" j ")).toBe("");
    expect(normalizeFilterTerm(undefined)).toBe("");
  });

  it("busca, tag, data ou coluna mandam ao banco; número e fila sozinhos não", () => {
    expect(hasServerFilter({})).toBe(false);
    expect(hasServerFilter({ term: "a", numberId: "n1", queuedOnly: true })).toBe(false);
    expect(hasServerFilter({ term: "ab" })).toBe(true);
    expect(hasServerFilter({ tagIds: ["t1"] })).toBe(true);
    expect(hasServerFilter({ fromDay: "2026-09-01" })).toBe(true);
    expect(hasServerFilter({ labelId: "l1" })).toBe(true);
    expect(hasServerFilter({ tagIds: [] })).toBe(false);
  });
});

describe("inboxFilterQuery ↔ parseInboxFilterParams", () => {
  it("chave estável: a ordem em que as tags foram marcadas não muda a chave", () => {
    expect(inboxFilterQuery({ tagIds: ["b", "a", "b"] })).toBe(inboxFilterQuery({ tagIds: ["a", "b"] }));
    expect(inboxFilterQuery({ term: " ab " })).toBe(inboxFilterQuery({ term: "ab" }));
  });

  it("termo curto, fila desligada e campos vazios ficam fora da chave", () => {
    expect(inboxFilterQuery({ term: "a", tagIds: [], queuedOnly: false })).toBe("");
  });

  it("ida e volta pela URL devolve o mesmo filtro", () => {
    const f = {
      term: "João 9", tagIds: ["t1", "t2"], fromDay: "2026-09-01", toDay: "2026-09-24",
      labelId: "l1", numberId: "n1", queuedOnly: true,
    };
    const parsed = parseInboxFilterParams(new URLSearchParams(`${inboxFilterQuery(f)}&skip=300`));
    expect(parsed).toEqual({ ...f, skip: 300 });
  });

  it("só um dos dias vira um dia só; dias trocados são desinvertidos", () => {
    expect(parseInboxFilterParams(new URLSearchParams("from=2026-09-10"))).toMatchObject({
      fromDay: "2026-09-10", toDay: "2026-09-10",
    });
    expect(parseInboxFilterParams(new URLSearchParams("from=2026-09-24&to=2026-09-01"))).toMatchObject({
      fromDay: "2026-09-01", toDay: "2026-09-24",
    });
  });

  it("lixo na query é ignorado, nunca erro", () => {
    const f = parseInboxFilterParams(new URLSearchParams(
      "from=ontem&to=2026-9-1&tag=a%20b&tag=ok&label=x'y&number=&skip=-5&fila=sim",
    ));
    expect(f).toEqual({
      term: "", tagIds: ["ok"], fromDay: undefined, toDay: undefined,
      labelId: undefined, numberId: undefined, queuedOnly: false, skip: 0,
    });
    expect(parseInboxFilterParams(new URLSearchParams("skip=2.5")).skip).toBe(0);
  });
});

const row = (id: string, extra: Partial<FilterableConversation & { lastMessageAt: string }> = {}) => ({
  contactId: id,
  contactName: `Cliente ${id}`,
  contactPhone: "5541999990000",
  tags: [] as { id: string; name: string; color: string }[],
  createdAt: "2026-09-20T15:00:00.000Z",
  kanbanLabelId: null as string | null,
  numberId: "n1" as string | null,
  status: "human",
  lastMessageAt: "2026-09-25T10:00:00.000Z",
  ...extra,
});

describe("matchesInboxFilter (o mesmo filtro numa linha carregada)", () => {
  const tag = { id: "t1", name: "Contratados", color: "#0f0" };

  it("sem filtro casa tudo", () => {
    expect(matchesInboxFilter(row("a"), {})).toBe(true);
  });

  it("tag, coluna, número e fila", () => {
    const c = row("a", { tags: [tag], kanbanLabelId: "l1", status: "queued" });
    expect(matchesInboxFilter(c, { tagIds: ["t1", "t9"], labelId: "l1", numberId: "n1", queuedOnly: true })).toBe(true);
    expect(matchesInboxFilter(c, { tagIds: ["t9"] })).toBe(false);
    expect(matchesInboxFilter(c, { labelId: "l2" })).toBe(false);
    expect(matchesInboxFilter(c, { numberId: "n2" })).toBe(false);
    expect(matchesInboxFilter(row("b"), { queuedOnly: true })).toBe(false);
  });

  it("data de entrada em dias de Brasília (22h do dia 24 ainda é dia 24)", () => {
    const c = row("a", { createdAt: "2026-09-25T01:00:00.000Z" });
    expect(matchesInboxFilter(c, { fromDay: "2026-09-01", toDay: "2026-09-24" })).toBe(true);
    expect(matchesInboxFilter(c, { fromDay: "2026-09-25", toDay: "2026-09-25" })).toBe(false);
  });

  it("termo por nome exibido (qualquer tamanho) ou telefone (2+ dígitos)", () => {
    const c = row("a", { contactName: "Maria Souza", contactPhone: "5541988887777" });
    expect(matchesInboxFilter(c, { term: "souz" })).toBe(true);
    expect(matchesInboxFilter(c, { term: "m" })).toBe(true);
    expect(matchesInboxFilter(c, { term: "8888" })).toBe(true);
    expect(matchesInboxFilter(c, { term: "joão" })).toBe(false);
  });
});

describe("filterResultChanged (rebuscar só quando entra ou sai alguém)", () => {
  const f = { tagIds: ["t1"] };
  const tag = { id: "t1", name: "Contratados", color: "#0f0" };
  const result = [row("a", { tags: [tag] })];

  it("quem está no resultado e continua casando não pede rebusca (a fusão do delta basta)", () => {
    expect(filterResultChanged([row("a", { tags: [tag], lastMessageAt: "2026-09-26T10:00:00.000Z" })], result, f)).toBe(false);
    expect(filterResultChanged([], result, f)).toBe(false);
  });

  it("perdeu a tag (sai) ou ganhou a tag fora do resultado (entra) → rebusca", () => {
    expect(filterResultChanged([row("a")], result, f)).toBe(true);
    expect(filterResultChanged([row("b", { tags: [tag] })], result, f)).toBe(true);
  });

  it("conversa fora do filtro e fora do resultado não pede nada", () => {
    expect(filterResultChanged([row("z")], result, f)).toBe(false);
  });

  it("termo de 1 caractere é ignorado como no banco", () => {
    expect(filterResultChanged([row("z", { contactName: "Xavier" })], result, { ...f, term: "a" })).toBe(false);
  });
});

describe("mergeLiveIntoFiltered", () => {
  it("troca pela versão mais nova da lista viva e não duplica", () => {
    const a = row("a", { lastMessageAt: "2026-09-25T10:00:00.000Z" });
    const b = row("b", { lastMessageAt: "2026-09-25T09:00:00.000Z" });
    const bNova = { ...b, lastMessageAt: "2026-09-25T11:00:00.000Z", contactName: "B nova" };
    const out = mergeLiveIntoFiltered([a, b], [bNova, row("c")]);
    expect(out.map((c) => c.contactId)).toEqual(["b", "a"]);
    expect(out[0]).toBe(bNova);
    // Quem só está na lista viva não entra (só a rebusca diz quem casa).
    expect(out).toHaveLength(2);
  });

  it("versão viva igual ou mais velha não troca: mesma referência", () => {
    const a = row("a");
    const filtered = [a];
    expect(mergeLiveIntoFiltered(filtered, [{ ...a, contactName: "velha" }])).toBe(filtered);
    expect(mergeLiveIntoFiltered(filtered, [{ ...a, lastMessageAt: "2026-09-24T10:00:00.000Z" }])).toBe(filtered);
    expect(mergeLiveIntoFiltered(filtered, [])).toBe(filtered);
  });
});

describe("páginas do resultado ('Carregar mais' e rebusca)", () => {
  const at = (h: number) => `2026-09-25T${String(h).padStart(2, "0")}:00:00.000Z`;

  it("appendFilterPage põe a página seguinte no fim sem repetir", () => {
    const current = [row("a"), row("b")];
    expect(appendFilterPage(current, [row("b"), row("c")]).map((c) => c.contactId)).toEqual(["a", "b", "c"]);
    expect(appendFilterPage(current, [row("a")])).toBe(current);
  });

  it("rebusca com página incompleta: o resultado inteiro é a página nova", () => {
    const fresh = [row("x")];
    expect(mergeRefreshedFirstPage([row("a"), row("b")], fresh, INBOX_FILTER_PAGE)).toBe(fresh);
  });

  it("rebusca com página cheia guarda só as páginas seguintes já carregadas (mais velhas que o fim dela)", () => {
    const current = [row("a", { lastMessageAt: at(10) }), row("b", { lastMessageAt: at(9) }), row("c", { lastMessageAt: at(8) }), row("d", { lastMessageAt: at(7) })];
    // Página de 2: "n" chegou agora, "a" saiu do filtro, "b" continua.
    const fresh = [row("n", { lastMessageAt: at(11) }), row("b", { lastMessageAt: at(9) })];
    const out = mergeRefreshedFirstPage(current, fresh, 2);
    expect(out.map((c) => c.contactId)).toEqual(["n", "b", "c", "d"]);
  });
});
