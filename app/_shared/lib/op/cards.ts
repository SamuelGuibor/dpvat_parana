// Consultas de card compartilhadas pelas ferramentas da IA de operação.
//
// Card = linha de User que não é equipe (ADMIN*) nem GHOST (hospital). A
// tabela Process está vazia em produção (docs/ai/kanban-cards.md): as
// ferramentas da Etapa 1 leem só User; se Process voltar a ter linhas, este é
// o ponto para incluir.
//
// Nunca selecione password/senha_inss aqui: o que a ferramenta precisa saber
// da senha do INSS é só "tem ou não tem" (senhaInssCadastrada).

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { TEAM_ROLES } from "../permissions";
import { getStatusLabelsByService } from "@/app/nova-dash/card-dialog/constants";
import { parseCardRef } from "./resolve";
import { OpToolError } from "./registry";

export const NOT_CARD_ROLES = [...TEAM_ROLES, "GHOST"];

/** Filtro de card de cliente (ativo ou arquivado). */
export const CARD_WHERE: Prisma.UserWhereInput = { role: { notIn: NOT_CARD_ROLES } };
/** Card ativo no board (o mesmo corte do fetchUsers). */
export const ACTIVE_CARD_WHERE: Prisma.UserWhereInput = { ...CARD_WHERE, archiveStatus: null };

/** Campos da lista (busca, parados, coluna). */
export const cardListSelect = {
  id: true,
  cardNumber: true,
  name: true,
  cpf: true,
  telefone: true,
  service: true,
  status: true,
  role: true,
  hospital: true,
  statusStartedAt: true,
  archiveStatus: true,
  archivedAt: true,
  label: { select: { name: true, timeLimitDays: true } },
  cardTags: { select: { name: true } },
} satisfies Prisma.UserSelect;

export type CardListRow = Prisma.UserGetPayload<{ select: typeof cardListSelect }>;

/** Rótulo da etapa do checklist do cliente (User.status) para o serviço do card. */
export function etapaLabel(service: string | null, status: string | null): string | null {
  if (!status) return null;
  return getStatusLabelsByService(service)[status] ?? status;
}

/** Nome da coluna: o Label do labelId; `role` (cópia do nome) só como fallback. */
export function columnName(row: { label: { name: string } | null; role: string }): string {
  return row.label?.name ?? row.role;
}

/** ids de User cujo telefone (principal ou secundário) termina nos mesmos 8 dígitos. */
export async function cardIdsByPhone(digits: string, take = 20): Promise<string[]> {
  const last8 = digits.replace(/\D/g, "").slice(-8);
  if (last8.length < 8) return [];
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "User"
    WHERE role NOT IN (${Prisma.join(NOT_CARD_ROLES)})
      AND regexp_replace(COALESCE(telefone, '') || ' ' || COALESCE(telefone_secundario, ''), '\\D', '', 'g') LIKE ${"%" + last8 + "%"}
    LIMIT ${take}
  `);
  return rows.map((r) => r.id);
}

/** ids de User com o CPF (só dígitos; também casa CPF gravado com máscara). */
export async function cardIdsByCpf(digits: string, take = 20): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "User"
    WHERE role NOT IN (${Prisma.join(NOT_CARD_ROLES)})
      AND regexp_replace(COALESCE(cpf, ''), '\\D', '', 'g') = ${digits}
    LIMIT ${take}
  `);
  return rows.map((r) => r.id);
}

/**
 * Resolve a referência do operador para UM card. Vários (CPF repetido, nome
 * parecido) → OpToolError "ambiguo" com as opções; nenhum → "nao_encontrado".
 */
export async function resolveOneCardId(ref: string): Promise<string> {
  const parsed = parseCardRef(ref);
  if (!parsed) throw new OpToolError("argumentos_invalidos", "Informe o número do processo, CPF, telefone ou nome.", 400);

  let ids: string[] = [];
  switch (parsed.kind) {
    case "cardNumber": {
      const u = await db.user.findFirst({ where: { ...CARD_WHERE, cardNumber: parsed.value }, select: { id: true } });
      ids = u ? [u.id] : [];
      break;
    }
    case "id": {
      const u = await db.user.findFirst({ where: { ...CARD_WHERE, id: parsed.value }, select: { id: true } });
      ids = u ? [u.id] : [];
      break;
    }
    case "cpf":
      ids = await cardIdsByCpf(parsed.value, 10);
      break;
    case "phone":
      ids = await cardIdsByPhone(parsed.value, 10);
      break;
    case "name": {
      const words = parsed.value.split(/\s+/).filter(Boolean);
      const rows = await db.user.findMany({
        where: { ...CARD_WHERE, AND: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) },
        select: { id: true },
        take: 10,
      });
      ids = rows.map((r) => r.id);
      break;
    }
  }

  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new OpToolError("nao_encontrado", "Nenhum card encontrado para essa referência.", 404);

  const options = await db.user.findMany({
    where: { id: { in: ids } },
    select: { cardNumber: true, name: true, archiveStatus: true, label: { select: { name: true } }, role: true },
    orderBy: { createdAt: "desc" },
  });
  throw new OpToolError(
    "ambiguo",
    `${ids.length} cards encontrados. Diga qual pelo número do processo.`,
    409,
    options.map((o) => ({
      cardNumber: o.cardNumber,
      nome: o.name,
      coluna: columnName(o),
      arquivado: o.archiveStatus ?? null,
    })),
  );
}
