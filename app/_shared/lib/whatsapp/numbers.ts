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
  /** true = templates pausados neste número (custo); texto livre segue. */
  templatesPaused: boolean;
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
    templatesPaused: false,
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
        templatesPaused: n.templatesPaused,
      });
    } catch (err) {
      // Chave de criptografia diferente da que salvou (ambiente local x Vercel
      // com WHATSAPP_CRED_KEY/NEXT_AUTH_SECRET distintos). Se é o número das
      // envs, o token das envs vale — segue funcionando; senão, avisa.
      if (env && env.phoneNumberId === n.phoneNumberId) {
        creds.push({ ...env, numberId: n.id, label: n.label, wabaId: n.wabaId ?? env.wabaId, apiVersion: n.apiVersion, templatesPaused: n.templatesPaused });
        console.warn(`[WA NUMBERS] Token do número ${n.label} indecifrável nesta instância (chave diferente) — usando o token das envs. Alinhe WHATSAPP_CRED_KEY entre os ambientes.`);
      } else {
        console.error(`[WA NUMBERS] Token indecifrável do número ${n.label} (${n.id}) — recadastre a credencial.`, err);
      }
    }
  }
  cache = { at: Date.now(), rows: creds };
  return creds;
}

/** Todas as credenciais ativas (painel de custos: consumo por WABA). */
export async function listAllCreds(): Promise<WaCreds[]> {
  return loadAll();
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
    // Linha desativada/removida: NUNCA cai no default — o cliente receberia a
    // mensagem por uma linha com a qual nunca falou (ex.: 2323 desativado em
    // 18/09/2026 com 200 conversas em standby). Sem credencial = envio recusado.
    console.error(`[WA NUMBERS] numberId ${numberId} não encontrado/inativo — envio bloqueado.`);
    return null;
  }
  return (await getDefaultCreds()) ?? null;
}

/**
 * Números DESATIVADOS na tela Números: o histórico fica no inbox só para
 * consulta (somente leitura) — nada sai por eles nem pelos crons.
 */
export async function getInactiveNumberIds(): Promise<string[]> {
  const rows = await db.whatsAppNumber.findMany({ where: { active: false }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Fragmento de `where` de conversa que exclui as de número desativado. O OR
 * com null é proposital: `notIn` sozinho derruba as linhas legadas sem numberId.
 */
export async function activeNumberConversationWhere(): Promise<{ OR?: ({ numberId: null } | { numberId: { notIn: string[] } })[] }> {
  const ids = await getInactiveNumberIds();
  if (!ids.length) return {};
  return { OR: [{ numberId: null }, { numberId: { notIn: ids } }] };
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
