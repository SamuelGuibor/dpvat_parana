import { describe, it, expect } from "vitest";
import { duplicateCardIds, findInconsistencies, sugerirManter, VARREDURA_REGRAS, type VarreduraCard } from "@/app/_shared/utils/op-varredura";
import { block, newState, markDone } from "@/app/_shared/utils/workflows";

const agora = new Date("2026-10-25T13:00:00Z");
// CPFs válidos de teste (gerados, sem dono).
const CPF_A = "52998224725";
const CPF_B = "11144477735";

function card(n: number, over: Partial<VarreduraCard> = {}): VarreduraCard {
  return { id: `card000000000000000000${n}`, cardNumber: n, nome: `Cliente ${n}`, coluna: "AUDITORIA", cpf: null, telefone: null, hospital: "X", outroHospital: null, ...over };
}

describe("findInconsistencies", () => {
  it("CPF repetido entre ativos (com ou sem máscara): UM item por grupo (27/10, item C) com os cards e a sugestão", () => {
    const r = findInconsistencies({ cards: [card(1, { cpf: CPF_A }), card(2, { cpf: "529.982.247-25" }), card(3, { cpf: CPF_B })], flows: [], limite: 30, agora });
    expect(r.totais.cpf_repetido).toBe(1);
    const item = r.itens.find((i) => i.checagem === "cpf_repetido")!;
    expect(item.evidencia).toMatchObject({ campo: "cpf", valor: CPF_A, sugestao: { manter: 1, arquivar: [2], motivo: "empate: o de menor número" } });
    expect((item.evidencia.cards as { cardNumber: number }[]).map((c) => c.cardNumber)).toEqual([1, 2]);
    // O card do item é o sugerido para manter.
    expect(item.card.cardNumber).toBe(1);
    expect(item.regra).toBe(VARREDURA_REGRAS.cpf_repetido.regra);
    expect(item.fonte).toMatch(/não é regra oficial/);
  });

  it("sugestão de qual manter: documentos > comentários > mais antigo > menor nº; stats entram pelo card", () => {
    const base = { id: "x", nome: null, coluna: "A", diasNaColuna: null, criadoEm: null };
    expect(sugerirManter([{ ...base, cardNumber: 5, documentos: 1, comentarios: 0 }, { ...base, cardNumber: 2, documentos: 3, comentarios: 0 }])).toEqual({ manter: 2, arquivar: [5], motivo: "tem mais documentos" });
    expect(sugerirManter([{ ...base, cardNumber: 5, documentos: 1, comentarios: 4 }, { ...base, cardNumber: 2, documentos: 1, comentarios: 1 }])).toMatchObject({ manter: 5, motivo: "tem mais comentários" });
    expect(sugerirManter([{ ...base, cardNumber: 5, documentos: 0, comentarios: 0, criadoEm: "2026-01-01" }, { ...base, cardNumber: 2, documentos: 0, comentarios: 0, criadoEm: "2026-05-01" }])).toMatchObject({ manter: 5, motivo: "é o mais antigo" });
    const r = findInconsistencies({
      cards: [card(1, { cpf: CPF_A, stats: { documentos: 0, comentarios: 0, diasNaColuna: 3, criadoEm: "2026-10-01" } }), card(2, { cpf: CPF_A, stats: { documentos: 4, comentarios: 1, diasNaColuna: 10, criadoEm: "2026-09-01" } })],
      flows: [], checagens: ["cpf_repetido"], limite: 30, agora,
    });
    expect(r.itens[0].card.cardNumber).toBe(2);
    expect(r.itens[0].evidencia.sugestao).toEqual({ manter: 2, arquivar: [1], motivo: "tem mais documentos" });
    expect(r.itens[0].evidencia.cards).toEqual([
      expect.objectContaining({ cardNumber: 1, documentos: 0, diasNaColuna: 3, criadoEm: "2026-10-01" }),
      expect.objectContaining({ cardNumber: 2, documentos: 4, comentarios: 1 }),
    ]);
  });

  it("duplicateCardIds devolve só os cards de grupos repetidos (para buscar as contagens deles)", () => {
    const ids = duplicateCardIds([card(1, { cpf: CPF_A }), card(2, { cpf: CPF_A }), card(3, { cpf: CPF_B }), card(4, { cpf: "", telefone: "41999990000" }), card(5, { cpf: "", telefone: "5541999990000" })]);
    expect(ids.sort()).toEqual([card(1).id, card(2).id, card(4).id, card(5).id].sort());
  });

  it("telefone repetido só com CPFs diferentes (mesmo CPF já sai no cpf_repetido)", () => {
    const mesmo = findInconsistencies({ cards: [card(1, { cpf: CPF_A, telefone: "(41) 99786-2323" }), card(2, { cpf: CPF_A, telefone: "5541997862323" })], flows: [], checagens: ["telefone_repetido"], limite: 30, agora });
    expect(mesmo.total).toBe(0);
    const outro = findInconsistencies({ cards: [card(1, { cpf: CPF_A, telefone: "(41) 99786-2323" }), card(2, { cpf: CPF_B, telefone: "5541997862323" })], flows: [], checagens: ["telefone_repetido"], limite: 30, agora });
    expect(outro.totais.telefone_repetido).toBe(1);
    expect(outro.itens[0].evidencia).toMatchObject({ campo: "telefone", final: "97862323", sugestao: { manter: 1, arquivar: [2] } });
  });

  it("CPF inválido só quando preenchido", () => {
    const r = findInconsistencies({ cards: [card(1, { cpf: "123.456.789-00" }), card(2, { cpf: "" }), card(3, { cpf: CPF_A })], flows: [], checagens: ["cpf_invalido"], limite: 30, agora });
    expect(r.itens.map((i) => i.card.cardNumber)).toEqual([1]);
  });

  it("sem hospital só nas colunas de pedido de prontuário; outro_hospital conta como preenchido", () => {
    const r = findInconsistencies({
      cards: [
        card(1, { coluna: "FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL", hospital: "" }),
        card(2, { coluna: "DISTRIBUIÇÃO DE SOLICITAÇÕES", hospital: null }),
        card(3, { coluna: "DISTRIBUIÇÃO DE SOLICITAÇÕES", hospital: null, outroHospital: "Hospital Y" }),
        card(4, { coluna: "AUDITORIA", hospital: null }),
      ],
      flows: [],
      checagens: ["sem_hospital"],
      limite: 30,
      agora,
    });
    expect(r.itens.map((i) => i.card.cardNumber).sort()).toEqual([1, 2]);
  });

  it("fluxo bloqueado há mais de 3 dias, só de card ativo, nunca o abandonado (> 14 dias)", () => {
    const c = card(7);
    const mk = (em: string) =>
      block(markDone(newState({ workflow: "prontuario", card: { id: c.id, cardNumber: 7, colunaId: null }, agora: new Date(em) }), "hospital", { agora: new Date(em) }), { passo: "pendencias", tipo: "erro_externo", codigo: "conversor_indisponivel" }, new Date(em));
    const flows = [
      { id: "f-recente", operatorId: "op1", state: mk("2026-10-23T12:00:00Z") },
      { id: "f-5dias", operatorId: "op1", state: mk("2026-10-20T12:00:00Z") },
      { id: "f-velho", operatorId: "op1", state: mk("2026-09-01T12:00:00Z") },
      { id: "f-outro-card", operatorId: "op1", state: { ...mk("2026-10-20T12:00:00Z"), card: { id: "cardsumido00000000000000", cardNumber: 1, colunaId: null } } },
    ];
    const r = findInconsistencies({ cards: [c], flows, checagens: ["fluxo_bloqueado"], limite: 30, agora });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].evidencia).toMatchObject({ fluxo: "f-5dias", workflow: "prontuario", passo: "pendencias", codigo: "conversor_indisponivel", diasBloqueado: 5, operadorId: "op1" });
  });

  it("limite corta a lista mas os totais contam tudo; ordenado por coluna", () => {
    const cards = Array.from({ length: 10 }, (_, i) => card(i + 1, { cpf: "11111111111", coluna: i % 2 ? "B" : "A" }));
    const r = findInconsistencies({ cards, flows: [], checagens: ["cpf_invalido"], limite: 3, agora });
    expect(r.total).toBe(10);
    expect(r.mostrados).toBe(3);
    expect(r.itens.every((i) => i.card.coluna === "A")).toBe(true);
  });
});
