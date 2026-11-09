// SÓ LEITURA: estado do bot de UMA conversa (ficha, etapa, desfecho anterior,
// pedido em aberto) em JSON, para reproduzir o turno no simulador local.
//   node -r dotenv/config scripts/diag-voz-contexto.mjs <contactId> <arquivo.json>
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
const db = new PrismaClient();
try {
  const c = await db.whatsAppConversation.findUnique({
    where: { contactId: process.argv[2] },
    select: { botMemory: true, botState: true, qualified: true, closeCategory: true, collectRequest: true, status: true },
  });
  writeFileSync(process.argv[3], JSON.stringify(c, null, 1));
  console.log("ok: status", c?.status, "| etapa", c?.botState, "| qualificado", c?.qualified, "| ficha", (c?.botMemory ?? "").length, "chars | pedido", c?.collectRequest ? "sim" : "não");
} finally { await db.$disconnect(); }
