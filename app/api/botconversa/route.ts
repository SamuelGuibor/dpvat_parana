import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const body = req.body;

    console.log('📩 Recebi POST do BotConversa:', body);

    // Aqui você pode salvar, processar ou redirecionar os dados
    // Por exemplo: Enviar para outro endpoint:
    // await fetch('https://suaapi.com/registro', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(body),
    // });

    // return res.status(200).json({ ok: true });
  }

  // Testar com GET
  if (req.method === 'GET') {
    return res.status(200).json({ message: 'Webhook ativo 🚀' });
  }

  return res.status(405).json({ error: 'Método não permitido' });
}