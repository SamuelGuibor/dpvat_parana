/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/app/_shared/lib/prisma";
import { gerarProcuracao } from "./gerarProcuracao";
import { buildProcuracaoData } from "./doc-fields";

type Tipo = "user" | "process";

function formatarData(data?: Date | null) {
    if (!data) return "";

    return data.toLocaleDateString("pt-BR");
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
