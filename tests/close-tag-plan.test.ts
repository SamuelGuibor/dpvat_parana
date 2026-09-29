import { describe, expect, it } from "vitest";
import {
  NQ_FALLBACK_LABEL_PREFIX,
  closeTagProtectedNames,
  fallbackCloseLabel,
  isDisqualifyingCategory,
  planCloseTagSync,
} from "@/app/_shared/utils/close-tag-plan";
import {
  CLOSE_CATEGORY_LABELS,
  CLOSE_CATEGORY_OPTIONS,
  HIRED_TAG_NAME,
  QUALIFIED_TAG_NAME,
} from "@/app/_shared/lib/whatsapp/close-categories";

// Tag automática de desfecho em todo encerramento (auditoria de 24/09/2026):
// a tag de desfecho anterior sai, as manuais ficam, e a tag-marco
// "Qualificada" do funil só sai quando o desfecho é de desqualificação.

const KNOWN = new Set<string>([
  ...Object.values(CLOSE_CATEGORY_LABELS),
  ...CLOSE_CATEGORY_OPTIONS.map((o) => o.label),
  "Não qualificada — Acidente muito antigo", // motivo da tabela whatsapp_close_reasons
]);

const tag = (tagId: string, name: string) => ({ tagId, name });

function plan(category: string, label: string, current: { tagId: string; name: string }[]) {
  return planCloseTagSync(current, label, KNOWN, closeTagProtectedNames(category)).removeTagIds;
}

describe("planCloseTagSync", () => {
  it("remove o rótulo de desfecho anterior", () => {
    const current = [tag("t_nq", "Não qualificado"), tag("t_perg", "Perguntas / dúvidas")];
    expect(plan("transferido", "Transferidos ao atendente", current)).toEqual(["t_nq", "t_perg"]);
  });

  it("remove também o motivo da tabela e o rótulo legível de nq_* sem linha na tabela", () => {
    const current = [
      tag("t_tab", "Não qualificada — Acidente muito antigo"),
      tag("t_fb", `${NQ_FALLBACK_LABEL_PREFIX}engano`),
    ];
    expect(plan("sem_resposta", "Sem resposta (não recuperado)", current)).toEqual(["t_tab", "t_fb"]);
  });

  it("mantém as tags manuais da equipe", () => {
    const current = [tag("t_vip", "VIP"), tag("t_rec", "Recontato"), tag("t_old", "Descartados")];
    expect(plan("perguntas", "Perguntas / dúvidas", current)).toEqual(["t_old"]);
  });

  it("não remove o rótulo atual (reencerrar com o mesmo desfecho)", () => {
    const current = [tag("t_transf", "Transferidos ao atendente")];
    expect(plan("transferido", "Transferidos ao atendente", current)).toEqual([]);
  });

  it("nunca remove 'Qualificada' nem 'Contratados' fora da desqualificação", () => {
    const current = [tag("t_q", QUALIFIED_TAG_NAME), tag("t_h", HIRED_TAG_NAME)];
    for (const category of ["transferido", "perguntas", "sem_resposta", "novo_acidente", "contratado_perdido"]) {
      expect(plan(category, CLOSE_CATEGORY_LABELS[category], current)).toEqual([]);
    }
  });

  it("encerrar como qualificado mantém a própria 'Qualificada' e tira a de não qualificado", () => {
    const current = [tag("t_q", QUALIFIED_TAG_NAME), tag("t_nq", "Não qualificado")];
    expect(plan("qualificado", QUALIFIED_TAG_NAME, current)).toEqual(["t_nq"]);
  });

  it("desqualificação tira 'Qualificada', mas nunca 'Contratados'", () => {
    const current = [tag("t_q", QUALIFIED_TAG_NAME), tag("t_h", HIRED_TAG_NAME), tag("t_vip", "VIP")];
    expect(plan("nao_qualificado", "Não qualificado", current)).toEqual(["t_q"]);
    expect(plan("nq_acidente_muito_antigo", "Não qualificada — Acidente muito antigo", current)).toEqual(["t_q"]);
    expect(plan("descartado", "Descartados", current)).toEqual(["t_q"]);
  });
});

describe("isDisqualifyingCategory", () => {
  it("só não qualificado, nq_* e descartado", () => {
    expect(isDisqualifyingCategory("nao_qualificado")).toBe(true);
    expect(isDisqualifyingCategory("nq_sem_cobertura")).toBe(true);
    expect(isDisqualifyingCategory("nq_qualquer_motivo_novo")).toBe(true);
    expect(isDisqualifyingCategory("descartado")).toBe(true);
    for (const category of ["qualificado", "contratado_perdido", "perguntas", "novo_acidente", "transferido", "sem_resposta"]) {
      expect(isDisqualifyingCategory(category)).toBe(false);
    }
  });
});

describe("fallbackCloseLabel", () => {
  it("nq_* vira rótulo legível, nunca a chave crua", () => {
    // A chave não tem acento: o rótulo sai legível, não perfeito (o bonito
    // vem da tabela whatsapp_close_reasons quando a linha existe).
    expect(fallbackCloseLabel("nq_sem_lesao_pertinente")).toBe("Não qualif. — sem lesao pertinente");
    expect(fallbackCloseLabel("nq_engano")).toBe(`${NQ_FALLBACK_LABEL_PREFIX}engano`);
    expect(fallbackCloseLabel("nq_")).toBe("Não qualificado");
  });

  it("categoria desconhecida vira texto com a 1ª letra maiúscula", () => {
    expect(fallbackCloseLabel("categoria_nova")).toBe("Categoria nova");
    expect(fallbackCloseLabel("")).toBe("Encerrada");
  });
});
