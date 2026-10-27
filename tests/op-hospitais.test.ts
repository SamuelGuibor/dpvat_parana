import { beforeEach, describe, expect, it, vi } from "vitest";

// Item B (27/10): automações por hospital, GHOSTs e cards ativos por hospital
// vêm de um cache de 5 min por instância; escrita de automação o esvazia.

const db = vi.hoisted(() => ({
  label: { findMany: vi.fn() },
  automation: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
}));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
vi.mock("@/app/_shared/lib/s3-presign", () => ({ readVaultText: vi.fn(async () => null) }));

import { activeCardsByHospital, ghostFor, hospitalContactFor, invalidateHospitalCache, loadGhosts, loadHospitalGroups } from "@/app/_shared/lib/op/hospitais";

beforeEach(() => {
  vi.clearAllMocks();
  invalidateHospitalCache();
  db.label.findMany.mockResolvedValue([{ id: "l1", name: "DISTRIBUIÇÃO DE SOLICITAÇÕES" }]);
  db.automation.findMany.mockResolvedValue([
    { id: "a1", name: "Hosp X", conditions: [{ field: "hospital", operator: "equals", value: "Hospital X" }], actions: [], updatedAt: new Date("2026-10-01") },
  ]);
  db.user.findMany.mockImplementation(async ({ where }: { where: { role?: string } }) =>
    where.role === "GHOST"
      ? [{ id: "g1", name: "[HOSPITAL] Hospital X", hospital_email: "same@x.org", hospital_telefone: null, hospital_modo: null, hospital_obs: null }]
      : [{ hospital: "Hospital X" }, { hospital: "hospital x" }, { hospital: "Outro" }],
  );
});

describe("cache de hospitais", () => {
  it("grupos: duas leituras seguidas = uma ida ao banco; invalidar força reler", async () => {
    const a = await loadHospitalGroups();
    const b = await loadHospitalGroups();
    expect(a).toBe(b);
    expect(a.get("HOSPITAL X")?.autos).toHaveLength(1);
    expect(db.automation.findMany).toHaveBeenCalledTimes(1);
    invalidateHospitalCache();
    await loadHospitalGroups();
    expect(db.automation.findMany).toHaveBeenCalledTimes(2);
  });

  it("GHOSTs e contagem de cards também vêm do cache; ghostFor e hospitalContactFor dividem a mesma leitura", async () => {
    await loadGhosts();
    const g = await ghostFor("hospital x");
    const c = await hospitalContactFor("Hospital X");
    expect(g?.id).toBe("g1");
    expect(c).toMatchObject({ email: "same@x.org", fonteEmail: "cadastro", ghost: { id: "g1" } });
    const ghostCalls = db.user.findMany.mock.calls.filter(([arg]) => arg.where.role === "GHOST");
    expect(ghostCalls).toHaveLength(1);

    const n1 = await activeCardsByHospital();
    const n2 = await activeCardsByHospital();
    expect(n1).toBe(n2);
    expect(n1.get("HOSPITAL X")?.n).toBe(2);
    const cardCalls = db.user.findMany.mock.calls.filter(([arg]) => arg.where.role !== "GHOST");
    expect(cardCalls).toHaveLength(1);
  });

  it("cache vencido (5 min) relê", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
      await loadHospitalGroups();
      vi.setSystemTime(new Date("2026-10-27T12:04:00Z"));
      await loadHospitalGroups();
      expect(db.automation.findMany).toHaveBeenCalledTimes(1);
      vi.setSystemTime(new Date("2026-10-27T12:05:01Z"));
      await loadHospitalGroups();
      expect(db.automation.findMany).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
