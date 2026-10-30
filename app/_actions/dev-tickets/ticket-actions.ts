"use server";

import { assertCanWrite, requireTeam } from "@/app/_shared/lib/permissions-server";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Prisma } from "@prisma/client";
import { db } from "../../_shared/lib/prisma";
import { AccessError } from "@/app/_shared/utils/route-guards";
import {
  TICKET_STATUS_FLOW,
  isKnowledgeType,
  statusesFor,
  type CerebroMeta,
  type Destino,
} from "@/app/_shared/utils/cerebro";
import { normalizeHospitalName } from "@/app/_shared/utils/vault";
import { getCerebroResumo, getLote } from "@/app/_shared/lib/cerebro";
import { CerebroError, asJson, criarSugestao, criarTicketDev, metaOf, withHistory } from "@/app/_shared/lib/cerebro-tickets";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Listas e fluxo em app/_shared/utils/cerebro.ts ("use server" só exporta
// funções async). Quadro "Cérebro APP" = Tickets Dev + conhecimento da operação
// (Etapa 2 do AI-First): tickets comuns seguem como antes; cards de
// conhecimento (CONHECIMENTO/SKILL/BOT/LACUNA/DESATUALIZADO) só são assumidos/movidos
// por quem tem manage_knowledge e passam pela fase VALIDACAO_IA.

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_IMAGES_PER_TICKET = 8;

/**
 * Quem vê o quadro: `view_tickets` (tickets de hoje) ou `op_use` (operador que
 * sugere conhecimento). Decisão pelas permissões do banco, não pela sessão.
 */
async function requireTeamMember() {
  const ctx = await requireTeam();
  if (!ctx.permissions.view_tickets && !ctx.permissions.op_use) {
    throw new AccessError("Você não tem acesso ao quadro de tickets.");
  }
  return { id: ctx.userId, name: ctx.name, role: ctx.role, permissions: ctx.permissions };
}

type Member = Awaited<ReturnType<typeof requireTeamMember>>;

/** Card de conhecimento: assumir/mover/conferir exige manage_knowledge (ADMIN++). */
function assertKnowledgeAccess(me: Member, type: string) {
  if (isKnowledgeType(type) && !me.permissions.manage_knowledge) {
    throw new AccessError("Só quem tem a permissão Base de conhecimento mexe em card de conhecimento.");
  }
}


/**
 * Presigned PUT para cada foto opcional do ticket. O navegador envia direto ao
 * S3 (prefixo dev-tickets/), contornando o limite de 4.5MB de body da Vercel.
 */
export async function getTicketImageUploadUrl(file: { name: string; type: string; size: number }) {
  await assertCanWrite();
  try {
    await requireTeamMember();

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return { success: false as const, error: "Formato inválido. Use JPEG, PNG, WEBP ou GIF." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { success: false as const, error: "Imagem excede o limite de 10MB." };
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `dev-tickets/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      ContentType: file.type,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return { success: true as const, url, key };
  } catch (error) {
    console.error("Erro ao gerar URL de upload do ticket:", error);
    return { success: false as const, error: "Falha ao preparar o upload da imagem." };
  }
}

export interface TicketImageInput {
  key: string;
  name: string;
}

interface CreateDevTicketProps {
  title: string;
  description: string;
  type: string;
  images?: TicketImageInput[] | null;
}

/**
 * Fotos de um ticket já persistido: lê o array `images` e, para registros
 * antigos, cai no par imageKey/imageName. Sem duplicar quando os dois existem.
 */
function ticketImagesOf(ticket: { images: unknown; imageKey: string | null; imageName: string | null }): TicketImageInput[] {
  const list = Array.isArray(ticket.images)
    ? (ticket.images as TicketImageInput[]).filter((img) => typeof img?.key === "string")
    : [];
  if (ticket.imageKey && !list.some((img) => img.key === ticket.imageKey)) {
    list.unshift({ key: ticket.imageKey, name: ticket.imageName ?? "imagem" });
  }
  return list;
}

/** Apaga chaves do S3 sem derrubar a operação principal se o bucket reclamar. */
async function deleteImageKeys(keys: string[]) {
  for (const Key of keys) {
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key }));
    } catch (err) {
      console.error("Erro ao excluir imagem do ticket no S3:", err);
    }
  }
}

/** Normaliza e valida a lista de fotos vinda do cliente (só chaves que o presign gerou). */
function sanitizeImages(images: TicketImageInput[] | null | undefined): TicketImageInput[] {
  if (!images?.length) return [];
  if (images.length > MAX_IMAGES_PER_TICKET) {
    throw new Error(`Máximo de ${MAX_IMAGES_PER_TICKET} fotos por ticket`);
  }

  const seen = new Set<string>();
  return images.map((img) => {
    const key = String(img?.key ?? "");
    if (!key.startsWith("dev-tickets/")) throw new Error("Imagem inválida");
    if (seen.has(key)) throw new Error("Imagem duplicada no ticket");
    seen.add(key);
    return { key, name: String(img?.name ?? "imagem") };
  });
}

export async function createDevTicket({ title, description, type, images }: CreateDevTicketProps) {
  await assertCanWrite();
  const me = await requireTeamMember();

  // Mesmo núcleo do criar_ticket_dev da IA (cerebro-tickets.ts).
  return criarTicketDev(
    { title, description, type, images: sanitizeImages(images) },
    { id: me.id, name: me.name ?? null },
  ).catch((err) => {
    throw err instanceof CerebroError ? new Error(err.message) : err;
  });
}

/** Acrescenta fotos a um ticket já criado (qualquer membro da equipe pode complementar). */
export async function addDevTicketImages(ticketId: string, images: TicketImageInput[]) {
  await assertCanWrite();
  await requireTeamMember();

  const ticket = await db.devTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket não encontrado");

  const current = ticketImagesOf(ticket);
  const merged = sanitizeImages([...current, ...sanitizeImages(images)]);

  return db.devTicket.update({
    where: { id: ticketId },
    data: {
      images: merged as unknown as Prisma.InputJsonValue,
      imageKey: merged[0]?.key ?? null,
      imageName: merged[0]?.name ?? null,
    },
  });
}

/** Remove uma foto do ticket (banco + S3). */
export async function removeDevTicketImage(ticketId: string, key: string) {
  await assertCanWrite();
  const me = await requireTeamMember();

  const ticket = await db.devTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket não encontrado");
  if (ticket.creatorId !== me.id && me.role !== "ADMIN++") {
    throw new Error("Só o criador do ticket (ou um ADMIN++) pode remover fotos");
  }

  const remaining = ticketImagesOf(ticket).filter((img) => img.key !== key);

  await db.devTicket.update({
    where: { id: ticketId },
    data: {
      images: remaining as unknown as Prisma.InputJsonValue,
      imageKey: remaining[0]?.key ?? null,
      imageName: remaining[0]?.name ?? null,
    },
  });

  await deleteImageKeys([key]);

  return { ok: true };
}

/** Dev assume o ticket: vira responsável e, se ainda em distribuição, avança para análise. */
export async function assumeDevTicket(ticketId: string) {
  await assertCanWrite();
  const me = await requireTeamMember();

  const ticket = await db.devTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket não encontrado");
  assertKnowledgeAccess(me, ticket.type);
  if (ticket.assigneeId && ticket.assigneeId !== me.id) {
    throw new Error(`Ticket já assumido por ${ticket.assigneeName}`);
  }

  return db.devTicket.update({
    where: { id: ticketId },
    data: {
      assigneeId: me.id,
      assigneeName: me.name ?? "Usuário",
      ...(ticket.status === "EM_DISTRIBUICAO" ? { status: "EM_ANALISE" } : {}),
      ...(isKnowledgeType(ticket.type) ? { meta: asJson(withHistory(metaOf(ticket), "Assumiu o card", me.name)) } : {}),
    },
  });
}

export async function setDevTicketStatus(ticketId: string, status: string) {
  await assertCanWrite();
  const me = await requireTeamMember();

  if (!(TICKET_STATUS_FLOW as readonly string[]).includes(status)) {
    throw new Error("Fase inválida");
  }

  const ticket = await db.devTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket não encontrado");
  assertKnowledgeAccess(me, ticket.type);
  // Validação IA é fase só do conhecimento (redator → validador).
  if (!(statusesFor(ticket.type) as string[]).includes(status)) {
    throw new Error("Esta fase é só para cards de conhecimento.");
  }

  const backToDistribution = status === "EM_DISTRIBUICAO";
  // Avançar sem responsável definido assume o ticket para quem moveu.
  const autoAssign = !backToDistribution && !ticket.assigneeId;

  return db.devTicket.update({
    where: { id: ticketId },
    data: {
      status,
      concludedAt: status === "CONCLUIDO" ? new Date() : null,
      // Voltar para distribuição libera o ticket para outro dev.
      ...(backToDistribution ? { assigneeId: null, assigneeName: null } : {}),
      ...(autoAssign ? { assigneeId: me.id, assigneeName: me.name ?? "Usuário" } : {}),
      ...(isKnowledgeType(ticket.type) ? { meta: asJson(withHistory(metaOf(ticket), `Moveu para ${status}`, me.name)) } : {}),
    },
  });
}

export async function deleteDevTicket(ticketId: string) {
  await assertCanWrite();
  const me = await requireTeamMember();

  const ticket = await db.devTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("Ticket não encontrado");
  if (ticket.creatorId !== me.id && me.role !== "ADMIN++") {
    throw new Error("Só o criador do ticket (ou um ADMIN++) pode excluí-lo");
  }
  assertKnowledgeAccess(me, ticket.type);

  await db.devTicket.delete({ where: { id: ticketId } });

  // Limpa as fotos no S3 (best-effort: o ticket já foi excluído do banco).
  await deleteImageKeys(ticketImagesOf(ticket).map((img) => img.key));

  return { ok: true };
}

// ---------------------------------------------------------------- Cérebro APP

export interface SugerirConhecimentoProps {
  title: string;
  /** vault (padrão) · skill · bot: onde a sugestão será implementada. */
  destino?: Destino;
  /** Nome do hospital (opcional, vault): com ele a sugestão é comparada à automação viva. */
  hospital?: string;
  /** Pasta da skill (destino skill), ex.: meu-dia. */
  skill?: string;
  proposta: string;
  evidencia?: string;
  sectorId?: string | null;
}

/**
 * Operador sugere conhecimento novo (/conhecimento sugerir ou botão do quadro)
 * para o vault, uma skill de operação ou o cérebro do bot. O servidor já faz a
 * checagem que consegue (criarSugestao) — quem implementa vê lado a lado.
 */
export async function sugerirConhecimento(props: SugerirConhecimentoProps) {
  await assertCanWrite();
  const me = await requireTeamMember();
  return criarSugestao(props, { id: me.id, name: me.name });
}

/** Setores para o seletor do quadro (filtro e "Enviar sugestão"). */
export async function listarSetoresDoQuadro() {
  await requireTeamMember();
  return db.sector.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, color: true } });
}

const AUTO_LIMIT = 50;

/**
 * Cria os cards automáticos que ainda não existem abertos: LACUNA (hospital de
 * card ativo sem procedimento) e DESATUALIZADO (nota publicada cuja automação
 * mudou). Um card aberto por chave; no máx. 50 por clique.
 */
export async function gerarCardsAutomaticos() {
  await assertCanWrite();
  const me = await requireTeamMember();
  if (!me.permissions.manage_knowledge) throw new AccessError("Só quem tem a permissão Base de conhecimento gera cards automáticos.");

  const resumo = await getCerebroResumo();
  const abertos = await db.devTicket.findMany({
    where: { type: { in: ["LACUNA", "DESATUALIZADO"] }, status: { not: "CONCLUIDO" } },
    select: { meta: true },
  });
  const chaves = new Set(abertos.map((t) => metaOf(t).chave).filter(Boolean));

  const novos: Prisma.DevTicketCreateManyInput[] = [];
  for (const l of resumo.lacunas) {
    const chave = `lacuna:${normalizeHospitalName(l.hospital)}`;
    if (chaves.has(chave)) continue;
    novos.push({
      title: `${l.hospital} sem procedimento`,
      description: `${l.cardsAtivos} card(s) ativo(s) com este hospital e nenhuma automação em DISTRIBUIÇÃO DE SOLICITAÇÕES. Pode ser hospital novo ou nome digitado diferente do da automação.`,
      type: "LACUNA",
      meta: asJson(withHistory({ chave, hospital: l.hospital, cardsAtivos: l.cardsAtivos }, "Criado pelo relatório de lacunas")),
      creatorId: me.id,
      creatorName: "Relatório de lacunas",
    });
  }
  for (const d of resumo.desatualizadas) {
    const chave = `desatualizado:${d.nota}`;
    if (chaves.has(chave)) continue;
    novos.push({
      title: `${d.hospital ?? d.nota}: automação mudou depois da nota`,
      description: `A nota publicada ${d.nota} foi escrita sobre um texto de automação que não é mais o atual. Até revalidar, vale o texto vivo da automação.`,
      type: "DESATUALIZADO",
      meta: asJson(withHistory({ chave, hospital: d.hospital ?? undefined, nota: d.nota }, "Criado pela checagem de desatualização")),
      creatorId: me.id,
      creatorName: "Checagem do vault",
    });
  }
  const lote = novos.slice(0, AUTO_LIMIT);
  if (lote.length) await db.devTicket.createMany({ data: lote });
  return { criados: lote.length, restantes: novos.length - lote.length };
}

/**
 * Conferência humana da amostra de um lote de publicação. O card do lote nasce
 * na primeira decisão (Validação IA) e vai para Concluído quando a amostra
 * inteira confere; uma devolução segura o card com a nota marcada.
 */
export async function registrarConferencia(loteId: string, nota: string, decisao: "confere" | "devolver", obs?: string) {
  await assertCanWrite();
  const me = await requireTeamMember();
  if (!me.permissions.manage_knowledge) throw new AccessError("Só quem tem a permissão Base de conhecimento confere amostra.");
  if (decisao !== "confere" && decisao !== "devolver") throw new Error("Decisão inválida");

  const lote = await getLote(loteId);
  if (!lote) throw new Error("Lote não encontrado no S3 (rode o sync do vault).");
  const amostra = lote.amostra.map((a) => a.nota);
  if (!amostra.includes(nota)) throw new Error("Essa nota não está na amostra do lote.");

  const chave = `lote:${loteId}`;
  const existentes = await db.devTicket.findMany({ where: { type: "CONHECIMENTO" }, select: { id: true, meta: true } });
  const atual = existentes.find((t) => metaOf(t).chave === chave);
  const base: CerebroMeta = atual
    ? metaOf(atual)
    : {
        chave,
        lote: { id: loteId, aprovadas: lote.aprovadas.length, devolvidas: lote.devolvidas.length, pendentes: lote.pendentes.length, amostra },
      };
  const decisoes = {
    ...(base.lote?.decisoes ?? {}),
    [nota]: { decisao, obs: obs?.trim() || undefined, por: me.name ?? "Usuário", em: new Date().toISOString() },
  };
  const meta = withHistory(
    { ...base, lote: { ...base.lote!, decisoes } },
    `${decisao === "confere" ? "Conferiu" : "Devolveu ao redator"} ${nota}${obs?.trim() ? ` — ${obs.trim()}` : ""}`,
    me.name,
  );
  const tudoConfere = amostra.every((n) => decisoes[n]?.decisao === "confere");
  const status = tudoConfere ? "CONCLUIDO" : "VALIDACAO_IA";

  if (atual) {
    return db.devTicket.update({
      where: { id: atual.id },
      data: { meta: asJson(meta), status, concludedAt: tudoConfere ? new Date() : null, assigneeId: me.id, assigneeName: me.name ?? "Usuário" },
    });
  }
  return db.devTicket.create({
    data: {
      title: `Lote ${loteId} — ${lote.aprovadas.length} nota(s) aprovadas pela IA`,
      description: `Conferência humana da amostra (${amostra.length} de ${lote.aprovadas.length}). ${lote.devolvidas.length} devolvida(s), ${lote.pendentes.length} com pendência humana.`,
      type: "CONHECIMENTO",
      status,
      meta: asJson(meta),
      creatorId: me.id,
      creatorName: "Validador IA",
      assigneeId: me.id,
      assigneeName: me.name ?? "Usuário",
      concludedAt: tudoConfere ? new Date() : null,
    },
  });
}
