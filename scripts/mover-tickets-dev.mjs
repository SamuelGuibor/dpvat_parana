// Move tickets DEV (não de conhecimento) de fase pelo id curto, com a mesma
// regra do setDevTicketStatus: avançar sem responsável assume o ticket para
// quem moveu (--autor=<e-mail ou nome do membro da equipe>).
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/mover-tickets-dev.mjs --fase=EM_ANALISE --autor=<e-mail> T-IFYLF T-NHXVY
//   (sem --apply = dry-run: só mostra o que mudaria)
import { PrismaClient } from "@prisma/client";

const FASES = ["EM_DISTRIBUICAO", "EM_ANALISE", "EM_DESENVOLVIMENTO", "CONCLUIDO"];
const DEV_TYPES = ["BUG", "ALTERACAO", "MELHORIA", "OUTRO"];

const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const refs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const fase = String(flags.fase ?? "");
if (!FASES.includes(fase)) throw new Error(`--fase deve ser uma de ${FASES.join(", ")}`);
if (!flags.autor) throw new Error("--autor=<e-mail do membro da equipe> é obrigatório");

const db = new PrismaClient();
try {
  const autor = await db.user.findMany({
    where: {
      OR: [{ email: String(flags.autor) }, { name: { startsWith: String(flags.autor), mode: "insensitive" } }],
      role: { in: ["ADMIN", "ADMIN+", "ADMIN++"] },
    },
    select: { id: true, name: true },
    take: 2,
  }).then((r) => (r.length === 1 ? r[0] : null));
  if (!autor) throw new Error("Autor não encontrado (ou mais de um) na equipe: use o e-mail ou o nome completo");

  for (const ref of refs) {
    const m = /^(?:[A-Z]-)?([a-z0-9]{5,})$/i.exec(ref.trim());
    const achados = m ? await db.devTicket.findMany({ where: { id: { endsWith: m[1].toLowerCase() } }, take: 2 }) : [];
    if (achados.length !== 1) { console.log(`${ref}: ${achados.length} encontrados — pulado`); continue; }
    const t = achados[0];
    if (!DEV_TYPES.includes(t.type)) { console.log(`${ref}: tipo ${t.type} é de conhecimento — use atualizar_ticket`); continue; }
    if (t.status === fase) { console.log(`${ref}: já está em ${fase}`); continue; }
    const assumir = fase !== "EM_DISTRIBUICAO" && !t.assigneeId;
    const data = {
      status: fase,
      concludedAt: fase === "CONCLUIDO" ? new Date() : null,
      ...(fase === "EM_DISTRIBUICAO" ? { assigneeId: null, assigneeName: null } : {}),
      ...(assumir ? { assigneeId: autor.id, assigneeName: autor.name ?? "Usuário" } : {}),
    };
    console.log(`${ref}: ${t.status} → ${fase}${assumir ? ` (assume ${autor.name})` : ""}${flags.apply ? "" : " [dry-run]"}`);
    if (flags.apply) await db.devTicket.update({ where: { id: t.id }, data });
  }
} finally {
  await db.$disconnect();
}
