// Criação pela IA (decisão do dono de 30/10): card de cliente e ticket DEV.
// Mesmos núcleos do site — createUserRow (cards/create.ts) e criarTicketDev
// (cerebro-tickets.ts). Membro da equipe NÃO passa por aqui: é L4 com
// "aprovo <código>" (preparar_membro_equipe, op/membro.ts).

import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { cardIdsByCpf, cardIdsByPhone, columnName } from "../cards";
import { brDateTime } from "../resolve";
import { isValidCpf } from "@/app/_shared/utils/format";
import { createUserRow } from "../../cards/create";
import { TEAM_ROLES } from "../../permissions";
import { CardWriteError } from "../../cards/types";
import { CerebroError, criarTicketDev } from "../../cerebro-tickets";
import { MANUAL_TICKET_TYPES, shortTicketId } from "@/app/_shared/utils/cerebro";
import { operatorAuthor, resolveColumnExact, resolveSector } from "./_escrita";
import { loadColumnNames } from "./listar-colunas";

// Reenvio do mesmo pedido (o modelo repetindo a confirmação) não cria dois cards.
const NOOP_JANELA_MS = 10 * 60_000;

async function cardsParecidos(cpf: string, telefone: string | null) {
  const ids = new Set(await cardIdsByCpf(cpf));
  if (telefone) for (const id of await cardIdsByPhone(telefone)) ids.add(id);
  if (!ids.size) return [];
  const rows = await db.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, cardNumber: true, name: true, cpf: true, role: true, archiveStatus: true, createdAt: true, label: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  return rows.map((r) => ({
    id: r.id,
    cardNumber: r.cardNumber,
    nome: r.name,
    coluna: columnName(r),
    arquivado: r.archiveStatus,
    porCpf: (r.cpf ?? "").replace(/\D/g, "") === cpf,
    criadoEm: r.createdAt,
  }));
}

export const criarCard = defineTool({
  name: "criar_card",
  description:
    "ESCRITA. Cria UM card de cliente no kanban (nome + CPF válido; telefone, e-mail e coluna opcionais — sem coluna = primeira). O card nasce na etapa 1 do INSS, SEM senha da área do cliente. Se já existe card com o mesmo CPF ou telefone, exige confirmação: mostre os cards parecidos e pergunte. Chame com confirmar: true.",
  level: 3,
  permission: "op_write",
  schema: z.object({
    nome: z.string().min(3).max(160),
    cpf: z.string().min(11).max(18).describe("Com ou sem máscara."),
    telefone: z.string().min(10).max(20).optional().describe("Com DDD."),
    email: z.email().max(160).optional(),
    coluna: z.string().min(1).max(120).optional().describe("Nome EXATO da coluna."),
    ...confirmSchema,
  }),
  async run({ op, trace }, args) {
    const cpf = args.cpf.replace(/\D/g, "");
    if (!isValidCpf(cpf)) throw new OpToolError("argumentos_invalidos", `CPF inválido: ${args.cpf}.`, 400);
    const telefone = args.telefone ? args.telefone.replace(/\D/g, "") : null;
    if (telefone && (telefone.length < 10 || telefone.length > 13)) {
      throw new OpToolError("argumentos_invalidos", `Telefone inválido: ${args.telefone} (use DDD + número).`, 400);
    }
    const nome = args.nome.trim();
    const coluna = args.coluna ? await resolveColumnExact(args.coluna) : (await loadColumnNames())[0];
    if (!coluna) throw new OpToolError("coluna_nao_encontrada", "O kanban não tem colunas.", 404);

    const [parecidos, membroMesmoCpf] = await Promise.all([
      cardsParecidos(cpf, telefone),
      // CPF de alguém da equipe: o "Esqueci minha senha" (findAccountByCpf, LIMIT 1)
      // pode passar a cair no card em vez da conta da pessoa.
      db.user.findFirst({ where: { role: { in: [...TEAM_ROLES] }, cpf: { in: [cpf] } }, select: { name: true } }),
    ]);
    const repetido = parecidos.find(
      (p) => p.porCpf && p.nome?.trim().toLowerCase() === nome.toLowerCase() && Date.now() - p.criadoEm.getTime() < NOOP_JANELA_MS,
    );
    if (repetido) {
      return {
        data: { noop: true, mensagem: "Este card acabou de ser criado.", card: { cardNumber: repetido.cardNumber, nome: repetido.nome, coluna: repetido.coluna } },
        summary: `noop criar card ${repetido.cardNumber}`,
        cardIds: [repetido.id],
      };
    }

    const out = await previewOrExecute({
      tool: "criar_card",
      args,
      estado: { labelId: coluna.id, parecidos: parecidos.map((p) => p.id), membro: Boolean(membroMesmoCpf) },
      // Duplicado é o problema nº 1 da /varredura: com CPF/telefone já no CRM o
      // operador decide vendo os cards; sem nada parecido, cria direto.
      confirmacao: parecidos.length || membroMesmoCpf ? "exigida" : "direta",
      previa: {
        acao: "criar card de cliente",
        nome,
        cpf,
        ...(telefone ? { telefone } : {}),
        ...(args.email ? { email: args.email } : {}),
        coluna: coluna.nome,
        etapa: "INSS — etapa 1",
        parecidos: parecidos.map((p) => ({
          cardNumber: p.cardNumber,
          nome: p.nome,
          coluna: p.coluna,
          arquivado: p.arquivado,
          mesmo: p.porCpf ? "CPF" : "telefone",
          criadoEm: brDateTime(p.criadoEm),
        })),
        avisos: [
          ...(parecidos.length ? [`já existe(m) ${parecidos.length} card(s) com o mesmo CPF ou telefone — confira se não é o mesmo cliente`] : []),
          ...(membroMesmoCpf ? [`este CPF é de ${membroMesmoCpf.name ?? "alguém"} da equipe: o "Esqueci minha senha" dessa pessoa pode cair no card`] : []),
          "o card nasce sem senha da área do cliente (a equipe define no card, ou o cliente usa \"Esqueci minha senha\")",
        ],
      },
      execute: () =>
        createUserRow({
          name: nome,
          cpf,
          passwordHash: null,
          email: args.email,
          telefone,
          labelId: coluna.id,
          author: operatorAuthor(op),
          source: "op",
          op: trace,
        }).catch((err) => {
          if (err instanceof CardWriteError) throw new OpToolError(err.code === "email_em_uso" ? "email_em_uso" : "argumentos_invalidos", err.message, 409);
          throw err;
        }),
    });
    if (!out.executed) return { data: { previa: out.previa }, summary: `prévia criar card (${coluna.nome})` };
    const u = out.result;
    return {
      data: { feito: true, card: { cardNumber: u.cardNumber, nome: u.name, coluna: coluna.nome }, aviso: "Sem senha da área do cliente." },
      summary: `criou o card ${u.cardNumber} (${coluna.nome})`,
      cardIds: [u.id],
    };
  },
});

export const criarTicketDevTool = defineTool({
  name: "criar_ticket_dev",
  description:
    "ESCRITA. Abre um ticket para o DESENVOLVIMENTO no quadro (aba Tickets) em nome do operador: BUG (algo quebrado), ALTERACAO (mudar algo que existe), MELHORIA (ideia nova) ou OUTRO. Conhecimento (hospital, skill, bot) é criar_ticket. Exige confirmação: chame sem previa_hash, mostre a prévia, pergunte e repita com confirmar: true + previa_hash. Fotos só pelo site.",
  level: 3,
  permission: "op_use",
  schema: z.object({
    titulo: z.string().min(3).max(160),
    tipo: z.enum(MANUAL_TICKET_TYPES),
    descricao: z
      .string()
      .min(10)
      .max(6000)
      .describe("O que aconteceu / o que mudar, onde (tela, card nº, conversa) e o que era esperado — nas palavras do operador."),
    setor: z.string().max(60).optional().describe("Nome do setor."),
    ...confirmSchema,
  }),
  async run({ op }, args) {
    let sector: { id: string; name: string } | null = null;
    if (args.setor) {
      sector = await resolveSector(args.setor);
      if (!sector) throw new OpToolError("nao_encontrado", `Setor não encontrado: ${args.setor}`, 404);
    }
    const out = await previewOrExecute({
      tool: "criar_ticket_dev",
      args,
      estado: { sectorId: sector?.id ?? null },
      confirmacao: "exigida",
      previa: { acao: "abrir ticket DEV", titulo: args.titulo, tipo: args.tipo, descricao: args.descricao, ...(sector ? { setor: sector.name } : {}) },
      execute: () =>
        criarTicketDev(
          { title: args.titulo, description: args.descricao, type: args.tipo, sectorId: sector?.id ?? null },
          { id: op.userId, name: operatorAuthor(op).name },
        ).catch((err) => {
          if (err instanceof CerebroError) throw new OpToolError("argumentos_invalidos", err.message, 422);
          throw err;
        }),
    });
    if (!out.executed) return { data: { previa: out.previa }, summary: `prévia ticket DEV ${args.tipo}` };
    const id = shortTicketId(out.result.id, out.result.type);
    return { data: { feito: true, id, tipo: out.result.type, fase: out.result.status }, summary: `abriu ticket DEV ${id}` };
  },
});
