// SÓ LEITURA: chaves do último log wa_bot de um contato (sem texto do cliente),
// para saber se o CRM e o micro que atenderam já tinham o campo voiceReplies.
//   node -r dotenv/config scripts/diag-voz-log.mjs <contactId>
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const [l] = await db.$queryRawUnsafe(
    `SELECT "createdAt", metadata FROM logs WHERE action = 'wa_bot' AND metadata->>'contactId' = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    process.argv[2]);
  const m = l?.metadata ?? {};
  console.log("chaves:", Object.keys(m).sort().join(", "));
  console.log("facts:", JSON.stringify(m.facts ?? null));
  console.log("voiceReplies:", m.voiceReplies ?? "(ausente)", "| model:", m.model ?? "-", "| brain:", JSON.stringify(m.brain ?? null));
  console.log("rationale:", String(m.rationale ?? "").slice(0, 300));
} finally { await db.$disconnect(); }
