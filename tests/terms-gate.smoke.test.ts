import { describe, expect, it } from "vitest";
import { db } from "@/app/_shared/lib/prisma";
import { checkTermsGate } from "@/app/_shared/lib/cards/terms-gate";
import { normalizeColumnName } from "@/app/_shared/utils/terms";

// Conferência SÓ LEITURA da trava aceite × ZapSign (T-B40K0) contra o board
// real: checkTermsGate só consulta (colunas, tag, aceite) — nada é movido.
//
//   TERMS_GATE_SMOKE=1 npx vitest run tests/terms-gate.smoke.test.ts
//
// Precisa de banco (o .env local é PRODUÇÃO); fora disso fica pulado.

const ativo = process.env.TERMS_GATE_SMOKE === "1";

describe.skipIf(!ativo)("trava aceite × ZapSign no board real", () => {
  it("COLHER-ASSINATURA sem aceite/tag não vai a POUPA TEMPO; card antigo da POUPA TEMPO entra na DISTRIBUIÇÃO", async () => {
    const labels = await db.label.findMany({ select: { id: true, name: true, order: true } });
    const by = (n: string) => labels.find((l) => normalizeColumnName(l.name) === n)!;
    const colher = by("COLHER-ASSINATURA");
    const poupa = by("POUPA TEMPO");
    const distrib = by("DISTRIBUICAO DE PROCESSOS");
    expect(colher && poupa && distrib).toBeTruthy();

    const noAcceptance = { cardTags: { none: { name: "ZAPSIGN ASSINADO" } } };
    const pre = await db.user.findFirst({ where: { labelId: colher.id, archiveStatus: null, ...noAcceptance }, select: { id: true } });
    const legacy = await db.user.findFirst({ where: { labelId: poupa.id, archiveStatus: null, ...noAcceptance }, select: { id: true } });

    if (pre) {
      const toPoupa = await checkTermsGate({ cardId: pre.id, isProcess: false, fromLabelId: colher.id, to: poupa });
      expect(toPoupa).toMatchObject({ ok: false, code: "falta_aceite" });
      const toDistrib = await checkTermsGate({ cardId: pre.id, isProcess: false, fromLabelId: colher.id, to: distrib });
      expect(toDistrib).toMatchObject({ ok: false, code: "falta_zapsign" });
    }
    if (legacy) {
      const ok = await checkTermsGate({ cardId: legacy.id, isProcess: false, fromLabelId: poupa.id, to: distrib });
      expect(ok).toEqual({ ok: true });
    }
    expect(pre || legacy).toBeTruthy();
  }, 60_000);
});
