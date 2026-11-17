// Diagnóstico SÓ LEITURA: versões dos formulários (whatsapp_form_versions),
// templates do catálogo do CRM e templates da Meta com botão de FORMULÁRIO
// (button type FLOW) — para conferir uma "v2" e por que o envio falha.
// Não imprime token. Banco em transação READ ONLY; na Meta só GET.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/diag-templates-flow.mjs [filtro]
import { PrismaClient } from "@prisma/client";

const filtro = (process.argv[2] ?? "").toLowerCase();
const db = new PrismaClient();
try {
  const { forms, templates, numbers } = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const forms = await tx.whatsAppFormVersion.findMany({
      where: { NOT: { name: { startsWith: "Padrão CTWA" } } },
      orderBy: [{ familyId: "asc" }, { version: "asc" }],
      select: { name: true, version: true, status: true, active: true, familyId: true, metaFlowId: true, wabaId: true, updatedAt: true },
    });
    const templates = await tx.whatsAppTemplate.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { name: true, status: true, category: true, numberId: true, bodyVars: true, headerFormat: true, createdAt: true },
    });
    const numbers = await tx.whatsAppNumber.findMany({ select: { id: true, label: true, wabaId: true, apiVersion: true, active: true } });
    return { forms, templates, numbers };
  });

  console.log("### Formulários (sem os de anúncio)");
  for (const f of forms) console.log(`- ${f.name} v${f.version} ${f.status}${f.active ? " (ativa)" : ""} flow=${f.metaFlowId} família=${f.familyId}`);

  console.log("\n### Templates no catálogo do CRM (40 mais novos)");
  const label = new Map(numbers.map((n) => [n.id, n.label]));
  for (const t of templates.filter((t) => !filtro || t.name.toLowerCase().includes(filtro))) {
    console.log(`- ${t.name} ${t.status} ${t.category} linha=${label.get(t.numberId) ?? t.numberId ?? "default"} vars=${t.bodyVars} header=${t.headerFormat ?? "—"} criado=${t.createdAt.toISOString().slice(0, 10)}`);
  }

  // Botões dos templates na Meta (o CRM não guarda os botões).
  const token = process.env.WHATSAPP_TOKEN;
  const seen = new Set();
  for (const n of numbers.filter((x) => x.active && x.wabaId)) {
    if (seen.has(n.wabaId)) continue;
    seen.add(n.wabaId);
    const url = `https://graph.facebook.com/${n.apiVersion}/${n.wabaId}/message_templates?fields=name,status,category,language,components&limit=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => null);
    if (!res.ok) { console.log(`\n### Meta (${n.label}): erro ${data?.error?.message}`); continue; }
    console.log(`\n### Templates da Meta com botão (${n.label})`);
    for (const t of data?.data ?? []) {
      const btns = (t.components ?? []).find((c) => c.type === "BUTTONS")?.buttons ?? [];
      if (!btns.length) continue;
      if (filtro && !t.name.toLowerCase().includes(filtro)) continue;
      const desc = btns.map((b) => `${b.type}${b.flow_id ? ` flow=${b.flow_id}` : ""}${b.flow_action ? ` action=${b.flow_action}` : ""}${b.navigate_screen ? ` tela=${b.navigate_screen}` : ""} "${b.text ?? ""}"`).join(" | ");
      console.log(`- ${t.name} ${t.status} ${t.category} ${t.language} :: ${desc}`);
      if (btns.some((b) => b.type === "FLOW")) {
        const body = (t.components ?? []).find((c) => c.type === "BODY");
        console.log(`    corpo: ${JSON.stringify(body?.text ?? "").slice(0, 160)}`);
      }
    }
  }
} finally {
  await db.$disconnect();
}
