import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { TeachError, analyzeTeaching, applyTeaching } from "../../whatsapp/teach-brain-core";

// Frente "bot" do Cérebro APP (docs/ai-first/11-plano-cerebro-app.md): o mesmo
// núcleo do "Ensinar o cérebro" do Copiloto, sem conversa obrigatória. Só o
// PLAYBOOK (R1..Rn): instruções ficam como proposta no ticket e são publicadas
// pela aba Revisão da IA (decisão D4). Regra nova entra no FIM (não renumera:
// R# é reconstruído em renderPlaybook/flattenRules/getRuleMetrics).

function toOpError(err: unknown): never {
  if (err instanceof TeachError) {
    const status = err.code === "nao_encontrado" ? 404 : err.code === "playbook_mudou" ? 409 : err.code === "ia_indisponivel" ? 503 : 422;
    throw new OpToolError(err.code === "invalido" ? "argumentos_invalidos" : err.code, err.message, status);
  }
  throw err;
}

const author = (op: { userId: string; name: string | null; email: string }) => ({ id: op.userId, name: `${op.name ?? op.email} (via IA)` });

export const analisarRegraBot = defineTool({
  name: "analisar_regra_bot",
  description:
    "Cruza um pedido de mudança no comportamento do bot do WhatsApp com o playbook PUBLICADO (regras R1..Rn) e devolve: regras que já falam disso (igual/parecida/conflita), recomendação (reforçar R#, regra nova, já existe), texto proposto e a versão do playbook. Opcional: o contato da conversa que motivou o pedido. Custa IA por chamada. Não muda nada.",
  level: 1,
  permission: "teach_bot",
  switchable: true,
  schema: z.object({
    pedido: z.string().min(8).max(4000).describe("O que o bot deve fazer diferente, nas palavras do ticket/operador."),
    tipo: z.enum(["regra", "sugestao", "correcao"]).optional().describe("regra (padrão) · sugestao · correcao (o bot errou numa conversa)."),
    contato: z.string().max(40).optional().describe("Telefone do contato da conversa que motivou (opcional)."),
    ticket: z.string().max(40).optional().describe("Id curto do ticket (vai para o log)."),
  }),
  async run({ op }, args) {
    let contactId: string | null = null;
    if (args.contato) {
      const digits = args.contato.replace(/\D/g, "");
      const c = await db.whatsAppContact.findMany({ where: { phone: { endsWith: digits.slice(-10) } }, select: { id: true }, take: 2 });
      if (!c.length) throw new OpToolError("nao_encontrado", "Nenhuma conversa com esse telefone.", 404);
      if (c.length > 1) throw new OpToolError("ambiguo", "Esse telefone tem conversa nas duas linhas: analise sem o contato.", 409);
      contactId = c[0].id;
    }
    const r = await analyzeTeaching({
      contactId,
      request: args.pedido,
      kind: args.tipo ?? "regra",
      author: author(op),
      extra: { origem: "op", ...(args.ticket ? { ticket: args.ticket } : {}) },
    }).catch(toOpError);
    const a = r.analysis;
    return {
      data: {
        playbookVersao: r.playbookVersion,
        recomendacao: a.recommendation,
        regraAlvo: a.targetRuleId ?? null,
        textoProposto: a.proposedText,
        jaExiste: a.existing.map((e) => ({ id: e.id, relacao: e.relation, texto: e.text })),
        esperado: a.expected,
        diagnostico: a.diagnosis,
      },
      summary: `análise bot: ${a.recommendation}${a.targetRuleId ? ` ${a.targetRuleId}` : ""} (playbook v${r.playbookVersion ?? "?"})`,
    };
  },
});

export const aplicarRegraBot = defineTool({
  name: "aplicar_regra_bot",
  description:
    "ESCRITA. Publica no playbook do bot do WhatsApp: reforca (reescreve a regra R# indicada) ou nova (acrescenta no FIM, seção \"Regras do inbox\"). Vai ao ar em até 5 min para TODOS os números. Exige confirmação: chame sem previa_hash, mostre a prévia, pergunte e repita com confirmar: true + previa_hash. Recusa se o playbook mudou desde a análise (playbook_mudou: analise de novo).",
  level: 3,
  permission: "teach_bot",
  schema: z.object({
    modo: z.enum(["reforcar", "nova"]),
    texto: z.string().min(8).max(2000).describe("Texto final da regra (o textoProposto da análise, ajustado pelo operador)."),
    regra: z.string().regex(/^R\d{1,3}$/).optional().describe("Obrigatório em reforcar: a regra R# a reescrever."),
    playbookVersao: z.number().int().describe("Versão devolvida por analisar_regra_bot."),
    pedido: z.string().min(3).max(4000).describe("Pedido original (vai para o log)."),
    ticket: z.string().max(40).optional(),
    ...confirmSchema,
  }),
  async run({ op }, args) {
    if (args.modo === "reforcar" && !args.regra) throw new OpToolError("argumentos_invalidos", "Em reforcar, informe a regra (R#).", 400);
    const pb = await db.whatsAppPlaybook.findFirst({ where: { status: "publicado" }, orderBy: { version: "desc" }, select: { version: true } });
    if (!pb) throw new OpToolError("nao_encontrado", "Nenhum playbook publicado.", 404);
    if (pb.version !== args.playbookVersao) {
      throw new OpToolError("playbook_mudou", "O playbook mudou desde a análise. Rode analisar_regra_bot de novo.", 409);
    }
    const out = await previewOrExecute({
      tool: "aplicar_regra_bot",
      args,
      estado: { playbookVersao: pb.version },
      confirmacao: "exigida",
      previa: {
        acao: args.modo === "reforcar" ? `reescrever ${args.regra}` : "regra nova no fim do playbook",
        texto: args.texto,
        playbookVersao: pb.version,
        aviso: "Vai ao ar em até 5 min para todos os números do WhatsApp.",
      },
      execute: () =>
        applyTeaching({
          mode: args.modo,
          text: args.texto,
          request: args.pedido,
          targetRuleId: args.regra,
          playbookVersion: args.playbookVersao,
          author: author(op),
          extra: { origem: "op", ...(args.ticket ? { ticket: args.ticket } : {}) },
        }).catch(toOpError),
    });
    if (!out.executed) return { data: { previa: out.previa }, summary: `prévia regra bot ${args.modo}` };
    return {
      data: { feito: true, mensagem: out.result.message, regra: out.result.ruleId, playbookVersao: out.result.playbookVersion },
      summary: `bot: ${out.result.message}`,
    };
  },
});
