// Zera o "cérebro" de UMA conversa de TESTE para o bot recomeçar do zero:
// ficha (botMemory), etapa, falhas, desfecho anterior (qualified/closeCategory),
// pedido em aberto e devolução; status volta a "bot" e o atendimento atual
// passa a começar agora (closedAt). Sem desfecho e sem etapa, o micro trata a
// próxima mensagem como atendimento NOVO (resolveTurnStart): ignora ficha e
// histórico. Nenhuma mensagem é apagada; o flag de áudio do contato fica como
// está.
//
// Uso (PRODUÇÃO):
//   node -r dotenv/config scripts/resetar-conversa-teste.mjs <contactId>          → só mostra
//   node -r dotenv/config scripts/resetar-conversa-teste.mjs <contactId> --apply  → aplica
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const contactId = process.argv[2];
const apply = process.argv.includes("--apply");
if (!contactId || contactId.startsWith("--")) { console.error("informe o contactId"); process.exit(1); }

const SELECT = {
  status: true, botState: true, botFailCount: true, qualified: true, closeCategory: true,
  assignedToId: true, queuedAt: true, closedAt: true, returnedToBotAt: true,
  collectRequest: true, collectRequestEndedAt: true, collectNudgeCount: true,
  botMemory: true,
};
const resumo = (c) => c && ({
  ...c, botMemory: c.botMemory ? `${c.botMemory.length} caracteres` : null,
  collectRequest: c.collectRequest ? "(tem pedido)" : null,
});

try {
  const antes = await db.whatsAppConversation.findUnique({ where: { contactId }, select: SELECT });
  if (!antes) { console.error("conversa não encontrada"); process.exit(1); }
  console.log("ANTES:", resumo(antes));
  if (!apply) { console.log("\n(só mostrou — rode com --apply para zerar)"); process.exit(0); }
  const depois = await db.whatsAppConversation.update({
    where: { contactId },
    data: {
      status: "bot", assignedToId: null, queuedAt: null, queueAlertAt: null,
      botMemory: null, botState: null, botFailCount: 0, botNudge30At: null,
      qualified: null, closeCategory: null, closedAt: new Date(), returnedToBotAt: null,
      collectRequest: null, collectRequestAt: null, collectRequestSource: null,
      collectRequestEndedAt: null, collectNudgeCount: 0, collectNudgeAt: null,
      recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null,
      recoveryManualById: null, recoveryManualMax: null,
    },
    select: SELECT,
  });
  console.log("DEPOIS:", resumo(depois));
} finally {
  await db.$disconnect();
}
