/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from "@/app/_lib/prisma";
import { gerarProcuracao } from "./gerarProcuracao";

type Tipo = "user" | "process";

function formatarData(data?: Date | null) {
    if (!data) return "";

    return data.toLocaleDateString("pt-BR");
}

export async function gerarProcuracaoById(
    id: string,
    type: Tipo
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

    // Padroniza campos
    const dados = {
        name: data.name || "",
        cpf: data.cpf || "",
        rg: data.rg || "",
        nacionalidade: data.nacionalidade || "brasileiro(a)",
        estado_civil: data.estado_civil || "",
        profissao: data.profissao || "",
        rua: data.rua || "",
        bairro: data.bairro || "",
        numero: data.numero || "",
        cep: data.cep || "",
        cidade: data.cidade || "",
        estado: data.estado || "",
        data: formatarData(new Date()),
    };

    const buffer = await gerarProcuracao(dados);
    return buffer;

}
