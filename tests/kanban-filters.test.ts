import { describe, expect, it } from "vitest";
import {
  EMPTY_KANBAN_FILTERS,
  daysInColumn,
  hasActiveKanbanFilters,
  hospitalKey,
  hospitalOf,
  hospitalOptions,
  isAfastado,
  isOverdue,
  matchesKanbanFilters,
  parseKanbanFilters,
  type KanbanFilters,
} from "@/app/_shared/utils/kanban-filters";

// Filtros do board (T-Y6ZGE). "Agora" = 09/11/2026 01:30 UTC = 08/11 22:30 em
// Brasília: pega o caso em que o dia UTC já virou e o de Brasília não.
const NOW = new Date("2026-11-09T01:30:00Z");

const f = (p: Partial<KanbanFilters>): KanbanFilters => ({ ...EMPTY_KANBAN_FILTERS, ...p });

describe("daysInColumn", () => {
  it("conta dias de calendário de Brasília", () => {
    // Entrou 07/11 23:00 em Brasília (08/11 02:00 UTC) → hoje (08/11 BR) = 1 dia.
    expect(daysInColumn("2026-11-08T02:00:00Z", NOW)).toBe(1);
    // Entrou hoje cedo em Brasília.
    expect(daysInColumn("2026-11-08T12:00:00Z", NOW)).toBe(0);
  });
  it("sem data ou data inválida = null", () => {
    expect(daysInColumn(null, NOW)).toBeNull();
    expect(daysInColumn("lixo", NOW)).toBeNull();
  });
});

describe("isOverdue", () => {
  it("estoura só quando passa do limite da coluna", () => {
    const label = { timeLimitDays: 2 };
    expect(isOverdue({ label, statusStartedAt: "2026-11-06T12:00:00Z" }, NOW)).toBe(false); // 2 dias
    expect(isOverdue({ label, statusStartedAt: "2026-11-05T12:00:00Z" }, NOW)).toBe(true); // 3 dias
  });
  it("coluna sem prazo ou card sem data nunca estoura", () => {
    expect(isOverdue({ label: { timeLimitDays: null }, statusStartedAt: "2020-01-01T00:00:00Z" }, NOW)).toBe(false);
    expect(isOverdue({ label: { timeLimitDays: 1 }, statusStartedAt: null }, NOW)).toBe(false);
  });
});

describe("isAfastado", () => {
  it("vigente hoje e no futuro, vencido antes", () => {
    // afastadoAte é meia-noite UTC de uma data: compara só a data com o dia de Brasília (08/11).
    expect(isAfastado({ afastadoAte: "2026-11-08T00:00:00.000Z" }, NOW)).toBe(true);
    expect(isAfastado({ afastadoAte: "2026-12-01T00:00:00.000Z" }, NOW)).toBe(true);
    expect(isAfastado({ afastadoAte: "2026-11-07T00:00:00.000Z" }, NOW)).toBe(false);
    expect(isAfastado({ afastadoAte: null }, NOW)).toBe(false);
  });
});

describe("hospital", () => {
  it("usa outro_hospital quando a lista diz Outro ou está vazia", () => {
    expect(hospitalOf({ hospital: "  Hospital  Cajuru " })).toBe("Hospital Cajuru");
    expect(hospitalOf({ hospital: "Outro", outro_hospital: "Santa Casa PG" })).toBe("Santa Casa PG");
    expect(hospitalOf({ hospital: "", outro_hospital: "HC" })).toBe("HC");
    expect(hospitalOf({})).toBeNull();
  });
  it("chave ignora acento, caixa e espaços", () => {
    expect(hospitalKey("Hospital  São Vicente")).toBe(hospitalKey("hospital sao vicente"));
  });
  it("opções agrupam grafias e ordenam por frequência", () => {
    const opts = hospitalOptions([
      { hospital: "Cajuru" }, { hospital: "cajurú" }, { hospital: "Evangélico" }, { hospital: "" },
    ]);
    expect(opts.map((o) => [o.name, o.count])).toEqual([["Cajuru", 2], ["Evangélico", 1]]);
  });
});

describe("matchesKanbanFilters", () => {
  const card = {
    hospital: "Cajuru",
    afastadoAte: "2026-12-01T00:00:00.000Z",
    label: { timeLimitDays: 5 },
    statusStartedAt: "2026-11-07T12:00:00Z",
  };

  it("sem filtro passa tudo", () => {
    expect(matchesKanbanFilters({}, [], EMPTY_KANBAN_FILTERS, NOW)).toBe(true);
    expect(hasActiveKanbanFilters(EMPTY_KANBAN_FILTERS)).toBe(false);
  });
  it("tags: OU entre as escolhidas", () => {
    expect(matchesKanbanFilters(card, ["t2"], f({ tagIds: ["t1", "t2"] }), NOW)).toBe(true);
    expect(matchesKanbanFilters(card, ["t3"], f({ tagIds: ["t1", "t2"] }), NOW)).toBe(false);
  });
  it("hospital pela chave", () => {
    expect(matchesKanbanFilters(card, [], f({ hospitals: [hospitalKey("CAJURU")] }), NOW)).toBe(true);
    expect(matchesKanbanFilters({ hospital: "Outro" }, [], f({ hospitals: ["cajuru"] }), NOW)).toBe(false);
  });
  it("E entre filtros diferentes", () => {
    expect(matchesKanbanFilters(card, [], f({ afastado: true, hospitals: ["cajuru"] }), NOW)).toBe(true);
    expect(matchesKanbanFilters(card, [], f({ afastado: true, overdue: true }), NOW)).toBe(false);
  });
});

describe("parseKanbanFilters", () => {
  it("restaura o que foi gravado", () => {
    const saved = f({ tagIds: ["a"], hospitals: ["cajuru"], overdue: true, afastado: false });
    expect(parseKanbanFilters(JSON.stringify(saved))).toEqual(saved);
  });
  it("lixo vira filtro vazio", () => {
    expect(parseKanbanFilters(null)).toEqual(EMPTY_KANBAN_FILTERS);
    expect(parseKanbanFilters("{quebrado")).toEqual(EMPTY_KANBAN_FILTERS);
    expect(parseKanbanFilters(JSON.stringify({ tagIds: [1, "ok"], overdue: "sim" }))).toEqual(f({ tagIds: ["ok"] }));
  });
});
