import { gerarProcuracaoById } from "@/app/_shared/utils/gerarProcuracaoById";

const CONVERTER_URL = process.env.DOCX_CONVERTER_URL || "http://localhost:3001";
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

// 120s: a conversão DOCX→PDF no microserviço pode levar dezenas de segundos
// (LibreOffice frio) — o default da Vercel não dá garantia.
export const maxDuration = 120;

export async function POST(req: Request) {
    try {
        const { id, type, template } = await req.json();
        const docxBuffer = await gerarProcuracaoById(id, type, template);

        const response = await fetch(`${CONVERTER_URL}/convert`, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
                ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
            },
            body: Buffer.from(docxBuffer),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Converter error: ${response.status} - ${errorText}`);
        }

        const pdfBuffer = await response.arrayBuffer();

        return new Response(new Uint8Array(pdfBuffer), {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": 'attachment; filename="procuracao.pdf"',
            },
        });
    } catch (err) {
        console.error("[procuracao] ERRO:", err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
