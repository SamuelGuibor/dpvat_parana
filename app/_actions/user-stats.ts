// app/_actions/process-status.ts
import { db } from "@/app/_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { Status } from "@prisma/client"; // Import the Status enum from Prisma

export async function getProcessStatus(processId: string) {
    try {
        const process = await db.process.findUnique({
            where: { id: processId },
            select: {
                id: true,
                status: true,
                role: true,
                service: true,
                type: true,
            },
        });

        if (!process) {
            throw new Error("Processo não encontrado");
        }

        return {
            status: process.status || null,
            role: process.role || null,
            service: process.service || null,
            type: process.type || null,
        };
    } catch (error) {
        console.error("Erro ao buscar status do processo:", error);
        throw error;
    }
}

export async function updateProcessStatus(processId: string, newStatus: Status) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        throw new Error("Usuário não autenticado.");
    }

    try {
        // Optional: Validate that newStatus is a valid enum value
        const validStatuses = Object.values(Status);
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Status inválido: ${newStatus}`);
        }

        const updated = await db.process.update({
            where: {
                id: processId,
            },
            data: {
                status: newStatus, // Now typed as Status, so Prisma accepts it
            },
        });

        return { status: updated.status };
    } catch (error) {
        console.error("Erro ao atualizar status do processo:", error);
        throw error;
    }
}