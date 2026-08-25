"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/app/_shared/lib/prisma";
import { requirePermission, getSessionPermissions } from "@/app/_shared/lib/permissions-server";
import { logWhatsAppEvent, createLog } from "@/app/_shared/lib/log";
import { postInternalNote, findLinkedCard } from "@/app/_shared/lib/whatsapp/bot";
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
  contactId: string;
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
    contactId: r.contactId,
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

/**
 * Card do kanban vinculado ao contato do contrato (vínculo direto ou fallback
 * pelos últimos 8 dígitos do telefone — mesma resolução do bot). O ownerId é
 * o que a aba Arquivos do CardDialog usa pra listar os anexos.
 */
export async function resolverCardDoContrato(
  contactId: string,
): Promise<{ id: string; isProcess: boolean; ownerId: string; nome: string | null } | null> {
  await requirePermission("manage_contracts");
  const card = await findLinkedCard(contactId);
  if (!card) return null;
  if (card.kind === "process") {
    const p = await db.process.findUnique({ where: { id: card.id }, select: { userId: true } });
    return { id: card.id, isProcess: true, ownerId: p?.userId ?? card.id, nome: card.name };
  }
  return { id: card.id, isProcess: false, ownerId: card.id, nome: card.name };
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
// Raio-X dos problemas (bloco "Precisou de humano" no topo da aba)
//
// Junta num só lugar tudo que travou: erro técnico, extração que caiu no colo
// do atendente, cliente que não confirmou e link parado há dias. A pergunta
// que este resumo responde é "o que quebrou e o que eu faço com cada um".
// ---------------------------------------------------------------------------

/** Status que só saem do lugar com gente. */
const STATUS_PROBLEMA = ["erro", "extracao_falhou", "confirmacao_expirada"] as const;

const ROTULO_PROBLEMA: Record<string, string> = {
  erro: "Erro técnico",
  extracao_falhou: "Precisou de humano",
  confirmacao_expirada: "Cliente não confirmou",
  parado: "Link parado há 48h+",
};

const ACAO_SUGERIDA: Record<string, string> = {
  erro: "Cancele este ciclo e gere o contrato de novo pelo cartão do cliente.",
  extracao_falhou: "Complete os dados que faltam com o cliente e gere o contrato manualmente.",
  confirmacao_expirada: "Fale com o cliente, confirme os dados na mão e gere de novo.",
  parado: "Reenvie o link ou ligue — já passou de 48h sem assinatura.",
};

export interface ContractProblemCase {
  id: string;
  contactId: string;
  cliente: string;
  telefone: string;
  status: string;
  /** erro | extracao_falhou | confirmacao_expirada | parado */
  tipo: string;
  rotulo: string;
  quando: string;
  /** Frase pronta: o que aconteceu com este contrato. */
  oQueAconteceu: string;
  pendencias: { label: string; reason: string }[];
  acaoSugerida: string;
  horasParado: number | null;
}

export interface ContractProblemSummary {
  total: number;
  porTipo: { tipo: string; rotulo: string; quantidade: number }[];
  /** Causas mais repetidas (campo que falta / mensagem de erro agrupada). */
  motivos: { motivo: string; quantidade: number }[];
  casos: ContractProblemCase[];
  /** Clientes que travaram e mesmo assim assinaram nos últimos 30 dias. */
  recuperados30d: number;
}

/** Agrupa mensagens de erro parecidas (tira ids e números variáveis). */
function normalizarMotivo(texto: string): string {
  return texto
    .replace(/[a-f0-9]{20,}/gi, "…")
    .replace(/\d+/g, "N")
    .trim()
    .slice(0, 120);
}

export async function resumirProblemasContratos(): Promise<ContractProblemSummary> {
  await requirePermission("manage_contracts");

  const rows = await db.signatureRequest.findMany({
    where: {
      OR: [
        { status: { in: [...STATUS_PROBLEMA] } },
        // Parados: link vivo, enviado, sem assinatura há mais de 48h.
        {
          status: { in: ["aguardando", "visualizado"] },
          sentAt: { lt: new Date(Date.now() - 48 * 3_600_000) },
        },
      ],
    },
    include: { contact: { select: { name: true, phone: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const agora = Date.now();
  const casos: ContractProblemCase[] = rows.map((r) => {
    const tipo = (STATUS_PROBLEMA as readonly string[]).includes(r.status) ? r.status : "parado";
    const pendencias = Array.isArray(r.missingFields)
      ? (r.missingFields as unknown as { label: string; reason: string }[])
      : [];
    const horasParado =
      r.sentAt && !r.signedAt ? Math.floor((agora - r.sentAt.getTime()) / 3_600_000) : null;

    let oQueAconteceu: string;
    if (tipo === "erro") {
      oQueAconteceu = r.error ?? "A geração do contrato falhou e o ciclo parou no meio.";
    } else if (tipo === "extracao_falhou") {
      oQueAconteceu = r.error
        ? r.error
        : pendencias.length
          ? `Faltou: ${pendencias.map((p) => p.label).join(", ")}.`
          : "A IA não conseguiu fechar os dados do contrato.";
    } else if (tipo === "confirmacao_expirada") {
      oQueAconteceu = "O resumo foi enviado, mas o cliente nunca confirmou os dados.";
    } else {
      oQueAconteceu = r.viewedAt
        ? `Abriu o link e não assinou — parado há ${horasParado}h.`
        : `Recebeu o link e nem abriu — parado há ${horasParado}h (${r.remindersSent} lembrete(s)).`;
    }

    return {
      id: r.id,
      contactId: r.contactId,
      cliente: r.contact.name ?? `+${r.contact.phone}`,
      telefone: r.contact.phone,
      status: r.status,
      tipo,
      rotulo: ROTULO_PROBLEMA[tipo] ?? r.status,
      quando: (r.sentAt ?? r.updatedAt).toISOString(),
      oQueAconteceu,
      pendencias,
      acaoSugerida: ACAO_SUGERIDA[tipo] ?? "",
      horasParado,
    };
  });

  const porTipoMap = new Map<string, number>();
  const motivosMap = new Map<string, number>();
  for (const c of casos) {
    porTipoMap.set(c.tipo, (porTipoMap.get(c.tipo) ?? 0) + 1);
    if (c.pendencias.length) {
      for (const p of c.pendencias) {
        const k = `Faltou ${p.label}`;
        motivosMap.set(k, (motivosMap.get(k) ?? 0) + 1);
      }
    } else {
      const k = normalizarMotivo(c.oQueAconteceu);
      motivosMap.set(k, (motivosMap.get(k) ?? 0) + 1);
    }
  }

  // Recuperação: clientes que travaram e depois assinaram mesmo assim.
  const contatosComProblema = [...new Set(casos.map((c) => c.contactId))];
  const recuperados30d = contatosComProblema.length
    ? await db.signatureRequest.count({
        where: {
          contactId: { in: contatosComProblema },
          status: { in: ["assinado", "validado"] },
          signedAt: { gte: new Date(agora - 30 * 86_400_000) },
        },
      })
    : 0;

  const ordemTipo = ["erro", "extracao_falhou", "confirmacao_expirada", "parado"];
  casos.sort(
    (a, b) =>
      ordemTipo.indexOf(a.tipo) - ordemTipo.indexOf(b.tipo) ||
      new Date(b.quando).getTime() - new Date(a.quando).getTime(),
  );

  return {
    total: casos.length,
    porTipo: ordemTipo
      .filter((t) => porTipoMap.has(t))
      .map((t) => ({ tipo: t, rotulo: ROTULO_PROBLEMA[t], quantidade: porTipoMap.get(t) ?? 0 })),
    motivos: [...motivosMap.entries()]
      .map(([motivo, quantidade]) => ({ motivo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 8),
    casos,
    recuperados30d,
  };
}

// ---------------------------------------------------------------------------
// Excluir a linha (lixeira da aba)
//
// Apaga o REGISTRO do ciclo — serve pra limpar teste e ciclo quebrado. Um
// contrato já assinado é documento: só sai com motivo escrito, e o que
// aconteceu fica no Log e na conversa do cliente.
// ---------------------------------------------------------------------------

export async function excluirContrato(
  id: string,
  motivo?: string,
): Promise<{ ok: boolean; erro?: string }> {
  await requirePermission("manage_contracts");
  const eu = await quemSou();

  const r = await db.signatureRequest.findUnique({
    where: { id },
    include: { contact: { select: { name: true, phone: true } } },
  });
  if (!r) return { ok: false, erro: "Contrato não encontrado (talvez já tenha sido excluído)." };

  const assinado = ["assinado", "validado"].includes(r.status);
  if (assinado && !motivo?.trim()) {
    return {
      ok: false,
      erro: "Este contrato já foi assinado — escreva o motivo da exclusão para prosseguir.",
    };
  }

  await db.signatureRequest.delete({ where: { id } });

  await createLog({
    action: "wa_signature",
    message:
      `EXCLUIU o contrato de assinatura de ${r.contact.name ?? `+${r.contact.phone}`} ` +
      `(situação "${r.status}")${motivo?.trim() ? ` — ${motivo.trim()}` : ""}`,
    authorId: eu.userId ?? "equipe",
    authorName: eu.userName,
    metadata: {
      channel: "whatsapp",
      stage: "assinatura_excluida",
      requestId: id,
      contactId: r.contactId,
      status: r.status,
      origem: r.origin,
      criadoEm: r.createdAt.toISOString(),
      assinadoEm: r.signedAt?.toISOString() ?? null,
      documentHash: r.documentHash,
      signedHash: r.signedHash,
      motivo: motivo?.trim() ?? null,
    },
  }).catch(() => {});

  if (assinado) {
    await postInternalNote(
      r.contactId,
      `🗑️ Contrato ASSINADO removido da lista por ${eu.userName}${motivo?.trim() ? ` — ${motivo.trim()}` : ""}. ` +
        `O PDF continua guardado; o registro do ciclo saiu da aba Contratos.`,
    ).catch(() => {});
  }

  revalidatePath("/nova-dash");
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
