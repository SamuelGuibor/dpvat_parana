import { db } from "./prisma";

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
// Desfecho: vem do archiveStatus do card (mesma régua da aba Arquivados) —
// pagos_* = PAGO, pastas_negadas_* = NEGADO, resto continua só "enviado".
// ---------------------------------------------------------------------------

export type FolderOutcome = "enviado" | "pago" | "negado";

export interface FolderRow {
  cardId: string;
  isProcess: boolean;
  /** Dono do card (pro Process é o userId; pro User é o próprio id). */
  ownerId: string;
  name: string;
  telefone: string;
  hospital: string;
  /** ISO de quando o card ENTROU na coluna destino (primeiro movimento). */
  enviadoEm: string;
  /** Nome da coluna que recebeu a pasta (ex.: "ENVIADOS P/ UNI"). */
  colunaOrigem: string;
  desfecho: FolderOutcome;
  /** ISO de quando foi arquivado (null = ainda ativo no board). */
  arquivadoEm: string | null;
  /** Coluna atual do board ou rótulo do status de arquivamento. */
  situacaoAtual: string;
  service: string;
  labelId: string | null;
  label: { id: string; name: string; color: string } | null;
}

export interface FolderReportTotals {
  enviadas: number;
  pagas: number;
  negadas: number;
  /** Enviadas que ainda não têm desfecho (nem pago, nem negado). */
  emAnalise: number;
  /** Enviadas no período imediatamente anterior, de mesma duração. */
  enviadasAnterior: number;
  /** Mediana de dias entre o envio e o arquivamento das já resolvidas. */
  medianaDiasDesfecho: number | null;
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

// Status de arquivamento que definem o desfecho da pasta.
const PAID_STATUSES = new Set(["pagos_ccs", "pagos_uni"]);
const DENIED_STATUSES = new Set(["pastas_negadas_ccs", "pastas_negadas_uni"]);

function outcomeFromArchiveStatus(status: string | null): FolderOutcome {
  if (status && PAID_STATUSES.has(status)) return "pago";
  if (status && DENIED_STATUSES.has(status)) return "negado";
  return "enviado";
}

interface BuildFolderReportProps {
  /** Trecho do nome da coluna que marca o envio (ex.: "CAIQUE", "UNI"). */
  keyword: string;
  /** ISO — início do período (filtra por enviadoEm). */
  from: string;
  /** ISO — fim do período. */
  to: string;
}

export async function buildFolderReport({
  keyword,
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

  // Só interessam os cards cuja entrada caiu DENTRO do período pedido.
  const userIds: string[] = [];
  const processIds: string[] = [];
  let enviadasAnterior = 0;
  for (const [key, entry] of firstEntry) {
    const at = entry.at;
    if (at >= prevFrom && at < fromDate) enviadasAnterior++;
    if (at < fromDate || at > toDate) continue;
    if (key.startsWith("p:")) processIds.push(key.slice(2));
    else userIds.push(key.slice(2));
  }

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
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: cardSelect })
      : Promise.resolve([]),
    processIds.length
      ? db.process.findMany({ where: { id: { in: processIds } }, select: { ...cardSelect, userId: true } })
      : Promise.resolve([]),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const toRow = (c: any, isProcess: boolean): FolderRow => {
    const entry = firstEntry.get(isProcess ? `p:${c.id}` : `u:${c.id}`)!;
    const enviadoEm = entry.at;
    const archiveStatus: string | null = c.archiveStatus ?? null;
    return {
      cardId: c.id,
      isProcess,
      ownerId: isProcess ? c.userId : c.id,
      name: c.name || "Sem nome",
      telefone: c.telefone || "",
      hospital: c.hospital || c.outro_hospital || "",
      enviadoEm: enviadoEm.toISOString(),
      colunaOrigem: entry.column,
      desfecho: outcomeFromArchiveStatus(archiveStatus),
      arquivadoEm: c.archivedAt ? c.archivedAt.toISOString() : null,
      situacaoAtual: archiveStatus
        ? (ARCHIVE_LABELS[archiveStatus] ?? archiveStatus)
        : (c.label?.name ?? c.role ?? ""),
      service: c.service || "",
      labelId: c.labelId ?? null,
      label: c.label ?? null,
    };
  };

  const rows: FolderRow[] = [
    ...users.map((u: any) => toRow(u, false)),
    ...processes.map((p: any) => toRow(p, true)),
  ].sort((a, b) => new Date(b.enviadoEm).getTime() - new Date(a.enviadoEm).getTime());
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Mediana (e não média) do tempo até o desfecho: uma pasta esquecida por
  // meses distorceria a média e daria a impressão de que tudo demora.
  const diasResolvidas = rows
    .filter((r) => r.desfecho !== "enviado" && r.arquivadoEm)
    .map((r) => (new Date(r.arquivadoEm!).getTime() - new Date(r.enviadoEm).getTime()) / 86_400_000)
    .sort((a, b) => a - b);
  const mid = Math.floor(diasResolvidas.length / 2);
  const medianaDiasDesfecho = diasResolvidas.length === 0
    ? null
    : Math.round(
        diasResolvidas.length % 2
          ? diasResolvidas[mid]
          : (diasResolvidas[mid - 1] + diasResolvidas[mid]) / 2,
      );

  const pagas = rows.filter((r) => r.desfecho === "pago").length;
  const negadas = rows.filter((r) => r.desfecho === "negado").length;

  const totals: FolderReportTotals = {
    enviadas: rows.length,
    pagas,
    negadas,
    emAnalise: rows.length - pagas - negadas,
    enviadasAnterior,
    medianaDiasDesfecho,
  };

  return { rows, totals };
}
