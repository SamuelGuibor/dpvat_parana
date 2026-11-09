// SÓ LEITURA: as cobranças de recuperação recentes por TEXTO LIVRE trazem usage
// do micro? (usage no /recovery-message existe só a partir do commit f398921,
// 21/10, que está no main do micro e não no master) → diz de que branch o
// Railway publica. Template não chama a IA e fica de fora.
//   node -r dotenv/config scripts/diag-voz-branch.mjs
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const rows = await db.$queryRawUnsafe(`
    SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI') quando,
           (metadata ? 'usage') tem_usage, metadata->>'via' via, metadata->>'template' template,
           (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(metadata) k) chaves
    FROM logs WHERE action = 'wa_followup' AND metadata->>'mode' = 'recovery'
      AND "createdAt" >= now() - interval '20 days'
    ORDER BY (metadata ? 'usage') DESC, "createdAt" DESC LIMIT 6`);
  for (const r of rows) console.log(r.quando, "usage:", r.tem_usage, "via:", r.via, "tpl:", r.template, "\n   ", r.chaves);
} finally { await db.$disconnect(); }
