"use server";

import { db } from "../_lib/prisma";

export async function getContacts() {
    const contacts = await db.contact.findMany({
        orderBy: {
            createdAt: "desc"
        }
    });

    return contacts;
}
