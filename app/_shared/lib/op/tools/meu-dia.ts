import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { brDate, brDaysBetween } from "../resolve";
import { CARD_WHERE, columnName } from "../cards";
import { aggregateMeuDia, type MeuDiaCard } from "@/app/_shared/utils/meu-dia";
import { pendenciasDoCard } from "./verificar-pendencias";
import { jobSummary, pendingJobsFor } from "../jobs";

const schema = z.object({
  dias: z.number().int().min(1).max(30).default(3).describe("Janela (dias) dos cards que você conduziu. Padrão 3."),
});

const MAX_CARDS = 30;
const MAX_PENDENCIAS = 15;

// "Responsável" = quem conduz o card (decisão 12): os que o operador tocou
// pela IA (op_tool_calls.cardIds) ou moveu no site (Log move com authorId).
export const meuDia = defineTool({
  name: "meu_dia",
  description:
    "Plano do dia do dono do token: tarefas/menções pendentes dele, cards que ele conduziu nos últimos N dias (pela IA ou movendo no site) com a situação atual, os parados além do prazo e um resumo de pendências. Só leitura.",
  level: 1,
  permission: "op_use",
  schema,
  async run({ op }, args) {
    const since = new Date(Date.now() - args.dias * 86_400_000);
    const [mentions, calls, moves, lotes] = await Promise.all([
      db.mention.findMany({
        where: { recipientId: op.userId, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 30,
        select: { id: true, authorName: true, source: true, excerpt: true, targetName: true, userId: true, sectorName: true, groupId: true, createdAt: true },
      }),
      db.opToolCall.findMany({
        where: { operatorId: op.userId, ok: true, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { cardIds: true, createdAt: true },
      }),
      db.log.findMany({
        where: { authorId: op.userId, action: "move", createdAt: { gte: since }, userId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: { userId: true, createdAt: true },
      }),
      // Item O (27/10): lotes em segundo plano terminados e ainda não vistos (+ os rodando).
      pendingJobsFor(op.userId),
    ]);

    const touched = new Map<string, Date>();
    const touch = (id: string, at: Date) => {
      const prev = touched.get(id);
      if (!prev || prev < at) touched.set(id, at);
    };
    for (const c of calls) for (const id of c.cardIds) touch(id, c.createdAt);
    for (const m of moves) if (m.userId) touch(m.userId, m.createdAt);

    const ids = [...touched.entries()].sort((a, b) => b[1].getTime() - a[1].getTime()).slice(0, MAX_CARDS).map(([id]) => id);
    const rows = ids.length
      ? await db.user.findMany({
          where: { ...CARD_WHERE, id: { in: ids } },
          select: {
            id: true,
            cardNumber: true,
            name: true,
            role: true,
            statusStartedAt: true,
            archiveStatus: true,
            label: { select: { name: true, timeLimitDays: true } },
          },
        })
      : [];
    const cards = aggregateMeuDia(
      rows.map<MeuDiaCard>((u) => ({
        id: u.id,
        cardNumber: u.cardNumber,
        nome: u.name,
        coluna: columnName(u),
        diasNaColuna: u.statusStartedAt ? brDaysBetween(u.statusStartedAt) : null,
        prazoColunaDias: u.label?.timeLimitDays ?? null,
        arquivado: u.archiveStatus ?? null,
        ultimoToque: touched.get(u.id)!,
      })),
    );

    const pendencias: { cardNumber: number | null; resumo: string }[] = [];
    // Em paralelo (27/10): antes era um card por vez, 15 × 3 queries em série.
    const lidas = await Promise.all(cards.slice(0, MAX_PENDENCIAS).map(async (c) => ({ c, d: await pendenciasDoCard(c.id) })));
    for (const { c, d } of lidas) {
      const partes = [
        d.pastasVazias.length ? `${d.pastasVazias.length} pasta(s) vazia(s)` : "",
        d.checklistPendente.length ? `${d.checklistPendente.length} item(ns) do checklist` : "",
        d.camposVaziosProcuracao.length ? `cadastro: ${d.camposVaziosProcuracao.slice(0, 4).join(", ")}` : "",
        d.tagsDePendencia.length ? `tags: ${d.tagsDePendencia.join(", ")}` : "",
        d.senhaInssCadastrada ? "" : "sem senha do INSS",
      ].filter(Boolean);
      if (partes.length) pendencias.push({ cardNumber: c.cardNumber, resumo: partes.join(" · ") });
    }

    return {
      data: {
        operador: op.name,
        hoje: brDate(new Date()),
        janelaDias: args.dias,
        tarefas: mentions.map((m) => ({
          tarefaId: m.id,
          de: m.authorName,
          origem: m.source,
          setor: m.sectorName,
          compartilhada: !!m.groupId,
          texto: m.excerpt,
          onde: m.targetName,
          desde: brDate(m.createdAt),
        })),
        cards,
        parados: cards.filter((c) => c.parado).map((c) => c.cardNumber),
        pendencias,
        lotes: lotes.map((l) => ({ ...jobSummary(l), criadoEm: brDate(l.createdAt), dica: l.status === "concluido" || l.status === "falhou" ? "pronto: resultado_lote" : "rodando" })),
      },
      summary: `meu dia: ${mentions.length} tarefa(s), ${cards.length} card(s), ${cards.filter((c) => c.parado).length} parado(s)${lotes.length ? `, ${lotes.length} lote(s)` : ""}`,
      cardIds: cards.map((c) => c.id),
    };
  },
});
