// Diagnóstico (SÓ LEITURA, transação READ ONLY) das respostas em áudio de UM
// telefone: o contato está marcado para áudio? O que o cérebro decidiu em cada
// turno (voiceReplies, versão das instruções)? A voz foi gerada (wa_tts) ou
// falhou (critical_error "whatsapp.voz")? As mensagens saíram como áudio?
//
// Uso (PRODUÇÃO):  node -r dotenv/config scripts/diag-voz.mjs 4188887513
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const fmt = (d) =>
  d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(d) : "—";
const last8 = String(process.argv[2] ?? "").replace(/\D/g, "").slice(-8);
if (last8.length < 8) { console.error("informe o telefone"); process.exit(1); }

try {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const contatos = await tx.$queryRawUnsafe(
      `SELECT c.id, c."numberId", c."voiceReplies", c."voiceRepliesAt", c."voiceRepliesBy", v.status, v."botState"
       FROM whatsapp_contacts c LEFT JOIN whatsapp_conversations v ON v."contactId" = c.id
       WHERE right(regexp_replace(c.phone, '\\D', '', 'g'), 8) = $1`, last8);
    console.log("CONTATOS:", contatos.map((c) => ({ ...c, voiceRepliesAt: fmt(c.voiceRepliesAt) })));
    for (const c of contatos) {
      const msgs = await tx.$queryRawUnsafe(
        `SELECT "createdAt", direction, "sentByBot", "systemSource", "mediaType", left(coalesce(body, transcript, ''), 70) txt
         FROM whatsapp_messages WHERE "contactId" = $1 AND internal = false ORDER BY "createdAt" DESC LIMIT 12`, c.id);
      console.log(`\nMENSAGENS (${c.id}, mais nova primeiro):`);
      for (const m of msgs) console.log(` ${fmt(m.createdAt)} ${m.direction}${m.sentByBot ? "/bot" : ""} ${m.mediaType ?? "texto"} | ${m.txt}`);
      const logs = await tx.$queryRawUnsafe(
        `SELECT "createdAt", action, message,
                metadata->>'voiceReplies' voz, metadata->'brain' brain, metadata->>'outcome' outcome,
                metadata->>'context' ctx, metadata->>'error' erro, metadata->>'source' src
         FROM logs WHERE metadata->>'contactId' = $1
           AND action IN ('wa_bot','wa_bot_discarded','wa_tts','critical_error','wa_contact')
         ORDER BY "createdAt" DESC LIMIT 15`, c.id);
      console.log(`\nLOGS:`);
      for (const l of logs) {
        console.log(` ${fmt(l.createdAt)} ${l.action} ${l.outcome ?? ""} voz=${l.voz ?? "-"} brain=${l.brain ? JSON.stringify(l.brain) : "-"} ${l.ctx ?? ""} ${(l.erro ?? "").slice(0, 120)} ${l.src ?? ""}`);
      }
    }
    const instr = await tx.$queryRawUnsafe(
      `SELECT version, status, "createdAt", 1 as ok
       FROM whatsapp_instructions WHERE status = 'publicado' ORDER BY version DESC LIMIT 1`);
    console.log("\nINSTRUÇÕES PUBLICADAS:", instr.map((i) => ({ ...i, createdAt: fmt(i.createdAt) })));
    const tts = await tx.$queryRawUnsafe(`SELECT count(*)::int n, max("createdAt") ultimo FROM logs WHERE action = 'wa_tts'`);
    const errs = await tx.$queryRawUnsafe(
      `SELECT "createdAt", metadata->>'context' ctx, left(metadata->>'error', 160) erro FROM logs
       WHERE action = 'critical_error' AND metadata->>'context' LIKE 'whatsapp.voz%' ORDER BY "createdAt" DESC LIMIT 5`);
    console.log("\nwa_tts no sistema todo:", tts.map((t) => ({ n: t.n, ultimo: fmt(t.ultimo) })));
    console.log("falhas de voz recentes:", errs.map((e) => ({ ...e, createdAt: fmt(e.createdAt) })));
  });
} finally {
  await db.$disconnect();
}
