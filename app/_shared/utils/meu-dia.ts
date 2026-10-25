// Agregação pura do /meu-dia (testada em tests/meu-dia.test.ts): junta os
// cards que o operador conduziu (pela IA ou movendo no site), marca os parados
// além do prazo da coluna e ordena para o plano do dia.

export interface MeuDiaCard {
  id: string;
  cardNumber: number | null;
  nome: string | null;
  coluna: string;
  diasNaColuna: number | null;
  prazoColunaDias: number | null;
  arquivado: string | null;
  /** Último toque do operador no card (IA ou site). */
  ultimoToque: Date;
}

export interface MeuDiaCardOut extends Omit<MeuDiaCard, "ultimoToque"> {
  parado: boolean;
  diasAlemDoPrazo: number | null;
}

/** "Parado" = passou do prazo da coluna (sem prazo: 7 dias, como listar_cards_parados). */
export function isParado(dias: number | null, prazo: number | null): boolean {
  if (dias == null) return false;
  return dias > (prazo ?? 7);
}

/**
 * Ativos primeiro; dentro deles, os parados há mais tempo além do prazo; depois
 * o toque mais recente. Arquivados ficam fora (o operador já encerrou).
 */
export function aggregateMeuDia(cards: MeuDiaCard[]): MeuDiaCardOut[] {
  return cards
    .filter((c) => !c.arquivado)
    .map((c) => {
      const parado = isParado(c.diasNaColuna, c.prazoColunaDias);
      return {
        id: c.id,
        cardNumber: c.cardNumber,
        nome: c.nome,
        coluna: c.coluna,
        diasNaColuna: c.diasNaColuna,
        prazoColunaDias: c.prazoColunaDias,
        arquivado: c.arquivado,
        parado,
        diasAlemDoPrazo: parado && c.diasNaColuna != null ? c.diasNaColuna - (c.prazoColunaDias ?? 7) : null,
        _toque: c.ultimoToque.getTime(),
      };
    })
    .sort((a, b) => Number(b.parado) - Number(a.parado) || (b.diasAlemDoPrazo ?? 0) - (a.diasAlemDoPrazo ?? 0) || b._toque - a._toque)
    .map((c) => {
      const out: Partial<typeof c> = { ...c };
      delete out._toque;
      return out as MeuDiaCardOut;
    });
}
