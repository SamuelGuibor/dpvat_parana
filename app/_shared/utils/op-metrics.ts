// Métricas da Operação por IA (Etapa 7), puras e testáveis
// (tests/op-metrics.test.ts). A lib app/_shared/lib/op/metrics.ts lê op_* com
// select mínimo e corte de data; daqui sai o mesmo número para a tela do
// gestor (Espaço de Trabalho → IA de operação), para a ferramenta
// gerar_relatorio e para a skill /auditoria-operacao.
//
// Nada aqui recebe texto de prompt nem `args` de ferramenta/aprovação: a
// classificação usa só skill, nível das ferramentas e flags já calculadas no
// SQL (confirmar/noop). Corte de dia sempre em Brasília (date-br.ts).

import { brDayKey, brDayRangeToInstants, brStartOfDaysAgo } from "./date-br";
import { WORKFLOW_STALE_DAYS, isOpen, isStale, parseWorkflowState, type WorkflowState } from "./workflows";

/**
 * Skills de operação (prompt que começa com uma delas é pedido mesmo sem
 * ferramenta). As de desenvolvimento (/plano, /validar, /migration,
 * /mapa-atualizar) ficam de fora: o token do dono registra todo prompt dele
 * neste repositório, e o `cwd` das sessões é o mesmo para os dois usos.
 */
export const OP_SKILLS = [
  "cliente",
  "processo",
  "parados",
  "pendencias",
  "hospital",
  "conhecimento",
  "publicar-conhecimento",
  "meu-dia",
  "procuracao",
  "pedido-prontuario",
  "contrato",
  "prontuario",
  "retomar",
  "auditoria-operacao",
  "varredura",
  "meu-rendimento",
] as const;
const OP_SKILL_SET = new Set<string>(OP_SKILLS);

export const OP_PERIOD_MAX_DAYS = 90;
export const OP_PERIOD_DEFAULT_DAYS = 7;
/** Fluxo bloqueado há mais que isso entra na /varredura. */
export const OP_FLOW_BLOCKED_DAYS = 3;

/** Definição de cada número (a tela mostra; evita número enganoso). */
export const OP_METRIC_DEFINITIONS = {
  pedidos: "Prompt que chamou ao menos uma ferramenta do CRM ou começou com uma skill de operação (/cliente, /prontuario…).",
  consultas: "Pedido que só leu (ferramentas L1) — as dúvidas do dia a dia.",
  acoes: "Pedido que preparou documento (L2), mexeu no card (L3) ou preparou/enviou e-mail ou WhatsApp (L4).",
  // Decisões 19 e 23 do dono (26/10): prompt sem ferramenta nem skill de
  // operação (conversa/desenvolvimento) não aparece em número nenhum — e é
  // apagado em 1 h (purgeDevPrompts) —, e não há "tempo ativo" por intervalo
  // entre prompts: o operador pede o que quiser, quando quiser.
  latencia: "Soma do tempo que as ferramentas levaram para responder (o único tempo medido).",
  cardsConduzidos: "Cards em que a IA executou uma ação a pedido do operador (L3 confirmada que mudou algo, ou envio aprovado).",
  cardsTocados: "Cards só lidos (consultas, prévias, preparos), sem ação executada.",
  falhas: "Chamadas recusadas ou com erro, por código (sem_permissao, ferramenta_desligada, estado_mudou…).",
  aprovacoes: "E-mails/WhatsApps preparados (L4): executada = saiu; expirada = 30 min sem 'aprovo <código>'.",
  fluxos: `Fluxos longos com retomada (/prontuario & cia.) começados no período. Parado há mais de ${WORKFLOW_STALE_DAYS} dias conta como abandonado. A lista de parados inclui os abertos de antes do período.`,
} as const;

// ---------------------------------------------------------------------------
// Período (dias de Brasília)
// ---------------------------------------------------------------------------

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// `ms` é a meia-noite UTC de uma chave de calendário (não um instante do
// banco): ler os campos UTC devolve a mesma chave, sem fuso no meio.
function utcMsToKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Chaves "YYYY-MM-DD" de `de` até `ate`, inclusivo (calendário puro, sem fuso). */
export function dayKeysBetween(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let t = keyToUtcMs(de), end = keyToUtcMs(ate); t <= end; t += 86_400_000) out.push(utcMsToKey(t));
  return out;
}

/** Dias de calendário entre duas chaves (b − a). */
export function dayKeyDiff(a: string, b: string): number {
  return Math.round((keyToUtcMs(b) - keyToUtcMs(a)) / 86_400_000);
}

export interface OpPeriod {
  de: string;
  ate: string;
  dias: number;
  gte: Date;
  lt: Date;
}

export class OpPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpPeriodError";
  }
}

/**
 * Período em dias de Brasília: `de`/`ate` (inclusivos) ou os últimos `dias`
 * (hoje incluso; padrão 7). Teto de 90 dias. Inválido lança OpPeriodError.
 */
export function resolveOpPeriod(input: { dias?: number; de?: string; ate?: string }, agora: Date = new Date()): OpPeriod {
  let de: string;
  let ate: string;
  if (input.de || input.ate) {
    de = input.de ?? input.ate!;
    ate = input.ate ?? brDayKey(agora);
    if (!DAY_KEY_RE.test(de) || !DAY_KEY_RE.test(ate)) throw new OpPeriodError("Use datas no formato AAAA-MM-DD.");
    if (de > ate) throw new OpPeriodError("A data inicial é depois da final.");
  } else {
    const dias = Math.trunc(input.dias ?? OP_PERIOD_DEFAULT_DAYS);
    if (!(dias >= 1)) throw new OpPeriodError("Informe pelo menos 1 dia.");
    if (dias > OP_PERIOD_MAX_DAYS) throw new OpPeriodError(`O período vai até ${OP_PERIOD_MAX_DAYS} dias.`);
    ate = brDayKey(agora);
    de = brDayKey(brStartOfDaysAgo(dias - 1, agora));
  }
  const dias = dayKeyDiff(de, ate) + 1;
  if (dias > OP_PERIOD_MAX_DAYS) throw new OpPeriodError(`O período vai até ${OP_PERIOD_MAX_DAYS} dias.`);
  const { gte, lt } = brDayRangeToInstants(de, ate);
  return { de, ate, dias, gte, lt };
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

export type PromptClass = "conversa" | "consulta" | "acao";

export function isOpSkill(skill: string | null | undefined): boolean {
  return !!skill && OP_SKILL_SET.has(skill);
}

/** Classe do prompt pela skill e pelos níveis das ferramentas que ele chamou (sem ler o texto). */
export function classifyPrompt(p: { skill: string | null; levels: number[] }): PromptClass {
  if (p.levels.some((l) => l >= 2)) return "acao";
  if (p.levels.length > 0 || isOpSkill(p.skill)) return "consulta";
  return "conversa";
}

export type CallKind = "leitura" | "preparo" | "previa" | "execucao" | "noop" | "falha";

/**
 * O que a chamada foi: L3 sem `confirmar` é prévia; com `confirmar` e sem
 * `noop` é execução (mudou o card). L4: `preparar_*` é preparo (gravou a
 * aprovação), `executar_aprovado` ok é execução (saiu).
 */
export function callKind(c: { tool: string; level: number; ok: boolean; confirmed: boolean; noop: boolean }): CallKind {
  if (!c.ok) return "falha";
  if (c.level <= 1) return "leitura";
  if (c.level === 2) return "preparo";
  if (c.noop) return "noop";
  if (c.level === 4) return c.tool === "executar_aprovado" ? "execucao" : "preparo";
  return c.confirmed ? "execucao" : "previa";
}

/** Status efetivo da aprovação: pendente com prazo vencido = expirada. */
export function approvalStatus(a: { status: string; expiresAt: Date }, agora: Date = new Date()): string {
  return a.status === "pendente" && a.expiresAt.getTime() < agora.getTime() ? "expirada" : a.status;
}

// ---------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------

export interface MetricPrompt {
  id: string;
  operatorId: string;
  sessionId: string;
  skill: string | null;
  createdAt: Date;
}

export interface MetricCall {
  id: string;
  operatorId: string;
  requestId: string | null;
  sessionId: string | null;
  tool: string;
  level: number;
  ok: boolean;
  code: string | null;
  /** args.confirmar === true (calculado no SQL; args não sai do banco). */
  confirmed: boolean;
  /** summary começa com "noop" (calculado no SQL). */
  noop: boolean;
  cardIds: string[];
  durationMs: number;
  createdAt: Date;
}

export interface MetricApproval {
  id: string;
  operatorId: string;
  canal: string;
  status: string;
  cardId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface MetricFlow {
  /** op_workflows.id (fluxos copiados da Etapa 6 mantêm o id do prompt de origem). */
  id: string;
  operatorId: string;
  createdAt: Date;
  state: unknown;
}

export interface ApprovalCounts {
  preparadas: number;
  executadas: number;
  expiradas: number;
  falharam: number;
  canceladas: number;
  pendentes: number;
}

export interface OperatorStats {
  operatorId: string;
  pedidos: number;
  consultas: number;
  acoes: number;
  sessoes: number;
  latenciaMs: number;
  chamadas: number;
  falhas: number;
  cardsConduzidos: number;
  cardsTocados: number;
  aprovacoes: ApprovalCounts;
  fluxos: { abertos: number; concluidos: number; abandonados: number };
  porDia: { dia: string; pedidos: number; acoes: number; falhas: number }[];
}

export interface ToolStats {
  tool: string;
  level: number;
  total: number;
  ok: number;
  falhas: number;
  mediaMs: number;
  maxMs: number;
  previas: number;
  execucoes: number;
  noop: number;
}

export interface FailureGroup {
  tool: string;
  code: string;
  total: number;
  /** op_tool_calls.id de até 3 exemplos (mais recentes). */
  exemplos: string[];
  cardIds: string[];
  operadores: string[];
}

export interface FlowItem {
  requestId: string;
  operatorId: string;
  workflow: string;
  cardId: string;
  cardNumber: number | null;
  status: string;
  passo: string | null;
  bloqueio: { passo: string; tipo: string; campos?: string[]; codigo?: string } | null;
  diasParado: number;
}

export interface ConductedCard {
  cardId: string;
  operadores: string[];
  acoes: number;
  ferramentas: string[];
  ultimo: string;
}

export interface OpMetrics {
  periodo: { de: string; ate: string; dias: number };
  totais: Omit<OperatorStats, "operatorId">;
  operadores: OperatorStats[];
  ferramentas: ToolStats[];
  falhas: FailureGroup[];
  skills: { skill: string; total: number }[];
  /** Ferramentas de leitura mais chamadas nas consultas ("dúvidas frequentes"). */
  consultasFrequentes: { tool: string; total: number }[];
  aprovacoes: {
    porStatus: Record<string, number>;
    porCanal: Record<string, number>;
    lista: { id: string; operatorId: string; canal: string; status: string; cardId: string | null; criadaEm: string }[];
  };
  fluxos: {
    porStatus: Record<string, number>;
    porWorkflow: Record<string, number>;
    bloqueios: { motivo: string; total: number }[];
    parados: FlowItem[];
  };
  cards: { conduzidos: ConductedCard[]; tocadosSoLeitura: number };
}

const MAX_LIST = 100;

function emptyApprovals(): ApprovalCounts {
  return { preparadas: 0, executadas: 0, expiradas: 0, falharam: 0, canceladas: 0, pendentes: 0 };
}

function emptyStats(operatorId: string, dias: string[]): OperatorStats {
  return {
    operatorId,
    pedidos: 0,
    consultas: 0,
    acoes: 0,
    sessoes: 0,
    latenciaMs: 0,
    chamadas: 0,
    falhas: 0,
    cardsConduzidos: 0,
    cardsTocados: 0,
    aprovacoes: emptyApprovals(),
    fluxos: { abertos: 0, concluidos: 0, abandonados: 0 },
    porDia: dias.map((dia) => ({ dia, pedidos: 0, acoes: 0, falhas: 0 })),
  };
}

function bump(rec: Record<string, number>, key: string, n = 1) {
  rec[key] = (rec[key] ?? 0) + n;
}

function countApproval(c: ApprovalCounts, status: string) {
  c.preparadas++;
  if (status === "executada") c.executadas++;
  else if (status === "expirada") c.expiradas++;
  else if (status === "falhou") c.falharam++;
  else if (status === "cancelada") c.canceladas++;
  else if (status === "pendente" || status === "enviando") c.pendentes++;
}

/** Status efetivo do fluxo: aberto e parado há mais de 14 dias = abandonado (sem gravar). */
export function flowStatus(state: WorkflowState, agora: Date = new Date()): string {
  return isOpen(state) && isStale(state, agora) ? "abandonado" : state.status;
}

/** Motivo legível do bloqueio para agrupar: código, senão campos, senão tipo. */
export function bloqueioMotivo(b: NonNullable<WorkflowState["bloqueio"]>): string[] {
  if (b.codigo) return [`codigo:${b.codigo}`];
  if (b.campos?.length) return b.campos.map((c) => `campo:${c}`);
  return [`tipo:${b.tipo}`];
}

export function buildOpMetrics(input: {
  prompts: MetricPrompt[];
  calls: MetricCall[];
  approvals: MetricApproval[];
  flows: MetricFlow[];
  periodo: { de: string; ate: string };
  agora?: Date;
}): OpMetrics {
  const agora = input.agora ?? new Date();
  const dias = dayKeysBetween(input.periodo.de, input.periodo.ate);
  const dayIdx = new Map(dias.map((d, i) => [d, i]));
  const byOp = new Map<string, OperatorStats>();
  const stats = (id: string) => {
    let s = byOp.get(id);
    if (!s) byOp.set(id, (s = emptyStats(id, dias)));
    return s;
  };

  // Ferramentas por prompt → classe do prompt.
  const callsByRequest = new Map<string, MetricCall[]>();
  for (const c of input.calls) {
    if (!c.requestId) continue;
    const list = callsByRequest.get(c.requestId) ?? [];
    list.push(c);
    callsByRequest.set(c.requestId, list);
  }

  const skills: Record<string, number> = {};
  const consultaTools: Record<string, number> = {};
  const sessionsByOp = new Map<string, Set<string>>();
  for (const p of input.prompts) {
    const calls = callsByRequest.get(p.id) ?? [];
    const cls = classifyPrompt({ skill: p.skill, levels: calls.map((c) => c.level) });
    // Conversa/desenvolvimento não entra em número nenhum (decisão 19).
    if (cls === "conversa") continue;
    const s = stats(p.operatorId);
    s.pedidos++;
    if (cls === "acao") s.acoes++;
    else s.consultas++;
    const i = dayIdx.get(brDayKey(p.createdAt));
    if (i !== undefined) {
      s.porDia[i].pedidos++;
      if (cls === "acao") s.porDia[i].acoes++;
    }
    if (p.skill) bump(skills, isOpSkill(p.skill) ? p.skill : "(outra skill)");
    else bump(skills, "(sem skill)");
    if (cls === "consulta") for (const c of calls) if (c.level <= 1) bump(consultaTools, c.tool);
    const set = sessionsByOp.get(p.operatorId) ?? new Set<string>();
    set.add(p.sessionId);
    sessionsByOp.set(p.operatorId, set);
  }
  for (const [op, set] of sessionsByOp) stats(op).sessoes = set.size;

  // Ferramentas, falhas, cards.
  const tools = new Map<string, ToolStats & { msSum: number }>();
  const failures = new Map<string, FailureGroup & { last: number }>();
  const conducted = new Map<string, { ops: Set<string>; acoes: number; tools: Set<string>; last: number }>();
  const touched = new Map<string, Set<string>>(); // cardId → operadores (só leitura/prévia)
  const conductedByOp = new Map<string, Set<string>>();
  const sortedCalls = [...input.calls].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const c of sortedCalls) {
    const s = stats(c.operatorId);
    s.chamadas++;
    s.latenciaMs += c.durationMs;
    const kind = callKind(c);
    const t = tools.get(c.tool) ?? { tool: c.tool, level: c.level, total: 0, ok: 0, falhas: 0, mediaMs: 0, maxMs: 0, previas: 0, execucoes: 0, noop: 0, msSum: 0 };
    t.total++;
    t.msSum += c.durationMs;
    t.maxMs = Math.max(t.maxMs, c.durationMs);
    if (c.ok) t.ok++;
    if (kind === "falha") t.falhas++;
    if (kind === "previa") t.previas++;
    if (kind === "execucao") t.execucoes++;
    if (kind === "noop") t.noop++;
    tools.set(c.tool, t);

    if (kind === "falha") {
      s.falhas++;
      const i = dayIdx.get(brDayKey(c.createdAt));
      if (i !== undefined) s.porDia[i].falhas++;
      const key = `${c.tool}\u0000${c.code ?? "?"}`;
      const f = failures.get(key) ?? { tool: c.tool, code: c.code ?? "?", total: 0, exemplos: [], cardIds: [], operadores: [], last: 0 };
      f.total++;
      if (f.exemplos.length < 3) f.exemplos.push(c.id);
      for (const id of c.cardIds) if (f.cardIds.length < 3 && !f.cardIds.includes(id)) f.cardIds.push(id);
      if (!f.operadores.includes(c.operatorId)) f.operadores.push(c.operatorId);
      f.last = Math.max(f.last, c.createdAt.getTime());
      failures.set(key, f);
      continue;
    }
    if (kind === "execucao") {
      for (const id of c.cardIds) {
        const k = conducted.get(id) ?? { ops: new Set<string>(), acoes: 0, tools: new Set<string>(), last: 0 };
        k.ops.add(c.operatorId);
        k.acoes++;
        k.tools.add(c.tool);
        k.last = Math.max(k.last, c.createdAt.getTime());
        conducted.set(id, k);
        const mine = conductedByOp.get(c.operatorId) ?? new Set<string>();
        mine.add(id);
        conductedByOp.set(c.operatorId, mine);
      }
    } else {
      for (const id of c.cardIds) {
        const set = touched.get(id) ?? new Set<string>();
        set.add(c.operatorId);
        touched.set(id, set);
      }
    }
  }
  for (const [op, set] of conductedByOp) stats(op).cardsConduzidos = set.size;
  const touchedOnly = [...touched.keys()].filter((id) => !conducted.has(id));
  for (const id of touchedOnly) for (const op of touched.get(id)!) stats(op).cardsTocados++;

  // Aprovações (L4).
  const porStatus: Record<string, number> = {};
  const porCanal: Record<string, number> = {};
  const aprLista: OpMetrics["aprovacoes"]["lista"] = [];
  const sortedApprovals = [...input.approvals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const a of sortedApprovals) {
    const st = approvalStatus(a, agora);
    bump(porStatus, st);
    bump(porCanal, a.canal);
    countApproval(stats(a.operatorId).aprovacoes, st);
    if (aprLista.length < MAX_LIST) {
      aprLista.push({ id: a.id, operatorId: a.operatorId, canal: a.canal, status: st, cardId: a.cardId, criadaEm: a.createdAt.toISOString() });
    }
  }

  // Fluxos (Etapa 6).
  const flowStatusCount: Record<string, number> = {};
  const porWorkflow: Record<string, number> = {};
  const motivos: Record<string, number> = {};
  const parados: FlowItem[] = [];
  for (const f of input.flows) {
    const state = parseWorkflowState(f.state);
    if (!state) continue;
    const st = flowStatus(state, agora);
    // Fluxo começado antes do período (ainda aberto) entra só na lista de
    // parados: os contadores são do período.
    const day = brDayKey(f.createdAt);
    if (day >= input.periodo.de && day <= input.periodo.ate) {
      bump(flowStatusCount, st);
      bump(porWorkflow, state.workflow);
      const s = stats(f.operatorId);
      if (st === "concluido") s.fluxos.concluidos++;
      else if (st === "abandonado") s.fluxos.abandonados++;
      else s.fluxos.abertos++;
      if (state.bloqueio) for (const m of bloqueioMotivo(state.bloqueio)) bump(motivos, m);
    }
    if (st === "em_andamento" || st === "bloqueado") {
      parados.push({
        requestId: f.id,
        operatorId: f.operatorId,
        workflow: state.workflow,
        cardId: state.card.id,
        cardNumber: state.card.cardNumber,
        status: st,
        passo: state.passo,
        bloqueio: state.bloqueio
          ? {
              passo: state.bloqueio.passo,
              tipo: state.bloqueio.tipo,
              ...(state.bloqueio.campos?.length ? { campos: state.bloqueio.campos } : {}),
              ...(state.bloqueio.codigo ? { codigo: state.bloqueio.codigo } : {}),
            }
          : null,
        diasParado: Math.max(0, dayKeyDiff(brDayKey(new Date(state.atualizadoEm)), brDayKey(agora))),
      });
    }
  }
  parados.sort((a, b) => b.diasParado - a.diasParado);

  const operadores = [...byOp.values()].sort((a, b) => b.pedidos - a.pedidos || b.chamadas - a.chamadas);
  const totais = emptyStats("", dias);
  for (const s of operadores) {
    for (const k of ["pedidos", "consultas", "acoes", "sessoes", "latenciaMs", "chamadas", "falhas", "cardsTocados"] as const) {
      totais[k] += s[k];
    }
    for (const k of Object.keys(totais.aprovacoes) as (keyof ApprovalCounts)[]) totais.aprovacoes[k] += s.aprovacoes[k];
    for (const k of ["abertos", "concluidos", "abandonados"] as const) totais.fluxos[k] += s.fluxos[k];
    s.porDia.forEach((d, i) => {
      totais.porDia[i].pedidos += d.pedidos;
      totais.porDia[i].acoes += d.acoes;
      totais.porDia[i].falhas += d.falhas;
    });
  }
  totais.cardsConduzidos = conducted.size;
  totais.cardsTocados = touchedOnly.length;
  const totaisSemId: Omit<OperatorStats, "operatorId"> = { ...totais };
  delete (totaisSemId as Partial<OperatorStats>).operatorId;

  const sortDesc = (rec: Record<string, number>, key: string) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .map(([k, total]) => ({ [key]: k, total }));

  return {
    periodo: { de: input.periodo.de, ate: input.periodo.ate, dias: dias.length },
    totais: totaisSemId,
    operadores,
    ferramentas: [...tools.values()]
      .map(({ msSum, ...t }) => ({ ...t, mediaMs: t.total ? Math.round(msSum / t.total) : 0 }))
      .sort((a, b) => b.total - a.total),
    falhas: [...failures.values()]
      .sort((a, b) => b.total - a.total || b.last - a.last)
      .map((f) => ({ tool: f.tool, code: f.code, total: f.total, exemplos: f.exemplos, cardIds: f.cardIds, operadores: f.operadores })),
    skills: sortDesc(skills, "skill") as { skill: string; total: number }[],
    consultasFrequentes: sortDesc(consultaTools, "tool").slice(0, 15) as { tool: string; total: number }[],
    aprovacoes: { porStatus, porCanal, lista: aprLista },
    fluxos: { porStatus: flowStatusCount, porWorkflow, bloqueios: sortDesc(motivos, "motivo") as { motivo: string; total: number }[], parados: parados.slice(0, MAX_LIST) },
    cards: {
      conduzidos: [...conducted.entries()]
        .sort((a, b) => b[1].last - a[1].last)
        .slice(0, MAX_LIST)
        .map(([cardId, k]) => ({ cardId, operadores: [...k.ops], acoes: k.acoes, ferramentas: [...k.tools], ultimo: new Date(k.last).toISOString() })),
      tocadosSoLeitura: touchedOnly.length,
    },
  };
}
