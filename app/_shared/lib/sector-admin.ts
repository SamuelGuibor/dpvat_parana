import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { db } from "./prisma";

// Quem pode CRIAR / EDITAR / EXCLUIR setores e ATRIBUIR pessoas a eles.
//
// Controle por lista de IDs na env SECTOR_ADMIN_IDS (ids de usuário separados
// por vírgula). Enquanto a env estiver vazia, cai no fallback: quem tem role
// "ADMIN++" também pode gerir — assim a tela não fica travada no primeiro
// deploy, antes de você descobrir seu próprio ID (que aparece na UI de gestão).
//
// Ex.: SECTOR_ADMIN_IDS="clx123...,clx456..."

const FALLBACK_ROLES = ["ADMIN", "ADMIN++"];

export function sectorAdminIds(): string[] {
  return (process.env.SECTOR_ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** true se o usuário pode gerir setores (por ID na env ou por role de fallback). */
export async function isSectorAdmin(userId: string, role?: string | null): Promise<boolean> {
  const ids = sectorAdminIds();
  if (ids.includes(userId)) return true;

  // Sem lista configurada → libera para os roles de fallback.
  if (ids.length === 0) {
    const effectiveRole = role ?? (await db.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role;
    return !!effectiveRole && FALLBACK_ROLES.includes(effectiveRole);
  }
  return false;
}

/** Garante que o usuário logado pode gerir setores; senão lança. Retorna a sessão. */
export async function requireSectorAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");
  const ok = await isSectorAdmin(session.user.id, (session.user as { role?: string }).role);
  if (!ok) throw new Error("Você não tem permissão para gerir setores.");
  return session;
}
