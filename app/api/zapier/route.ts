// app/api/zapier/route.ts

/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(req: Request) {
  try {
    const data = await req.json();
    console.log("Payload recebido no /api/zapier:", data);

    const zapierWebhookUrl = "https://hooks.zapier.com/hooks/catch/15773180/u32anjp/";

    const response = await fetch(zapierWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error("Erro ao enviar para Zapier");

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("Erro ao enviar dados para o Zapier:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  }
}
