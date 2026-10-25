// Peças comuns das ferramentas de escrita (L3): autor "(via IA)", leitura do
// card para a prévia, resolução EXATA de coluna/tag/pessoa/setor (escrita
// nunca escolhe entre parecidos) e o que as automações da coluna de destino
// vão fazer.

import { db } from "../../prisma";
import { fetchAutomationsByLabel, type AutomationAction, type AutomationCondition } from "../../db/automations";
import { evalConditions, getVars, type CardData } from "../../automation-conditions";
import { brDateVars } from "@/app/_shared/utils/date-br";
import { TEAM_ROLES } from "../../permissions";
import type { OperatorContext } from "../auth";
import type { OpTrace, WriteAuthor } from "../../cards/types";
import { OpToolError } from "../registry";
import { matchColumn, normalizeColumnName, brDaysBetween } from "../resolve";
import { columnName, resolveOneCardId } from "../cards";
import { loadColumns } from "./listar-colunas";

/** Autor visível de toda escrita da IA (decisão do dono, 25/10). */
export function operatorAuthor(op: OperatorContext): WriteAuthor {
  return { id: op.userId, name: `${op.name ?? op.email} (via IA)` };
}

export function writeCommon(op: OperatorContext, trace: OpTrace, cardId: string) {
  return { cardId, isProcess: false, author: operatorAuthor(op), source: "op" as const, op: trace };
}

/** Estado do card que as prévias mostram e o hash amarra. */
export async function loadCardState(ref: string) {
  const id = await resolveOneCardId(ref);
  const u = await db.user.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      cardNumber: true,
      name: true,
      role: true,
      labelId: true,
      statusStartedAt: true,
      archiveStatus: true,
      label: { select: { name: true, timeLimitDays: true } },
      cardTags: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  return u;
}

export type CardState = Awaited<ReturnType<typeof loadCardState>>;

/** O que a skill mostra depois de escrever. */
export function cardSummary(u: CardState) {
  return {
    cardNumber: u.cardNumber,
    nome: u.name,
    coluna: columnName(u),
    diasNaColuna: u.statusStartedAt ? brDaysBetween(u.statusStartedAt) : null,
    prazoColunaDias: u.label?.timeLimitDays ?? null,
    tags: u.cardTags.map((t) => t.name),
    arquivado: u.archiveStatus ?? null,
  };
}

/** Coluna pelo nome EXATO (sem acento/caixa). Parecida, mesmo uma só → pergunta. */
export async function resolveColumnExact(query: string) {
  const cols = await loadColumns();
  const match = matchColumn(cols.map((c) => c.nome), query);
  if (match.exact !== null) return cols.find((c) => c.nome === match.exact)!;
  if (match.candidates.length > 0) {
    throw new OpToolError("coluna_ambigua", `"${query}" não é o nome exato de uma coluna. Qual destas?`, 409, match.candidates);
  }
  throw new OpToolError("coluna_nao_encontrada", `Nenhuma coluna chamada "${query}".`, 404, cols.map((c) => c.nome));
}

/** Tag pelo nome exato; parecidas → `ambiguo` com as opções. */
export async function resolveTagExact(query: string) {
  const tags = await db.cardTag.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const q = normalizeColumnName(query);
  const exact = tags.find((t) => normalizeColumnName(t.name) === q);
  if (exact) return exact;
  const similar = tags.filter((t) => q && normalizeColumnName(t.name).includes(q)).map((t) => t.name);
  if (similar.length) throw new OpToolError("ambiguo", `"${query}" não é o nome exato de uma tag. Qual destas?`, 409, similar);
  throw new OpToolError("nao_encontrado", `Nenhuma tag chamada "${query}".`, 404, tags.map((t) => t.name));
}

const norm = (s: string) => normalizeColumnName(s);

/** Membro da equipe pelo nome: igual (nome completo ou primeiro nome único) → ok; senão pergunta. */
export async function resolveTeamMember(query: string) {
  const team = await db.user.findMany({
    where: { role: { in: [...TEAM_ROLES] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const q = norm(query);
  const exact = team.filter((u) => u.name && norm(u.name) === q);
  if (exact.length === 1) return exact[0];
  const partial = team.filter((u) => u.name && ` ${norm(u.name)} `.includes(` ${q} `));
  if (exact.length === 0 && partial.length === 1 && q.length >= 3) {
    // "Isadora" casando com um único "Isadora Souza": a prévia mostra o nome
    // completo e o operador confirma antes de qualquer envio.
    return partial[0];
  }
  const options = (exact.length > 1 ? exact : partial).map((u) => u.name ?? u.email);
  if (options.length) throw new OpToolError("ambiguo", `"${query}" casa com mais de uma pessoa. Quem?`, 409, options);
  return null;
}

export async function resolveSector(query: string) {
  const sectors = await db.sector.findMany({ select: { id: true, name: true, slug: true } });
  const q = norm(query.replace(/^@/, ""));
  return sectors.find((s) => norm(s.slug) === q || norm(s.name) === q) ?? null;
}

/** Descrição curta de cada ação de automação, para a prévia. */
function describeAction(a: AutomationAction, vars: Record<string, string>, labelNames: Map<string, string>, tagNames: Map<string, string>) {
  const fill = (t: string) => t.replace(/\[\[(\w+)\]\]/g, (_, k) => vars[k] ?? "");
  switch (a.type) {
    case "whatsapp":
      return {
        tipo: "whatsapp",
        detalhe: a.waTemplateName
          ? `manda ao cliente o template "${a.waTemplateName}" (fora da janela de 24h) ou o texto: ${fill(a.waText ?? "").slice(0, 400)}`
          : `manda ao cliente: ${fill(a.waText ?? "").slice(0, 400)}`,
      };
    case "comment":
      return { tipo: "comment", detalhe: `comenta no card: ${fill(a.templateText ?? "").slice(0, 300)}` };
    case "file":
      return { tipo: "file", detalhe: `gera o documento ${a.templateFileName ?? ".docx"}` };
    case "move":
      return { tipo: "move", detalhe: `move o card de novo para "${labelNames.get(a.moveLabelId ?? "") ?? "?"}"` };
    case "add_tag":
      return { tipo: "add_tag", detalhe: `marca a tag "${tagNames.get(a.tagId ?? "") ?? "?"}"` };
    case "ai_audit":
      return { tipo: "ai_audit", detalhe: `roda a auditoria de documentos por IA (${a.auditType ?? "?"})` };
    case "sheets":
      return { tipo: "sheets", detalhe: "registra o card numa planilha do Google" };
    default:
      return { tipo: String(a.type), detalhe: "" };
  }
}

/**
 * Automações ativas da coluna de destino que vão rodar para ESTE card (as
 * condições são avaliadas com os dados atuais). Mesmo filtro do executor.
 */
export async function automationsPreview(labelId: string, cardId: string) {
  const automations = await fetchAutomationsByLabel(labelId);
  if (!automations.length) return { automacoes: [], mandaWhatsapp: false };
  const card = await db.user.findUnique({ where: { id: cardId } });
  if (!card) return { automacoes: [], mandaWhatsapp: false };
  const tagRows = await db.cardTag.findMany({ where: { users: { some: { id: cardId } } }, select: { name: true } });
  const cardData = card as unknown as CardData;
  const vars = { ...getVars(cardData), ...brDateVars() };
  const [labels, tags] = await Promise.all([
    db.label.findMany({ select: { id: true, name: true } }),
    db.cardTag.findMany({ select: { id: true, name: true } }),
  ]);
  const labelNames = new Map(labels.map((l) => [l.id, l.name]));
  const tagNames = new Map(tags.map((t) => [t.id, t.name]));

  const out: { nome: string; acoes: { tipo: string; detalhe: string }[] }[] = [];
  for (const auto of automations) {
    if (auto.cardType === "process") continue;
    const conds = (auto.conditions as unknown as AutomationCondition[]) ?? [];
    if (!evalConditions(conds, auto.conditionLogic, cardData, tagRows.map((t) => t.name))) continue;
    const actions = (auto.actions as unknown as AutomationAction[]) ?? [];
    out.push({ nome: auto.name, acoes: actions.map((a) => describeAction(a, vars, labelNames, tagNames)) });
    // Ação "move" é terminal: o executor não roda o que vem depois.
    if (actions.some((a) => a.type === "move")) break;
  }
  return { automacoes: out, mandaWhatsapp: out.some((a) => a.acoes.some((x) => x.tipo === "whatsapp")) };
}

/** Automações que têm a tag como condição (aviso na prévia de tag). */
export async function automationsUsingTag(tagName: string) {
  const all = await db.automation.findMany({
    where: { isActive: true },
    select: { name: true, conditions: true, triggerLabel: { select: { name: true } } },
  });
  return all
    .filter((a) =>
      ((a.conditions as unknown as AutomationCondition[]) ?? []).some(
        (c) => c.field === "tags" && JSON.stringify(c.value ?? "").toUpperCase().includes(tagName.toUpperCase()),
      ),
    )
    .map((a) => `${a.name} (coluna ${a.triggerLabel?.name ?? "?"})`)
    .slice(0, 20);
}
