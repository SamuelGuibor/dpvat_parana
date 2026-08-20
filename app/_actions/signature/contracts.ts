"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/_shared/lib/prisma";
import { requirePermission, getSessionPermissions } from "@/app/_shared/lib/permissions-server";
import { logWhatsAppEvent, createLog } from "@/app/_shared/lib/log";
import { postInternalNote } from "@/app/_shared/lib/whatsapp/bot";
import { sendSystemWhatsApp } from "@/app/_shared/lib/whatsapp/outbound";
import { signUrlFor, verifyUrlFor } from "@/app/_shared/lib/signature/tokens";
import {
  createSignatureFromCard,
  createSignatureFromContact,
  CONTRACT_FIELD_KEYS,
  isAutoSignatureEnabled,
  isAutoSignatureActive,
  SIGNATURE_AUTO_PAUSE_KEY,
  type DeliveryMode,
  type ManualSignatureResult,
} from "@/app/_shared/lib/signature/core";

// Ações da equipe sobre os contratos: gerar (card ou inbox), listar, validar,
// cancelar e reenviar o link. Toda ação exige a permissão "manage_contracts" e
// fica registrada no Log — contrato é documento, não pode ter ação anônima.

async function quemSou() {
  const sessao = await getSessionPermissions();
  return { userId: sessao?.userId, userName: sessao?.name ?? sessao?.email ?? "equipe" };
}

// ---------------------------------------------------------------------------
// Geração manual
// ---------------------------------------------------------------------------

export async function gerarContratoDoCard(
  cardId: string,
  isProcess: boolean,
  delivery: DeliveryMode,
): Promise<ManualSignatureResult> {
  await requirePermission("manage_contracts");
  const eu = await quemSou();
  const res = await createSignatureFromCard(cardId, isProcess, { delivery, ...eu });
  if (res.ok) revalidatePath("/nova-dash");
  return res;
}

export async function gerarContratoDoContato(
  contactId: string,
  delivery: DeliveryMode,
): Promise<ManualSignatureResult> {
  await requirePermission("manage_contracts");
  const eu = await quemSou();
  const res = await createSignatureFromContact(contactId, { delivery, ...eu });
  if (res.ok) revalidatePath("/nova-dash");
  return res;
}

// ---------------------------------------------------------------------------
// Listagem (aba Contratos)
// ---------------------------------------------------------------------------

export interface ContractRow {
  id: string;
  contactId: string;
  cliente: string;
  telefone: string;
  status: string;
  origem: string;
  criadoPor: string | null;
  entregaPor: string | null;
  signUrl: string;
  criadoEm: string;
  enviadoEm: string | null;
  abriuEm: string | null;
  assinadoEm: string | null;
  validadoEm: string | null;
  validadoPor: string | null;
  lembretes: number;
  expiraEm: string;
  pendencias: { label: string; reason: string }[];
  erro: string | null;
  /** Horas paradas desde o envio, sem assinar (alerta da lista). */
  horasParado: number | null;
}

/** Ordem de urgência: o que precisa de gente primeiro. */
const PESO_STATUS: Record<string, number> = {
  assinado: 0, // falta validar → topo
  extracao_falhou: 1,
  erro: 1,
  confirmacao_expirada: 2,
  visualizado: 3,
  aguardando: 4,
  confirmando: 5,
  coletando: 5,
  expirado: 6,
  recusado: 7,
  cancelado: 8,
  validado: 9,
};

export async function listarContratos(filtro?: {
  status?: string;
  busca?: string;
}): Promise<{ linhas: ContractRow[]; contagem: Record<string, number> }> {
  await requirePermission("manage_contracts");

  const busca = filtro?.busca?.trim();
  const rows = await db.signatureRequest.findMany({
    where: {
      ...(filtro?.status && filtro.status !== "todos" ? { status: filtro.status } : {}),
      ...(busca
        ? {
            contact: {
              OR: [
                { name: { contains: busca, mode: "insensitive" } },
                { phone: { contains: busca.replace(/\D/g, "") } },
              ],
            },
          }
        : {}),
    },
    include: { contact: { select: { name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const validadores = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.validatedById).filter(Boolean) as string[] } },
    select: { id: true, name: true },
  });
  const nomePorId = new Map(validadores.map((v) => [v.id, v.name]));

  const agora = Date.now();
  const linhas: ContractRow[] = rows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    cliente: r.contact.name ?? `+${r.contact.phone}`,
    telefone: r.contact.phone,
    status: r.status,
    origem: r.origin,
    criadoPor: r.createdByName,
    entregaPor: r.deliveredBy,
    signUrl: signUrlFor(r.token),
    criadoEm: r.createdAt.toISOString(),
    enviadoEm: r.sentAt?.toISOString() ?? null,
    abriuEm: r.viewedAt?.toISOString() ?? null,
    assinadoEm: r.signedAt?.toISOString() ?? null,
    validadoEm: r.validatedAt?.toISOString() ?? null,
    validadoPor: r.validatedById ? nomePorId.get(r.validatedById) ?? "—" : null,
    lembretes: r.remindersSent,
    expiraEm: r.expiresAt.toISOString(),
    pendencias: Array.isArray(r.missingFields)
      ? (r.missingFields as unknown as { label: string; reason: string }[])
      : [],
    erro: r.error,
    horasParado:
      r.sentAt && !r.signedAt && ["aguardando", "visualizado"].includes(r.status)
        ? Math.floor((agora - r.sentAt.getTime()) / 3_600_000)
        : null,
  }));

  linhas.sort(
    (a, b) =>
      (PESO_STATUS[a.status] ?? 5) - (PESO_STATUS[b.status] ?? 5) ||
      new Date(a.enviadoEm ?? a.criadoEm).getTime() - new Date(b.enviadoEm ?? b.criadoEm).getTime(),
  );

  const contagem: Record<string, number> = {};
  for (const l of linhas) contagem[l.status] = (contagem[l.status] ?? 0) + 1;
  contagem.todos = linhas.length;

  return { linhas, contagem };
}

export interface ContractDetail {
  id: string;
  cliente: string;
  telefone: string;
  status: string;
  signUrl: string;
  verifyUrl: string;
  /** Rota que entrega o PDF (assinado, se já houver). */
  pdfUrl: string;
  documentHash: string | null;
  signedHash: string | null;
  temPdf: boolean;
  temAssinado: boolean;
  dados: { campo: string; valor: string; origem: string; confianca: number | null }[];
  trilha: { at: string; passo: string; detalhe?: string; ip?: string }[];
  /** Todos os ciclos DESTE cliente, do mais novo ao mais antigo. */
  historico: { id: string; status: string; criadoEm: string; origem: string; assinadoEm: string | null }[];
}

export async function detalharContrato(id: string): Promise<ContractDetail | null> {
  await requirePermission("manage_contracts");

  const r = await db.signatureRequest.findUnique({
    where: { id },
    include: { contact: { select: { name: true, phone: true } } },
  });
  if (!r) return null;

  const irmaos = await db.signatureRequest.findMany({
    where: { contactId: r.contactId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, origin: true, signedAt: true },
  });

  const extracted = (r.extracted ?? {}) as Record<
    string,
    { value?: string; source?: string; confidence?: number }
  >;

  return {
    id: r.id,
    cliente: r.contact.name ?? `+${r.contact.phone}`,
    telefone: r.contact.phone,
    status: r.status,
    signUrl: signUrlFor(r.token),
    verifyUrl: verifyUrlFor(r.token),
    pdfUrl: `/api/signature/pdf/${r.token}`,
    documentHash: r.documentHash,
    signedHash: r.signedHash,
    temPdf: !!r.pdfKey,
    temAssinado: !!r.signedPdfKey,
    dados: CONTRACT_FIELD_KEYS.map((k) => ({
      campo: k,
      valor: extracted[k]?.value ?? "—",
      origem: extracted[k]?.source ?? "—",
      confianca: extracted[k]?.confidence ?? null,
    })),
    trilha: Array.isArray(r.audit)
      ? (r.audit as unknown as { at: string; passo: string; detalhe?: string; ip?: string }[])
      : [],
    historico: irmaos.map((i) => ({
      id: i.id,
      status: i.status,
      criadoEm: i.createdAt.toISOString(),
      origem: i.origin,
      assinadoEm: i.signedAt?.toISOString() ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Ações sobre um ciclo
// ---------------------------------------------------------------------------

/** Conferência humana final: o atendente bateu os dados com os documentos. */
export async function validarContrato(id: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermission("manage_contracts");
  const eu = await quemSou();

  const r = await db.signatureRequest.findUnique({
    where: { id },
    include: { contact: { select: { name: true, phone: true } } },
  });
  if (!r) return { ok: false, erro: "Contrato não encontrado." };
  if (r.status !== "assinado") {
    return { ok: false, erro: `Só dá pra validar um contrato assinado (este está "${r.status}").` };
  }

  await db.signatureRequest.update({
    where: { id },
    data: { status: "validado", validatedAt: new Date(), validatedById: eu.userId ?? null },
  });
  await postInternalNote(r.contactId, `✅ Contrato VALIDADO por ${eu.userName}.`).catch(() => {});
  await logWhatsAppEvent({
    action: "wa_signature",
    message: `assinatura: contrato validado por ${eu.userName}`,
    authorId: eu.userId ?? "equipe",
    authorName: eu.userName,
    contactId: r.contactId,
    contactName: r.contact.name,
    contactPhone: r.contact.phone,
    metadata: { stage: "validado", requestId: id },
  }).catch(() => {});

  revalidatePath("/nova-dash");
  return { ok: true };
}

/** Cancela o ciclo (o link para de funcionar na hora). */
export async function cancelarContrato(id: string, motivo: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermission("manage_contracts");
  const eu = await quemSou();

  const r = await db.signatureRequest.findUnique({ where: { id } });
  if (!r) return { ok: false, erro: "Contrato não encontrado." };
  if (["assinado", "validado"].includes(r.status)) {
    return { ok: false, erro: "Contrato já assinado não pode ser cancelado — fale com o cliente." };
  }

  await db.signatureRequest.update({
    where: { id },
    data: { status: "cancelado", nextReminderAt: null, refusedReason: motivo.slice(0, 200) },
  });
  await postInternalNote(
    r.contactId,
    `🚫 Contrato CANCELADO por ${eu.userName}${motivo ? ` — ${motivo}` : ""}. O link de assinatura parou de funcionar.`,
  ).catch(() => {});

  revalidatePath("/nova-dash");
  return { ok: true };
}

/** Reenvia o link pelo WhatsApp (sem gastar uma das 3 tentativas do cron). */
export async function reenviarLink(id: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermission("manage_contracts");
  const eu = await quemSou();

  const r = await db.signatureRequest.findUnique({
    where: { id },
    include: { contact: { select: { name: true, phone: true } } },
  });
  if (!r) return { ok: false, erro: "Contrato não encontrado." };
  if (!["aguardando", "visualizado"].includes(r.status)) {
    return { ok: false, erro: `Este contrato está "${r.status}" — não há link ativo para reenviar.` };
  }

  const primeiroNome = (r.contact.name ?? "").trim().split(/\s+/)[0] ?? "";
  const enviado = await sendSystemWhatsApp({
    // Linha certa: o contato do ciclo, sem re-resolver pelo telefone.
    contactId: r.contactId,
    phone: r.contact.phone,
    clientName: r.contact.name,
    text:
      `Oi${primeiroNome ? `, ${primeiroNome}` : ""}! Segue de novo o link para assinar seus documentos: ` +
      `${signUrlFor(r.token)} — qualquer dúvida é só chamar por aqui. 😊`,
    templateName: "lembrete_assinatura",
    templateVars: [primeiroNome || "tudo bem"],
    // Botão "Assinar documentos" do template: URL com o token como sufixo.
    templateButtonVar: r.token,
    authorId: eu.userId ?? "equipe",
    authorName: eu.userName,
    source: "signature_resend",
  });

  if (!enviado.sent) {
    return {
      ok: false,
      erro: "Não consegui enviar agora (janela de 24h fechada ou template pendente na Meta). Copie o link e mande você mesmo.",
    };
  }
  await db.signatureRequest.update({ where: { id }, data: { deliveredBy: "atendente" } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Trava de segurança da AUTOMAÇÃO (botão na aba Contratos)
//
// Pausa/retoma o gatilho automático do bot NA HORA, sem deploy. Pausada, a
// qualificação volta a ir direto pra fila (comportamento de antes da
// assinatura automática); o botão manual e os ciclos já em andamento seguem
// funcionando. A env SIGNATURE_AUTO_ENABLED continua sendo a chave-mestra:
// com ela desligada, o botão nem tem o que pausar.
// ---------------------------------------------------------------------------

export interface AutomacaoAssinaturaStatus {
  /** Chave-mestra do ambiente (SIGNATURE_AUTO_ENABLED). */
  envLigada: boolean;
  /** Trava da equipe apertada (pausa manual). */
  pausada: boolean;
  /** Resultado efetivo: o bot está gerando contrato sozinho agora? */
  ativa: boolean;
}

export async function getAutomacaoAssinatura(): Promise<AutomacaoAssinaturaStatus> {
  await requirePermission("manage_contracts");
  const envLigada = isAutoSignatureEnabled();
  const ativa = await isAutoSignatureActive();
  return { envLigada, pausada: envLigada && !ativa, ativa };
}

export async function setAutomacaoAssinaturaPausada(
  pausada: boolean,
): Promise<{ ok: boolean; erro?: string }> {
  await requirePermission("manage_contracts");
  const eu = await quemSou();
  try {
    await db.appSetting.upsert({
      where: { key: SIGNATURE_AUTO_PAUSE_KEY },
      update: { value: pausada ? "true" : "false" },
      create: { key: SIGNATURE_AUTO_PAUSE_KEY, value: pausada ? "true" : "false" },
    });
    await createLog({
      action: "update",
      message: pausada
        ? "PAUSOU a automação de contratos do bot (trava de segurança)"
        : "RETOMOU a automação de contratos do bot",
      authorId: eu.userId ?? "equipe",
      authorName: eu.userName,
      metadata: { channel: "whatsapp", stage: "assinatura_automacao", pausada },
    });
    revalidatePath("/nova-dash");
    return { ok: true };
  } catch (err) {
    console.error("[SIGN] Falha ao alternar a trava da automação:", err);
    return { ok: false, erro: "Não consegui salvar. Tente de novo." };
  }
}
