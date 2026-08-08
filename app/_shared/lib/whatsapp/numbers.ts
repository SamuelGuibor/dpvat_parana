import { db } from "@/app/_shared/lib/prisma";
import { decryptSecret, encryptSecret } from "./crypto";

// Resolver de NÚMEROS da empresa (multi-tenant): traduz um numberId (ou o
// phone_number_id que chega no webhook) para as credenciais da Meta daquele
// número. Fallback total nas envs WHATSAPP_* — sem nenhuma linha em
// whatsapp_numbers o sistema se comporta exatamente como antes.
//
// Cache em memória por instância (60s): o webhook resolve credencial em TODA
// mensagem — sem cache seria uma query extra por webhook à toa.

export interface WaCreds {
  numberId: string | null; // null = número "env" (legado, sem linha no banco)
  phoneNumberId: string;
  token: string;
  wabaId: string;
  apiVersion: string;
  label: string;
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; rows: WaCreds[] } | null = null;

function envCreds(): WaCreds | null {
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  if (!token || !phoneNumberId) return null;
  return {
    numberId: null,
    phoneNumberId,
    token,
    wabaId: process.env.WHATSAPP_WABA_ID ?? "",
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
    label: "Número principal",
  };
}

async function loadAll(): Promise<WaCreds[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await db.whatsAppNumber.findMany({ where: { active: true } });
  const env = envCreds();
  const creds: WaCreds[] = [];
  for (const n of rows) {
    try {
      creds.push({
        numberId: n.id,
        phoneNumberId: n.phoneNumberId,
        token: decryptSecret(n.accessTokenEnc),
        wabaId: n.wabaId ?? "",
        apiVersion: n.apiVersion,
        label: n.label,
      });
    } catch (err) {
      // Chave de criptografia diferente da que salvou (ambiente local x Vercel
      // com WHATSAPP_CRED_KEY/NEXT_AUTH_SECRET distintos). Se é o número das
      // envs, o token das envs vale — segue funcionando; senão, avisa.
      if (env && env.phoneNumberId === n.phoneNumberId) {
        creds.push({ ...env, numberId: n.id, label: n.label, wabaId: n.wabaId ?? env.wabaId, apiVersion: n.apiVersion });
        console.warn(`[WA NUMBERS] Token do número ${n.label} indecifrável nesta instância (chave diferente) — usando o token das envs. Alinhe WHATSAPP_CRED_KEY entre os ambientes.`);
      } else {
        console.error(`[WA NUMBERS] Token indecifrável do número ${n.label} (${n.id}) — recadastre a credencial.`, err);
      }
    }
  }
  cache = { at: Date.now(), rows: creds };
  return creds;
}

export function invalidateNumberCache() {
  cache = null;
}

/**
 * Credenciais por id do NOSSO número (WhatsAppNumber.id). numberId null/ausente
 * → número default: a linha isDefault, senão a única linha ativa, senão as envs.
 */
export async function getCreds(numberId?: string | null): Promise<WaCreds | null> {
  const rows = await loadAll();
  if (numberId) {
    const hit = rows.find((r) => r.numberId === numberId);
    if (hit) return hit;
    // Linha desativada/removida: melhor avisar do que mandar pelo número errado.
    console.error(`[WA NUMBERS] numberId ${numberId} não encontrado/inativo — usando default.`);
  }
  return (await getDefaultCreds()) ?? null;
}

/** O número default (envio quando a conversa não tem numberId). */
export async function getDefaultCreds(): Promise<WaCreds | null> {
  const rows = await loadAll();
  const flagged = await db.whatsAppNumber.findFirst({ where: { isDefault: true, active: true }, select: { id: true } });
  if (flagged) {
    const hit = rows.find((r) => r.numberId === flagged.id);
    if (hit) return hit;
  }
  if (rows.length === 1) return rows[0];
  return envCreds();
}

/**
 * Resolve o número a partir do phone_number_id que a Meta manda no webhook
 * (value.metadata.phone_number_id). Se bater com as envs e ainda não existir
 * linha no banco, devolve o creds "env" (numberId null) — o sistema legado.
 */
export async function getCredsByPhoneNumberId(phoneNumberId: string): Promise<WaCreds | null> {
  if (!phoneNumberId) return getDefaultCreds();
  const rows = await loadAll();
  const hit = rows.find((r) => r.phoneNumberId === phoneNumberId);
  if (hit) return hit;
  const env = envCreds();
  if (env && env.phoneNumberId === phoneNumberId) return env;
  return null;
}

/**
 * Backfill do número original: cria a linha WhatsAppNumber a partir das envs
 * (token criptografado) e adota TODO o histórico sem numberId — contatos,
 * conversas, mensagens, rule events e templates — em UPDATEs por tabela
 * (WHERE numberId IS NULL, roda em segundos mesmo com tabelas grandes porque
 * é um único statement por tabela, sem varrer linha a linha no app).
 * Idempotente: rodar de novo só re-adota o que ficou nulo.
 */
export async function ensureDefaultNumber(): Promise<{ numberId: string; adopted: Record<string, number> } | { error: string }> {
  const env = envCreds();
  if (!env) return { error: "Envs WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configuradas." };

  let row = await db.whatsAppNumber.findUnique({ where: { phoneNumberId: env.phoneNumberId } });
  if (row) {
    // Linha criada por outro ambiente (chave de criptografia diferente)?
    // Re-criptografa com a chave DESTE ambiente — o import vira o "conserto".
    try {
      decryptSecret(row.accessTokenEnc);
    } catch {
      row = await db.whatsAppNumber.update({
        where: { id: row.id },
        data: { accessTokenEnc: encryptSecret(env.token) },
      });
      invalidateNumberCache();
      console.warn("[WA NUMBERS] Token do número principal re-criptografado com a chave deste ambiente.");
    }
  }
  if (!row) {
    row = await db.whatsAppNumber.create({
      data: {
        phoneNumberId: env.phoneNumberId,
        wabaId: env.wabaId || null,
        label: "Número principal",
        accessTokenEnc: encryptSecret(env.token),
        apiVersion: env.apiVersion,
        isDefault: true,
      },
    });
    invalidateNumberCache();
  }

  const id = row.id;
  const adopted: Record<string, number> = {};
  adopted.contacts = (await db.whatsAppContact.updateMany({ where: { numberId: null }, data: { numberId: id } })).count;
  adopted.conversations = (await db.whatsAppConversation.updateMany({ where: { numberId: null }, data: { numberId: id } })).count;
  adopted.messages = (await db.whatsAppMessage.updateMany({ where: { numberId: null }, data: { numberId: id } })).count;
  adopted.ruleEvents = (await db.whatsAppRuleEvent.updateMany({ where: { numberId: null }, data: { numberId: id } })).count;
  adopted.templates = (await db.whatsAppTemplate.updateMany({ where: { numberId: null }, data: { numberId: id } })).count;
  return { numberId: id, adopted };
}
