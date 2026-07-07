/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { db } from "../../_shared/lib/prisma";

export async function ContactUsers(prevState: any, formData: FormData) {
  try {

    if (formData.get('company')) {
      return { success: false, message: 'Spam detectado' };
    }

    const name = formData.get('name') as string;
    const number = formData.get('number') as string;
    
    const desc = formData.get('desc') as '';

    const urlRegex = /(https?:\/\/[^\s]+)/g;

    if (urlRegex.test(desc)) {
      return { success: false, message: 'Links não permitidos' };
    }

    await db.contact.create({
      data: {
        name,
        number,
        desc,
      },
    });

    console.log(name, number, desc)

    return { success: true, message: 'Enviado com sucesso' };
  } catch (error) {
    return { success: false, message: 'Ocorreu um erro ao enviar.' };
  }
}