"use server";

import { db } from "../../_shared/lib/prisma";
import { unstable_noStore as noStore } from "next/cache";
import { createLog } from "../../_shared/lib/log";
import { requirePermission } from "../../_shared/lib/permissions-server";

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
  | "desistiram_expressamente"
  | "voltar_um_dia";

const ARCHIVE_LABELS: Record<ArchiveStatus, string> = {
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
  voltar_um_dia: "VOLTAR UM DIA"
};

interface SetArchiveStatusProps {
  id: string;
  isProcess: boolean;
  status: ArchiveStatus | null;
}

// Arquiva (status != null) ou desarquiva (status = null) um card.
// Mantém o labelId para que ao desarquivar o card volte para a coluna original.
export async function setArchiveStatus({ id, isProcess, status }: SetArchiveStatusProps) {
  const ctx = await requirePermission("archive_cards");

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
    authorId: ctx.userId,
    authorName: ctx.name ?? "Usuário",
    userId: isProcess ? null : id,
    processId: isProcess ? id : null,
    metadata: {
      archiveStatus: status,
      archiveLabel: status ? ARCHIVE_LABELS[status] : null,
      archived: Boolean(status),
    },
  });

  // Sem revalidatePath: o board remove/repõe o card de forma otimista e o
  // polling sincroniza o resto — revalidar re-renderizava a rota inteira.
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

/**
 * Página da aba Arquivados. Antes isto devolvia os 874 arquivados INTEIROS
 * (com obs, endereço, e-mail) e o filtro/busca/contagem eram feitos no
 * navegador — a aba puxava a tabela toda do Neon a cada abertura só para
 * mostrar 24 cards. Agora filtro, busca e recorte acontecem no Postgres,
 * com a mesma semântica da busca do Ctrl+K (search-archived.ts): nome por
 * `contains` sem acento-sensibilidade e dígitos batendo em CPF, telefone ou
 * número do card.
 */
export interface ArchivedPageParams {
  /** Aba de divisão; ausente = TODOS. */
  status?: ArchiveStatus;
  /** Termo da lupa (mínimo 2 caracteres; abaixo disso é ignorado). */
  query?: string;
  /** Quantos já carregados (botão "carregar mais"). */
  skip?: number;
  take?: number;
}

export interface ArchivedPage {
  cards: ArchivedCard[];
  /** Total que casa com o filtro atual — base do "mostrando X de Y". */
  total: number;
  /** Contagem por divisão, respeitando a busca (números das abas). */
  counts: Record<string, number>;
  /** Ainda há página seguinte? */
  hasMore: boolean;
}

const ARCHIVED_PAGE_SIZE = 60;

/** Filtro Prisma compartilhado por User e Process. */
function buildArchivedWhere(params: ArchivedPageParams) {
  const q = (params.query ?? "").trim();
  const qDigits = q.replace(/\D/g, "");

  const search = q.length >= 2
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          ...(qDigits.length >= 3
            ? [
                { cpf: { contains: qDigits } },
                { telefone: { contains: qDigits } },
                ...(qDigits.length <= 8 ? [{ cardNumber: parseInt(qDigits, 10) }] : []),
              ]
            : []),
        ],
      }
    : {};

  return {
    archiveStatus: params.status ? params.status : { not: null },
    ...search,
  };
}

export async function getArchivedCards(
  params: ArchivedPageParams = {},
): Promise<ArchivedPage> {
  noStore();
  await requirePermission("view_archived");

  const take = params.take ?? ARCHIVED_PAGE_SIZE;
  const skip = params.skip ?? 0;
  const where = buildArchivedWhere(params);
  // Contagem por aba ignora a divisão escolhida (senão as outras abas zeram),
  // mas respeita a busca — é o que o usuário espera ao digitar.
  const countWhere = buildArchivedWhere({ ...params, status: undefined });

  // As duas tabelas são ordenadas por archivedAt e intercaladas depois, então
  // cada uma precisa entregar skip+take candidatos para o corte final ser
  // correto (não dá para paginar no banco um merge de duas tabelas).
  const window = skip + take;

  const [users, processes, userCounts, processCounts] = await Promise.all([
    db.user.findMany({
      where: { ...where, role: { not: "GHOST" } },
      orderBy: { archivedAt: "desc" },
      select: archivedUserSelect,
      take: window,
    }),
    db.process.findMany({
      where,
      orderBy: { archivedAt: "desc" },
      select: archivedProcessSelect,
      take: window,
    }),
    db.user.groupBy({
      by: ["archiveStatus"],
      where: { ...countWhere, role: { not: "GHOST" } },
      _count: { _all: true },
    }),
    db.process.groupBy({
      by: ["archiveStatus"],
      where: countWhere,
      _count: { _all: true },
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

  const merged = [...mappedUsers, ...mappedProcesses].sort((a, b) => {
    const ta = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
    const tb = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
    return tb - ta;
  });

  const counts: Record<string, number> = { all: 0 };
  for (const row of [...userCounts, ...processCounts]) {
    const key = row.archiveStatus;
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + row._count._all;
    counts.all += row._count._all;
  }

  const total = params.status ? (counts[params.status] ?? 0) : counts.all;

  return {
    cards: merged.slice(skip, skip + take),
    total,
    counts,
    hasMore: skip + take < total,
  };
}


/**
 * Um card arquivado pelo id — para ABRIR o card fora da aba Arquivados.
 *
 * A caixa de Menções e Tarefas manda o quadro abrir o card, e o quadro só
 * conhece os cards ATIVOS: com o card arquivado o clique voltava pro Kanban e
 * não abria nada (nem erro). Aqui o quadro consegue montar o diálogo mesmo
 * assim, mostrando em que arquivo o card está.
 */
export async function getArchivedCardById(
  id: string,
  isProcess: boolean
): Promise<ArchivedCard | null> {
  noStore();
  await requirePermission("view_archived");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  if (isProcess) {
    const p: any = await db.process.findUnique({ where: { id }, select: archivedProcessSelect });
    if (!p) return null;
    return {
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
    };
  }

  const u: any = await db.user.findUnique({ where: { id }, select: archivedUserSelect });
  if (!u) return null;
  return {
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
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
