import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST() {
  try {
    // manda email
    const { data } = await resend.emails.send({
      from: 'mucaguibor@gmail.com',
      to: 'mucaguibor@gmail.com',
      subject: 'Olá Mundo',
      html: '<strong>Funcionou!</strong>',
    });

    return Response.json(data);
  } catch (error) {
    return Response.json({ error });
  }
}
