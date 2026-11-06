import { describe, it, expect } from "vitest";
import { RECOVERY_DAILY_CAP_DEFAULT, RECOVERY_MIN_SEND_GAP_MS, recoveryGapOk } from "@/app/_shared/lib/whatsapp/recovery-caps";

describe("ritmo da recuperação (T-IFYLF)", () => {
  const agora = Date.parse("2026-11-05T13:00:00Z");

  it("sem envio recente pode sair; dentro do minuto, não", () => {
    expect(recoveryGapOk(null, agora)).toBe(true);
    expect(recoveryGapOk(new Date(agora - 10_000), agora)).toBe(false);
    expect(recoveryGapOk(new Date(agora - RECOVERY_MIN_SEND_GAP_MS), agora)).toBe(true);
  });

  it("um envio por minuto das 7h às 21h comporta o teto diário", () => {
    expect(14 * 60).toBeGreaterThanOrEqual(RECOVERY_DAILY_CAP_DEFAULT);
  });
});
