import { db } from "@/app/_lib/prisma";

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

export async function fetchEventsCount() {
  const data = await db.botconversa.groupBy({
    by: ["evento"],
    _count: { evento: true },
  });
  return data.reduce<Record<string, number>>((acc, item) => {
    acc[item.evento] = item._count.evento;
    return acc;
  }, {});
}

export async function fetchEventsByMonth(year = new Date().getFullYear()) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

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

export async function fetchBotconversaAll() {
  return db.botconversa.findMany({ orderBy: { createdAt: "desc" } });
}
