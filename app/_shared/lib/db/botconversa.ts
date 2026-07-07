import { db } from "@/app/_shared/lib/prisma";

type StatusKey = "aprovados" | "indeferidos" | "emAndamento";

const EVENT_MAP: Record<string, StatusKey> = {
  contratado: "aprovados",
  nao_contratado: "indeferidos",
  nao_qualificado: "indeferidos",
  iniciado: "emAndamento",
  em_conversa: "emAndamento",
  em_honorario: "emAndamento",
  aguardando: "emAndamento",
  enviou_documentos: "emAndamento",
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export interface DateRange {
  from: Date;
  to: Date;
}

export async function fetchEventsCount(range?: DateRange) {
  const where = range
    ? { createdAt: { gte: range.from, lte: range.to } }
    : undefined;

  const data = await db.botconversa.groupBy({
    by: ["evento"],
    _count: { evento: true },
    ...(where ? { where } : {}),
  });

  return data.reduce<Record<string, number>>((acc, item) => {
    acc[item.evento] = item._count.evento;
    return acc;
  }, {});
}

export async function fetchEventsByMonth(year = new Date().getFullYear(), range?: DateRange) {
  const start = range?.from ?? new Date(year, 0, 1);
  const end = range?.to ?? new Date(year, 11, 31, 23, 59, 59);

  const events = await db.botconversa.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { evento: true, createdAt: true },
  });

  const monthlyData = MONTHS.map((month) => ({
    month,
    aprovados: 0,
    indeferidos: 0,
    emAndamento: 0,
  }));

  for (const event of events) {
    if (!event.createdAt) continue;
    const mappedKey = EVENT_MAP[event.evento];
    if (mappedKey) monthlyData[event.createdAt.getMonth()][mappedKey]++;
  }

  return monthlyData;
}

export async function fetchBotconversaAll(range?: DateRange) {
  const where = range
    ? { createdAt: { gte: range.from, lte: range.to } }
    : undefined;

  return db.botconversa.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}
