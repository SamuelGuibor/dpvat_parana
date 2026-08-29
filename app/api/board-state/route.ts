import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";
import { db } from "@/app/_shared/lib/prisma";
import { fetchLabels } from "@/app/_shared/lib/db/labels";
import { fetchUsers } from "@/app/_shared/lib/db/users";
import { fetchProcesses } from "@/app/_shared/lib/db/processes";

// Estado completo do board numa ÚNICA requisição. Antes cada tick de 7s do
// kanban fazia 5 chamadas (3 server actions + card-counts + card-tags/lookup)
// = 5 invocações serverless e 5 getServerSession por tick, por usuário.
//
// Cheque de versão (?v=): a carga completa custa ~1 MB de egress do Neon por
// tick e na maioria dos ticks NADA mudou. O hash abaixo é calculado DENTRO do
// Postgres (só o md5 atravessa a rede); se bater com o `v` do cliente, a
// resposta é { unchanged: true } e o payload gordo nem é consultado.

// Hash de tudo que o payload do board reflete: cards ativos (User/Process),
// colunas, contagens de comentários/anexos e tags (tabelas de junção
// implícitas incluídas — connect/disconnect de tag não toca updatedAt).
async function computeBoardVersion(): Promise<string | null> {
  try {
    const rows = await db.$queryRaw<{ v: string }[]>`
      SELECT md5(concat_ws('|',
        (SELECT concat(count(*), ':', coalesce(max("updatedAt")::text, ''))
           FROM "User"
          WHERE role <> 'GHOST' AND role NOT LIKE 'ADMIN%' AND "archiveStatus" IS NULL),
        (SELECT concat(count(*), ':', coalesce(max("updatedAt")::text, ''))
           FROM "Process" WHERE "archiveStatus" IS NULL),
        (SELECT concat(count(*), ':', coalesce(max("updatedAt")::text, '')) FROM "Label"),
        (SELECT concat(count(*), ':', coalesce(max("updatedAt")::text, '')) FROM "Comment"),
        (SELECT concat(count(*), ':', coalesce(max(coalesce("updatedAt", "uploadedAt"))::text, ''))
           FROM "Document"),
        (SELECT coalesce(md5(string_agg(id || name || color, ',' ORDER BY id)), '') FROM card_tags),
        (SELECT coalesce(md5(string_agg("A" || "B", ',' ORDER BY "A", "B")), '') FROM "_UserCardTags"),
        (SELECT coalesce(md5(string_agg("A" || "B", ',' ORDER BY "A", "B")), '') FROM "_ProcessCardTags")
      )) AS v`;
    return rows[0]?.v ?? null;
  } catch (err) {
    // Falhou o cheque? Segue o fluxo antigo (carga completa) — nunca pode
    // derrubar o board por causa de uma otimização de tráfego.
    console.error("[BOARD-STATE] versão indisponível:", err);
    return null;
  }
}

export const dynamic = "force-dynamic";

type TagDTO = { id: string; name: string; color: string };
type CountMap = Record<string, { comments: number; attachments: number }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBasic(row: any, isProcess: boolean) {
  return {
    id: row.id,
    name: row.name || "Sem nome",
    cpf: row.cpf || "",
    telefone: row.telefone || "",
    status: row.status || undefined,
    labelId: row.labelId ?? null,
    label: row.label ?? null,
    type: row.type ?? (row.role || "USER"),
    role: row.role || (isProcess ? "PROCESS" : "USER"),
    obs: isProcess ? undefined : row.obs || "",
    observacao: isProcess ? row.observacao || "" : undefined,
    service: row.service || "",
    fixed: row.fixed ?? false,
    roleFixed: row.roleFixed || "",
    statusStartedAt: row.statusStartedAt ? row.statusStartedAt.toISOString() : null,
    cardNumber: row.cardNumber ?? null,
    afastadoAte: row.afastadoAte ? row.afastadoAte.toISOString() : null,
    archiveStatus: row.archiveStatus ?? null,
    boardOrder: row.boardOrder ?? null,
    userId: isProcess ? row.userId : undefined,
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role?.startsWith("ADMIN")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const clientVersion = new URL(req.url).searchParams.get("v");
    const version = await computeBoardVersion();

    // Cliente já tem esta versão → tick barato, sem payload.
    if (clientVersion && version && clientVersion === version) {
      return NextResponse.json({ unchanged: true, v: version });
    }

    const [labels, usersRaw, processesRaw] = await Promise.all([
      fetchLabels(),
      fetchUsers(),
      fetchProcesses(),
    ]);

    const users = usersRaw.map((u) => mapBasic(u, false));
    const processes = processesRaw.map((p) => mapBasic(p, true));

    const userIds = users.map((u) => u.id);
    const processIds = processes.map((p) => p.id);

    const counts: { users: CountMap; processes: CountMap } = { users: {}, processes: {} };
    const tags: { users: Record<string, TagDTO[]>; processes: Record<string, TagDTO[]> } = {
      users: {},
      processes: {},
    };

    const [uComments, uDocs, pComments, pDocs, uTags, pTags] = await Promise.all([
      userIds.length
        ? db.comment.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: { _all: true } })
        : Promise.resolve([]),
      userIds.length
        ? db.document.groupBy({ by: ["userId"], where: { userId: { in: userIds } }, _count: { _all: true } })
        : Promise.resolve([]),
      processIds.length
        ? db.comment.groupBy({ by: ["processId"], where: { processId: { in: processIds } }, _count: { _all: true } })
        : Promise.resolve([]),
      processIds.length
        ? db.document.groupBy({ by: ["processId"], where: { processId: { in: processIds } }, _count: { _all: true } })
        : Promise.resolve([]),
      userIds.length
        ? db.user.findMany({
            where: { id: { in: userIds }, cardTags: { some: {} } },
            select: { id: true, cardTags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
          })
        : Promise.resolve([]),
      processIds.length
        ? db.process.findMany({
            where: { id: { in: processIds }, cardTags: { some: {} } },
            select: { id: true, cardTags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
          })
        : Promise.resolve([]),
    ]);

    for (const id of userIds) counts.users[id] = { comments: 0, attachments: 0 };
    for (const id of processIds) counts.processes[id] = { comments: 0, attachments: 0 };
    for (const row of uComments) if (row.userId) counts.users[row.userId].comments = row._count._all;
    for (const row of uDocs) if (row.userId) counts.users[row.userId].attachments = row._count._all;
    for (const row of pComments) if (row.processId) counts.processes[row.processId].comments = row._count._all;
    for (const row of pDocs) if (row.processId) counts.processes[row.processId].attachments = row._count._all;
    for (const u of uTags) tags.users[u.id] = u.cardTags;
    for (const p of pTags) tags.processes[p.id] = p.cardTags;

    return NextResponse.json({ labels, users, processes, counts, tags, v: version });
  } catch (err) {
    console.error("[BOARD-STATE]", err);
    return NextResponse.json({ error: "Erro ao carregar o board" }, { status: 500 });
  }
}
