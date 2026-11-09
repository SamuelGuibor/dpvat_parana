// Sonda o cérebro de PRODUÇÃO (CHATBOT_URL) com uma conversa de mentira e diz
// se ele já devolve o campo voiceReplies (micro com o deploy de 09/11). Não
// envia nada a ninguém nem grava no banco; custa uma chamada de IA.
//   node -r dotenv/config scripts/diag-voz-micro.mjs
const url = (process.env.CHATBOT_URL || "").replace(/\/$/, "");
const secret = process.env.CHATBOT_SECRET || "";
if (!url || !secret) { console.error("CHATBOT_URL/CHATBOT_SECRET ausentes"); process.exit(1); }
const res = await fetch(`${url}/reply`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-bot-secret": secret, "x-bot-budget-ms": "40000" },
  body: JSON.stringify({
    contact: { name: "Teste diagnóstico", phone: "5500000000000" },
    history: [], message: "boa noite, eu não sei ler nem escrever, pode mandar áudio?",
    memory: null, state: null, failCount: 0, flows: [],
    priorOutcome: { qualified: null, closeCategory: null },
    conversationFacts: { docsReceived: 0, registeredClient: false, recentAttendant: false, voiceReplies: false },
    business: { open: true, reopens: "", greeting: "boa noite" },
  }),
  signal: AbortSignal.timeout(45_000),
});
const d = await res.json().catch(() => null);
console.log("HTTP", res.status);
console.log("tem o campo voiceReplies:", d && "voiceReplies" in d ? `SIM (${d.voiceReplies})` : "NÃO (micro antigo)");
console.log("brain:", JSON.stringify(d?.brain ?? null), "| model:", d?.model ?? "-");
