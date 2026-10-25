// Relatório da Operação por IA a partir de op_* (só leitura). Serve de
// evidência e de auditoria até a tela "Operação por IA" (Etapa 7) existir.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/op-relatorio.mjs [--dias=7] [--prompts]
//
// --prompts imprime os 120 primeiros caracteres de cada prompt (pode ter CPF e
// nome de cliente — não cole a saída em lugar público). Sem a flag, só contagens.
// Tudo numa transação READ ONLY: o script não tem caminho de escrita.
import { PrismaClient } from "@prisma/client";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const dias = Math.max(1, Number(args.dias ?? 7));
const desde = new Date(Date.now() - dias * 86_400_000);
const fmt = (d) =>
  d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(d) : "—";

const db = new PrismaClient();

try {
  const data = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const tokens = await tx.operatorToken.findMany({
      orderBy: { createdAt: "asc" },
      select: { label: true, createdAt: true, lastUsedAt: true, revokedAt: true, user: { select: { name: true } } },
    });
    const sessions = await tx.opSession.findMany({
      where: { lastSeenAt: { gte: desde } },
      orderBy: { startedAt: "asc" },
      select: { id: true, operatorId: true, startedAt: true, lastSeenAt: true, _count: { select: { requests: true, toolCalls: true } } },
    });
    const requests = await tx.opRequest.findMany({
      where: { createdAt: { gte: desde } },
      orderBy: { createdAt: "asc" },
      select: { operatorId: true, skill: true, text: true, createdAt: true, _count: { select: { toolCalls: true } } },
    });
    const calls = await tx.opToolCall.findMany({
      where: { createdAt: { gte: desde } },
      orderBy: { createdAt: "asc" },
      select: { operatorId: true, tool: true, level: true, args: true, summary: true, ok: true, code: true, durationMs: true, requestId: true, cardIds: true, createdAt: true },
    });
    const ids = [...new Set([...sessions, ...requests, ...calls].map((r) => r.operatorId))];
    const users = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return { tokens, sessions, requests, calls, names: new Map(users.map((u) => [u.id, u.name])) };
  });

  const who = (id) => data.names.get(id) ?? id;
  console.log(`\n== Operação por IA — últimos ${dias} dia(s) (desde ${fmt(desde)}) ==\n`);

  console.log(`Tokens (${data.tokens.length}):`);
  for (const t of data.tokens) {
    console.log(`  ${t.user.name} · "${t.label}" · criado ${fmt(t.createdAt)} · último uso ${fmt(t.lastUsedAt)}${t.revokedAt ? ` · REVOGADO ${fmt(t.revokedAt)}` : ""}`);
  }

  console.log(`\nSessões do app (${data.sessions.length}):`);
  for (const s of data.sessions) {
    console.log(`  ${who(s.operatorId)} · ${fmt(s.startedAt)} → ${fmt(s.lastSeenAt)} · ${s._count.requests} prompt(s) · ${s._count.toolCalls} ferramenta(s)`);
  }

  const bySkill = {};
  for (const r of data.requests) bySkill[r.skill ?? "(texto livre)"] = (bySkill[r.skill ?? "(texto livre)"] ?? 0) + 1;
  console.log(`\nPrompts (${data.requests.length}):`, bySkill);
  // Token colado no chat vira texto do prompt: alarme para revogar e trocar.
  const leaked = data.requests.filter((r) => /crmop_[A-Za-z0-9_-]{20,}/.test(r.text));
  if (leaked.length) {
    console.log(`  ⚠ ${leaked.length} prompt(s) contêm um token do app (crmop_…): revogue esse token na tela Equipe e gere outro.`);
  }
  if (args.prompts) {
    for (const r of data.requests) {
      console.log(`  ${fmt(r.createdAt)} · ${who(r.operatorId)} · ${r._count.toolCalls} ferr. · ${r.text.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }

  const byTool = {};
  for (const c of data.calls) {
    const t = (byTool[c.tool] ??= { total: 0, ok: 0, falhas: {}, ms: 0 });
    t.total++;
    t.ms += c.durationMs;
    if (c.ok) t.ok++;
    else t.falhas[c.code ?? "?"] = (t.falhas[c.code ?? "?"] ?? 0) + 1;
  }
  const linked = data.calls.filter((c) => c.requestId).length;
  const cards = new Set(data.calls.flatMap((c) => c.cardIds));
  console.log(`\nFerramentas (${data.calls.length} chamadas · ${linked} ligadas a um prompt · ${cards.size} card(s) distintos):`);
  for (const [tool, t] of Object.entries(byTool).sort((a, b) => b[1].total - a[1].total)) {
    const falhas = Object.entries(t.falhas).map(([k, v]) => `${k}×${v}`).join(", ");
    console.log(`  ${tool.padEnd(22)} ${String(t.total).padStart(4)} · ok ${t.ok} · média ${Math.round(t.ms / t.total)} ms${falhas ? ` · falhas: ${falhas}` : ""}`);
  }

  // Escritas (L3): cada ação gera 2 linhas — prévia (sem confirmar) e execução.
  const writes = data.calls.filter((c) => c.level >= 3);
  if (writes.length) {
    const byW = {};
    for (const c of writes) {
      const w = (byW[c.tool] ??= { previas: 0, execucoes: 0, noop: 0, estadoMudou: 0, recusas: {} });
      const confirmed = c.args && typeof c.args === "object" && c.args.confirmar === true;
      if (!c.ok) {
        if (c.code === "estado_mudou") w.estadoMudou++;
        else w.recusas[c.code ?? "?"] = (w.recusas[c.code ?? "?"] ?? 0) + 1;
      } else if (/^noop/.test(c.summary ?? "")) w.noop++;
      else if (confirmed) w.execucoes++;
      else w.previas++;
    }
    console.log(`
Escritas (${writes.length} chamadas L3):`);
    for (const [tool, w] of Object.entries(byW)) {
      const rec = Object.entries(w.recusas).map(([k, v]) => `${k}×${v}`).join(", ");
      console.log(`  ${tool.padEnd(22)} prévias ${w.previas} · execuções ${w.execucoes} · noop ${w.noop} · estado_mudou ${w.estadoMudou}${rec ? ` · recusas: ${rec}` : ""}`);
    }
  }
  console.log("");
} finally {
  await db.$disconnect();
}
