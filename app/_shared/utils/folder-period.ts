// Regras puras das planilhas de pastas (Caique/UNI) — sem banco, testáveis.
//
// Regra do negócio: pasta paga conta no período em que o cliente FOI PAGO, não
// no mês em que a pasta foi enviada (entrou em 09, pago em 10 → conta em 10).
// O mesmo vale pra negada. Por isso a planilha tem duas datas por linha
// (envio e desfecho) e cada KPI olha a sua.

/**
 * Desfecho da pasta COMO ESTAVA no fim do período pedido:
 * - pago / negado: arquivada com o status DESTE destino (pagos_ccs só conta na
 *   do Caique, pagos_uni só na da UNI — pasta que saiu do Caique e foi paga
 *   pela UNI não é "paga pelo Caique");
 * - encerrado: arquivada com qualquer outro status (outro destino, perdeu
 *   contato, desistiu…) — saiu da análise sem desfecho deste destino;
 * - enviado: ainda em aberto naquela data.
 */
export type FolderOutcome = "enviado" | "pago" | "negado" | "encerrado";

export interface FolderStatuses {
  /** archiveStatus que significa "pago" neste destino (ex.: pagos_uni). */
  paid: string;
  /** archiveStatus que significa "negado" neste destino. */
  denied: string;
}

export function inPeriod(d: Date | null, from: Date, to: Date): boolean {
  return !!d && d >= from && d <= to;
}

/**
 * Desfecho visto do fim do período: se o card só foi arquivado depois de `to`,
 * naquele período ele ainda estava em análise.
 */
export function outcomeAsOf(
  archiveStatus: string | null,
  archivedAt: Date | null,
  statuses: FolderStatuses,
  asOf: Date,
): { desfecho: FolderOutcome; desfechoEm: Date | null } {
  if (!archiveStatus || !archivedAt || archivedAt > asOf) return { desfecho: "enviado", desfechoEm: null };
  if (archiveStatus === statuses.paid) return { desfecho: "pago", desfechoEm: archivedAt };
  if (archiveStatus === statuses.denied) return { desfecho: "negado", desfechoEm: archivedAt };
  return { desfecho: "encerrado", desfechoEm: archivedAt };
}

export interface FolderPeriodRow {
  enviadoEm: string | null;
  desfecho: FolderOutcome;
  desfechoEm: string | null;
  /** Entrou na coluna do destino dentro do período. */
  enviadaNoPeriodo: boolean;
  /** Pago/negado com data de desfecho dentro do período. */
  resolvidaNoPeriodo: boolean;
}

export interface FolderPeriodTotals {
  /** Pastas que ENTRARAM na coluna no período. */
  enviadas: number;
  /** Pagas no período (pela data do pagamento, não do envio). */
  pagas: number;
  /** Negadas no período (pela data da negativa). */
  negadas: number;
  /** Enviadas no período que seguiam sem desfecho no fim dele. */
  emAnalise: number;
  /** Mediana de dias entre envio e desfecho das resolvidas no período. */
  medianaDiasDesfecho: number | null;
}

export function computeFolderTotals(rows: FolderPeriodRow[]): FolderPeriodTotals {
  const enviadas = rows.filter((r) => r.enviadaNoPeriodo).length;
  const pagas = rows.filter((r) => r.resolvidaNoPeriodo && r.desfecho === "pago").length;
  const negadas = rows.filter((r) => r.resolvidaNoPeriodo && r.desfecho === "negado").length;
  const emAnalise = rows.filter((r) => r.enviadaNoPeriodo && r.desfecho === "enviado").length;

  // Mediana (e não média) do tempo até o desfecho: uma pasta esquecida por
  // meses distorceria a média e daria a impressão de que tudo demora. Pasta
  // paga sem registro de envio (anterior aos logs de movimento) fica de fora.
  const dias = rows
    .filter((r) => r.resolvidaNoPeriodo && r.enviadoEm && r.desfechoEm)
    .map((r) => (new Date(r.desfechoEm!).getTime() - new Date(r.enviadoEm!).getTime()) / 86_400_000)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  const mid = Math.floor(dias.length / 2);
  const medianaDiasDesfecho = dias.length === 0
    ? null
    : Math.round(dias.length % 2 ? dias[mid] : (dias[mid - 1] + dias[mid]) / 2);

  return { enviadas, pagas, negadas, emAnalise, medianaDiasDesfecho };
}
