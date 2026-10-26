/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/app/_shared/lib/prisma";
import { gerarProcuracao } from "./gerarProcuracao";
import { buildProcuracaoData } from "./doc-fields";
import { brDateBR } from "./date-br";

type Tipo = "user" | "process";

function formatarData(data?: Date | null) {
    if (!data) return "";

    // Data de Curitiba: a Vercel roda em UTC e, depois das 21h, o
    // toLocaleDateString saía com a data de amanhã (decisão do dono, 26/10).
    return brDateBR(data);
}

export async function gerarProcuracaoById(
    id: string,
    type: Tipo,
    template?: string
) {
    let data: any;

    // Busca conforme tipo
    if (type === "user") {
        data = await db.user.findUnique({
            where: { id },
        });
    }

    if (type === "process") {
        data = await db.process.findUnique({
            where: { id },
        });
    }

    if (!data) {
        throw new Error("Registro não encontrado");
    }

    // Padroniza campos (mapa compartilhado com a IA de operação, doc-fields.ts).
    const dados = buildProcuracaoData(data, formatarData(new Date()));

    const buffer = await gerarProcuracao(dados, template);
    return buffer;

}
