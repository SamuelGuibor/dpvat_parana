// Lê tickets DEV pelo id curto (ex.: T-IFYLF) — só leitura. A IA de operação
// não abre ticket DEV (ler_ticket recusa), então o dev usa este script.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/ler-tickets-dev.mjs T-IFYLF T-NHXVY
import { PrismaClient } from "@prisma/client";

const refs = process.argv.slice(2);
const db = new PrismaClient();
const fmt = (d) =>
  d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d) : "—";

try {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    for (const ref of refs) {
      const m = /^(?:[A-Z]-)?([a-z0-9]{5,})$/i.exec(ref.trim());
      if (!m) { console.log(`\n### ${ref}: id inválido`); continue; }
      const achados = await tx.devTicket.findMany({ where: { id: { endsWith: m[1].toLowerCase() } }, take: 2 });
      if (achados.length !== 1) { console.log(`\n### ${ref}: ${achados.length} encontrados`); continue; }
      const t = achados[0];
      const imgs = Array.isArray(t.images) ? t.images.length : 0;
      console.log(`\n### ${ref} (${t.id})\ntipo=${t.type} status=${t.status} criador=${t.creatorName} resp=${t.assigneeName ?? "—"} criado=${fmt(t.createdAt)} imagens=${imgs + (t.imageKey ? 1 : 0)}\nTÍTULO: ${t.title}\n${t.description}`);
    }
  });
} finally {
  await db.$disconnect();
}
