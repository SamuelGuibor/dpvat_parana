'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requirePermission, requireTeam } from '@/app/_shared/lib/permissions-server';
import { encryptSecret } from '@/app/_shared/lib/whatsapp/crypto';
import { ensureDefaultNumber, invalidateNumberCache } from '@/app/_shared/lib/whatsapp/numbers';

// Cadastro de NÚMEROS da empresa (multi-tenant): a tela de Números do
// workspace cria/edita as credenciais da Meta por número. Token nunca volta
// pro client — só um sufixo mascarado. Gestão restrita ao ADMIN++
// (manage_team): API key é o segredo mais sensível do sistema.

export interface WaNumberDTO {
  id: string;
  label: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  apiVersion: string;
  active: boolean;
  isDefault: boolean;
  tokenHint: string; // "•••• abc4" — prova que tem token sem expor nada
  createdAt: string;
}

function toDTO(n: {
  id: string; label: string; phoneNumberId: string; wabaId: string | null;
  displayPhone: string | null; apiVersion: string; active: boolean;
  isDefault: boolean; accessTokenEnc: string; createdAt: Date;
}): WaNumberDTO {
  return {
    id: n.id, label: n.label, phoneNumberId: n.phoneNumberId, wabaId: n.wabaId,
    displayPhone: n.displayPhone, apiVersion: n.apiVersion, active: n.active,
    isDefault: n.isDefault,
    tokenHint: `••••${n.accessTokenEnc.slice(-4)}`,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Lista para a tela (equipe pode ver os rótulos; editar é só ADMIN++). */
export async function listWaNumbers(): Promise<WaNumberDTO[]> {
  await requireTeam();
  const rows = await db.whatsAppNumber.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toDTO);
}

/** Lista enxuta pros seletores (dashboard, inbox): só id + rótulo. */
export async function listWaNumberOptions(): Promise<{ id: string; label: string; displayPhone: string | null }[]> {
  await requireTeam();
  const rows = await db.whatsAppNumber.findMany({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, displayPhone: true },
  });
  return rows;
}

/**
 * Valida a credencial NA META antes de salvar: GET no phone_number_id com o
 * token informado. Se a Meta recusar, o cadastro nem acontece — evita salvar
 * um número que vai falhar silenciosamente no primeiro envio.
 */
async function verifyOnMeta(token: string, phoneNumberId: string, apiVersion: string): Promise<{ displayPhone: string | null; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { displayPhone: null, error: data?.error?.message ?? `Meta respondeu HTTP ${res.status} — confira token e phone_number_id.` };
    }
    return { displayPhone: data?.display_phone_number ?? null };
  } catch (err) {
    return { displayPhone: null, error: `Falha de rede ao validar na Meta: ${String(err)}` };
  }
}

export async function createWaNumber(input: {
  label: string;
  phoneNumberId: string;
  wabaId?: string;
  accessToken: string;
  apiVersion?: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('manage_team');
  const label = input.label.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  const token = input.accessToken.trim();
  const apiVersion = (input.apiVersion ?? 'v21.0').trim();
  if (!label || !phoneNumberId || !token) return { ok: false, error: 'Preencha rótulo, phone_number_id e token.' };

  const check = await verifyOnMeta(token, phoneNumberId, apiVersion);
  if (check.error) return { ok: false, error: check.error };

  const isFirst = (await db.whatsAppNumber.count()) === 0;
  try {
    await db.whatsAppNumber.create({
      data: {
        label,
        phoneNumberId,
        wabaId: input.wabaId?.trim() || null,
        displayPhone: check.displayPhone?.replace(/\D/g, '') || null,
        accessTokenEnc: encryptSecret(token),
        apiVersion,
        isDefault: isFirst,
      },
    });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('Unique constraint')) return { ok: false, error: 'Esse phone_number_id já está cadastrado.' };
    return { ok: false, error: 'Falha ao salvar o número.' };
  }
  invalidateNumberCache();
  return { ok: true };
}

export async function updateWaNumber(input: {
  id: string;
  label?: string;
  wabaId?: string;
  accessToken?: string; // vazio/ausente = mantém o atual
  apiVersion?: string;
  active?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('manage_team');
  const row = await db.whatsAppNumber.findUnique({ where: { id: input.id } });
  if (!row) return { ok: false, error: 'Número não encontrado.' };

  const token = input.accessToken?.trim();
  if (token) {
    const check = await verifyOnMeta(token, row.phoneNumberId, input.apiVersion ?? row.apiVersion);
    if (check.error) return { ok: false, error: check.error };
  }

  await db.whatsAppNumber.update({
    where: { id: input.id },
    data: {
      ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      ...(input.wabaId !== undefined ? { wabaId: input.wabaId.trim() || null } : {}),
      ...(token ? { accessTokenEnc: encryptSecret(token) } : {}),
      ...(input.apiVersion?.trim() ? { apiVersion: input.apiVersion.trim() } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  invalidateNumberCache();
  return { ok: true };
}

/** Marca o número default (fallback de envio sem numberId). */
export async function setDefaultWaNumber(id: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('manage_team');
  const row = await db.whatsAppNumber.findUnique({ where: { id }, select: { id: true, active: true } });
  if (!row?.active) return { ok: false, error: 'Número não encontrado ou inativo.' };
  await db.$transaction([
    db.whatsAppNumber.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    db.whatsAppNumber.update({ where: { id }, data: { isDefault: true } }),
  ]);
  invalidateNumberCache();
  return { ok: true };
}

/**
 * Importa o número das envs WHATSAPP_* como a primeira linha do cadastro e
 * ADOTA todo o histórico sem numberId (contatos, conversas, mensagens,
 * eventos, templates). Idempotente — rodar de novo só pega o que ficou nulo.
 */
export async function importEnvNumber(): Promise<{ ok: boolean; error?: string; adopted?: Record<string, number> }> {
  await requirePermission('manage_team');
  const result = await ensureDefaultNumber();
  if ('error' in result) return { ok: false, error: result.error };
  return { ok: true, adopted: result.adopted };
}
