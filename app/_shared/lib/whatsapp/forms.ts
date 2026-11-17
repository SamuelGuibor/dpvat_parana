import { randomBytes } from "crypto";
import type { Prisma, WhatsAppFormVersion } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { getCreds, getDefaultCreds, type WaCreds } from "./numbers";
import { sendFlowMessage } from "./client";
import { isWindowOpen } from "./outbound";
import {
  readFlowJson, entryScreen, buildEntryData, validateFormMessage, describeFlowSendError,
  flowSentBody, isAdAutoForm, nextVersionName,
  type FlowJson, type FlowValidationError, type FormFamilyDTO, type FormVersionDTO, type WaFlowSent,
} from "@/app/_shared/utils/wa-forms";

// Formulários do WhatsApp (Meta "WhatsApp Flows"), T-7ZQH6: Graph API de
// Flows + catálogo no banco (WhatsAppFormVersion) + envio. SEM guarda: quem
// chama (rota GET com teamRoute, actions com requireTeam/requirePermission,
// bot) já decidiu o acesso.
//
// Por que um catálogo no banco: Flow publicado não pode ser alterado na Meta.
// Editar = criar outro Flow (clonado) como rascunho, subir o JSON novo e
// publicar; a "família" junta as versões e só a ativa sai no envio.

function graphBase(c: WaCreds): string {
  return `https://graph.facebook.com/${c.apiVersion}`;
}

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: number };

async function graph<T>(c: WaCreds, path: string, init?: RequestInit): Promise<GraphResult<T>> {
  try {
    const res = await fetch(path.startsWith("http") ? path : `${graphBase(c)}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${c.token}`, ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = data?.error;
      const msg = err?.error_user_msg ?? err?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: String(msg), code: Number(err?.code) || undefined };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Credenciais de um número ATIVO da WABA (Flows são por WABA, como templates).
 * Sem número ativo dela, tenta o default (que pode ser o das envs).
 */
export async function credsForWaba(wabaId: string): Promise<WaCreds | null> {
  const row = await db.whatsAppNumber.findFirst({
    where: { wabaId, active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (row) {
    const c = await getCreds(row.id);
    if (c) return c;
  }
  const def = await getDefaultCreds();
  return def && def.wabaId === wabaId ? def : null;
}

// ─── Graph API de Flows ──────────────────────────────────────────────────────

interface MetaFlowRow {
  id: string;
  name: string;
  status: string;
  categories?: string[];
}

/** Todos os Flows da WABA (com paginação; teto de 20 páginas de 100). */
export async function fetchMetaFlows(c: WaCreds): Promise<GraphResult<MetaFlowRow[]>> {
  const out: MetaFlowRow[] = [];
  let url: string | null = `${graphBase(c)}/${c.wabaId}/flows?fields=id,name,status,categories&limit=100`;
  for (let page = 0; url && page < 20; page++) {
    const r: GraphResult<{ data?: MetaFlowRow[]; paging?: { next?: string } }> = await graph(c, url);
    if (!r.ok) return r;
    out.push(...(r.data.data ?? []));
    url = r.data.paging?.next ?? null;
  }
  return { ok: true, data: out };
}

/** JSON do Flow (asset FLOW_JSON). A URL de download é assinada e sem token. */
export async function fetchMetaFlowJson(c: WaCreds, metaFlowId: string): Promise<GraphResult<FlowJson>> {
  const r = await graph<{ data?: { asset_type?: string; download_url?: string }[] }>(c, `${metaFlowId}/assets`);
  if (!r.ok) return r;
  const link = r.data.data?.find((a) => a.asset_type === "FLOW_JSON")?.download_url;
  if (!link) return { ok: false, error: "A Meta não devolveu o JSON deste formulário." };
  try {
    const res = await fetch(link, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const json = readFlowJson(await res.text());
    return json ? { ok: true, data: json } : { ok: false, error: "JSON do formulário em formato inesperado." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Link de pré-visualização interativa da Meta (expira; só para a equipe). */
export async function fetchMetaFlowPreview(c: WaCreds, metaFlowId: string): Promise<string | null> {
  const r = await graph<{ preview?: { preview_url?: string } }>(c, `${metaFlowId}?fields=preview.invalidate(false)`);
  return r.ok ? r.data.preview?.preview_url ?? null : null;
}

function parseValidationErrors(raw: unknown): FlowValidationError[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const msg = [o.error_type, o.message ?? o.error].filter((x) => typeof x === "string").join(": ");
    return { message: msg || "Erro de validação", line: typeof o.line_start === "number" ? o.line_start : null };
  });
}

async function uploadMetaFlowJson(c: WaCreds, metaFlowId: string, json: FlowJson): Promise<GraphResult<FlowValidationError[]>> {
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(json)], { type: "application/json" }), "flow.json");
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  const r = await graph<{ success?: boolean; validation_errors?: unknown }>(c, `${metaFlowId}/assets`, { method: "POST", body: form });
  if (!r.ok) return r;
  return { ok: true, data: parseValidationErrors(r.data.validation_errors) };
}

// ─── Catálogo no banco ───────────────────────────────────────────────────────

// Uma ida à Meta por WABA por minuto e por instância: abrir o modal de novo
// logo em seguida (ou dois atendentes juntos) usa o banco.
const SYNC_TTL_MS = 60_000;
const lastSync = new Map<string, number>();

/**
 * Espelha os Flows da Meta no banco: Flow novo vira família própria (versão 1,
 * ativo se publicado); os existentes atualizam nome/status. Flow que sumiu da
 * Meta fica com status DELETED (a lista veio completa).
 */
export async function syncFormCatalog(c: WaCreds, opts: { force?: boolean } = {}): Promise<{ error: string | null }> {
  const now = Date.now();
  if (!opts.force && now - (lastSync.get(c.wabaId) ?? 0) < SYNC_TTL_MS) return { error: null };
  const r = await fetchMetaFlows(c);
  if (!r.ok) return { error: r.code === 10 || r.code === 200 ? "O token desta linha não tem acesso aos formulários (Flows) da Meta." : r.error };
  lastSync.set(c.wabaId, now);

  const rows = await db.whatsAppFormVersion.findMany({
    where: { wabaId: c.wabaId },
    select: { id: true, metaFlowId: true, name: true, status: true },
  });
  const byMeta = new Map(rows.map((x) => [x.metaFlowId, x]));
  const seen = new Set<string>();

  for (const f of r.data) {
    seen.add(f.id);
    const cur = byMeta.get(f.id);
    if (!cur) {
      await db.whatsAppFormVersion.create({
        data: {
          wabaId: c.wabaId,
          metaFlowId: f.id,
          familyId: f.id,
          version: 1,
          name: f.name,
          status: f.status,
          categories: (f.categories ?? []) as Prisma.InputJsonValue,
          active: f.status === "PUBLISHED",
        },
      }).catch(() => { /* corrida com outra aba: a unique do metaFlowId barra a cópia */ });
    } else if (cur.name !== f.name || (cur.status !== f.status && cur.status !== "DISCARDED")) {
      await db.whatsAppFormVersion.update({ where: { id: cur.id }, data: { name: f.name, status: f.status } });
    }
  }
  const gone = rows.filter((x) => !seen.has(x.metaFlowId) && x.status !== "DISCARDED" && x.status !== "DELETED");
  if (gone.length) {
    await db.whatsAppFormVersion.updateMany({ where: { id: { in: gone.map((x) => x.id) } }, data: { status: "DELETED", active: false } });
  }
  return { error: null };
}

type VersionRow = WhatsAppFormVersion;

export function toFormVersionDTO(v: VersionRow, names: Map<string, string>): FormVersionDTO {
  return {
    id: v.id,
    familyId: v.familyId,
    metaFlowId: v.metaFlowId,
    version: v.version,
    name: v.name,
    status: v.status,
    active: v.active,
    bodyText: v.bodyText,
    cta: v.cta,
    headerText: v.headerText,
    footerText: v.footerText,
    createdByName: v.createdById ? names.get(v.createdById) ?? null : null,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

async function authorNames(rows: VersionRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.createdById).filter(Boolean))] as string[];
  if (!ids.length) return new Map();
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name ?? "Equipe"]));
}

/** Versões de uma família, da mais nova para a mais antiga. */
export async function loadFamilyVersions(familyId: string): Promise<FormVersionDTO[]> {
  const rows = await db.whatsAppFormVersion.findMany({
    where: { familyId, status: { notIn: ["DISCARDED"] } },
    orderBy: { version: "desc" },
  });
  const names = await authorNames(rows);
  return rows.map((r) => toFormVersionDTO(r, names));
}

/** Catálogo da WABA agrupado por família (formulários de anúncio no fim). */
export async function loadFormCatalog(wabaId: string): Promise<FormFamilyDTO[]> {
  const rows = await db.whatsAppFormVersion.findMany({
    where: { wabaId, status: { notIn: ["DISCARDED", "DELETED"] } },
    orderBy: [{ familyId: "asc" }, { version: "desc" }],
  });
  const names = await authorNames(rows);
  const families = new Map<string, FormVersionDTO[]>();
  for (const r of rows) {
    const list = families.get(r.familyId) ?? [];
    list.push(toFormVersionDTO(r, names));
    families.set(r.familyId, list);
  }
  const out: FormFamilyDTO[] = [];
  for (const [familyId, versions] of families) {
    const active = versions.find((v) => v.active && v.status === "PUBLISHED") ?? null;
    const draft = versions.find((v) => v.status === "DRAFT") ?? null;
    const name = (active ?? versions[versions.length - 1]).name.replace(/\s+v\d+$/i, "");
    out.push({ familyId, name, adAuto: isAdAutoForm(name), active, draft, versions });
  }
  return out.sort((a, b) => Number(a.adAuto) - Number(b.adAuto) || a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * JSON da versão: o guardado no banco ou, na 1ª vez, o da Meta (guardado para
 * as próximas: versão publicada não muda lá).
 */
export async function ensureFlowJson(v: VersionRow, c: WaCreds): Promise<GraphResult<FlowJson>> {
  const stored = readFlowJson(v.flowJson);
  if (stored) return { ok: true, data: stored };
  const r = await fetchMetaFlowJson(c, v.metaFlowId);
  if (r.ok && v.status !== "DRAFT") {
    await db.whatsAppFormVersion.update({ where: { id: v.id }, data: { flowJson: r.data as unknown as Prisma.InputJsonValue } });
  }
  return r;
}

// ─── Edição (rascunho → publicar) ────────────────────────────────────────────

/**
 * Salva o JSON editado como rascunho da família: reaproveita o rascunho que
 * já existe ou cria um Flow novo na Meta clonando a versão de base. Devolve
 * os erros de validação da Meta (rascunho com erro salva, mas não publica).
 */
export async function saveFormDraft(opts: {
  base: VersionRow;
  json: FlowJson;
  authorId: string;
}): Promise<{ ok: true; version: VersionRow; validationErrors: FlowValidationError[] } | { ok: false; error: string }> {
  const c = await credsForWaba(opts.base.wabaId);
  if (!c) return { ok: false, error: "Nenhuma linha ativa desta conta do WhatsApp para falar com a Meta." };

  let draft = await db.whatsAppFormVersion.findFirst({
    where: { familyId: opts.base.familyId, status: "DRAFT" },
    orderBy: { version: "desc" },
  });

  if (!draft) {
    const last = await db.whatsAppFormVersion.findFirst({
      where: { familyId: opts.base.familyId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (last?.version ?? opts.base.version) + 1;
    const name = nextVersionName(opts.base.name, version);
    const categories = Array.isArray(opts.base.categories) && opts.base.categories.length ? opts.base.categories : ["OTHER"];
    const created = await graph<{ id?: string }>(c, `${c.wabaId}/flows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, categories, clone_flow_id: opts.base.metaFlowId }),
    });
    if (!created.ok || !created.data.id) {
      return { ok: false, error: `A Meta não criou a nova versão: ${created.ok ? "sem id na resposta" : created.error}` };
    }
    draft = await db.whatsAppFormVersion.create({
      data: {
        wabaId: c.wabaId,
        metaFlowId: created.data.id,
        familyId: opts.base.familyId,
        version,
        name,
        status: "DRAFT",
        categories: categories as Prisma.InputJsonValue,
        active: false,
        bodyText: opts.base.bodyText,
        cta: opts.base.cta,
        headerText: opts.base.headerText,
        footerText: opts.base.footerText,
        createdById: opts.authorId,
      },
    });
  }

  const up = await uploadMetaFlowJson(c, draft.metaFlowId, opts.json);
  if (!up.ok) return { ok: false, error: `A Meta recusou o JSON: ${up.error}` };
  const saved = await db.whatsAppFormVersion.update({
    where: { id: draft.id },
    data: { flowJson: opts.json as unknown as Prisma.InputJsonValue },
  });
  return { ok: true, version: saved, validationErrors: up.data };
}

/** Publica o rascunho e faz dele a versão ativa da família. */
export async function publishFormDraft(v: VersionRow): Promise<{ ok: true; version: VersionRow } | { ok: false; error: string }> {
  if (v.status !== "DRAFT") return { ok: false, error: "Só rascunho pode ser publicado." };
  const c = await credsForWaba(v.wabaId);
  if (!c) return { ok: false, error: "Nenhuma linha ativa desta conta do WhatsApp para falar com a Meta." };
  const r = await graph<{ success?: boolean }>(c, `${v.metaFlowId}/publish`, { method: "POST" });
  if (!r.ok) return { ok: false, error: `A Meta não publicou: ${r.error}` };
  const [, version] = await db.$transaction([
    db.whatsAppFormVersion.updateMany({ where: { familyId: v.familyId, id: { not: v.id } }, data: { active: false } }),
    db.whatsAppFormVersion.update({ where: { id: v.id }, data: { status: "PUBLISHED", active: true, publishedAt: new Date() } }),
  ]);
  return { ok: true, version };
}

/** Descarta o rascunho (apaga na Meta; Flow em rascunho pode ser apagado). */
export async function discardFormDraft(v: VersionRow): Promise<{ ok: true } | { ok: false; error: string }> {
  if (v.status !== "DRAFT") return { ok: false, error: "Só rascunho pode ser descartado." };
  const c = await credsForWaba(v.wabaId);
  if (c) {
    const r = await graph<{ success?: boolean }>(c, v.metaFlowId, { method: "DELETE" });
    // Já apagado lá (100/"does not exist") segue: o objetivo é sair da lista.
    if (!r.ok && !/exist|not found/i.test(r.error)) return { ok: false, error: `A Meta não apagou o rascunho: ${r.error}` };
  }
  await db.whatsAppFormVersion.update({ where: { id: v.id }, data: { status: "DISCARDED", active: false } });
  return { ok: true };
}

/** Volta a uma versão publicada anterior (só muda o que sai no envio). */
export async function activateFormVersion(v: VersionRow): Promise<{ ok: true } | { ok: false; error: string }> {
  if (v.status !== "PUBLISHED") return { ok: false, error: "Só versão publicada pode ficar ativa." };
  await db.$transaction([
    db.whatsAppFormVersion.updateMany({ where: { familyId: v.familyId, id: { not: v.id } }, data: { active: false } }),
    db.whatsAppFormVersion.update({ where: { id: v.id }, data: { active: true } }),
  ]);
  return { ok: true };
}

// ─── Envio ───────────────────────────────────────────────────────────────────

export interface SendFormInput {
  contactId: string;
  versionId: string;
  body: string;
  cta: string;
  header?: string | null;
  footer?: string | null;
  /** Valores da tela de entrada (chave → texto), convertidos pelo tipo do JSON. */
  values?: Record<string, string>;
  authorId: string | null;
  sentByBot?: boolean;
  systemSource?: string | null;
  /** "terms" = aceite de termos pedido pelo bot (T-B40K0). */
  purpose?: "terms" | null;
  /** Motivo do `qualify` do cérebro (vai para a nota da Fila quando o aceite chegar). */
  queueReason?: string | null;
}

export type SendFormResult =
  | {
    ok: true;
    message: Prisma.WhatsAppMessageGetPayload<object>;
    contact: { id: string; name: string | null; phone: string; numberId: string | null; userId: string | null; processId: string | null };
    version: VersionRow;
  }
  | { ok: false; error: string };

/**
 * Envia o formulário publicado ao contato e grava a mensagem (com o
 * `interactive` e o texto legível). Não mexe no status da conversa: o
 * atendente assume na action; o bot segue no modo bot.
 */
export async function sendFormToContact(input: SendFormInput): Promise<SendFormResult> {
  const [contact, version] = await Promise.all([
    db.whatsAppContact.findUnique({
      where: { id: input.contactId },
      select: { id: true, name: true, phone: true, numberId: true, optedOut: true, userId: true, processId: true },
    }),
    db.whatsAppFormVersion.findUnique({ where: { id: input.versionId } }),
  ]);
  if (!contact) return { ok: false, error: "Contato não encontrado." };
  if (contact.optedOut) return { ok: false, error: "Este contato pediu para não receber mensagens." };
  if (!version) return { ok: false, error: "Formulário não encontrado — atualize a lista." };
  if (version.status !== "PUBLISHED") {
    return { ok: false, error: "Só formulário PUBLICADO pode ser enviado. Publique o rascunho antes." };
  }

  const c = await getCreds(contact.numberId);
  if (!c) return { ok: false, error: "A linha deste contato foi desativada — a conversa é somente leitura." };
  if (c.wabaId !== version.wabaId) {
    return { ok: false, error: "Este formulário é de outra conta do WhatsApp. Use um formulário da linha que atende o contato." };
  }

  const invalid = validateFormMessage({ body: input.body, cta: input.cta, header: input.header, footer: input.footer });
  if (invalid) return { ok: false, error: invalid };

  if (!(await isWindowOpen(contact.id))) {
    return { ok: false, error: describeFlowSendError(131047, undefined) };
  }

  const jsonR = await ensureFlowJson(version, c);
  if (!jsonR.ok) return { ok: false, error: `Não consegui ler o formulário na Meta: ${jsonR.error}` };
  const json = jsonR.data;
  const screen = entryScreen(json).id;
  const data = buildEntryData(json, input.values ?? {});

  // O token volta no nfm_reply: amarra a resposta a este envio (e à versão).
  const token = `crm.${version.id.slice(-8)}.${randomBytes(6).toString("hex")}`;
  const sent = await sendFlowMessage(contact.phone, {
    flowId: version.metaFlowId,
    token,
    cta: input.cta,
    body: input.body,
    header: input.header,
    footer: input.footer,
    screen,
    data,
  }, contact.numberId);
  if (!sent.waMessageId) return { ok: false, error: describeFlowSendError(sent.errorCode, sent.error) };

  const interactive: WaFlowSent = {
    kind: "flow",
    formVersionId: version.id,
    metaFlowId: version.metaFlowId,
    flowName: version.name,
    version: version.version,
    token,
    cta: input.cta.trim(),
    header: input.header?.trim() || null,
    footer: input.footer?.trim() || null,
    screen,
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(input.queueReason ? { queueReason: input.queueReason.slice(0, 500) } : {}),
  };
  const message = await db.whatsAppMessage.create({
    data: {
      contactId: contact.id,
      numberId: contact.numberId,
      waMessageId: sent.waMessageId,
      direction: "out",
      body: flowSentBody(version.name, input.body, input.cta),
      status: "sent",
      sentByBot: input.sentByBot ?? false,
      authorId: input.authorId,
      systemSource: input.systemSource ?? null,
      interactive: interactive as unknown as Prisma.InputJsonValue,
    },
  });
  // A lista do inbox ordena por lastMessageAt e sincroniza por delta (updatedAt).
  await db.whatsAppConversation.updateMany({ where: { contactId: contact.id }, data: { lastMessageAt: new Date() } });
  return { ok: true, message, contact, version };
}

/** A versão ativa e publicada de uma família, pelo nome (ex.: o aceite de termos). */
export async function findActiveFormByName(wabaId: string, name: string): Promise<VersionRow | null> {
  const base = name.trim().replace(/\s+v\d+$/i, "");
  const rows = await db.whatsAppFormVersion.findMany({
    where: { wabaId, status: "PUBLISHED", active: true },
  });
  return rows.find((r) => r.name.replace(/\s+v\d+$/i, "") === base) ?? null;
}
