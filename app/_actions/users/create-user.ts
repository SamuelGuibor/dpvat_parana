"use server";

import { assertCanWrite } from "@/app/_shared/lib/permissions-server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { hashPassword } from "../../_shared/lib/password";
import { requirePermission } from "../../_shared/lib/permissions-server";
import { isTeamRole } from "../../_shared/lib/permissions";
import { createUserRow } from "../../_shared/lib/cards/create";

interface CreateUserProps {
  name: string;
  cpf: string;
  password: string;
  email?: string;
  labelId?: string;
  role?: string;
  senha_inss?: string;
}

// Mesma lib da IA de operação (criar_card / preparar_membro_equipe):
// app/_shared/lib/cards/create.ts.
export const createUser = async ({ name, cpf, password, email, labelId, role, senha_inss }: CreateUserProps) => {
  await assertCanWrite();
  const isAdmin = isTeamRole(role);

  // Criar um MEMBRO DA EQUIPE (role ADMIN*) é gestão de equipe — só ADMIN++.
  // Criar card de cliente continua aberto a toda a equipe.
  if (isAdmin) await requirePermission("manage_team");

  const session = await getServerSession(authOptions);
  const user = await createUserRow({
    name,
    cpf,
    passwordHash: password ? await hashPassword(password) : null,
    email,
    labelId,
    role,
    senha_inss,
    author: { id: session?.user?.id ?? "", name: session?.user?.name ?? "Usuário" },
    // Sem sessão não há autor: o log de criação ficava de fora (comportamento antigo).
    logCreate: Boolean(session?.user?.id),
  });

  return { id: user.id, name: user.name, email: user.email, cpf: user.cpf, role: user.role, labelId: user.labelId, cardNumber: user.cardNumber };
};
