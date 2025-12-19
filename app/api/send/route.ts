import { Resend } from 'resend';


export async function GET() {
    const resend = new Resend(process.env.RESEND_API_KEY);

    try {
        // manda email
        const { data } = await resend.emails.send({
            from: 'contato@segurosparana.com.br',
            to: 'mucaguibor@gmail.com',
            subject: 'Olá Mundo',
            html: '<strong>Funcionou! o nicolas é boiola</strong>',
        });

        return Response.json(data);
    } catch (error) {
        return Response.json({ error });
    }
}
