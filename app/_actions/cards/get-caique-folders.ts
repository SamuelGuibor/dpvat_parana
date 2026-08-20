"use server";

import { db } from "../../_shared/lib/prisma";
import { unstable_noStore as noStore } from "next/cache";
import { requirePermission } from "../../_shared/lib/permissions-server";

// ---------------------------------------------------------------------------
// Planilha de controle das "pastas enviadas pro Caique".
//
// Fonte da data de envio: a tabela Log com action "move" (o mesmo insumo do
// funil em get-funnel-analytics.ts). Todo movimento de coluna — arrasto no
// board (update-kanban.ts) ou automação (automation-executor.ts) — grava um
// log com metadata { from, to } contendo o NOME das colunas. Preferimos o Log
// ao statusStartedAt do card porque o statusStartedAt é sobrescrito a cada
// movimento: se o card saiu da coluna CAIQUE (ou foi arquivado), a data de
// entrada se perderia. O Log preserva o histórico completo.
//
// Desfecho: vem do archiveStatus do card (mesma régua da aba Arquivados) —
// pagos_* = PAGO, pastas_negadas_* = NEGADO, resto continua só "enviado".
// ---------------------------------------------------------------------------

export type CaiqueOutcome = "enviado" | "pago" | "negado";

export interface CaiqueFolderRow {
  cardId: string;
  isProcess: boolean;
  /** Dono do card (pro Process é o userId; pro User é o próprio id). */
  ownerId: string;
  name: string;
  telefone: string;
  hospital: string;
  /** ISO de quando o card ENTROU na coluna CAIQUE (primeiro movimento). */
  enviadoEm: string;
  desfecho: CaiqueOutcome;
  /** ISO de quando foi arquivado (null = ainda ativo no board). */
  arquivadoEm: string | null;
  /** Coluna atual do board ou rótulo do status de arquivamento. */
  situacaoAtual: string;
  service: string;
  labelId: string | null;
  label: { id: string; name: string; color: string } | null;
}

export interface CaiqueFoldersResult {
  rows: CaiqueFolderRow[];
  totals: { enviadas: number; pagas: number; negadas: number };
}

// Rótulos amigáveis dos status de arquivamento (espelho do archive-card.ts —
// arquivo "use server" não pode exportar constante, então duplicamos aqui).
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

function outcomeFromArchiveStatus(status: string | null): CaiqueOutcome {
  if (status && PAID_STATUSES.has(status)) return "pago";
  if (status && DENIED_STATUSES.has(status)) return "negado";
  return "enviado";
}

interface GetCaiqueFoldersProps {
  /** ISO — início do período (filtra por enviadoEm). */
  from: string;
  /** ISO — fim do período. */
  to: string;
}

export async function getCaiqueFolders({ from, to }: GetCaiqueFoldersProps): Promise<CaiqueFoldersResult> {
  noStore();
  // Mesma permissão da aba Arquivados — a planilha vive dentro dela.
  await requirePermission("view_archived");

  const fromDate = new Date(from);
  const toDate = new Date(to);

  // O `message` do log de movimento sempre cita as colunas de origem/destino
  // ("moveu de X para Y"), então o contains no message é um pré-filtro barato
  // no banco; a checagem de verdade é no metadata.to (coluna de DESTINO) —
  // sem isso contaríamos também a SAÍDA da coluna CAIQUE.
  const logs = await db.log.findMany({
    where: {
      action: "move",
      message: { contains: "caique", mode: "insensitive" },
    },
    select: { userId: true, processId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 20_000,
  });

  // Primeira ENTRADA na coluna CAIQUE por card (reentradas não contam de novo:
  // a pasta já tinha sido enviada — evitamos duplicar a linha na planilha).
  const firstEntry = new Map<string, Date>();
  for (const log of logs) {
    const meta = (log.metadata ?? {}) as { to?: string | null };
    const dest = typeof meta.to === "string" ? meta.to : null;
    if (!dest || !dest.toUpperCase().includes("CAIQUE")) continue;
    const key = log.processId ? `p:${log.processId}` : log.userId ? `u:${log.userId}` : null;
    if (!key || firstEntry.has(key)) continue;
    firstEntry.set(key, log.createdAt);
  }

  // Só interessam os cards cuja entrada caiu DENTRO do período pedido.
  const userIds: string[] = [];
  const processIds: string[] = [];
  for (const [key, at] of firstEntry) {
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
  const toRow = (c: any, isProcess: boolean): CaiqueFolderRow => {
    const enviadoEm = firstEntry.get(isProcess ? `p:${c.id}` : `u:${c.id}`)!;
    const archiveStatus: string | null = c.archiveStatus ?? null;
    return {
      cardId: c.id,
      isProcess,
      ownerId: isProcess ? c.userId : c.id,
      name: c.name || "Sem nome",
      telefone: c.telefone || "",
      hospital: c.hospital || c.outro_hospital || "",
      enviadoEm: enviadoEm.toISOString(),
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

  const rows: CaiqueFolderRow[] = [
    ...users.map((u: any) => toRow(u, false)),
    ...processes.map((p: any) => toRow(p, true)),
  ].sort((a, b) => new Date(b.enviadoEm).getTime() - new Date(a.enviadoEm).getTime());
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const totals = {
    enviadas: rows.length,
    pagas: rows.filter((r) => r.desfecho === "pago").length,
    negadas: rows.filter((r) => r.desfecho === "negado").length,
  };

  return { rows, totals };
}
