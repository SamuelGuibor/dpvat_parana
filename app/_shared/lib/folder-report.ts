import { db } from "./prisma";
import {
  computeFolderTotals,
  inPeriod,
  outcomeAsOf,
  type FolderOutcome,
  type FolderPeriodTotals,
  type FolderStatuses,
} from "../utils/folder-period";

// ---------------------------------------------------------------------------
// Núcleo das planilhas de "pastas enviadas" (Caique e UNI).
//
// Fonte da data de envio: a tabela Log com action "move" (o mesmo insumo do
// funil em get-funnel-analytics.ts). Todo movimento de coluna — arrasto no
// board (update-kanban.ts) ou automação (automation-executor.ts) — grava um
// log com metadata { from, to } contendo o NOME das colunas. Preferimos o Log
// ao statusStartedAt do card porque o statusStartedAt é sobrescrito a cada
// movimento: se o card saiu da coluna (ou foi arquivado), a data de entrada se
// perderia. O Log preserva o histórico completo.
//
// Desfecho: vem do archiveStatus + archivedAt do card (mesma régua da aba
// Arquivados). Pago/negado conta no período da DATA DO DESFECHO, não do envio
// (regras em utils/folder-period.ts). Antes contava "enviadas no mês que hoje
// estão pagas" e misturava pagos_uni na planilha do Caique (e vice-versa).
// ---------------------------------------------------------------------------

export type { FolderOutcome };

export interface FolderRow {
  cardId: string;
  isProcess: boolean;
  /** Dono do card (pro Process é o userId; pro User é o próprio id). */
  ownerId: string;
  name: string;
  telefone: string;
  hospital: string;
  /** ISO de quando o card ENTROU na coluna destino (primeiro movimento).
   *  null = pasta paga/negada sem registro de envio (anterior aos logs). */
  enviadoEm: string | null;
  /** Nome da coluna que recebeu a pasta (ex.: "ENVIADOS P/ UNI"). */
  colunaOrigem: string;
  /** Desfecho como estava no FIM do período pedido. */
  desfecho: FolderOutcome;
  /** ISO do desfecho (pagamento/negativa/encerramento) — null se em aberto. */
  desfechoEm: string | null;
  enviadaNoPeriodo: boolean;
  resolvidaNoPeriodo: boolean;
  /** ISO de quando foi arquivado HOJE (null = ainda ativo no board). */
  arquivadoEm: string | null;
  /** Coluna atual do board ou rótulo do status de arquivamento. */
  situacaoAtual: string;
  service: string;
  labelId: string | null;
  label: { id: string; name: string; color: string } | null;
}

export interface FolderReportTotals extends FolderPeriodTotals {
  /** Enviadas no período imediatamente anterior, de mesma duração. */
  enviadasAnterior: number;
}

export interface FolderReportResult {
  rows: FolderRow[];
  totals: FolderReportTotals;
}

// Rótulos amigáveis dos status de arquivamento (espelho do archive-card.ts —
// arquivo "use server" não pode exportar constante, então vivem aqui).
const ARCHIVE_LABELS: Record<string, string> = {
  pagos_ccs: "APTOS CCS",
  pagos_uni: "APTOS UNI",
  enviados_taynara: "ENVIADOS TAYNARA",
  enviados_evelyn: "ENVIADOS EVELYN",
  enviados_joinville: "ENVIADOS JOINVILLE",
  pastas_negadas_ccs: "PASTAS NEGADAS CCS",
  pastas_negadas_uni: "PASTAS NEGADAS UNI",
  perdeu_contato_definitivo: "PERDEU CONTATO - DEFINITIVO",
  nao_assinaram_procuracao: "NÃO ASSINARAM PROCURAÇÃO",
  descartados_analise_interna: "DESCARTADOS ANÁLISE INTERNA",
  desistiram_expressamente: "DESISTIRAM EXPRESSAMENTE",
  voltar_um_dia: "VOLTAR UM DIA",
};

interface BuildFolderReportProps {
  /** Trecho do nome da coluna que marca o envio (ex.: "CAIQUE", "UNI"). */
  keyword: string;
  /** Status de arquivamento que são pago/negado NESTE destino. */
  statuses: FolderStatuses;
  /** ISO — início do período. */
  from: string;
  /** ISO — fim do período. */
  to: string;
}

export async function buildFolderReport({
  keyword,
  statuses,
  from,
  to,
}: BuildFolderReportProps): Promise<FolderReportResult> {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const needle = keyword.toUpperCase();

  // O `message` do log de movimento sempre cita as colunas de origem/destino
  // ("moveu de X para Y"), então o contains no message é um pré-filtro barato
  // no banco; a checagem de verdade é no metadata.to (coluna de DESTINO) —
  // sem isso contaríamos também a SAÍDA da coluna.
  const logs = await db.log.findMany({
    where: {
      action: "move",
      message: { contains: keyword, mode: "insensitive" },
    },
    select: { userId: true, processId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 20_000,
  });

  // Primeira ENTRADA na coluna por card (reentradas não contam de novo: a
  // pasta já tinha sido enviada — evitamos duplicar a linha na planilha).
  const firstEntry = new Map<string, { at: Date; column: string }>();
  for (const log of logs) {
    const meta = (log.metadata ?? {}) as { to?: string | null };
    const dest = typeof meta.to === "string" ? meta.to : null;
    if (!dest || !dest.toUpperCase().includes(needle)) continue;
    const key = log.processId ? `p:${log.processId}` : log.userId ? `u:${log.userId}` : null;
    if (!key || firstEntry.has(key)) continue;
    firstEntry.set(key, { at: log.createdAt, column: dest });
  }

  // Período imediatamente anterior, de mesma duração — base do comparativo
  // "vs. período anterior" no cartão de Enviadas.
  const spanMs = Math.max(0, toDate.getTime() - fromDate.getTime());
  const prevFrom = new Date(fromDate.getTime() - spanMs);

  const sentUserIds: string[] = [];
  const sentProcessIds: string[] = [];
  let enviadasAnterior = 0;
  for (const [key, entry] of firstEntry) {
    const at = entry.at;
    if (at >= prevFrom && at < fromDate) enviadasAnterior++;
    const isProcess = key.startsWith("p:");
    if (inPeriod(at, fromDate, toDate)) (isProcess ? sentProcessIds : sentUserIds).push(key.slice(2));
  }

  // Cards da planilha = enviados no período + os pagos/negados no período
  // (enviados antes, pagos agora). Entram também os arquivados com o
  // pago/negado deste destino sem passar pela coluna: pastas anteriores aos
  // logs de movimento (começam em 02/07/2026) ou arquivadas direto do board.
  const resolvedIn = {
    archivedAt: { gte: fromDate, lte: toDate },
    archiveStatus: { in: [statuses.paid, statuses.denied] },
  };

  const cardSelect = {
    id: true,
    name: true,
    telefone: true,
    hospital: true,
    outro_hospital: true,
    archiveStatus: true,
    archivedAt: true,
    role: true, // nome da coluna atual do board
    service: true,
    labelId: true,
    label: { select: { id: true, name: true, color: true } },
  };

  const [users, processes] = await Promise.all([
    db.user.findMany({
      where: { OR: [{ id: { in: sentUserIds } }, resolvedIn] },
      select: cardSelect,
    }),
    db.process.findMany({
      where: { OR: [{ id: { in: sentProcessIds } }, resolvedIn] },
      select: { ...cardSelect, userId: true },
    }),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const toRow = (c: any, isProcess: boolean): FolderRow => {
    const entry = firstEntry.get(isProcess ? `p:${c.id}` : `u:${c.id}`);
    const archiveStatus: string | null = c.archiveStatus ?? null;
    const archivedAt: Date | null = c.archivedAt ?? null;
    const { desfecho, desfechoEm } = outcomeAsOf(archiveStatus, archivedAt, statuses, toDate);
    return {
      cardId: c.id,
      isProcess,
      ownerId: isProcess ? c.userId : c.id,
      name: c.name || "Sem nome",
      telefone: c.telefone || "",
      hospital: c.hospital || c.outro_hospital || "",
      enviadoEm: entry ? entry.at.toISOString() : null,
      colunaOrigem: entry?.column ?? "",
      desfecho,
      desfechoEm: desfechoEm ? desfechoEm.toISOString() : null,
      enviadaNoPeriodo: !!entry && inPeriod(entry.at, fromDate, toDate),
      resolvidaNoPeriodo: (desfecho === "pago" || desfecho === "negado") && inPeriod(desfechoEm, fromDate, toDate),
      arquivadoEm: archivedAt ? archivedAt.toISOString() : null,
      situacaoAtual: archiveStatus
        ? (ARCHIVE_LABELS[archiveStatus] ?? archiveStatus)
        : (c.label?.name ?? c.role ?? ""),
      service: c.service || "",
      labelId: c.labelId ?? null,
      label: c.label ?? null,
    };
  };

  // Linha fica no mês do desfecho quando foi paga/negada no período; senão no
  // mês do envio. Mais recente primeiro.
  const refTime = (r: FolderRow) =>
    new Date((r.resolvidaNoPeriodo ? r.desfechoEm : r.enviadoEm) ?? 0).getTime();
  const rows: FolderRow[] = [
    ...users.map((u: any) => toRow(u, false)),
    ...processes.map((p: any) => toRow(p, true)),
  ]
    .filter((r) => r.enviadaNoPeriodo || r.resolvidaNoPeriodo)
    .sort((a, b) => refTime(b) - refTime(a));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { rows, totals: { ...computeFolderTotals(rows), enviadasAnterior } };
}
