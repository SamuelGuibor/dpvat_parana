import { describe, it, expect, vi, beforeEach } from "vitest";

// Decisão 19 (26/10): prompt de desenvolvimento some depois de 1 h — só com o
// interruptor purga_prompts_dev ligado. Prisma mockado.
const db = vi.hoisted(() => ({ appSetting: { findUnique: vi.fn() }, $executeRaw: vi.fn() }));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
vi.mock("@/app/_shared/lib/log", () => ({ createLog: vi.fn() }));

import { purgeDevPrompts } from "@/app/_shared/lib/op/retencao";
import { invalidateOpSwitches } from "@/app/_shared/lib/op/switches";

const sqlOf = (q: { strings: string[] }) => q.strings.join("?");

beforeEach(() => {
  db.appSetting.findUnique.mockReset();
  db.$executeRaw.mockReset().mockResolvedValue(3);
  invalidateOpSwitches();
});

describe("purgeDevPrompts", () => {
  it("interruptor desligado (padrão) = não apaga nada", async () => {
    db.appSetting.findUnique.mockResolvedValue(null);
    expect(await purgeDevPrompts()).toBeNull();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("ligado: só prompt > 1 h, sem ferramenta, sem skill de operação, sem aprovação nem fluxo", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ purga_prompts_dev: true }) });
    const agora = new Date("2026-10-26T15:00:00Z");
    expect(await purgeDevPrompts({ operatorId: "op1", agora })).toBe(3);
    const q = db.$executeRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    const sql = sqlOf(q);
    expect(sql).toMatch(/DELETE FROM op_requests/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM op_tool_calls/);
    expect(sql).toMatch(/"approvedRequestId" = r\.id/);
    expect(sql).toMatch(/"originRequestId" = r\.id/);
    expect(sql).toMatch(/r\.state IS NULL/);
    expect(sql).toMatch(/LIMIT/);
    expect(q.values).toContainEqual(new Date("2026-10-26T14:00:00Z"));
    expect(q.values).toContain("prontuario");
    expect(q.values).toContain("op1");
  });
});
