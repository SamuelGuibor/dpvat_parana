import { gerarProcuracaoById } from "@/app/_utils/gerarProcuracaoById";

export async function POST(req: Request) {
    const { id, type } = await req.json();

    const buffer = await gerarProcuracaoById(id, type);

    return new Response(
        new Uint8Array(buffer),
        {
            headers: {
                "Content-Type":
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

                "Content-Disposition":
                    'attachment; filename="procuracao.docx"',
            },
        }
    );

}
