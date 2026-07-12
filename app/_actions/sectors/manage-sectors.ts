"use server";

import { db } from "@/app/_shared/lib/prisma";
import { requireSectorAdmin } from "@/app/_shared/lib/sector-admin";
import type { SectorDTO } from "./list-sectors";

/** Normaliza o nome em um slug para @menção: minúsculas, sem acento/espaço. */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function createSector(input: { name: string; color?: string }): Promise<SectorDTO> {
  await requireSectorAdmin();

  const name = input.name.trim();
  if (!name) throw new Error("Nome do setor é obrigatório.");
  if (name.length > 40) throw new Error("Nome muito longo (máx. 40).");

  const slug = slugify(name);
  if (!slug) throw new Error("Nome inválido.");

  const color = input.color && HEX.test(input.color) ? input.color : "#3b82f6";

  const exists = await db.sector.findFirst({
    where: { OR: [{ name }, { slug }] },
    select: { id: true },
  });
  if (exists) throw new Error("Já existe um setor com esse nome.");

  const last = await db.sector.findFirst({ orderBy: { order: "desc" }, select: { order: true } });

  const s = await db.sector.create({
    data: { name, slug, color, order: (last?.order ?? -1) + 1 },
    include: { _count: { select: { users: true } } },
  });
  return { id: s.id, name: s.name, slug: s.slug, color: s.color, order: s.order, memberCount: s._count.users };
}

export async function updateSector(input: { id: string; name?: string; color?: string }): Promise<SectorDTO> {
  await requireSectorAdmin();

  const data: { name?: string; slug?: string; color?: string } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Nome do setor é obrigatório.");
    if (name.length > 40) throw new Error("Nome muito longo (máx. 40).");
    const slug = slugify(name);
    if (!slug) throw new Error("Nome inválido.");
    const clash = await db.sector.findFirst({
      where: { OR: [{ name }, { slug }], NOT: { id: input.id } },
      select: { id: true },
    });
    if (clash) throw new Error("Já existe um setor com esse nome.");
    data.name = name;
    data.slug = slug;
  }

  if (input.color !== undefined) {
    if (!HEX.test(input.color)) throw new Error("Cor inválida.");
    data.color = input.color;
  }

  const s = await db.sector.update({
    where: { id: input.id },
    data,
    include: { _count: { select: { users: true } } },
  });
  return { id: s.id, name: s.name, slug: s.slug, color: s.color, order: s.order, memberCount: s._count.users };
}

export async function deleteSector(id: string): Promise<{ ok: true }> {
  await requireSectorAdmin();
  // onDelete: SetNull no schema desassocia os usuários automaticamente.
  await db.sector.delete({ where: { id } });
  return { ok: true };
}

/** Atribui (ou remove, com sectorId=null) o setor de um usuário. */
export async function assignUserSector(input: { userId: string; sectorId: string | null }): Promise<{ ok: true }> {
  await requireSectorAdmin();
  await db.user.update({
    where: { id: input.userId },
    data: { sectorId: input.sectorId },
  });
  return { ok: true };
}
