// Criar card de cliente ou membro da equipe: um caminho só para o site
// (createUser, app/_actions/users/create-user.ts) e para a IA de operação
// (criar_card L3, preparar_membro_equipe L4 — decisão do dono de 30/10). Sem
// guarda e sem sessão: quem chama já decidiu a permissão e passa o autor.
//
// Card e membro são a MESMA tabela User: membro = role ADMIN*, sem coluna;
// card = labelId + role com o nome da coluna, nascendo em INSS_S1 com o timer
// rodando (antes ficava "Sem data" até a primeira movimentação).

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { createLog } from "../log";
import { isTeamRole } from "../permissions";
import { CardWriteError, sourceMeta, type WriteAuthor, type OpTrace, type WriteSource } from "./types";

export interface CreateUserRowInput {
  name: string;
  cpf: string;
  /** Já em hash (hashPassword). null = sem senha: a pessoa define pelo "esqueci minha senha". */
  passwordHash: string | null;
  email?: string | null;
  telefone?: string | null;
  /** Card: coluna. Ignorado para membro da equipe. */
  labelId?: string | null;
  /** Membro: ADMIN/ADMIN+/ADMIN++. Card: nome da coluna (o site manda; vazio = nome da coluna). */
  role?: string | null;
  senha_inss?: string | null;
  author: WriteAuthor;
  source?: WriteSource;
  op?: OpTrace | null;
  /** Log "create" no card (conta em "Criações"). O site só grava com sessão. */
  logCreate?: boolean;
}

async function nextCardNumber(): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('card_number_seq') AS nextval`);
  return Number(rows[0].nextval);
}

/** E-mail placeholder do cliente sem e-mail: User.email é @unique e chave das permissões. */
export function placeholderEmail(cpf: string): string {
  return `${cpf}@inserir-email.com`;
}

export async function createUserRow(input: CreateUserRowInput) {
  // CPF entra no banco SEM máscara (só dígitos) — a UI formata na exibição.
  const cpf = (input.cpf ?? "").replace(/\D/g, "");
  const isMember = isTeamRole(input.role ?? null);

  let labelId: string | null = null;
  let role = input.role ?? null;
  if (!isMember) {
    const label = input.labelId
      ? await db.label.findUnique({ where: { id: input.labelId }, select: { id: true, name: true } })
      : await db.label.findFirst({ orderBy: { order: "asc" }, select: { id: true, name: true } });
    if (input.labelId && !label) throw new CardWriteError("coluna_nao_encontrada", "Coluna não encontrada.");
    labelId = label?.id ?? null;
    // role do card é só cópia do nome da coluna.
    role = role || label?.name || null;
  }

  const cardNumber = await nextCardNumber();
  // Segundo card do mesmo CPF sem e-mail: o placeholder já existe (User.email
  // é @unique) e a criação falhava. Sufixo com o nº do card, mantendo o
  // "inserir-email" que as telas usam para saber que é placeholder.
  let email = input.email?.trim() || placeholderEmail(cpf);
  if (!input.email?.trim() && (await db.user.findUnique({ where: { email }, select: { id: true } }))) {
    email = `${cpf}-${cardNumber}@inserir-email.com`;
  }
  let user;
  try {
    user = await db.user.create({
      data: {
        name: input.name,
        email,
        cpf,
        password: input.passwordHash,
        ...(role ? { role } : {}),
        labelId,
        senha_inss: input.senha_inss ?? undefined,
        telefone: input.telefone ? input.telefone.replace(/\D/g, "") : undefined,
        cardNumber,
        ...(isMember ? {} : { service: "INSS", status: "INSS_S1", statusStartedAt: new Date() }),
      },
    });
  } catch (err) {
    // E-mail repetido (o placeholder do mesmo CPF inclusive): erro esperado.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && JSON.stringify(err.meta?.target ?? "").includes("email")) {
      throw new CardWriteError("email_em_uso", `Já existe cadastro com o e-mail ${email}.`);
    }
    throw err;
  }

  // Criação de card conta em "Criações" (só cards de cliente; membro da
  // equipe não entra na métrica).
  if (!isMember && input.logCreate !== false) {
    await createLog({
      action: "create",
      message: `criou o card "${input.name}"`,
      authorId: input.author.id,
      authorName: input.author.name,
      userId: user.id,
      metadata: {
        cardName: input.name,
        cardNumber,
        service: user.service ?? null,
        status: user.status ?? null,
        column: role ?? null,
        ...sourceMeta(input.source, input.op),
      },
    });
  }

  return user;
}
