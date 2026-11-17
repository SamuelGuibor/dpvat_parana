// Diagnóstico SÓ LEITURA: rastro de envios de um template (logs wa_template,
// mensagens com o texto dele e critical_error recentes) — para entender por
// que o envio pelo botão Template falhou.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/diag-envio-template.mjs <nome_do_template> [horas=48]
import { PrismaClient } from "@prisma/client";

const nome = process.argv[2];
const horas = Number(process.argv[3] ?? 48);
if (!nome) throw new Error("Passe o nome do template.");
const desde = new Date(Date.now() - horas * 3600_000);
const fmt = (d) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(d);

const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const logs = await tx.log.findMany({
      where: { action: { in: ["wa_template", "wa_text"] }, createdAt: { gte: desde }, metadata: { path: ["templateName"], equals: nome } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { createdAt: true, action: true, message: true, metadata: true },
    });
    console.log(`### Logs com templateName=${nome} (${logs.length})`);
    for (const l of logs) console.log(`- ${fmt(l.createdAt)} ${l.action} ${l.message.slice(0, 140)} ${JSON.stringify(l.metadata).slice(0, 200)}`);

    const erros = await tx.log.findMany({
      where: { action: "critical_error", createdAt: { gte: desde } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { createdAt: true, message: true, metadata: true },
    });
    console.log(`\n### critical_error nas últimas ${horas} h (${erros.length})`);
    for (const e of erros) console.log(`- ${fmt(e.createdAt)} ${e.message.slice(0, 120)} ${JSON.stringify(e.metadata?.context ?? "")} ${String(e.metadata?.error ?? "").slice(0, 200)}`);
  });
} finally {
  await db.$disconnect();
}
