// Membro da equipe pela IA (decisão do dono de 30/10). Dá acesso ao CRM
// inteiro, então segue o contrato do L4 como as ações irreversíveis:
// preparar grava a aprovação (op_approvals, canal "equipe"), o operador digita
// "aprovo <código>" e só então executar_aprovado cria. Exige manage_team (o
// mesmo do "Adicionar membro" da tela Equipe), conferido de novo no executar.
//
// A IA nunca escolhe nem vê senha: o membro nasce SEM senha e entra pelo
// "Esqueci minha senha" (código por e-mail/SMS). ADMIN++ só pelo site.

import { db } from "../prisma";
import { createLog } from "../log";
import { TEAM_ROLES } from "../permissions";
import { isValidCpf } from "@/app/_shared/utils/format";
import { createUserRow } from "../cards/create";
import { CardWriteError, sourceMeta, type OpTrace } from "../cards/types";
import { OpToolError } from "./registry";
import type { OperatorContext } from "./auth";
import { cardIdsByCpf } from "./cards";
import { operatorAuthor } from "./tools/_escrita";

export const CARGOS_MEMBRO = ["ADMIN", "ADMIN+"] as const;
export type CargoMembro = (typeof CARGOS_MEMBRO)[number];

export interface MembroApprovalArgs extends Record<string, unknown> {
  acao: "criar_membro";
  nome: string;
  email: string;
  cpf: string;
  telefone: string | null;
  cargo: CargoMembro;
}

async function conflitos(email: string, cpf: string) {
  const [porEmail, equipeMesmoCpf] = await Promise.all([
    // Caixa diferente também conflita: as allowlists comparam e-mail normalizado.
    db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } }),
    db.user.findFirst({
      where: { role: { in: [...TEAM_ROLES] }, cpf: { in: [cpf] } },
      select: { name: true },
    }),
  ]);
  return { emailEmUso: Boolean(porEmail), equipeMesmoCpf: equipeMesmoCpf?.name ?? null };
}

export async function prepareMembro(input: {
  op: OperatorContext;
  nome: string;
  email: string;
  cpf: string;
  telefone?: string;
  cargo: CargoMembro;
}): Promise<{ args: MembroApprovalArgs; previa: Record<string, unknown> }> {
  if (!input.op.permissions.manage_team) {
    throw new OpToolError("sem_permissao", "Criar membro da equipe exige a permissão de gerenciar a equipe.", 403);
  }
  const cpf = input.cpf.replace(/\D/g, "");
  if (!isValidCpf(cpf)) throw new OpToolError("argumentos_invalidos", `CPF inválido: ${input.cpf}.`, 400);
  const email = input.email.trim().toLowerCase();
  const telefone = input.telefone ? input.telefone.replace(/\D/g, "") : null;
  if (telefone && (telefone.length < 10 || telefone.length > 13)) {
    throw new OpToolError("argumentos_invalidos", `Telefone inválido: ${input.telefone} (use DDD + número).`, 400);
  }

  const c = await conflitos(email, cpf);
  if (c.emailEmUso) throw new OpToolError("email_em_uso", `Já existe cadastro com o e-mail ${email}.`, 409);
  if (c.equipeMesmoCpf) throw new OpToolError("ja_existe", `${c.equipeMesmoCpf} já é da equipe com este CPF.`, 409);
  const cardsDoCpf = await cardIdsByCpf(cpf, 2);

  const args: MembroApprovalArgs = { acao: "criar_membro", nome: input.nome.trim(), email, cpf, telefone, cargo: input.cargo };
  const previa = {
    canal: "equipe",
    acao: "CRIAR MEMBRO DA EQUIPE",
    nome: args.nome,
    email,
    cpf,
    telefone,
    cargo: args.cargo,
    avisos: [
      "dá acesso ao CRM com as permissões padrão do cargo (ajuste na tela Equipe)",
      "nasce SEM senha: a pessoa entra em /login → \"Esqueci minha senha\" e recebe o código por e-mail" + (telefone ? " ou SMS" : ""),
      // findAccountByCpf pega um cadastro qualquer do CPF (docs/ai/auth-permissoes.md).
      ...(cardsDoCpf.length ? ["este CPF também é de um card de cliente: o \"Esqueci minha senha\" pode cair no card — confira o primeiro acesso"] : []),
      "a IA de operação (token do app) é liberada à parte, em Equipe → Token do app",
    ],
  };
  return { args, previa };
}

/** E-mail ou CPF ocupado desde a preparação → prepare de novo. */
export async function precheckMembro(args: MembroApprovalArgs): Promise<void> {
  const c = await conflitos(args.email, args.cpf);
  if (c.emailEmUso || c.equipeMesmoCpf) {
    throw new OpToolError("hash_diferente", "E-mail ou CPF passou a ser usado por outro cadastro desde a preparação.", 409);
  }
}

/** Executa o aprovado; nunca lança (executeApproval registra o resultado). */
export async function runApprovedMembro(input: { args: MembroApprovalArgs; op: OperatorContext; trace: OpTrace }) {
  const { args, op, trace } = input;
  const author = operatorAuthor(op);
  try {
    const user = await createUserRow({
      name: args.nome,
      cpf: args.cpf,
      passwordHash: null,
      email: args.email,
      telefone: args.telefone,
      role: args.cargo,
      author,
      source: "op",
      op: trace,
    });
    // Membro não conta em "Criações": fica como update da equipe, como o token do app.
    await createLog({
      action: "update",
      message: `criou o membro da equipe "${args.nome}" (${args.cargo})`,
      authorId: author.id,
      authorName: author.name,
      userId: user.id,
      metadata: { stage: "team_member_create", cargo: args.cargo, ...sourceMeta("op", trace) },
    });
    return { sent: true, acao: args.acao, membro: { nome: user.name, email: user.email, cargo: user.role } };
  } catch (err) {
    console.error("[op] criar membro falhou:", err);
    return { sent: false, error: err instanceof CardWriteError || err instanceof Error ? err.message.slice(0, 200) : "falha" };
  }
}
