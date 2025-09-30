"use server"
import { db } from "../_lib/prisma";
export async function toggleFixed({ userId, isProcess }: { userId: string, isProcess: boolean }): Promise<{ userId: string; fixed?: boolean }> {
    if (isProcess) {
        const process = await db.process.findUnique({ where: { id: userId }, select: { fixed: true } });
        if (!process) throw new Error("Process not found");
        const updated = await db.process.update({
            where: { id: userId },
            data: { fixed: !process.fixed }, 
        });
        return { userId, fixed: updated.fixed ?? false };
    } else {
        const user = await db.user.findUnique({ where: { id: userId }, select: { fixed: true } });
        if (!user) throw new Error("User not found");
        const updated = await db.user.update({
            where: { id: userId },
            data: { fixed: !user.fixed }, 
        });
        return { userId, fixed: updated.fixed ?? false };
    }
}