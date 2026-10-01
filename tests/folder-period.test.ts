import { describe, expect, it } from "vitest";
import { computeFolderTotals, inPeriod, outcomeAsOf, type FolderPeriodRow } from "../app/_shared/utils/folder-period";

const UNI = { paid: "pagos_uni", denied: "pastas_negadas_uni" };
// Setembro/2026 em Brasília (00:00 BRT = 03:00Z).
const SET_INI = new Date("2026-09-01T03:00:00Z");
const SET_FIM = new Date("2026-10-01T02:59:59.999Z");
const OUT_INI = new Date("2026-10-01T03:00:00Z");
const OUT_FIM = new Date("2026-11-01T02:59:59.999Z");

/** Monta a linha como o folder-report.ts monta, para um período. */
function row(enviadoEm: string | null, status: string | null, archivedAt: string | null, from: Date, to: Date): FolderPeriodRow {
  const env = enviadoEm ? new Date(enviadoEm) : null;
  const { desfecho, desfechoEm } = outcomeAsOf(status, archivedAt ? new Date(archivedAt) : null, UNI, to);
  return {
    enviadoEm,
    desfecho,
    desfechoEm: desfechoEm?.toISOString() ?? null,
    enviadaNoPeriodo: inPeriod(env, from, to),
    resolvidaNoPeriodo: (desfecho === "pago" || desfecho === "negado") && inPeriod(desfechoEm, from, to),
  };
}

describe("outcomeAsOf", () => {
  it("pago só com o status do próprio destino", () => {
    const at = new Date("2026-09-10T15:00:00Z");
    expect(outcomeAsOf("pagos_uni", at, UNI, SET_FIM).desfecho).toBe("pago");
    expect(outcomeAsOf("pastas_negadas_uni", at, UNI, SET_FIM).desfecho).toBe("negado");
    // Pago pelo Caique (CCS) não é pago pela UNI.
    expect(outcomeAsOf("pagos_ccs", at, UNI, SET_FIM).desfecho).toBe("encerrado");
    expect(outcomeAsOf(null, null, UNI, SET_FIM).desfecho).toBe("enviado");
  });

  it("arquivada depois do fim do período ainda estava em análise", () => {
    const r = outcomeAsOf("pagos_uni", new Date("2026-10-05T15:00:00Z"), UNI, SET_FIM);
    expect(r).toEqual({ desfecho: "enviado", desfechoEm: null });
  });
});

describe("computeFolderTotals — pago conta no mês do pagamento", () => {
  // Entrou em 09, pago em 10.
  const env = "2026-09-20T15:00:00Z";
  const pago = "2026-10-03T15:00:00Z";

  it("setembro: enviada e ainda em análise; não conta como paga", () => {
    const t = computeFolderTotals([row(env, "pagos_uni", pago, SET_INI, SET_FIM)]);
    expect(t).toMatchObject({ enviadas: 1, pagas: 0, emAnalise: 1 });
  });

  it("outubro: conta como paga, não como enviada", () => {
    const t = computeFolderTotals([row(env, "pagos_uni", pago, OUT_INI, OUT_FIM)]);
    expect(t).toMatchObject({ enviadas: 0, pagas: 1, emAnalise: 0, medianaDiasDesfecho: 13 });
  });

  it("pago na virada do mês em Brasília (30/09 22h BRT = 01/10 01h UTC) conta em setembro", () => {
    const t = computeFolderTotals([row(env, "pagos_uni", "2026-10-01T01:00:00Z", SET_INI, SET_FIM)]);
    expect(t.pagas).toBe(1);
  });

  it("pago sem registro de envio conta na paga e fica fora da mediana", () => {
    const t = computeFolderTotals([row(null, "pagos_uni", pago, OUT_INI, OUT_FIM)]);
    expect(t).toMatchObject({ enviadas: 0, pagas: 1, medianaDiasDesfecho: null });
  });

  it("encerrada por outro motivo não é paga, negada nem em análise", () => {
    const t = computeFolderTotals([row(env, "pagos_ccs", "2026-09-25T15:00:00Z", SET_INI, SET_FIM)]);
    expect(t).toMatchObject({ enviadas: 1, pagas: 0, negadas: 0, emAnalise: 0 });
  });
});
