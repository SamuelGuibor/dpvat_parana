// Diagnóstico (SÓ LEITURA) da API externa de mensagens (T-WOJYR): escolhe um
// telefone de amostra que tenha conversa em 2 linhas, nota interna e mensagem
// apagada, grava o telefone num arquivo (não imprime) e mostra o que a API
// deveria devolver por contato: total visível, notas internas e apagadas que
// NÃO podem sair.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/diag-api-externa-mensagens.mjs --saida=<arquivo> [--phone=<55...>]
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
if (typeof flags.saida !== "string") throw new Error("--saida=<arquivo> é obrigatório");

const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    // Como o telefone está gravado: tamanho × 1º dígito depois do DDD (12
    // dígitos começando por 2–5 parece fixo, mas pode ser celular sem o 9).
    const dist = await tx.$queryRawUnsafe(`
      SELECT length(phone) AS tam, substr(phone, 5, 1) AS d1, count(*)::int AS n
      FROM whatsapp_contacts WHERE phone ~ '^55[0-9]{10,11}$'
      GROUP BY 1, 2 ORDER BY 1, 2`);
    console.log("tamanho/1º dígito local:", dist.map((r) => `${r.tam}:${r.d1}=${r.n}`).join("  "));
    const pares = await tx.$queryRawUnsafe(`
      SELECT substr(a.phone, 5, 1) AS d1, count(*)::int AS n
      FROM whatsapp_contacts a JOIN whatsapp_contacts b
        ON length(a.phone) = 12 AND b.phone = substr(a.phone, 1, 4) || '9' || substr(a.phone, 5)
      GROUP BY 1 ORDER BY 1`);
    console.log("12 díg. que também existem com o 9 (mesmo celular):", pares.map((r) => `${r.d1}=${r.n}`).join("  ") || "nenhum");

    const logs = await tx.log.findMany({
      where: { action: "api_wa_messages" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { createdAt: true, authorId: true, authorName: true, metadata: true },
    });
    for (const l of logs) {
      const { phone: _p, ...meta } = l.metadata ?? {};
      console.log(`log ${l.createdAt.toISOString()} ${l.authorId} "${l.authorName}" ${JSON.stringify(meta)} phone=${_p ? "(tem)" : "—"}`);
    }

    let phone = typeof flags.phone === "string" ? flags.phone : null;
    if (!phone) {
      // Telefone com 2+ contatos (linhas) e, em algum deles, nota interna e apagada.
      const rows = await tx.$queryRawUnsafe(`
        SELECT c.phone
        FROM whatsapp_contacts c
        WHERE c.phone IN (SELECT phone FROM whatsapp_contacts GROUP BY phone HAVING count(*) > 1)
          AND EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m."contactId" = c.id AND m.internal)
          AND EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m."contactId" = c.id AND m."deletedAt" IS NOT NULL)
        LIMIT 1`);
      phone = rows[0]?.phone ?? null;
    }
    if (!phone) { console.log("Nenhum telefone de amostra encontrado."); return; }
    writeFileSync(flags.saida, phone, "utf8");
    console.log(`telefone de amostra gravado em ${flags.saida} (${phone.length} dígitos)`);

    const contacts = await tx.whatsAppContact.findMany({ where: { phone }, select: { id: true, numberId: true } });
    for (const c of contacts) {
      const [visiveis, internas, apagadas] = await Promise.all([
        tx.whatsAppMessage.count({ where: { contactId: c.id, internal: false, deletedAt: null } }),
        tx.whatsAppMessage.count({ where: { contactId: c.id, internal: true } }),
        tx.whatsAppMessage.count({ where: { contactId: c.id, deletedAt: { not: null } } }),
      ]);
      console.log(`contato ${c.id} linha=${c.numberId ?? "—"} visíveis=${visiveis} internas=${internas} apagadas=${apagadas}`);
    }
  });
} finally {
  await db.$disconnect();
}
