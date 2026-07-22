"use server";

import { db } from "../../_shared/lib/prisma";
import { requireTeam } from "../../_shared/lib/permissions-server";
import type { ArchiveStatus } from "./archive-card";

// Busca leve em cards ARQUIVADOS por nome, nº do card, CPF ou telefone.
// Usada pela busca do kanban e pelo Ctrl+K para evitar criar card duplicado
// de um cliente que já passou pelo escritório (o board só carrega os ativos).
// Devolve apenas dados de identificação — sem endereço/observações.

const DIVISION_LABELS: Record<ArchiveStatus, string> = {
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

export interface ArchivedSearchHit {
  id: string;
  isProcess: boolean;
  name: string;
  cardNumber: number | null;
  /** Divisão dos Arquivados em que o card está (ex.: "APTOS CCS"). */
  division: string;
}

export async function searchArchivedCards(query: string): Promise<ArchivedSearchHit[]> {
  await requireTeam();

  const q = (query ?? "").trim();
  if (q.length < 2) return [];
  const qDigits = q.replace(/\D/g, "");

  // Nome (contains, case-insensitive) OU dígitos (nº do card / CPF / telefone).
  const nameFilter = { name: { contains: q, mode: "insensitive" as const } };
  const digitFilters = qDigits.length >= 3
    ? [
        // CPF/telefone podem estar salvos com ou sem máscara — o contains por
        // dígitos cobre o formato sem máscara; o formato mascarado é coberto
        // pela normalização na gravação (novos registros já são só dígitos).
        { cpf: { contains: qDigits } },
        { telefone: { contains: qDigits } },
        ...(qDigits.length <= 8 && /^\d+$/.test(qDigits)
          ? [{ cardNumber: parseInt(qDigits, 10) }]
          : []),
      ]
    : [];

  const where = {
    archiveStatus: { not: null },
    OR: [nameFilter, ...digitFilters],
  };

  const [users, processes] = await Promise.all([
    db.user.findMany({
      where: { ...where, role: { not: "GHOST" } },
      select: { id: true, name: true, cardNumber: true, archiveStatus: true },
      take: 8,
      orderBy: { archivedAt: "desc" },
    }),
    db.process.findMany({
      where,
      select: { id: true, name: true, cardNumber: true, archiveStatus: true },
      take: 8,
      orderBy: { archivedAt: "desc" },
    }),
  ]);

  const map = (row: { id: string; name: string | null; cardNumber: number | null; archiveStatus: string | null }, isProcess: boolean): ArchivedSearchHit => ({
    id: row.id,
    isProcess,
    name: row.name ?? "Sem nome",
    cardNumber: row.cardNumber,
    division: DIVISION_LABELS[row.archiveStatus as ArchiveStatus] ?? row.archiveStatus ?? "Arquivado",
  });

  return [
    ...users.map((u) => map(u, false)),
    ...processes.map((p) => map(p, true)),
  ].slice(0, 8);
}
