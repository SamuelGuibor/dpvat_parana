import { describe, expect, it } from "vitest";
import { getDefaultCreds } from "@/app/_shared/lib/whatsapp/numbers";
import { fetchMetaFlows, fetchMetaFlowJson, fetchMetaFlowPreview } from "@/app/_shared/lib/whatsapp/forms";
import { entryScreen, entryScreenData, extractEditableFields, summarizeFlow } from "@/app/_shared/utils/wa-forms";

// Conferência SÓ LEITURA da API de Flows da Meta (T-7ZQH6) com a linha
// default: lista, JSON e link de prévia do formulário de aceite. Nada é
// gravado no banco nem criado na Meta.
//
//   WA_FORMS_META_SMOKE=1 npx vitest run tests/wa-forms-meta.smoke.test.ts

const ativo = process.env.WA_FORMS_META_SMOKE === "1";

describe.skipIf(!ativo)("API de Flows da Meta", () => {
  it("lista, lê o JSON e gera a prévia do aceite_termos_servico", async () => {
    const c = await getDefaultCreds();
    expect(c?.wabaId).toBeTruthy();
    const list = await fetchMetaFlows(c!);
    expect(list.ok).toBe(true);
    const flows = list.ok ? list.data : [];
    const aceite = flows.find((f) => f.name === "aceite_termos_servico");
    expect(aceite?.status).toBe("PUBLISHED");
    const json = await fetchMetaFlowJson(c!, aceite!.id);
    expect(json.ok).toBe(true);
    if (!json.ok) return;
    expect(entryScreen(json.data).id).toBe("ACEITE_TERMOS");
    expect(entryScreenData(json.data).map((d) => d.key)).toEqual(["nome"]);
    expect(summarizeFlow(json.data).length).toBe(3);
    expect(extractEditableFields(json.data).length).toBeGreaterThan(5);
    const preview = await fetchMetaFlowPreview(c!, aceite!.id);
    expect(preview).toMatch(/^https:\/\//);
    console.log(`flows=${flows.length} aceite=${aceite!.id} prévia=${preview ? "ok" : "—"}`);
  }, 60_000);
});
