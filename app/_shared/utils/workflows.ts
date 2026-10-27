// Workflows com retomada da IA de operação (Etapa 6) — puro, testado em
// tests/workflows.test.ts.
//
// Um fluxo longo (/prontuario, /procuracao, /pedido-prontuario, /contrato)
// guarda o progresso em op_requests.state do prompt que o iniciou (a
// "origem"). O estado diz só O QUE A IA JÁ FEZ, por ids/keys: o conteúdo
// (dados do cliente, texto do e-mail) continua no card, no rascunho
// (op-drafts/) e na aprovação (op_approvals) — retomar relê da fonte.
//
// Os passos ficam declarados aqui e as skills citam os mesmos ids. O modelo
// nunca escreve o JSON: a ferramenta salvar_progresso recebe passo/ref/
// bloqueio e o servidor monta, confere o ref e valida com o schema abaixo.

import { z } from "zod/v4";
import { brStartOfDay } from "./date-br";
import { DOC_FIELD_LABELS, type DraftKind } from "./doc-fields";

export const WORKFLOW_IDS = ["prontuario", "procuracao", "pedido_prontuario", "contrato"] as const;
export type WorkflowId = (typeof WORKFLOW_IDS)[number];

/**
 * Como cada passo se comporta ao retomar:
 * - reler: leitura barata (card, hospital, pendências) — sempre refeita, nunca "aproveitada".
 * - rascunho: PDF em op-drafts/ (ref = key) — vale enquanto o rascunho existir (7 dias).
 * - anexo: documentos no card (ref = ids de Document) — vale enquanto não forem para a lixeira.
 * - aprovacao: preparar_* de L4 (ref = approvalId) — NUNCA é aproveitada: só a executada conta.
 * - envio: executar_aprovado (ref = approvalId com status executada).
 * - registro: algo que já aconteceu no CRM (modo escolhido, tag, coluna, comentário).
 * - operador: passo fora do CRM confirmado pelo operador (ZapSign no navegador); sem ref.
 */
export type StepKind = "reler" | "rascunho" | "anexo" | "aprovacao" | "envio" | "registro" | "operador";

export interface WorkflowStep {
  id: string;
  rotulo: string;
  kind: StepKind;
  opcional?: boolean;
  /** Passos que precisam estar feitos (ou não se aplicar) antes deste. */
  requer?: string[];
  /** Só se aplica quando outro passo foi feito (e, com `ref`, com aquele valor). */
  quando?: { passo: string; ref?: string };
  /** kind rascunho: tipo do preparar_* aceito. */
  rascunho?: DraftKind;
  /** kind aprovacao/envio: ferramenta de preparo da aprovação. */
  aprovacao?: "preparar_email" | "preparar_whatsapp";
  /** kind registro: o que o servidor confere no ref. */
  confere?: "valor" | "tag" | "coluna" | "comentario";
  /** confere "valor": valores aceitos. */
  valores?: string[];
}

export interface WorkflowDef {
  id: WorkflowId;
  rotulo: string;
  skill: string;
  passos: WorkflowStep[];
}

const reler = (id: string, rotulo: string): WorkflowStep => ({ id, rotulo, kind: "reler" });

export const WORKFLOWS: Record<WorkflowId, WorkflowDef> = {
  prontuario: {
    id: "prontuario",
    rotulo: "pedido de prontuário",
    skill: "/prontuario",
    passos: [
      reler("card", "card"),
      reler("hospital", "procedimento do hospital"),
      reler("pendencias", "pendências do cadastro"),
      { id: "pedido", rotulo: "pedido de prontuário (rascunho)", kind: "rascunho", rascunho: "pedido_prontuario" },
      { id: "procuracao", rotulo: "procuração (rascunho)", kind: "rascunho", rascunho: "procuracao", opcional: true },
      { id: "anexar", rotulo: "anexar no card", kind: "anexo", opcional: true, requer: ["pedido"] },
      { id: "modo", rotulo: "canal do hospital", kind: "registro", confere: "valor", valores: ["email", "outro"], requer: ["pedido"] },
      { id: "preparar_email", rotulo: "e-mail preparado (código)", kind: "aprovacao", aprovacao: "preparar_email", requer: ["modo"], quando: { passo: "modo", ref: "email" } },
      { id: "enviar", rotulo: "e-mail enviado", kind: "envio", aprovacao: "preparar_email", requer: ["preparar_email"], quando: { passo: "modo", ref: "email" } },
      { id: "tag", rotulo: "tag de prontuário solicitado", kind: "registro", confere: "tag", opcional: true, requer: ["modo", "enviar"] },
      { id: "mover", rotulo: "mover para a coluna de espera", kind: "registro", confere: "coluna", opcional: true, requer: ["modo", "enviar"] },
    ],
  },
  procuracao: {
    id: "procuracao",
    rotulo: "procuração",
    skill: "/procuracao",
    passos: [
      reler("card", "card"),
      { id: "procuracao", rotulo: "procuração (rascunho)", kind: "rascunho", rascunho: "procuracao" },
      { id: "anexar", rotulo: "anexar no card", kind: "anexo", opcional: true, requer: ["procuracao"] },
    ],
  },
  pedido_prontuario: {
    id: "pedido_prontuario",
    rotulo: "pedido de prontuário (sem envio)",
    skill: "/pedido-prontuario",
    passos: [
      reler("card", "card"),
      reler("hospital", "procedimento do hospital"),
      { id: "pedido", rotulo: "pedido de prontuário (rascunho)", kind: "rascunho", rascunho: "pedido_prontuario" },
      { id: "anexar", rotulo: "anexar no card", kind: "anexo", opcional: true, requer: ["pedido"] },
    ],
  },
  contrato: {
    id: "contrato",
    rotulo: "contrato no ZapSign",
    skill: "/contrato",
    passos: [
      reler("card", "card"),
      { id: "contrato", rotulo: "KIT/contrato (rascunho)", kind: "rascunho", rascunho: "contrato" },
      { id: "anexar", rotulo: "anexar no card", kind: "anexo", opcional: true, requer: ["contrato"] },
      // Navegador do operador: nunca "feito" sozinho — só depois de ele confirmar no chat.
      { id: "zapsign", rotulo: "documento criado no ZapSign (confirmado pelo operador)", kind: "operador", requer: ["contrato"] },
      { id: "comentar", rotulo: "link comentado no card", kind: "registro", confere: "comentario", requer: ["zapsign"] },
      { id: "preparar_whatsapp", rotulo: "WhatsApp preparado (código)", kind: "aprovacao", aprovacao: "preparar_whatsapp", opcional: true, requer: ["comentar"] },
      { id: "enviar", rotulo: "WhatsApp enviado", kind: "envio", aprovacao: "preparar_whatsapp", requer: ["preparar_whatsapp"], quando: { passo: "preparar_whatsapp" } },
    ],
  },
};

/** Fluxo parado há mais que isso (dias de calendário em Brasília) = abandonado. */
export const WORKFLOW_STALE_DAYS = 14;
export const WORKFLOW_STATUS = ["em_andamento", "bloqueado", "concluido", "abandonado"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUS)[number];
export const BLOQUEIO_TIPOS = ["dado_faltante", "aguardando_operador", "erro_externo"] as const;

// O bloqueio não tem texto livre (o modelo poderia escrever nome/CPF ali, e o
// argumento também vai para op_tool_calls.args): só tipo + campos e código de
// listas fechadas. O texto para o operador é montado na saída.
export const BLOQUEIO_CODIGOS = [
  "conversor_indisponivel",
  "modelo_invalido",
  "rascunho_expirado",
  "sem_hospital",
  "sem_destinatario",
  "email_nao_configurado",
  "anexos_grandes",
  "anexo_invalido",
  "aprovacao_nao_digitada",
  "aprovacao_expirada",
  "envio_em_andamento",
  "card_sumiu",
  "ferramenta_desligada",
  "opt_out",
  "cooldown",
  "janela_fechada",
  "sem_opt_in",
  "linha_inativa",
  "contato_nao_confirmado",
  "templates_pausados",
  "template_nao_aprovado",
  "template_categoria",
  "template_nao_encontrado",
  "login_zapsign",
  "cadastro_incompleto",
  "erro_interno",
] as const;
export type BloqueioCodigo = (typeof BLOQUEIO_CODIGOS)[number];

const normCampo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const CAMPO_BY_TEXT = new Map<string, string>();
for (const [key, label] of Object.entries(DOC_FIELD_LABELS)) {
  CAMPO_BY_TEXT.set(normCampo(key), key);
  CAMPO_BY_TEXT.set(normCampo(label), key);
}

/** "estado civil" / "estado_civil" / "Estado Civil" → "estado_civil"; fora da lista → null. */
export function campoKey(text: string): string | null {
  return CAMPO_BY_TEXT.get(normCampo(text)) ?? null;
}

export function isBloqueioCodigo(code: string): code is BloqueioCodigo {
  return (BLOQUEIO_CODIGOS as readonly string[]).includes(code);
}

// ---------------------------------------------------------------------------
// Estado (v1) — só ids/keys, nunca dado pessoal
// ---------------------------------------------------------------------------

// Padrões óbvios de dado pessoal: o estado é recusado inteiro se aparecer um.
// (Key de rascunho tem timestamp de 13 dígitos: os limites (?<!\d)/(?!\d) não casam.)
const PII_PATTERNS: RegExp[] = [
  /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/, // CPF com máscara
  /(?<!\d)\d{11}(?!\d)/, // CPF ou celular só dígitos
  /[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i, // e-mail
  /\(?\b\d{2}\)?\s?9?\d{4}-\d{4}\b/, // telefone com máscara
];

export function containsPii(text: string): boolean {
  return PII_PATTERNS.some((re) => re.test(text));
}

// Ids gerados pelo CRM (key de rascunho, approvalId, cuid) não são texto: um
// hex aleatório pode ter 11 dígitos seguidos e não é CPF.
const ID_LIKE = [
  /^op-drafts\/[\w-]+\/\d{13}-[a-f0-9]{8}\.pdf$/,
  /^apr[a-f0-9]{10,40}$/,
  /^c[a-z0-9]{20,32}$/,
  // Document.id é uuid
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
];

export function isIdLike(ref: string): boolean {
  return ID_LIKE.some((re) => re.test(ref));
}

/** Textos do estado que não são id do CRM (onde dado pessoal poderia escapar). */
function freeTexts(s: { feitos: { refs?: string[]; modelo?: string }[] }): string[] {
  const out: string[] = [];
  for (const f of s.feitos) {
    for (const r of f.refs ?? []) if (!isIdLike(r)) out.push(r);
    if (f.modelo) out.push(f.modelo);
  }
  return out;
}

const refSchema = z.string().min(1).max(200).regex(/^[\w./:@-]+$|^[\p{L}\p{N} ._()/-]+$/u, "ref com caracteres inválidos");
const isoSchema = z.string().max(40);

const feitoSchema = z.object({
  passo: z.string().max(40),
  em: isoSchema,
  refs: z.array(refSchema).max(5).optional(),
  /** Rascunho: nome do modelo usado (vem do metadado do rascunho, não do modelo). */
  modelo: z.string().max(120).optional(),
});

const bloqueioSchema = z.object({
  passo: z.string().max(40),
  tipo: z.enum(BLOQUEIO_TIPOS),
  campos: z
    .array(z.string().refine((k) => Object.prototype.hasOwnProperty.call(DOC_FIELD_LABELS, k), "campo fora da lista"))
    .max(20)
    .optional(),
  codigo: z.enum(BLOQUEIO_CODIGOS).optional(),
  em: isoSchema,
});

export const workflowStateSchema = z
  .object({
    v: z.literal(1),
    workflow: z.enum(WORKFLOW_IDS),
    status: z.enum(WORKFLOW_STATUS),
    card: z.object({ id: z.string().min(5).max(64), cardNumber: z.number().int().nullable(), colunaId: z.string().max(64).nullable() }),
    /** Último passo salvo (null = ainda nenhum). */
    passo: z.string().max(40).nullable(),
    feitos: z.array(feitoSchema).max(30),
    bloqueio: bloqueioSchema.nullable(),
    criadoEm: isoSchema,
    atualizadoEm: isoSchema,
  })
  .refine((s) => freeTexts(s).every((t) => !containsPii(t)), {
    message: "o estado do fluxo não pode ter dado pessoal (CPF, telefone, e-mail)",
  });

export type WorkflowState = z.infer<typeof workflowStateSchema>;
export type WorkflowFeito = WorkflowState["feitos"][number];
export type WorkflowBloqueio = NonNullable<WorkflowState["bloqueio"]>;

/** Lê o Json do banco: inválido/versão desconhecida → null (a linha é ignorada). */
export function parseWorkflowState(raw: unknown): WorkflowState | null {
  const r = workflowStateSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function workflowDef(id: WorkflowId): WorkflowDef {
  return WORKFLOWS[id];
}

export function stepOf(def: WorkflowDef, passo: string): WorkflowStep | undefined {
  return def.passos.find((p) => p.id === passo);
}

export function newState(input: { workflow: WorkflowId; card: WorkflowState["card"]; agora: Date }): WorkflowState {
  const em = input.agora.toISOString();
  return {
    v: 1,
    workflow: input.workflow,
    status: "em_andamento",
    card: input.card,
    passo: null,
    feitos: [],
    bloqueio: null,
    criadoEm: em,
    atualizadoEm: em,
  };
}

function feitoDe(state: WorkflowState, passo: string): WorkflowFeito | undefined {
  return state.feitos.find((f) => f.passo === passo);
}

/** O passo se aplica a este fluxo (ex.: preparar_email só quando o canal é e-mail)? */
export function isApplicable(state: WorkflowState, step: WorkflowStep): boolean {
  if (!step.quando) return true;
  const f = feitoDe(state, step.quando.passo);
  if (!f) return false;
  return step.quando.ref === undefined || (f.refs ?? [])[0] === step.quando.ref;
}

export type StepCheck = { ok: true; step: WorkflowStep } | { ok: false; motivo: string };

/** Pode salvar este passo agora? (existe no workflow, se aplica, pré-requisitos feitos). */
export function checkStep(state: WorkflowState, passo: string): StepCheck {
  const def = workflowDef(state.workflow);
  const step = stepOf(def, passo);
  if (!step) {
    return { ok: false, motivo: `"${passo}" não é passo de ${def.skill}. Passos: ${def.passos.map((p) => p.id).join(", ")}.` };
  }
  if (!isApplicable(state, step)) {
    return { ok: false, motivo: `"${passo}" não se aplica a este fluxo (depende de "${step.quando!.passo}"${step.quando!.ref ? ` = ${step.quando!.ref}` : ""}).` };
  }
  for (const req of step.requer ?? []) {
    const reqStep = stepOf(def, req);
    if (!reqStep) continue;
    if (!feitoDe(state, req) && isApplicable(state, reqStep)) {
      return { ok: false, motivo: `"${passo}" vem depois de "${req}", que ainda não foi salvo neste fluxo.` };
    }
  }
  if (step.kind === "aprovacao") {
    const envio = def.passos.find((p) => p.kind === "envio" && p.requer?.includes(step.id));
    if (envio && feitoDe(state, envio.id)) {
      return { ok: false, motivo: `O envio deste fluxo já foi feito: "${passo}" não pode ser preparado de novo aqui.` };
    }
  }
  return { ok: true, step };
}

/** Próximo passo aplicável, depois de `depoisDe` (padrão: o último salvo), ainda não feito. */
export function nextStep(state: WorkflowState, depoisDe: string | null = state.passo): WorkflowStep | null {
  const def = workflowDef(state.workflow);
  const from = depoisDe ? def.passos.findIndex((p) => p.id === depoisDe) : -1;
  for (const step of def.passos.slice(from + 1)) {
    if (!isApplicable(state, step)) continue;
    if (feitoDe(state, step.id)) continue;
    return step;
  }
  return null;
}

/** Onde o fluxo está agora: o passo bloqueado (se parou) ou o próximo a fazer. */
export function currentStep(state: WorkflowState): WorkflowStep | null {
  if (!isOpen(state)) return null;
  if (state.bloqueio) {
    const b = stepOf(workflowDef(state.workflow), state.bloqueio.passo);
    if (b) return b;
  }
  return nextStep(state);
}

/** Marca o passo como feito (idempotente: o mesmo passo substitui a entrada). Limpa o bloqueio. */
export function markDone(
  state: WorkflowState,
  passo: string,
  extra: { refs?: string[]; modelo?: string; agora: Date },
): WorkflowState {
  const em = extra.agora.toISOString();
  const entry: WorkflowFeito = { passo, em, ...(extra.refs?.length ? { refs: extra.refs } : {}), ...(extra.modelo ? { modelo: extra.modelo } : {}) };
  const feitos = feitoDe(state, passo) ? state.feitos.map((f) => (f.passo === passo ? entry : f)) : [...state.feitos, entry];
  const next: WorkflowState = { ...state, feitos, passo, bloqueio: null, status: "em_andamento", atualizadoEm: em };
  return nextStep(next) ? next : { ...next, status: "concluido" };
}

/** Registra que o fluxo parou no passo (o passo NÃO conta como feito; o que já foi feito fica). */
export function block(state: WorkflowState, bloqueio: Omit<WorkflowBloqueio, "em">, agora: Date): WorkflowState {
  const em = agora.toISOString();
  return { ...state, status: "bloqueado", bloqueio: { ...bloqueio, em }, atualizadoEm: em };
}

export function finish(state: WorkflowState, status: "concluido" | "abandonado", agora: Date): WorkflowState {
  return { ...state, status, atualizadoEm: agora.toISOString() };
}

export function isOpen(state: WorkflowState): boolean {
  return state.status === "em_andamento" || state.status === "bloqueado";
}

/** Parado há mais de 14 dias (Brasília) desde o último progresso. */
export function isStale(state: WorkflowState, agora: Date = new Date()): boolean {
  const last = new Date(state.atualizadoEm);
  if (Number.isNaN(last.getTime())) return true;
  const days = Math.round((brStartOfDay(agora).getTime() - brStartOfDay(last).getTime()) / 86_400_000);
  return days > WORKFLOW_STALE_DAYS;
}

// ---------------------------------------------------------------------------
// Retomada
// ---------------------------------------------------------------------------

export type ApprovalFact = "pendente" | "enviando" | "executada" | "falhou" | "expirada" | "cancelada" | "sumiu";

/** O que a lib releu da fonte antes de retomar. */
export interface ResumeFacts {
  /** key → "ok" | "vencido" (mais de 7 dias/apagado/inválido). Desde 27/10 (item K) o rascunho é do card: o de colega vale. */
  rascunhos: Record<string, "ok" | "vencido">;
  /** id de Document → "ok" | "apagado" (lixeira ou outro card). */
  documentos: Record<string, "ok" | "apagado">;
  /** approvalId → status atual (pendente de outra sessão já vem "cancelada"). */
  aprovacoes: Record<string, ApprovalFact>;
  /** Item J (27/10): pendente da MESMA sessão/operador ainda válida → o operador só digita o código. */
  aprovacoesPendentes?: Record<string, { codigo: string; expiraEm: string }>;
  /** Ferramenta de preparo (preparar_email/…) → aprovação executada depois do início do fluxo. */
  enviosExecutados?: Record<string, string>;
  /** Registros que deixaram de valer (tag tirada, card em outra coluna, comentário apagado). */
  registrosMudaram?: string[];
  card: { existe: boolean; arquivado: boolean; colunaMudou: boolean };
}

export interface ResumePlan {
  /** Passos já feitos que continuam valendo (com os refs para reaproveitar). */
  feitos: { passo: string; rotulo: string; refs?: string[]; modelo?: string }[];
  /** Feitos que perderam a validade: refazer (do primeiro). */
  refazer: { passo: string; rotulo: string; motivo: string }[];
  /** Leituras que sempre são refeitas antes de seguir. */
  reler: string[];
  proximo: { passo: string; rotulo: string; opcional: boolean } | null;
  avisos: string[];
  /** Algo impede seguir sem o operador conferir (envio em andamento, card sumiu). */
  parar: { codigo: BloqueioCodigo; motivo: string } | null;
  /** Item J: aprovação preparada que ainda vale — basta o operador digitar "aprovo <codigo>". */
  aprovacaoValida: { passo: string; approvalId: string; codigo: string; expiraEm: string } | null;
  /** Estado já sem os feitos que perderam a validade (o que a lib grava). */
  estado: WorkflowState;
}

/**
 * Decide o que reaproveitar e o que refazer. Regras: rascunho vale se existe
 * (ou se já foi anexado e o anexo continua no card); aprovação L4 vale só
 * executada (o envio está feito) ou, desde 27/10 (item J), pendente da MESMA
 * sessão e ainda no prazo (a lib só a lista em aprovacoesPendentes nesse
 * caso); "enviando" para tudo; leituras sempre de novo; registro vale salvo
 * se a lib disse que mudou.
 */
export function resumePlan(state: WorkflowState, fatos: ResumeFacts, agora: Date = new Date()): ResumePlan {
  const def = workflowDef(state.workflow);
  const avisos: string[] = [];
  const refazer: ResumePlan["refazer"] = [];
  const validos = new Map<string, WorkflowFeito>();
  let parar: ResumePlan["parar"] = null;
  let aprovacaoValida: ResumePlan["aprovacaoValida"] = null;

  if (!fatos.card.existe) {
    parar = { codigo: "card_sumiu", motivo: "O card deste fluxo não existe mais (ou deixou de ser card). Não dá para retomar." };
  }
  if (fatos.card.arquivado) avisos.push("O card foi arquivado desde a pausa: confirme com o operador se segue.");
  if (fatos.card.colunaMudou) avisos.push("O card mudou de coluna desde a pausa (alguém mexeu pelo site): confira antes de seguir.");

  const anexoFeito = state.feitos.find((f) => stepOf(def, f.passo)?.kind === "anexo");
  const anexoOk = !!anexoFeito && (anexoFeito.refs ?? []).length > 0 && (anexoFeito.refs ?? []).every((id) => fatos.documentos[id] === "ok");

  for (const step of def.passos) {
    const f = feitoDe(state, step.id);
    if (!f) continue;
    // Leitura feita fica registrada, mas é sempre refeita (lista `reler`).
    if (step.kind === "reler") {
      validos.set(step.id, f);
      continue;
    }
    const ref = (f.refs ?? [])[0];
    switch (step.kind) {
      case "rascunho": {
        const st = ref ? fatos.rascunhos[ref] : "vencido";
        if (st === "ok") validos.set(step.id, f);
        else if (anexoOk) {
          validos.set(step.id, f);
          avisos.push(`O rascunho de "${step.rotulo}" venceu, mas o documento já está anexado no card: use o documento do card (listar_documentos) no lugar da key.`);
        } else {
          refazer.push({ passo: step.id, rotulo: step.rotulo, motivo: "o rascunho venceu (7 dias) ou foi apagado" });
        }
        break;
      }
      case "anexo":
        if (anexoOk) validos.set(step.id, f);
        else refazer.push({ passo: step.id, rotulo: step.rotulo, motivo: "o documento anexado foi para a lixeira ou saiu do card" });
        break;
      case "aprovacao": {
        const st = ref ? fatos.aprovacoes[ref] ?? "sumiu" : "sumiu";
        if (st === "executada") validos.set(step.id, f);
        else if (st === "enviando") {
          validos.set(step.id, f);
          parar ??= {
            codigo: "envio_em_andamento",
            motivo: "O envio deste fluxo começou e o resultado não foi confirmado. Confira no card/inbox se saiu ANTES de seguir; não prepare de novo.",
          };
        } else if (st === "pendente" && ref && fatos.aprovacoesPendentes?.[ref]) {
          const p = fatos.aprovacoesPendentes[ref];
          validos.set(step.id, f);
          aprovacaoValida = { passo: step.id, approvalId: ref, codigo: p.codigo, expiraEm: p.expiraEm };
          avisos.push(`"${step.rotulo}" ainda vale (mesma sessão, dentro dos 30 min): mostre a prévia de novo e peça para o operador digitar "aprovo ${p.codigo}"; não prepare de novo.`);
        } else {
          refazer.push({ passo: step.id, rotulo: step.rotulo, motivo: "aprovação de outra sessão (ou vencida) não se reaproveita: prepare de novo (código novo)" });
        }
        break;
      }
      case "envio": {
        const st = ref ? fatos.aprovacoes[ref] ?? "sumiu" : "sumiu";
        if (st === "executada") validos.set(step.id, f);
        else refazer.push({ passo: step.id, rotulo: step.rotulo, motivo: "o envio não consta como feito" });
        break;
      }
      case "registro":
      case "operador":
        if (fatos.registrosMudaram?.includes(step.id)) {
          avisos.push(`"${step.rotulo}" mudou desde a pausa (alguém mexeu pelo site).`);
        }
        validos.set(step.id, f);
        if (step.kind === "operador") avisos.push(`"${step.rotulo}" foi confirmado pelo operador, não pelo CRM: confira se está como ele disse.`);
        break;
    }
  }

  // Envio executado e o passo de envio não foi salvo (a conversa caiu logo
  // depois): o envio está feito — nunca repetir.
  for (const step of def.passos) {
    if (step.kind !== "envio" || validos.has(step.id)) continue;
    const prep = def.passos.find((p) => p.kind === "aprovacao" && step.requer?.includes(p.id));
    if (!prep) continue;
    const pf = validos.get(prep.id);
    const salvo = pf?.refs?.[0];
    const ref = salvo && fatos.aprovacoes[salvo] === "executada" ? salvo : step.aprovacao ? fatos.enviosExecutados?.[step.aprovacao] : undefined;
    if (ref) {
      const em = pf?.em ?? state.atualizadoEm;
      validos.set(prep.id, { passo: prep.id, em, refs: [ref] });
      validos.set(step.id, { passo: step.id, em, refs: [ref] });
      for (const id of [prep.id, step.id]) {
        const i = refazer.findIndex((r) => r.passo === id);
        if (i >= 0) refazer.splice(i, 1);
      }
      avisos.push("O e-mail/WhatsApp deste fluxo já foi enviado (aprovação executada): não envie de novo.");
    }
  }

  // Aprovação refeita invalida o envio que dependia dela.
  for (const r of [...refazer]) {
    const dependentes = def.passos.filter((p) => p.kind === "envio" && p.requer?.includes(r.passo));
    for (const d of dependentes) {
      if (validos.has(d.id)) validos.delete(d.id);
    }
  }

  const feitos = def.passos.filter((p) => validos.has(p.id)).map((p) => validos.get(p.id)!);
  const ordem = (id: string) => def.passos.findIndex((p) => p.id === id);
  const primeiroRefazer = refazer.length ? Math.min(...refazer.map((r) => ordem(r.passo))) : Infinity;
  const ultimoValido = feitos.filter((f) => stepOf(def, f.passo)?.kind !== "reler").reduce((m, f) => Math.max(m, ordem(f.passo)), -1);
  const ancora = Math.min(primeiroRefazer - 1, ultimoValido);
  const estado: WorkflowState = {
    ...state,
    feitos,
    passo: ancora >= 0 ? def.passos[ancora].id : null,
    status: parar ? "bloqueado" : state.status === "bloqueado" ? "bloqueado" : "em_andamento",
    bloqueio: parar
      ? { passo: def.passos[Math.max(0, ancora + 1)]?.id ?? def.passos[0].id, tipo: "aguardando_operador", codigo: parar.codigo, em: agora.toISOString() }
      : state.bloqueio,
  };

  let proximo: WorkflowStep | null = null;
  for (const step of def.passos) {
    if (step.kind === "reler" || !isApplicable(estado, step) || validos.has(step.id)) continue;
    const idx = ordem(step.id);
    if (idx >= primeiroRefazer || idx > ultimoValido) {
      proximo = step;
      break;
    }
  }

  return {
    feitos: feitos.map((f) => ({ passo: f.passo, rotulo: stepOf(def, f.passo)?.rotulo ?? f.passo, ...(f.refs ? { refs: f.refs } : {}), ...(f.modelo ? { modelo: f.modelo } : {}) })),
    refazer: refazer.sort((a, b) => ordem(a.passo) - ordem(b.passo)),
    reler: def.passos.filter((p) => p.kind === "reler").map((p) => p.id),
    proximo: parar ? null : proximo ? { passo: proximo.id, rotulo: proximo.rotulo, opcional: !!proximo.opcional } : null,
    avisos,
    aprovacaoValida,
    parar,
    estado,
  };
}
