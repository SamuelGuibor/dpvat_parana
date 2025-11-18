/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { db } from "../_lib/prisma";

export async function ContactUsers(prevState: any, formData: FormData) {
  try {
    const name = formData.get('name') as string;
    const number = formData.get('number') as string;
    const desc = formData.get('desc') as string | null;

    await db.contact.create({
      data: {
        name,
        number,
        desc,
      },
    });

    return { success: true, message: 'Enviado com sucesso' };
  } catch (error) {
    return { success: false, message: 'Ocorreu um erro ao enviar.' };
  }
}