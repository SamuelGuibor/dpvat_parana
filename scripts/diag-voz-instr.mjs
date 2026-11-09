// SÓ LEITURA: a seção do áudio está nas instruções publicadas? Mostra títulos
// das seções e o trecho que cita voiceReplies.
//   node -r dotenv/config scripts/diag-voz-instr.mjs
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const i = await db.whatsAppInstructions.findFirst({ where: { status: "publicado" }, orderBy: { version: "desc" } });
  console.log("versão publicada:", i?.version, "| intro cita voiceReplies:", (i?.intro ?? "").includes("voiceReplies"));
  for (const s of (i?.sections ?? [])) {
    const has = String(s.content ?? "").includes("voiceReplies");
    console.log(`- [${s.enabled === false ? "OFF" : "on"}] ${s.title}${has ? "  ← cita voiceReplies" : ""}`);
    if (has) console.log(String(s.content).slice(0, 1800).replace(/^/gm, "    "));
  }
} finally { await db.$disconnect(); }
