// Diagnóstico SÓ LEITURA de um fluxo do bot (aba Fluxos, model WhatsAppFlow):
// descrição que a IA lê e os passos com o texto que sai ao cliente.
//
// Uso (PRODUÇÃO: o banco local é o Neon de produção):
//   node -r dotenv/config scripts/diag-fluxo-bot.mjs "Solicitar Relato Acidente"
import { PrismaClient } from "@prisma/client";

const nome = process.argv[2];
if (!nome) throw new Error("Passe o nome do fluxo.");
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    // Nome exato primeiro; senão, o primeiro que contém o texto (e lista os nomes).
    const f = (await tx.whatsAppFlow.findFirst({ where: { name: { equals: nome, mode: "insensitive" } } }))
      ?? (await tx.whatsAppFlow.findFirst({ where: { name: { contains: nome, mode: "insensitive" } } }));
    if (!f) {
      const nomes = await tx.whatsAppFlow.findMany({ select: { name: true }, orderBy: { name: "asc" } });
      console.log(`fluxo não encontrado. Fluxos: ${nomes.map((n) => JSON.stringify(n.name)).join(", ")}`);
      return;
    }
    console.log(`### ${f.name} (${f.id}) atualizado=${f.updatedAt.toISOString()}\nDESCRIÇÃO: ${f.description ?? "—"}\nPASSOS:\n${JSON.stringify(f.steps, null, 2)}`);
  });
} finally {
  await db.$disconnect();
}
