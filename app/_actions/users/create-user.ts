"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { createLog } from "../../_shared/lib/log";
import { hashPassword } from "../../_shared/lib/password";
import { requirePermission } from "../../_shared/lib/permissions-server";

interface CreateUserProps {
  name: string;
  cpf: string;
  password: string;
  email?: string;
  labelId?: string;
  role?: string;
  senha_inss?: string;
}

async function nextCardNumber(): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('card_number_seq') AS nextval`);
  return Number(rows[0].nextval);
}

export const createUser = async ({ name, cpf, password, email, labelId, role, senha_inss }: CreateUserProps) => {
  // CPF entra no banco SEM máscara (só dígitos) — a UI formata na exibição.
  cpf = (cpf ?? "").replace(/\D/g, "");
  const finalEmail = email?.trim() || `${cpf}@inserir-email.com`;

  const isAdmin = role === 'ADMIN' || role === 'ADMIN+' || role === 'ADMIN++';

  // Criar um MEMBRO DA EQUIPE (role ADMIN*) é gestão de equipe — só ADMIN++.
  // Criar card de cliente continua aberto a toda a equipe.
  if (isAdmin) await requirePermission("manage_team");

  const finalLabelId = isAdmin ? null : (
    labelId || (
      await db.label.findFirst({ orderBy: { order: "asc" }, select: { id: true } })
    )?.id
  );

  const cardNumber = await nextCardNumber();

  const user = await db.user.create({
    data: {
      name,
      email: finalEmail,
      cpf,
      password: password ? await hashPassword(password) : password,
      role,
      labelId: finalLabelId,
      senha_inss,
      cardNumber,
      // Card de cliente já nasce na primeira etapa do fluxo (INSS por padrão)
      // e com o timer da coluna rodando — antes ficava "Sem data" até a
      // primeira movimentação.
      ...(isAdmin ? {} : { service: "INSS", status: "INSS_S1", statusStartedAt: new Date() }),
    },
  });

  // Criação de card conta em "Criações" (só cards de cliente; membro da
  // equipe criado pelo Team não entra na métrica).
  if (!isAdmin) {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      await createLog({
        action: "create",
        message: `criou o card "${name}"`,
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
        userId: user.id,
        metadata: {
          cardName: name,
          cardNumber,
          service: user.service ?? null,
          status: user.status ?? null,
          column: role ?? null,
        },
      });
    }
  }

  return { id: user.id, name: user.name, email: user.email, cpf: user.cpf, role: user.role, labelId: user.labelId, cardNumber: user.cardNumber };
};
