"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { requireTeam } from "@/app/_shared/lib/permissions-server";

export interface DuplicateHit {
  id: string;
  isProcess: boolean;
  name: string;
  cardNumber: number | null;
  archiveStatus: string | null;
  matchedBy: "cpf" | "telefone";
}

/**
 * Procura um cliente já cadastrado com o mesmo CPF (dígitos) ou telefone
 * (últimos 8 dígitos — mesma heurística do inbox WhatsApp). Usado como aviso
 * antes de criar um card novo, para evitar cliente duplicado com dois fluxos.
 */
export async function findDuplicateClient(input: {
  cpf?: string | null;
  telefone?: string | null;
}): Promise<DuplicateHit | null> {
  await requireTeam();

  const cpf = (input.cpf ?? "").replace(/\D/g, "");
  const phone8 = (input.telefone ?? "").replace(/\D/g, "").slice(-8);

  if (cpf.length === 11) {
    const users = await db.$queryRaw<
      { id: string; name: string | null; cardNumber: number | null; archiveStatus: string | null }[]
    >(Prisma.sql`
      SELECT id, name, "cardNumber", "archiveStatus" FROM "User"
      WHERE cpf IS NOT NULL
        AND role <> 'GHOST'
        AND role NOT LIKE 'ADMIN%'
        AND regexp_replace(cpf, '\\D', '', 'g') = ${cpf}
      LIMIT 1
    `);
    if (users.length) {
      const u = users[0];
      return {
        id: u.id,
        isProcess: false,
        name: u.name ?? "Sem nome",
        cardNumber: u.cardNumber,
        archiveStatus: u.archiveStatus,
        matchedBy: "cpf",
      };
    }
  }

  if (phone8.length === 8) {
    const users = await db.$queryRaw<
      { id: string; name: string | null; cardNumber: number | null; archiveStatus: string | null }[]
    >(Prisma.sql`
      SELECT id, name, "cardNumber", "archiveStatus" FROM "User"
      WHERE telefone IS NOT NULL
        AND role <> 'GHOST'
        AND role NOT LIKE 'ADMIN%'
        AND right(regexp_replace(telefone, '\\D', '', 'g'), 8) = ${phone8}
      LIMIT 1
    `);
    if (users.length) {
      const u = users[0];
      return {
        id: u.id,
        isProcess: false,
        name: u.name ?? "Sem nome",
        cardNumber: u.cardNumber,
        archiveStatus: u.archiveStatus,
        matchedBy: "telefone",
      };
    }
  }

  return null;
}
