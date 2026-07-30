// Registra o webhook da ZapSign apontando para o CRM (rodar UMA vez por ambiente):
//   node --env-file=.env scripts/zapsign-register-webhook.mjs https://segurosparana.com.br
//
// Exige no .env: ZAPSIGN_API_TOKEN e ZAPSIGN_WEBHOOK_SECRET.
// Para sandbox, defina também ZAPSIGN_BASE_URL=https://sandbox.api.zapsign.com.br

const base = (process.env.ZAPSIGN_BASE_URL ?? "https://api.zapsign.com.br").replace(/\/$/, "");
const token = process.env.ZAPSIGN_API_TOKEN;
const secret = process.env.ZAPSIGN_WEBHOOK_SECRET;
const appUrl = process.argv[2];

if (!token || !secret) {
  console.error("Faltam ZAPSIGN_API_TOKEN e/ou ZAPSIGN_WEBHOOK_SECRET no .env");
  process.exit(1);
}
if (!appUrl) {
  console.error("Uso: node --env-file=.env scripts/zapsign-register-webhook.mjs <URL do CRM>");
  process.exit(1);
}

const url = `${appUrl.replace(/\/$/, "")}/api/zapsign/webhook`;
const res = await fetch(`${base}/api/v1/user/company/webhook/`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    url,
    type: "", // todos os eventos; o endpoint filtra
    headers: [{ name: "x-zap-secret", value: secret }],
  }),
});
const body = await res.text();
if (!res.ok) {
  console.error(`Falha HTTP ${res.status}: ${body}`);
  process.exit(1);
}
console.log(`Webhook registrado: ${url}`);
console.log(body);
