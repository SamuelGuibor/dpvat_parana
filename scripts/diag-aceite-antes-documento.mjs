// Diagnóstico SÓ LEITURA: linha do tempo de um contato do WhatsApp em volta do
// formulário de aceite de termos — mensagens (com mídia e notas internas),
// decisões do cérebro (`wa_bot`: action, state, fatos enviados, desfecho
// efetivo) e aceites registrados. Serve para conferir se o formulário saiu
// antes de o cliente mandar o documento com foto.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/diag-aceite-antes-documento.mjs <fim do telefone> [--desde=AAAA-MM-DD] [--ate=AAAA-MM-DD]
import { PrismaClient } from "@prisma/client";

const fone = (process.argv[2] ?? "").replace(/\D/g, "");
if (fone.length < 8) throw new Error("Passe ao menos os 8 últimos dígitos do telefone.");
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
// Dia de Brasília (UTC-3 fixo) para o corte; só diagnóstico.
const desde = arg("desde") ? new Date(`${arg("desde")}T00:00:00-03:00`) : new Date(Date.now() - 3 * 86_400_000);
const ate = arg("ate") ? new Date(`${arg("ate")}T23:59:59-03:00`) : new Date();
const fmt = (d) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
const cut = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " "); return t.length > n ? `${t.slice(0, n)}…` : t; };

const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const contatos = await tx.whatsAppContact.findMany({
      where: { phone: { endsWith: fone.slice(-8) } },
      select: { id: true, name: true, phone: true, numberId: true, userId: true, createdAt: true },
    });
    for (const c of contatos) {
      const conv = await tx.whatsAppConversation.findUnique({
        where: { contactId: c.id },
        select: { status: true, qualified: true, closeCategory: true, closedAt: true, createdAt: true, botState: true, botMemory: true },
      });
      console.log(`\n### ${c.name} ${c.phone} (${c.id}) card=${c.userId ?? "—"} contato desde ${fmt(c.createdAt)}`);
      console.log(`conversa: status=${conv?.status} qualified=${conv?.qualified} closeCategory=${conv?.closeCategory} closedAt=${conv?.closedAt ? fmt(conv.closedAt) : "—"} criada=${conv ? fmt(conv.createdAt) : "—"} botState=${conv?.botState}`);
      console.log(`botMemory: ${cut(conv?.botMemory, 900)}`);

      const msgs = await tx.whatsAppMessage.findMany({
        where: { contactId: c.id, createdAt: { gte: desde, lte: ate } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, direction: true, internal: true, sentByBot: true, authorId: true, body: true, transcript: true, mediaType: true, mediaKey: true, interactive: true, systemSource: true, deletedAt: true },
      });
      const logs = await tx.$queryRaw`
        SELECT "createdAt", action, message, metadata
        FROM logs
        WHERE action IN ('wa_bot', 'wa_bot_discarded', 'terms_accept', 'wa_form', 'wa_return_bot', 'wa_assign', 'wa_close', 'wa_reopen')
          AND metadata->>'contactId' = ${c.id}
          AND "createdAt" BETWEEN ${desde} AND ${ate}
        ORDER BY "createdAt" ASC`;

      const linhas = [];
      for (const m of msgs) {
        const quem = m.direction === "in" ? "CLIENTE" : m.internal ? "NOTA" : m.sentByBot ? "BOT" : m.systemSource ? `SISTEMA(${m.systemSource})` : "ATENDENTE";
        const it = m.interactive && typeof m.interactive === "object" ? m.interactive : null;
        const extra = [
          m.mediaType ? `[mídia ${m.mediaType}${m.mediaKey ? "" : " SEM ARQUIVO"}]` : "",
          it ? `[interactive kind=${it.kind} purpose=${it.purpose ?? "—"}${it.queueReason ? ` queueReason=${cut(it.queueReason, 160)}` : ""}]` : "",
          m.deletedAt ? "[apagada]" : "",
        ].filter(Boolean).join(" ");
        linhas.push({ at: m.createdAt, txt: `${quem}: ${cut(m.body ?? m.transcript ?? "", 420)} ${extra}`.trim() });
      }
      for (const l of logs) {
        const md = l.metadata ?? {};
        const resumo = l.action === "wa_bot" || l.action === "wa_bot_discarded"
          ? `action=${md.action ?? md.decision?.action ?? "—"} state=${md.state ?? md.decision?.state ?? "—"} outcome=${md.outcome ?? "—"} closeCategory=${md.closeCategory ?? "—"} effective=${JSON.stringify(md.effective ?? null)} facts=${JSON.stringify(md.facts ?? null)} appliedRules=${JSON.stringify(md.appliedRules ?? null)} handoffReason=${cut(md.handoffReason ?? "", 260)}`
          : cut(JSON.stringify(md), 260);
        linhas.push({ at: l.createdAt, txt: `  >> LOG ${l.action}: ${cut(l.message, 160)} | ${resumo}` });
      }
      linhas.sort((a, b) => a.at - b.at);
      for (const l of linhas) console.log(`${fmt(l.at)} ${l.txt}`);

      const aceites = await tx.termsAcceptance.findMany({
        where: { OR: [{ contactId: c.id }, { phone: c.phone }] },
        select: { acceptedAt: true, termsVersion: true, code: true, pdfKey: true, userId: true },
      });
      console.log(`aceites: ${aceites.map((a) => `${fmt(a.acceptedAt)} ${a.termsVersion} pdf=${a.pdfKey ? "sim" : "não"} card=${a.userId ?? "—"}`).join(" | ") || "nenhum"}`);
    }
    if (!contatos.length) console.log("Nenhum contato com esse final de telefone.");
  });
} finally {
  await db.$disconnect();
}
