// Diagnóstico SÓ LEITURA: últimas mensagens de um contato do WhatsApp, para
// conferir como a resposta de formulário (nfm_reply) foi gravada.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/diag-resposta-formulario.mjs "<parte do nome do contato>"
import { PrismaClient } from "@prisma/client";

const nome = process.argv[2] ?? "";
if (!nome.trim()) throw new Error("Passe parte do nome do contato.");
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const contatos = await tx.whatsAppContact.findMany({
      where: { name: { contains: nome, mode: "insensitive" } },
      select: { id: true, name: true, numberId: true, userId: true },
      take: 3,
    });
    for (const c of contatos) {
      console.log(`\n### ${c.name} (${c.id}) linha=${c.numberId ?? "—"} card=${c.userId ? "sim" : "não"}`);
      const msgs = await tx.whatsAppMessage.findMany({
        where: { contactId: c.id },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { createdAt: true, direction: true, internal: true, body: true, interactive: true, replyToId: true, waMessageId: true },
      });
      for (const m of msgs.reverse()) {
        const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(m.createdAt);
        console.log(`- ${quando} ${m.direction}${m.internal ? " (nota)" : ""} body=${JSON.stringify((m.body ?? "").slice(0, 80))} interactive=${m.interactive ? JSON.stringify(m.interactive).slice(0, 120) : "null"} replyTo=${m.replyToId ? "sim" : "não"}`);
      }
      const aceites = await tx.termsAcceptance.count({ where: { contactId: c.id } });
      console.log(`  aceites registrados: ${aceites}`);
    }
  });
} finally {
  await db.$disconnect();
}
