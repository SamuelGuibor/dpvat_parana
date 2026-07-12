"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { revalidatePath } from "next/cache";
import { unstable_noStore as noStore } from "next/cache";
import { createLog } from "../../_shared/lib/log";

// Estados possíveis de arquivamento. null = card ativo no board.
export type ArchiveStatus =
  | "pagos_ccs"
  | "pagos_uni"
  | "enviados_taynara"
  | "enviados_evelyn"
  | "enviados_joinville"
  | "pastas_negadas_ccs"
  | "pastas_negadas_uni"
  | "perdeu_contato_definitivo"
  | "nao_assinaram_procuracao"
  | "descartados_analise_interna"
  | "desistiram_expressamente";

const ARCHIVE_LABELS: Record<ArchiveStatus, string> = {
  pagos_ccs: "PAGOS CCS",
  pagos_uni: "PAGOS UNI",
  enviados_taynara: "ENVIADOS TAYNARA",
  enviados_evelyn: "ENVIADOS EVELYN",
  enviados_joinville: "ENVIADOS JOINVILLE",
  pastas_negadas_ccs: "PASTAS NEGADAS CCS",
  pastas_negadas_uni: "PASTAS NEGADAS UNI",
  perdeu_contato_definitivo: "PERDEU CONTATO - DEFINITIVO",
  nao_assinaram_procuracao: "NÃO ASSINARAM PROCURAÇÃO",
  descartados_analise_interna: "DESCARTADOS ANÁLISE INTERNA",
  desistiram_expressamente: "DESISTIRAM EXPRESSAMENTE",
};

interface SetArchiveStatusProps {
  id: string;
  isProcess: boolean;
  status: ArchiveStatus | null;
}

// Arquiva (status != null) ou desarquiva (status = null) um card.
// Mantém o labelId para que ao desarquivar o card volte para a coluna original.
export async function setArchiveStatus({ id, isProcess, status }: SetArchiveStatusProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Não autenticado");

  const data = {
    archiveStatus: status,
    archivedAt: status ? new Date() : null,
  };

  if (isProcess) {
    await db.process.update({ where: { id }, data });
  } else {
    await db.user.update({ where: { id }, data });
  }

  await createLog({
    action: "archive",
    message: status
      ? `arquivou o card como "${ARCHIVE_LABELS[status]}"`
      : "desarquivou o card",
    authorId: session.user.id,
    authorName: session.user.name ?? "Usuário",
    userId: isProcess ? null : id,
    processId: isProcess ? id : null,
    metadata: {
      archiveStatus: status,
      archiveLabel: status ? ARCHIVE_LABELS[status] : null,
      archived: Boolean(status),
    },
  });

  revalidatePath("/nova-dash");
  return { success: true };
}

export interface ArchivedCard {
  id: string;
  isProcess: boolean;
  name: string;
  cardNumber: number | null;
  archiveStatus: ArchiveStatus;
  archivedAt: string | null;
  service: string;
  labelId: string | null;
  label: { id: string; name: string; color: string } | null;
  cpf: string;
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
  ownerId: string;
  obs: string;
}

const archivedUserSelect = {
  id: true,
  name: true,
  cardNumber: true,
  archiveStatus: true,
  archivedAt: true,
  service: true,
  labelId: true,
  label: { select: { id: true, name: true, color: true } },
  cpf: true,
  telefone: true,
  email: true,
  cidade: true,
  estado: true,
  obs: true,
};

const archivedProcessSelect = {
  id: true,
  name: true,
  userId: true,
  cardNumber: true,
  archiveStatus: true,
  archivedAt: true,
  service: true,
  labelId: true,
  label: { select: { id: true, name: true, color: true } },
  cpf: true,
  telefone: true,
  email: true,
  cidade: true,
  estado: true,
  observacao: true,
};

// Retorna todos os cards (usuários + processos) que estão arquivados/pagos/não qualificados.
export async function getArchivedCards(): Promise<ArchivedCard[]> {
  noStore();
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Usuário não autenticado.");

  const [users, processes] = await Promise.all([
    db.user.findMany({
      where: { archiveStatus: { not: null }, role: { not: "GHOST" } },
      orderBy: { archivedAt: "desc" },
      select: archivedUserSelect,
    }),
    db.process.findMany({
      where: { archiveStatus: { not: null } },
      orderBy: { archivedAt: "desc" },
      select: archivedProcessSelect,
    }),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mappedUsers: ArchivedCard[] = users.map((u: any) => ({
    id: u.id,
    isProcess: false,
    name: u.name || "Sem nome",
    cardNumber: u.cardNumber ?? null,
    archiveStatus: u.archiveStatus as ArchiveStatus,
    archivedAt: u.archivedAt ? u.archivedAt.toISOString() : null,
    service: u.service || "",
    labelId: u.labelId ?? null,
    label: u.label ?? null,
    cpf: u.cpf || "",
    telefone: u.telefone || "",
    email: u.email || "",
    cidade: u.cidade || "",
    estado: u.estado || "",
    ownerId: u.id,
    obs: u.obs || "",
  }));

  const mappedProcesses: ArchivedCard[] = processes.map((p: any) => ({
    id: p.id,
    isProcess: true,
    name: p.name || "Sem nome",
    cardNumber: p.cardNumber ?? null,
    archiveStatus: p.archiveStatus as ArchiveStatus,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    service: p.service || "",
    labelId: p.labelId ?? null,
    label: p.label ?? null,
    cpf: p.cpf || "",
    telefone: p.telefone || "",
    email: p.email || "",
    cidade: p.cidade || "",
    estado: p.estado || "",
    ownerId: p.userId,
    obs: p.observacao || "",
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return [...mappedUsers, ...mappedProcesses].sort((a, b) => {
    const ta = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
    const tb = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
    return tb - ta;
  });
}
