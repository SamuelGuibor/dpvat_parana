// Etapa 6: workflows com retomada. `salvar_progresso` grava o passo feito (ou
// onde parou) em op_workflows (decisão 21, 26/10); nunca toca o card. O fluxo
// é do card: qualquer operador continua o de um colega (decisão 20). Nasce com interruptor DESLIGADO (switchable): desligada, as skills
// seguem sem retomada. `fluxos_abertos` e `retomar_fluxo` leem; o retomar só
// grava (tira o que venceu, cancela a aprovação pendente do próprio fluxo)
// com o interruptor ligado. Lib: app/_shared/lib/op/workflow.ts; passos:
// app/_shared/utils/workflows.ts.

import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { resolveOneCardId } from "../cards";
import { cardRefSchema } from "./obter-card";
import { brDateTime, brDaysBetween } from "../resolve";
import { getOpSwitches, isToolEnabled } from "../switches";
import { listOpenFlows, loadForResume, saveProgress } from "../workflow";
import { DOC_FIELD_LABELS } from "@/app/_shared/utils/doc-fields";
import {
  BLOQUEIO_CODIGOS,
  BLOQUEIO_TIPOS,
  WORKFLOW_IDS,
  WORKFLOW_STALE_DAYS,
  currentStep,
  stepOf,
  workflowDef,
  type WorkflowState,
  type WorkflowStep,
} from "@/app/_shared/utils/workflows";

const workflowSchema = z.enum(WORKFLOW_IDS).describe("prontuario | procuracao | pedido_prontuario | contrato");

/** id → nome da equipe, para "quem começou/quem continuou". */
async function teamNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = await db.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, email: true } });
  return new Map(rows.map((u) => [u.id, u.name ?? u.email]));
}

function stepOut(step: WorkflowStep | null) {
  return step ? { passo: step.id, rotulo: step.rotulo, opcional: !!step.opcional } : null;
}

function bloqueioOut(state: WorkflowState) {
  const b = state.bloqueio;
  if (!b) return null;
  const def = workflowDef(state.workflow);
  return {
    passo: b.passo,
    rotulo: stepOf(def, b.passo)?.rotulo ?? b.passo,
    tipo: b.tipo,
    ...(b.campos?.length ? { campos: b.campos.map((c) => DOC_FIELD_LABELS[c] ?? c) } : {}),
    ...(b.codigo ? { codigo: b.codigo } : {}),
    desde: brDateTime(b.em),
  };
}

function feitosOut(state: WorkflowState) {
  const def = workflowDef(state.workflow);
  return state.feitos.map((f) => ({ passo: f.passo, rotulo: stepOf(def, f.passo)?.rotulo ?? f.passo, em: brDateTime(f.em), ...(f.refs ? { refs: f.refs } : {}) }));
}

// ---------------------------------------------------------------------------
// salvar_progresso
// ---------------------------------------------------------------------------

const salvarSchema = z
  .object({
    workflow: workflowSchema,
    card: cardRefSchema,
    passo: z.string().min(2).max(40).optional().describe("Id do passo (ver a skill). Sem bloqueio = passo FEITO."),
    ref: z
      .union([z.string().min(1).max(200), z.array(z.string().min(1).max(200)).min(1).max(5)])
      .optional()
      .describe(
        "O que a ferramenta do passo devolveu: key op-drafts/… (rascunho), documento.id (anexar), approvalId (preparar_*/enviar), \"email\"|\"outro\" (modo), nome exato da tag/coluna, comentarioId. Nunca invente.",
      ),
    bloqueio: z
      .object({
        tipo: z.enum(BLOQUEIO_TIPOS),
        campos: z
          .array(z.string().min(1).max(60))
          .max(20)
          .optional()
          .describe("Campos faltando, como vieram em camposFaltando (ex.: \"data do acidente\", \"estado civil\"). Só os campos do cadastro entram; o resto é ignorado."),
        codigo: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/).optional().describe(`code da recusa que parou o fluxo: ${BLOQUEIO_CODIGOS.join(", ")}. Outro = ignorado.`),
      })
      .optional()
      .describe("O fluxo PAROU neste passo (o passo não conta como feito; o que já foi feito fica). Sem texto livre: o progresso nunca guarda nome, CPF, telefone ou e-mail."),
    fim: z.enum(["concluido", "abandonado"]).optional().describe("Encerra o fluxo: concluido (operador não quer os passos opcionais que faltam) ou abandonado (vai recomeçar)."),
  })
  .refine((a) => Boolean(a.passo) !== Boolean(a.fim), { message: "mande passo OU fim" })
  .refine((a) => !(a.fim && (a.ref || a.bloqueio)), { message: "fim não leva ref nem bloqueio" });

export const salvarProgresso = defineTool({
  name: "salvar_progresso",
  description:
    "REGISTRO. Guarda o progresso de um fluxo longo (/prontuario, /procuracao, /pedido-prontuario, /contrato) para retomar depois, em outra conversa ou outro dia. Chame DEPOIS de cada passo concluído, com o ref exato que a ferramenta devolveu; ao parar por dado faltante/erro, com bloqueio. Não mexe no card. Passo fora da ordem = passo_invalido; ref que não confere = ref_invalido.",
  level: 1,
  permission: "op_use",
  switchable: true,
  schema: salvarSchema,
  async run({ op, trace, previewOnly }, args) {
    const refs = args.ref === undefined ? [] : Array.isArray(args.ref) ? args.ref : [args.ref];
    const out = await saveProgress({
      op,
      trace,
      workflow: args.workflow,
      cardRef: args.card,
      passo: args.passo,
      refs,
      bloqueio: args.bloqueio,
      fim: args.fim,
      previewOnly,
    });
    const cardOut = { cardNumber: out.card.cardNumber, nome: out.card.name };
    const comecadoPor = "comecadoPor" in out && out.comecadoPor ? (await teamNames([out.comecadoPor])).get(out.comecadoPor) ?? null : null;
    if ("semRegistro" in out) {
      return {
        data: {
          salvo: false,
          semRegistro: true,
          aviso: `Progresso NÃO guardado: ${out.motivo}. Este fluxo não vai poder ser retomado — avise o operador uma vez e siga normalmente.`,
          card: cardOut,
        },
        summary: `sem registro (${args.workflow} ${out.card.cardNumber ?? "?"})`,
        cardIds: [out.card.id],
      };
    }
    const estado = out.estado;
    const data = {
      salvo: out.salvo,
      ...("previewOnly" in out ? { previewOnly: true, aviso: "modo de teste (script): nada foi gravado", estadoQueGravaria: estado } : { novo: out.novo }),
      fluxo: out.fluxo,
      ...(comecadoPor ? { comecadoPor, aviso: `Fluxo começado por ${comecadoPor}: você continuou de onde ficou.` } : {}),
      workflow: estado.workflow,
      card: cardOut,
      status: estado.status,
      bloqueio: bloqueioOut(estado),
      feitos: feitosOut(estado),
      proximo: stepOut(out.proximo),
      ...(estado.status === "bloqueado" ? { instrucao: "Diga ao operador o que falta e que, quando resolver, é só digitar /retomar." } : {}),
    };
    const what = args.fim ? `fim ${args.fim}` : args.bloqueio ? `bloqueado em ${args.passo}` : `${args.passo} feito`;
    return { data, summary: `${args.workflow} ${out.card.cardNumber ?? "?"}: ${what}${"previewOnly" in out ? " (prévia)" : ""}`, cardIds: [out.card.id] };
  },
});

// ---------------------------------------------------------------------------
// fluxos_abertos
// ---------------------------------------------------------------------------

export const fluxosAbertos = defineTool({
  name: "fluxos_abertos",
  description: `REGISTRO. Lista fluxos longos em andamento ou parados (últimos ${WORKFLOW_STALE_DAYS} dias): sem card = os que o operador começou ou continuou; com card = TODOS daquele card, de qualquer colega (o caso passa por vários operadores). Diz quem começou, quem mexeu por último, onde parou e por quê, próximo passo. É a primeira chamada da /retomar. Só lê.`,
  level: 1,
  permission: "op_use",
  schema: z.object({ card: cardRefSchema.optional().describe("Nº do card (ou CPF/nome): lista os fluxos dele de qualquer operador.") }),
  async run({ op }, args) {
    const agora = new Date();
    const filtro = args.card ? { cardId: await resolveOneCardId(args.card) } : { operatorId: op.userId };
    const { abertos, vencidos } = await listOpenFlows(filtro, agora);
    const ids = [...new Set(abertos.map((f) => f.state.card.id))];
    const [cards, nomes] = await Promise.all([
      ids.length ? db.user.findMany({ where: { id: { in: ids } }, select: { id: true, cardNumber: true, name: true } }) : Promise.resolve([]),
      teamNames(abertos.flatMap((f) => [f.startedById, f.lastOperatorId])),
    ]);
    const fluxos = abertos.slice(0, 20).map((f) => {
      const def = workflowDef(f.state.workflow);
      const c = cards.find((x) => x.id === f.state.card.id);
      const ultimo = f.state.passo ? stepOf(def, f.state.passo) : null;
      return {
        fluxo: f.id,
        workflow: f.state.workflow,
        rotulo: def.rotulo,
        skill: def.skill,
        card: { cardNumber: c?.cardNumber ?? f.state.card.cardNumber, nome: c?.name ?? null },
        status: f.state.status,
        comecadoPor: nomes.get(f.startedById) ?? f.startedById,
        ultimoOperador: nomes.get(f.lastOperatorId) ?? f.lastOperatorId,
        deColega: f.lastOperatorId !== op.userId,
        ultimoPasso: ultimo ? { passo: ultimo.id, rotulo: ultimo.rotulo } : null,
        bloqueio: bloqueioOut(f.state),
        proximo: stepOut(currentStep(f.state)),
        atualizado: brDateTime(f.state.atualizadoEm),
        diasParado: brDaysBetween(new Date(f.state.atualizadoEm), agora),
      };
    });
    return {
      data: {
        total: abertos.length,
        fluxos,
        ...(vencidos ? { aviso: `${vencidos} fluxo(s) parado(s) há mais de ${WORKFLOW_STALE_DAYS} dias não aparecem (considerados abandonados).` } : {}),
      },
      summary: `${abertos.length} fluxo(s) aberto(s)`,
      cardIds: ids.slice(0, 100),
    };
  },
});

// ---------------------------------------------------------------------------
// retomar_fluxo
// ---------------------------------------------------------------------------

const retomarSchema = z
  .object({
    fluxo: z.string().min(5).max(64).optional().describe("Id do fluxo (de fluxos_abertos)."),
    card: cardRefSchema.optional(),
    workflow: workflowSchema.optional(),
  })
  .refine((a) => Boolean(a.fluxo) || (Boolean(a.card) && Boolean(a.workflow)), { message: "mande fluxo, ou card + workflow" });

export const retomarFluxo = defineTool({
  name: "retomar_fluxo",
  description:
    "REGISTRO. Abre um fluxo parado (do operador ou de um colega — qualquer um da equipe continua o caso) e diz o que já foi feito e AINDA vale (rascunho existe, anexo no card, envio executado), o que refazer (rascunho vencido; aprovação NUNCA se reaproveita: prepara de novo com código novo), o que reler (card, hospital, pendências) e o próximo passo. Com card + workflow no início de uma skill: aberto: false = começar do zero.",
  level: 1,
  permission: "op_use",
  schema: retomarSchema,
  async run({ op, previewOnly }, args) {
    const write = !previewOnly && isToolEnabled(await getOpSwitches(), salvarProgresso);
    const out = await loadForResume({ op, fluxoId: args.fluxo, workflow: args.workflow, cardRef: args.card, write, cancelarPendentes: !previewOnly });
    if (!out.aberto) {
      return {
        data: { aberto: false, fluxo: out.fluxo, ...(out.status ? { status: out.status } : {}), motivo: out.motivo },
        summary: `retomar: sem fluxo aberto${out.status ? ` (${out.status})` : ""}`,
      };
    }
    const def = workflowDef(out.state.workflow);
    const p = out.plano;
    const nomes = await teamNames([out.comecadoPor, out.ultimoOperador]);
    const deColega = out.ultimoOperador !== op.userId;
    return {
      data: {
        aberto: true,
        fluxo: out.fluxo,
        workflow: out.state.workflow,
        rotulo: def.rotulo,
        skill: def.skill,
        card: { cardNumber: out.card?.cardNumber ?? out.state.card.cardNumber, nome: out.card?.name ?? null, arquivado: out.card?.archiveStatus ?? null },
        comecadoPor: nomes.get(out.comecadoPor) ?? out.comecadoPor,
        ultimoOperador: nomes.get(out.ultimoOperador) ?? out.ultimoOperador,
        ...(deColega ? { avisoColega: `Este fluxo estava com ${nomes.get(out.ultimoOperador) ?? "um colega"}. Ao seguir, você passa a ser quem continuou; rascunho e aprovação dele não valem para você (prepare de novo).` } : {}),
        parouEm: bloqueioOut(out.state),
        desde: brDateTime(out.state.atualizadoEm),
        jaFeito: p.feitos,
        refazer: p.refazer,
        reler: p.reler.map((id) => stepOf(def, id)?.rotulo ?? id),
        proximo: p.proximo,
        avisos: p.avisos,
        parar: p.parar,
        ...(write ? {} : { aviso: previewOnly ? "Modo de teste (script): nada foi gravado nem cancelado." : "Progresso desligado: o plano não foi gravado (a aprovação pendente do fluxo, se havia, foi cancelada)." }),
        instrucao: p.parar
          ? "PARE: mostre o motivo ao operador e não siga o fluxo até ele conferir."
          : `Mostre ao operador o que já foi feito e o que vai refazer. Releia ${p.reler.join(", ")} (sempre). Siga a skill ${def.skill} a partir do próximo passo; passo de escrita começa SEM confirmar (prévia) e envio sempre pede preparar de novo.`,
      },
      summary: `retomar ${out.state.workflow} ${out.card?.cardNumber ?? "?"}: próximo ${p.proximo?.passo ?? "—"}${p.refazer.length ? `, refazer ${p.refazer.map((r) => r.passo).join("/")}` : ""}`,
      cardIds: [out.state.card.id],
    };
  },
});
