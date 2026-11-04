// Conversas do WhatsApp por filtro (decisão do dono, 04/11): a IA de operação
// manda mensagem a QUALQUER contato do inbox — com ou sem card — escolhido por
// linha, pasta (bot/fila/atendimento/recuperação/encerradas), não lidas,
// aguardando resposta, período, tag, desfecho e vínculo com card. Só lê; o
// envio continua pelo preparar_whatsapp (`conversas`) + "aprovo <código>".
//
// Regras de leitura iguais às do inbox (inbox-data.ts): não lida = "marcar
// como não lida" (lastReadAt na época) OU mensagem RECEBIDA sem nota interna
// depois da leitura efetiva de qualquer atendente. Linha desativada fica de
// fora (como nos crons). Última mensagem = sem nota interna e sem apagada.
// whatsapp_messages é grande: só LATERAL com LIMIT 1 pelo índice
// (contactId, createdAt), nunca distinct.

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { OpToolError } from "./registry";
import { NOT_CARD_ROLES } from "./cards";
import { getInactiveNumberIds } from "../whatsapp/numbers";
import { brDayRangeToInstants } from "@/app/_shared/utils/date-br";
import { normalizeColumnName } from "./resolve";
import {
  PASTA_DO_STATUS,
  STATUS_DA_PASTA,
  alcance,
  motivoBloqueio,
  resolvePeriodo,
  type CampoData,
  type PastaConversa,
} from "@/app/_shared/utils/op-conversas";

export interface ConversaFiltros {
  linha?: string;
  pastas?: PastaConversa[];
  desfechos?: string[];
  naoLidas?: boolean;
  aguardandoResposta?: boolean;
  desde?: string;
  ate?: string;
  campoData?: CampoData;
  vinculo?: "com_card" | "sem_card";
  tags?: string[];
  janela?: "aberta" | "fechada";
  busca?: string;
  incluirOptOut?: boolean;
  /** 0 = não exclui. Contato que recebeu mensagem aprovada pela IA (systemSource "op") nas últimas N horas fica de fora. */
  semRepetirHoras?: number;
  /** Restringe a estes contatos (preparar_whatsapp com `conversas`). */
  contactIds?: string[];
}

export interface ConversaItem {
  contato: string;
  nome: string | null;
  telefone: string;
  linha: string;
  linhaId: string | null;
  pasta: PastaConversa | string;
  desfecho: string | null;
  naoLida: boolean;
  aguardandoResposta: boolean;
  ultimaMensagemEm: Date;
  ultimaDoClienteEm: Date | null;
  janelaAberta: boolean;
  optOut: boolean;
  optIn: boolean;
  podeReceber: "texto" | "so_template" | "bloqueado";
  bloqueio: string | null;
  card: { id: string; cardNumber: number | null; nome: string | null; hospital: string | null; arquivado: string | null } | null;
  hospitalHint: string | null;
  recebeuDaIaEm: Date | null;
}

type Linha = { id: string; label: string; displayPhone: string | null; active: boolean; isDefault: boolean; templatesPaused?: boolean };

async function linhas(): Promise<Linha[]> {
  return db.whatsAppNumber.findMany({ select: { id: true, label: true, displayPhone: true, active: true, isDefault: true, templatesPaused: true } });
}

/** Linha pelo nome ("Seguros Paraná IA", parcial aceito se única) ou pelo telefone (8 últimos dígitos). */
export function matchLinha(all: Linha[], ref: string): Linha {
  const digits = ref.replace(/\D/g, "");
  if (digits.length >= 8) {
    const byPhone = all.filter((n) => (n.displayPhone ?? "").replace(/\D/g, "").endsWith(digits.slice(-8)));
    if (byPhone.length === 1) return byPhone[0];
  }
  const alvo = normalizeColumnName(ref);
  const exatas = all.filter((n) => normalizeColumnName(n.label) === alvo);
  if (exatas.length === 1) return exatas[0];
  const parciais = all.filter((n) => normalizeColumnName(n.label).includes(alvo));
  if (parciais.length === 1) return parciais[0];
  const opcoes = all.map((n) => ({ linha: n.label, telefone: n.displayPhone, ativa: n.active }));
  if (parciais.length > 1) throw new OpToolError("ambiguo", `Mais de uma linha com "${ref}".`, 409, opcoes);
  throw new OpToolError("nao_encontrado", `Linha "${ref}" não encontrada.`, 404, opcoes);
}

const EPOCH = Prisma.sql`TIMESTAMP 'epoch'`;

export async function queryConversas(
  f: ConversaFiltros,
  page: { limite: number; offset: number },
): Promise<{ total: number; itens: ConversaItem[]; resumo: Record<string, number>; linhaFiltrada: string | null; periodo: { de: string; ate: string } | null }> {
  const all = await linhas();
  const label = new Map(all.map((n) => [n.id, n]));
  const padrao = all.find((n) => n.isDefault) ?? null;
  const inativas = await getInactiveNumberIds();

  const conds: Prisma.Sql[] = [];
  // Linha desativada (2323) fica de fora, como nos crons: getCreds devolve null.
  if (inativas.length) conds.push(Prisma.sql`(ct."numberId" IS NULL OR ct."numberId" NOT IN (${Prisma.join(inativas)}))`);

  let linhaFiltrada: string | null = null;
  if (f.linha) {
    const l = matchLinha(all, f.linha);
    linhaFiltrada = l.label;
    // Contato sem numberId sai pela linha padrão (sendingNumber em comms.ts).
    conds.push(l.isDefault ? Prisma.sql`(ct."numberId" = ${l.id} OR ct."numberId" IS NULL)` : Prisma.sql`ct."numberId" = ${l.id}`);
  }
  if (f.contactIds?.length) conds.push(Prisma.sql`c."contactId" IN (${Prisma.join(f.contactIds)})`);
  if (f.pastas?.length) conds.push(Prisma.sql`c.status IN (${Prisma.join(f.pastas.map((p) => STATUS_DA_PASTA[p]))})`);
  if (f.desfechos?.length) conds.push(Prisma.sql`c."closeCategory" IN (${Prisma.join(f.desfechos)})`);
  if (f.vinculo === "sem_card") conds.push(Prisma.sql`ct."userId" IS NULL`);
  if (f.vinculo === "com_card") conds.push(Prisma.sql`ct."userId" IS NOT NULL`);
  if (!f.incluirOptOut) conds.push(Prisma.sql`ct."optedOut" = false`);
  if (f.busca?.trim()) {
    const termo = f.busca.trim();
    const digitos = termo.replace(/\D/g, "");
    conds.push(
      digitos.length >= 6
        ? Prisma.sql`ct.phone LIKE ${"%" + digitos + "%"}`
        : Prisma.sql`ct.name ILIKE ${"%" + termo.replace(/[\\%_]/g, (ch) => "\\" + ch) + "%"}`,
    );
  }
  if (f.tags?.length) {
    const nomes = f.tags.map((t) => t.trim().toLowerCase());
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM whatsapp_conversation_tags x JOIN whatsapp_tags t ON t.id = x."tagId"
      WHERE x."conversationId" = c.id AND lower(t.name) IN (${Prisma.join(nomes)}))`);
  }
  const periodo = resolvePeriodo(f.desde, f.ate);
  if (periodo && "erro" in periodo) throw new OpToolError("argumentos_invalidos", periodo.erro, 400);
  if (periodo) {
    const { gte, lt } = brDayRangeToInstants(periodo.de, periodo.ate);
    const campo = f.campoData ?? "ultima_mensagem";
    conds.push(
      campo === "inicio_conversa"
        ? Prisma.sql`c."createdAt" >= ${gte} AND c."createdAt" < ${lt}`
        : campo === "ultima_do_cliente"
          ? Prisma.sql`EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false AND m."createdAt" >= ${gte} AND m."createdAt" < ${lt})`
          : Prisma.sql`c."lastMessageAt" >= ${gte} AND c."lastMessageAt" < ${lt}`,
    );
  }
  const horas = f.semRepetirHoras ?? 0;
  const desdeOp = new Date(Date.now() - Math.max(horas, 12) * 3_600_000);
  if (horas > 0) {
    const corte = new Date(Date.now() - horas * 3_600_000);
    conds.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m."contactId" = c."contactId" AND m."systemSource" = 'op' AND m."createdAt" >= ${corte})`);
  }
  const janelaDesde = new Date(Date.now() - 24 * 3_600_000);

  // Condições que dependem das LATERAL (só depois do WHERE barato).
  const pos: Prisma.Sql[] = [];
  if (f.naoLidas === true) pos.push(Prisma.sql`nao_lida`);
  if (f.naoLidas === false) pos.push(Prisma.sql`NOT nao_lida`);
  if (f.aguardandoResposta === true) pos.push(Prisma.sql`last_dir = 'in'`);
  if (f.aguardandoResposta === false) pos.push(Prisma.sql`last_dir IS DISTINCT FROM 'in'`);
  if (f.janela === "aberta") pos.push(Prisma.sql`last_in_at >= ${janelaDesde}`);
  if (f.janela === "fechada") pos.push(Prisma.sql`(last_in_at IS NULL OR last_in_at < ${janelaDesde})`);

  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;
  const wherePos = pos.length ? Prisma.sql`WHERE ${Prisma.join(pos, " AND ")}` : Prisma.empty;

  type Row = {
    contactId: string;
    status: string;
    closeCategory: string | null;
    lastMessageAt: Date;
    name: string | null;
    phone: string;
    numberId: string | null;
    userId: string | null;
    optedOut: boolean;
    optedInAt: Date | null;
    hospitalHint: string | null;
    last_dir: string | null;
    last_in_at: Date | null;
    nao_lida: boolean;
    op_at: Date | null;
    total: number;
  };
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    WITH base AS (
      SELECT c."contactId", c.status, c."closeCategory", c."lastMessageAt",
        ct.name, ct.phone, ct."numberId", ct."userId", ct."optedOut", ct."optedInAt", ct."hospitalHint",
        lm.direction AS last_dir, li."createdAt" AS last_in_at, op."createdAt" AS op_at,
        COALESCE(rr.read_at = ${EPOCH} OR li."createdAt" > COALESCE(rr.read_at, ${EPOCH}), false) AS nao_lida
      FROM whatsapp_conversations c
      JOIN whatsapp_contacts ct ON ct.id = c."contactId"
      CROSS JOIN LATERAL (
        SELECT GREATEST(c."lastReadAt", MAX(r."lastReadAt")) AS read_at
        FROM whatsapp_conversation_reads r WHERE r."conversationId" = c.id
      ) rr
      LEFT JOIN LATERAL (
        SELECT m.direction FROM whatsapp_messages m
        WHERE m."contactId" = c."contactId" AND m.internal = false AND m."deletedAt" IS NULL
        ORDER BY m."createdAt" DESC LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT m."createdAt" FROM whatsapp_messages m
        WHERE m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false
        ORDER BY m."createdAt" DESC LIMIT 1
      ) li ON true
      LEFT JOIN LATERAL (
        SELECT m."createdAt" FROM whatsapp_messages m
        WHERE m."contactId" = c."contactId" AND m."systemSource" = 'op' AND m."createdAt" >= ${desdeOp}
        ORDER BY m."createdAt" DESC LIMIT 1
      ) op ON true
      ${where}
    )
    SELECT *, count(*) OVER ()::int AS total FROM base
    ${wherePos}
    ORDER BY "lastMessageAt" DESC, "contactId"
    LIMIT ${page.limite} OFFSET ${page.offset}
  `);

  // Card ligado no inbox (vínculo manual `userId`); a ficha da IA também grava esse vínculo.
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const cards = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds }, role: { notIn: NOT_CARD_ROLES } },
        select: { id: true, cardNumber: true, name: true, hospital: true, archiveStatus: true },
      })
    : [];
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const itens: ConversaItem[] = rows.map((r) => {
    const linhaRow = r.numberId ? label.get(r.numberId) ?? null : padrao;
    const janelaAberta = !!r.last_in_at && r.last_in_at >= janelaDesde;
    const estado = {
      optedOut: r.optedOut,
      optedIn: !!r.optedInAt,
      janelaAberta,
      linhaAtiva: linhaRow ? linhaRow.active : false,
      templatesPausados: linhaRow?.templatesPaused === true,
    };
    const card = r.userId ? cardById.get(r.userId) ?? null : null;
    return {
      contato: r.contactId,
      nome: r.name,
      telefone: r.phone,
      linha: linhaRow?.label ?? "padrão",
      linhaId: linhaRow?.id ?? null,
      pasta: PASTA_DO_STATUS[r.status] ?? r.status,
      desfecho: r.closeCategory,
      naoLida: r.nao_lida,
      aguardandoResposta: r.last_dir === "in",
      ultimaMensagemEm: r.lastMessageAt,
      ultimaDoClienteEm: r.last_in_at,
      janelaAberta,
      optOut: r.optedOut,
      optIn: !!r.optedInAt,
      podeReceber: alcance(estado),
      bloqueio: motivoBloqueio(estado),
      card: card ? { id: card.id, cardNumber: card.cardNumber, nome: card.name, hospital: card.hospital, arquivado: card.archiveStatus } : null,
      hospitalHint: r.hospitalHint,
      recebeuDaIaEm: r.op_at,
    };
  });

  const resumo = {
    nestaPagina: itens.length,
    texto: itens.filter((i) => i.podeReceber === "texto").length,
    soTemplate: itens.filter((i) => i.podeReceber === "so_template").length,
    bloqueados: itens.filter((i) => i.podeReceber === "bloqueado").length,
    semCard: itens.filter((i) => !i.card).length,
  };
  return { total: rows[0]?.total ?? 0, itens, resumo, linhaFiltrada, periodo: periodo && !("erro" in periodo) ? periodo : null };
}
