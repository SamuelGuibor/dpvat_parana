"use server";

// Contato do hospital (T-PMEYS, 09/11/2026): e-mail, telefone, modo e observação
// do pedido de prontuário, editados pela tela do card. Os campos moram no GHOST
// do hospital (User role GHOST, colunas hospital_*) desde 25/10 e já são lidos
// pela IA de operação (consultar_hospital, destino padrão do /prontuario) e pelas
// automações ([[hospital_email]], [[hospital_telefone]]). Até aqui só o script
// vault-hospitais-para-ghost.mjs gravava.

import { db } from "@/app/_shared/lib/prisma";
import { requirePermission, requireTeam } from "@/app/_shared/lib/permissions-server";
import { createLog } from "@/app/_shared/lib/log";
import { invalidateHospitalCache } from "@/app/_shared/lib/op/hospitais";
import { normalizeHospitalName, slugify } from "@/app/_shared/utils/vault";
import { isValidEmail, normalizeEmail } from "@/app/_shared/utils/email-mime";
import { AccessError } from "@/app/_shared/utils/route-guards";
import type { HospitalContactDTO, HospitalContactInput } from "./contact-types";

const HOSPITAL_PREFIX = "[HOSPITAL] ";

/** GHOST do hospital pelo nome normalizado (leitura fresca: o cache da IA tem 5 min). */
async function findGhost(hospital: string) {
  const key = normalizeHospitalName(hospital);
  if (!key) return null;
  const ghosts = await db.user.findMany({
    where: { role: "GHOST" },
    select: { id: true, name: true, hospital_email: true, hospital_telefone: true, hospital_modo: true, hospital_obs: true },
  });
  return ghosts.find((g) => normalizeHospitalName(g.name ?? "") === key) ?? null;
}

export async function getHospitalContact(hospital: string): Promise<HospitalContactDTO> {
  const ctx = await requireTeam();
  const nome = (hospital ?? "").trim();
  if (!nome) throw new Error("Informe o hospital.");
  const g = await findGhost(nome);
  return {
    hospital: nome,
    noCatalogo: !!g,
    email: g?.hospital_email ?? "",
    telefone: g?.hospital_telefone ?? "",
    modo: g?.hospital_modo ?? "",
    obs: g?.hospital_obs ?? "",
    podeEditar: !!ctx.permissions.create_hospitals && !ctx.permissions.read_only,
  };
}

export async function updateHospitalContact(hospital: string, input: HospitalContactInput): Promise<HospitalContactDTO> {
  const ctx = await requirePermission("create_hospitals");
  if (ctx.permissions.read_only) throw new AccessError("Seu acesso é somente de visualização.");
  const nome = (hospital ?? "").trim();
  if (!nome) throw new Error("Informe o hospital.");

  const email = input.email.trim() ? normalizeEmail(input.email) : "";
  if (email && !isValidEmail(email)) throw new Error("E-mail inválido.");
  const telefone = input.telefone.replace(/\D/g, "");
  if (telefone && (telefone.length < 10 || telefone.length > 13)) throw new Error("Telefone inválido: use DDD + número.");
  const modo = input.modo.trim().slice(0, 200);
  const obs = input.obs.trim().slice(0, 2000);
  const data = {
    hospital_email: email || null,
    hospital_telefone: telefone || null,
    hospital_modo: modo || null,
    hospital_obs: obs || null,
  };

  let g = await findGhost(nome);
  const antes = g
    ? { email: g.hospital_email, telefone: g.hospital_telefone, modo: g.hospital_modo, obs: g.hospital_obs }
    : null;
  if (g) {
    await db.user.update({ where: { id: g.id }, data });
  } else {
    // Hospital criado pelo campo do card ainda não tem GHOST no catálogo: cria
    // no mesmo formato do seed (consome um nº da sequência dos cards, como lá).
    const base = slugify(nome);
    // E-mail único: o primeiro livre entre ghost_hosp_<slug>, -2, -3… (exato,
    // não por prefixo: "hospital-a" não pode contar "hospital-ab").
    let email = `ghost_hosp_${base}@hospital.internal`;
    for (let n = 2; await db.user.findUnique({ where: { email }, select: { id: true } }); n++) {
      email = `ghost_hosp_${base}-${n}@hospital.internal`;
    }
    const rows = await db.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('card_number_seq') AS nextval`);
    try {
      g = await db.user.create({
        data: {
          name: `${HOSPITAL_PREFIX}${nome}`,
          email,
          // Usuário-fantasma não faz login: sem senha o authorize() nunca o aceita.
          password: null,
          role: "GHOST",
          hospital: nome,
          cardNumber: Number(rows[0].nextval),
          ...data,
        },
        select: { id: true, name: true, hospital_email: true, hospital_telefone: true, hospital_modo: true, hospital_obs: true },
      });
    } catch (err) {
      // Dois salvamentos ao mesmo tempo do mesmo hospital novo: o outro criou
      // primeiro (e-mail único). Grava nele.
      if ((err as { code?: string }).code !== "P2002") throw err;
      g = await findGhost(nome);
      if (!g) throw err;
      await db.user.update({ where: { id: g.id }, data });
    }
  }
  invalidateHospitalCache();

  await createLog({
    action: "update",
    message: `atualizou o contato do hospital ${nome}`,
    authorId: ctx.userId,
    authorName: ctx.name ?? "Equipe",
    userId: g.id,
    metadata: { stage: "hospital_contact", hospital: nome, antes, depois: { email: data.hospital_email, telefone: data.hospital_telefone, modo: data.hospital_modo, obs: data.hospital_obs } },
  });

  return { hospital: nome, noCatalogo: true, email, telefone, modo, obs, podeEditar: true };
}
