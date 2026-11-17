// Diagnóstico SÓ LEITURA: a WABA de cada número ativo tem acesso à API de
// WhatsApp Flows? Lista os Flows (id, nome, status, categorias) por WABA.
// Não imprime token. Banco em transação READ ONLY; na Meta só GET.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/diag-flows-meta.mjs
import { PrismaClient } from "@prisma/client";
import { createDecipheriv, scryptSync } from "crypto";

function decrypt(stored) {
  const secret = process.env.WHATSAPP_CRED_KEY ?? process.env.NEXT_AUTH_SECRET;
  const key = scryptSync(secret, "whatsapp-number-creds", 32);
  const [v, ivB64, tagB64, dataB64] = stored.split(":");
  if (v !== "v1") throw new Error("formato inválido");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(dataB64, "base64")), d.final()]).toString("utf8");
}

const dumpName = process.argv[2] ?? null;
const db = new PrismaClient();
try {
  const numbers = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.whatsAppNumber.findMany({
      select: { id: true, label: true, wabaId: true, apiVersion: true, active: true, accessTokenEnc: true, isDefault: true },
    });
  });
  for (const n of numbers) {
    console.log(`\n### ${n.label} (ativo=${n.active} default=${n.isDefault} waba=${n.wabaId ? "sim" : "não"})`);
    if (!n.wabaId) continue;
    // A chave local pode não ser a da Vercel: sem decifrar, tenta o token das
    // envs (System User costuma ser o mesmo nas duas WABAs).
    let token;
    try { token = decrypt(n.accessTokenEnc); } catch { token = process.env.WHATSAPP_TOKEN; console.log("  (token do banco não decifra localmente; usando WHATSAPP_TOKEN do .env)"); }
    if (!token) { console.log("  sem token"); continue; }
    const url = `https://graph.facebook.com/${n.apiVersion}/${n.wabaId}/flows?fields=id,name,status,categories,validation_errors,json_version&limit=50`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.log(`  ERRO HTTP ${res.status}: ${data?.error?.message ?? "?"} (code ${data?.error?.code ?? "?"})`);
      continue;
    }
    const flows = data?.data ?? [];
    console.log(`  API de Flows OK — ${flows.length} flow(s)`);
    for (const f of flows) {
      console.log(`  - ${f.name} | status=${f.status} | categorias=${(f.categories ?? []).join(",")} | json=${f.json_version ?? "?"} | erros=${(f.validation_errors ?? []).length}`);
      // node ... diag-flows-meta.mjs <nome do flow> → imprime o JSON do Flow.
      if (dumpName && f.name === dumpName) {
        const a = await fetch(`https://graph.facebook.com/${n.apiVersion}/${f.id}/assets`, { headers: { Authorization: `Bearer ${token}` } });
        const assets = await a.json().catch(() => null);
        const link = assets?.data?.find((x) => x.asset_type === "FLOW_JSON")?.download_url;
        if (link) console.log(await (await fetch(link)).text());
        else console.log("  sem FLOW_JSON:", JSON.stringify(assets)?.slice(0, 300));
      }
    }
    if (data?.paging?.next) console.log("  (há mais páginas)");
  }
} finally {
  await db.$disconnect();
}
