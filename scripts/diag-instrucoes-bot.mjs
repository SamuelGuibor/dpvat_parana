// Diagnóstico SÓ LEITURA das instruções do bot (o prompt vivo, no banco):
// versões recentes, rascunho pendente e títulos das seções da publicada.
// Com --grep=<texto>, mostra os trechos da publicada que contêm o texto.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/diag-instrucoes-bot.mjs [--grep=qualify]
import { PrismaClient } from "@prisma/client";

const grep = process.argv.find((a) => a.startsWith("--grep="))?.slice(7) ?? null;
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const rows = await tx.whatsAppInstructions.findMany({
      orderBy: { version: "desc" },
      take: 5,
      select: { id: true, version: true, status: true, changeNote: true, charCount: true, publishedAt: true, updatedAt: true, sections: true },
    });
    for (const r of rows) {
      console.log(`v${r.version} ${r.status} chars=${r.charCount} publicada=${r.publishedAt?.toISOString() ?? "—"} atualizada=${r.updatedAt.toISOString()} nota=${JSON.stringify(r.changeNote ?? "")}`);
    }
    const pub = rows.find((r) => r.status === "publicado");
    if (!pub) return;
    const sections = (pub.sections ?? []).slice().sort((a, b) => a.order - b.order);
    console.log(`\nSeções da v${pub.version} publicada:`);
    for (const s of sections) console.log(`  ${s.order}. ${s.enabled === false ? "(desligada) " : ""}${s.title} — ${s.content.length} chars`);
    if (grep) {
      console.log(`\nTrechos com "${grep}":`);
      for (const s of sections) {
        for (const line of s.content.split("\n")) {
          if (line.toLowerCase().includes(grep.toLowerCase())) console.log(`  [${s.title}] ${line.slice(0, 220)}`);
        }
      }
    }
  });
} finally {
  await db.$disconnect();
}
