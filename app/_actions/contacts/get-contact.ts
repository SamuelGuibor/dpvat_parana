"use server";

import { db } from "../../_shared/lib/prisma";

export async function getContacts() {
    const contacts = await db.contact.findMany({
        orderBy: {
            createdAt: "desc"
        },
        // Lista do formulário do site: os 500 mais recentes bastam (era a
        // tabela inteira, a cada 10s).
        take: 500,
    });

    return contacts;
}
