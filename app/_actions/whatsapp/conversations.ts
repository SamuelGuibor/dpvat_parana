/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use server';

import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import { runAfterResponse } from '@/app/_shared/lib/background';
import { markMessageRead } from '@/app/_shared/lib/whatsapp/client';
import {
  countUnreadConversations, getInboxVersion, loadConversationByContact, loadConversationList, searchConversations,
} from '@/app/_shared/lib/whatsapp/inbox-data';
import type { WhatsAppConversationDTO } from '@/app/_shared/lib/whatsapp/inbox-types';
import {
  assumePatch, closePatch, qualifiedForCategory, returnToBotPatch,
} from '@/app/_shared/utils/whatsapp-inbox';
import { QUALIFIED_BY_CATEGORY } from '@/app/_shared/lib/whatsapp/close-categories';
import { closeCategoryLabel, prepareCloseTag } from '@/app/_shared/lib/whatsapp/close-tags';
import { captureConversation } from '@/app/_shared/lib/whatsapp/brain';
import { STICKY_OWNER_ENABLED } from '@/app/_shared/lib/whatsapp/ownership';
import { reportLeadStageToMeta } from '@/app/_shared/lib/meta-conversions';
import {
  COLLECT_REQUEST_CLEARED, COLLECT_REQUEST_LOG_MAX, clipCollectText, collectOpenData, collectRequestEndedData,
  collectRequestPatch, collectSummary, isCollectRequestLive, isCollectSource, normalizeCollectRequest,
  pickAttendantRequest, requestAnchor, sameCollectRequest, type CollectRequestDTO, type CollectSource,
} from '@/app/_shared/utils/collect-request';

// Fila e atribuição de conversas de WhatsApp (estilo Botconversa):
// bot → queued (handoff) → human (atendente assume) → closed.
//
// As LEITURAS da lista (lista, hash, busca, conversa por contato, contagens)
// moram em app/_shared/lib/whatsapp/inbox-data.ts e o inbox as lê pelas rotas
// GET de app/api/whatsapp/inbox/* (fora da fila serial de server actions: o
// clique do atendente não espera mais o poll). O DTO mora em inbox-types.ts.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

/** Pedido em aberto da conversa, como está no banco (collect-request.ts). */
interface StoredCollectRequest {
  text: string | null;
  at: Date | null;
  source: string | null;
  endedAt: Date | null;
  nudges: number;
}

/**
 * Busca contactId + status + nome/telefone para anexar aos logs de auditoria,
 * e o pedido em aberto (Devolver, barra e Encerrar decidem em cima dele).
 * Um JOIN só: o `select` com a relação `contact` virava 2 SQL (o schema não
 * liga relationJoins), e isto roda em todo assumir, devolver e encerrar.
 */
async function convContact(conversationId: string): Promise<{
  contactId: string;
  status: string;
  contact: { name: string | null; phone: string };
  collect: StoredCollectRequest;
} | null> {
  const rows = await db.$queryRaw<{
    contactId: string; status: string; name: string | null; phone: string;
    collectRequest: string | null; collectRequestAt: Date | null; collectRequestSource: string | null;
    collectRequestEndedAt: Date | null; collectNudgeCount: number | null;
  }[]>`
    SELECT c."contactId", c.status, ct.name, ct.phone,
           c."collectRequest", c."collectRequestAt", c."collectRequestSource",
           c."collectRequestEndedAt", c."collectNudgeCount"
    FROM whatsapp_conversations c
    JOIN whatsapp_contacts ct ON ct.id = c."contactId"
    WHERE c.id = ${conversationId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    contactId: row.contactId,
    status: row.status,
    contact: { name: row.name, phone: row.phone },
    collect: {
      text: row.collectRequest,
      at: row.collectRequestAt,
      source: row.collectRequestSource,
      endedAt: row.collectRequestEndedAt,
      nudges: Number(row.collectNudgeCount ?? 0),
    },
  };
}

// Guarda das mutações ANTIGAS deste arquivo: role do JWT, sem trava de IP.
// Devolver, Encerrar e o pedido em aberto já usam requireTeam (cargo do banco
// + trava): o texto do pedido entra no prompt do cérebro. As leituras abaixo
// também usam requireTeam; a troca nas demais mutações é outra etapa.
async function requireTeamMember(): Promise<{ id: string; name: string }> {
  // Role e nome já vêm no JWT da sessão — o findUnique extra por chamada era
  // uma query redundante em TODO poll do inbox.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  if (!TEAM_ROLES.includes(session.user.role ?? '')) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
  return { id: session.user.id, name: session.user.name ?? 'Atendente' };
}

// ---------------------------------------------------------------------------
// Leituras antigas do inbox, agora wrappers finos de inbox-data.ts.
//
// Ficam por UM deploy só para as abas abertas com o bundle antigo (que ainda
// chamam estas actions pelo id); o bundle novo lê pelas rotas GET
// (/api/whatsapp/inbox/{conversations,version,search}). No deploy seguinte,
// remover as que ficarem sem uso (npx knip). O badge de não lidas das abas
// também saiu daqui: vem de GET /api/team/badges (`whatsappUnread`).
// ---------------------------------------------------------------------------

/** @deprecated bundle antigo: o badge das abas vem de GET /api/team/badges. Regra em `countUnreadConversations`. */
export async function countWhatsAppUnread(): Promise<number> {
  await requireTeam();
  return countUnreadConversations();
}

/** @deprecated bundle antigo: o total vem junto do hash em GET /api/whatsapp/inbox/version. */
export async function countWhatsAppConversationsTotal(): Promise<number> {
  await requireTeam();
  return (await getInboxVersion()).total;
}

/** @deprecated bundle antigo: a lista vem de GET /api/whatsapp/inbox/conversations. */
export async function listWhatsAppConversations(): Promise<WhatsAppConversationDTO[]> {
  await requireTeam();
  return loadConversationList();
}

/** @deprecated bundle antigo: o hash vem de GET /api/whatsapp/inbox/version. */
export async function getWhatsAppInboxVersion(): Promise<string> {
  await requireTeam();
  return (await getInboxVersion()).version;
}

/** @deprecated bundle antigo: a busca vem de GET /api/whatsapp/inbox/search?q=. */
export async function searchWhatsAppConversations(term: string): Promise<WhatsAppConversationDTO[]> {
  await requireTeam();
  return searchConversations(term);
}

/** @deprecated bundle antigo: a hidratação vem de GET /api/whatsapp/inbox/conversations?contactId=. */
export async function getWhatsAppConversationByContact(
  contactId: string,
): Promise<WhatsAppConversationDTO | null> {
  await requireTeam();
  return loadConversationByContact(contactId);
}

export interface AttendantDTO {
  id: string;
  name: string;
}

/** Atendentes da equipe (role ADMIN*) — popula o filtro de "Com outros atendentes". */
export async function listWhatsAppAttendants(): Promise<AttendantDTO[]> {
  await requireTeamMember();
  const users = await db.user.findMany({
    where: { role: { in: TEAM_ROLES } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return users.map((u) => ({ id: u.id, name: u.name ?? 'Atendente' }));
}

// Assumir, devolver e encerrar DEVOLVEM o patch da conversa (auditoria de
// 24/09/2026): a tela aplica na hora, sem recarregar as 1.000 conversas da
// lista. O patch sai do que a action já tem em mãos (sem hidratar a conversa
// de novo) e é o mesmo do otimista do clique (assumePatch/returnToBotPatch/
// closePatch em app/_shared/utils/whatsapp-inbox.ts). Aba com o bundle antigo
// ignora o retorno e segue recarregando a lista, como antes.

/** Atendente assume a conversa (sai da fila / tira do bot / reabre se estava encerrada). */
export async function assumeConversation(conversationId: string): Promise<Partial<WhatsAppConversationDTO>> {
  const me = await requireTeamMember();
  const before = await convContact(conversationId);
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    // Assumiu: zeram os marcadores de SLA da fila.
    // recoveryNextAt nulo: atendente assumiu → o ciclo de recuperação para.
    //
    // `qualified` é PRESERVADO (06/08/2026). Antes o assumir zerava o campo, e
    // com isso a conversa perdia a marca de lead qualificado: devolvida ao bot
    // e abandonada pelo cliente, o cron a tratava como triagem incompleta e
    // disparava o ciclo de recuperação em cima de quem já estava com a equipe
    // (caso Daniel). Quem reclassifica o desfecho é o encerramento.
    data: { status: 'human', assignedToId: me.id, queuedAt: null, queueAlertAt: null, recoveryNextAt: null },
  });
  if (before) {
    // "Assumir" reabre quando estava encerrada; senão é uma atribuição normal.
    // Log sem IA depois da resposta, com o instante do clique: o painel
    // Chatbot ordena wa_assign → wa_text → wa_close pelo createdAt.
    const reopened = before.status === 'closed';
    const action = reopened ? 'wa_reopen' : 'wa_assign';
    const at = new Date();
    runAfterResponse(`log ${action}`, () => logWhatsAppEvent({
      action,
      message: reopened
        ? `reabriu e assumiu o atendimento de ${before.contact?.name ?? before.contact?.phone}`
        : `assumiu o atendimento de ${before.contact?.name ?? before.contact?.phone}`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
      at,
    }));
  }
  return assumePatch(me);
}

/** Plano do pedido em aberto no Devolver: o `data` do update, o patch da tela e o que fica valendo (log). */
interface ReturnCollectPlan {
  data: Prisma.WhatsAppConversationUncheckedUpdateInput;
  /** Ausente = a barra não muda. */
  collect?: { collectRequest: CollectRequestDTO | null };
  /** Pedido que fica valendo depois do Devolver (null = nada em aberto). */
  text: string | null;
  source: CollectSource | null;
  changed: boolean;
}

const sourceOf = (v: string | null): CollectSource => (isCollectSource(v) ? v : 'devolver');

/**
 * O que o Devolver faz com o pedido em aberto (contrato de 30/09/2026):
 * - `raw` undefined (campo vazio sem pedido anterior, ou aba com o bundle
 *   antigo): mantém o pedido não vencido ou detecta a última lista mandada por
 *   atendente, a mesma detecção do turno do bot (pickAttendantRequest depois
 *   de requestAnchor). Gravar aqui, e não só no próximo turno, é o que deixa o
 *   cron cobrar o silêncio de quem nunca mais respondeu;
 * - null ou '' (o atendente esvaziou o campo): CONCLUI, com âncora (a
 *   detecção não reabre a mesma lista);
 * - texto: abre ou substitui com origem 'devolver'; o mesmo texto de um pedido
 *   ainda válido não mexe (data e contagem de cobranças seguem).
 */
async function planReturnCollect(
  stored: StoredCollectRequest,
  contactId: string,
  raw: string | null | undefined,
  me: { id: string; name: string },
  now: Date,
): Promise<ReturnCollectPlan> {
  const live = !!stored.text && isCollectRequestLive(stored.at, now);
  if (raw !== undefined) {
    const wanted = normalizeCollectRequest(raw);
    if (!wanted) {
      return { data: collectRequestEndedData(now), collect: collectRequestPatch(null), text: null, source: null, changed: !!stored.text };
    }
    if (live && sameCollectRequest(wanted, stored.text)) {
      return { data: {}, text: stored.text, source: sourceOf(stored.source), changed: false };
    }
    return {
      data: collectOpenData(wanted, me.id, 'devolver', now),
      collect: collectRequestPatch({ text: wanted, at: now, byName: me.name, source: 'devolver' }),
      text: wanted,
      source: 'devolver',
      changed: true,
    };
  }

  // Lista de atendente MAIS NOVA que o pedido gravado fica no lugar dele
  // ("Ainda faltam: ✅ …"), como no bot.ts. Índice [contactId, createdAt].
  const after = new Date(Math.max(requestAnchor(stored.endedAt, now).getTime(), live && stored.at ? stored.at.getTime() : 0));
  const msgs = await db.whatsAppMessage.findMany({
    where: {
      contactId, direction: 'out', sentByBot: false, internal: false, deletedAt: null,
      createdAt: { gt: after },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, body: true, createdAt: true, authorId: true },
  });
  const detected = pickAttendantRequest(msgs, after);
  if (detected) {
    const author = detected.authorId
      ? await db.user.findUnique({ where: { id: detected.authorId }, select: { name: true } })
      : null;
    return {
      data: collectOpenData(detected.text, detected.authorId, 'lista_atendente', detected.at),
      collect: collectRequestPatch({
        text: detected.text, at: detected.at, byName: author ? author.name ?? 'Atendente' : null, source: 'lista_atendente',
      }),
      text: detected.text,
      source: 'lista_atendente',
      changed: true,
    };
  }
  if (live) return { data: {}, text: stored.text, source: sourceOf(stored.source), changed: false };
  // Vencido (> 7 dias) e nada novo: sai sem âncora, como no turno do bot.
  if (stored.text) return { data: COLLECT_REQUEST_CLEARED, collect: collectRequestPatch(null), text: null, source: null, changed: true };
  return { data: {}, text: null, source: null, changed: false };
}

/**
 * Devolve a conversa pro bot responder, com o pedido opcional do campo "O
 * que a IA deve recolher?" (regras em planReturnCollect). Também a partir da
 * Fila: a IA transferiu por uma dúvida no meio da coleta, o atendente
 * respondeu sem assumir e devolve.
 */
export async function returnConversationToBot(
  conversationId: string,
  // Opcional: a aba com o bundle antigo chama com 1 argumento só.
  collectRequest?: string | null,
): Promise<Partial<WhatsAppConversationDTO>> {
  // requireTeam (cargo do banco + trava de IP), não o JWT: o texto do pedido
  // vai para o prompt do cérebro.
  const ctx = await requireTeam();
  const me = { id: ctx.userId, name: ctx.name ?? 'Atendente' };
  const before = await convContact(conversationId);
  const now = new Date();
  // Vem do navegador: fora de texto/null vale como "não mexer" (nunca conclui
  // um pedido por um valor estranho).
  const raw = typeof collectRequest === 'string' || collectRequest === null ? collectRequest : undefined;
  const plan: ReturnCollectPlan = before
    ? await planReturnCollect(before.collect, before.contactId, raw, me, now)
    : { data: {}, text: null, source: null, changed: false };
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    // botNudge30At zerado: um marcador de silêncio antigo (armado antes de o
    // atendente assumir) fazia o cron despachar DESPEDIDA logo após a
    // devolução ao bot, por cima das mensagens do atendente (caso Víctor,
    // 28/07 — 2ª despedida no mesmo dia). Devolveu ao bot = ciclo de silêncio
    // recomeça do zero.
    //
    // assignedToId FICA (dono pegajoso, EF-1 da auditoria de 24/09/2026):
    // antes o devolver zerava o dono, e quando o cliente voltava e o bot
    // transferia, a conversa caía na Fila sem dono e outro atendente pegava.
    // Agora ela segue 'bot' com o selo do atendente, e handoff/qualify levam de
    // volta para ele (ownership.ts). WA_HUMAN_HOLD_DAYS=0 volta a soltar.
    //
    // returnedToBotAt (nunca limpo): fato "conversa devolvida pela equipe" do
    // cérebro (priorOutcome.returnedByAttendant) e rede do cron de silêncio.
    data: {
      status: 'bot',
      ...(STICKY_OWNER_ENABLED ? {} : { assignedToId: null }),
      queuedAt: null, queueAlertAt: null, botNudge30At: null, botNudge24At: null,
      returnedToBotAt: now,
      ...plan.data,
    },
  });
  if (before) {
    const who = before.contact?.name ?? before.contact?.phone;
    runAfterResponse('log wa_return_bot', () => logWhatsAppEvent({
      action: 'wa_return_bot',
      message: plan.text
        ? `devolveu ${who} para o atendimento automático (bot) — IA vai recolher: ${collectSummary(plan.text)}`
        : `devolveu ${who} para o atendimento automático (bot)`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
      metadata: {
        collectRequest: plan.text ? clipCollectText(plan.text, COLLECT_REQUEST_LOG_MAX) : null,
        collectSource: plan.source,
        collectChanged: plan.changed,
      },
      at: now,
    }));
  }
  return returnToBotPatch({ keepOwner: STICKY_OWNER_ENABLED, collect: plan.collect });
}

/**
 * Edita ou limpa o pedido em aberto pela barra "IA recolhendo" da conversa
 * (não muda o status). Texto → abre/substitui com origem 'devolver' e zera as
 * cobranças; null/'' → CONCLUI (com âncora: a detecção não reabre a lista).
 * Mesmo texto de um pedido válido → nada muda (idempotente).
 */
export async function setConversationCollectRequest(
  conversationId: string,
  text: string | null,
): Promise<Partial<WhatsAppConversationDTO>> {
  const ctx = await requireTeam();
  const before = await convContact(conversationId);
  if (!before) throw new Error('Conversa não encontrada.');
  const now = new Date();
  const wanted = normalizeCollectRequest(text);
  if (wanted && before.collect.text && isCollectRequestLive(before.collect.at, now) && sameCollectRequest(wanted, before.collect.text)) {
    return {};
  }
  if (!wanted && !before.collect.text) return collectRequestPatch(null);
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    data: wanted ? collectOpenData(wanted, ctx.userId, 'devolver', now) : collectRequestEndedData(now),
  });
  const authorName = ctx.name ?? 'Atendente';
  const who = before.contact?.name ?? before.contact?.phone;
  runAfterResponse('log wa_collect_request', () => logWhatsAppEvent({
    action: 'wa_collect_request',
    message: wanted
      ? `mudou o que a IA deve recolher de ${who}: ${collectSummary(wanted)}`
      : `encerrou o pedido em aberto da IA com ${who}`,
    authorId: ctx.userId,
    authorName,
    contactId: before.contactId,
    contactName: before.contact?.name,
    contactPhone: before.contact?.phone,
    metadata: {
      op: wanted ? 'set' : 'clear',
      text: wanted ? clipCollectText(wanted, COLLECT_REQUEST_LOG_MAX) : null,
      conversationId,
    },
    at: now,
  }));
  return collectRequestPatch(wanted ? { text: wanted, at: now, byName: authorName, source: 'devolver' } : null);
}

/**
 * Encerra o atendimento marcando a CATEGORIA do desfecho (qualificado,
 * não qualificado, perguntas, novo acidente, transferido). Se o cliente mandar
 * mensagem depois, a conversa reabre pro bot automaticamente.
 *
 * Aceita também `true/false` (compat) → qualificado / não qualificado.
 *
 * `collect` = o que fazer com o pedido em aberto (a tela pergunta quando há
 * um): 'concluir' grava o fim (com âncora: a lista não volta como pedido);
 * 'manter' deixa o pedido gravado e, se o cliente voltar em até 7 dias, a IA
 * retoma a lista de onde parou; ausente (sem pedido, ou aba com o bundle
 * antigo) limpa sem âncora, como o encerramento do cron.
 */
export async function closeConversation(
  conversationId: string,
  category: string | boolean = 'nao_qualificado',
  collect?: 'concluir' | 'manter',
): Promise<Partial<WhatsAppConversationDTO>> {
  const ctx = await requireTeam();
  const me = { id: ctx.userId, name: ctx.name ?? 'Atendente' };

  const cat = typeof category === 'boolean' ? (category ? 'qualificado' : 'nao_qualificado') : category;
  // Motivos dinâmicos criados pela equipe têm prefixo "nq_" — todos contam
  // como não qualificado; o resto precisa estar no mapa estático (hasOwn: o
  // `in` aceitava "constructor" e afins, herdados do Object).
  const closeCategory = Object.prototype.hasOwnProperty.call(QUALIFIED_BY_CATEGORY, cat) || cat.startsWith('nq_')
    ? cat
    : 'nao_qualificado';
  const qualified = qualifiedForCategory(closeCategory);
  // Vem do navegador: só os dois valores conhecidos contam.
  const keepRequest = collect === 'manter';
  const concludeRequest = collect === 'concluir';
  // Ficha (botMemory/botState) PRESERVADA nos desfechos que não desqualificam
  // (30/09/2026), como o bot e o cron já fazem desde 25/07: o checklist item a
  // item da coleta mora na ficha, e encerrar como "Qualificada" no meio da
  // lista apagava o que já tinha chegado. A limpeza por idade fica na
  // reabertura (service.ts). Não qualificada (nq_*) e descartada continuam
  // zerando: essas conversas nem voltam ao bot sozinhas.
  const wipeMemory = qualified === false || closeCategory === 'descartado';

  // Encerrar levava ~1,25 s no p50 (auditoria de 24/09/2026, DUR-3): contato,
  // motivo, snapshot, update, 5 queries de tag e o log, tudo em série. Agora
  // contato e rótulo saem juntos; as leituras da tag correm junto com o
  // snapshot + update; a gravação da tag, o log e o aviso à Meta vão para
  // depois da resposta.
  const [before, label] = await Promise.all([convContact(conversationId), closeCategoryLabel(closeCategory)]);

  const [closeTag] = await Promise.all([
    // Tag automática = o próprio desfecho ("Não qualificada — sem cobertura
    // INSS"): as tags de desfecho anteriores saem e as manuais ficam
    // (close-tags.ts). Só LEITURA aqui; as tags finais voltam no patch. null
    // = falhou (o encerramento vale assim mesmo) e a tela corrige na próxima
    // recarga pelo hash.
    prepareCloseTag(conversationId, closeCategory, label),
    (async () => {
      // Cérebro: snapshot ANTES do update (que pode zerar botMemory/botState
      // abaixo). A leitura do snapshot precisa ficar antes do update, por isso
      // ele não vai para depois da resposta.
      if (before) await captureConversation(before.contactId, 'manual', { closeCategory, qualified });
      await db.whatsAppConversation.update({
        where: { id: conversationId },
        // Desfecho real → ciclo de recuperação zerado por completo.
        data: {
          status: 'closed', closedAt: new Date(), assignedToId: null, qualified, closeCategory,
          ...(wipeMemory ? { botMemory: null, botState: null } : {}),
          botFailCount: 0, queuedAt: null, queueAlertAt: null, recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null,
          // Pedido em aberto: concluir (com âncora), manter, ou limpar sem
          // âncora (padrão: a lista do atendente volta a ser detectável se o
          // cliente responder na janela de 7 dias).
          ...(keepRequest ? {} : concludeRequest ? collectRequestEndedData() : COLLECT_REQUEST_CLEARED),
        },
      });
    })(),
  ]);

  // A gravação da tag só depois do update: encerramento que falha não deixa
  // tag de desfecho em conversa aberta.
  if (closeTag) runAfterResponse('tag de desfecho', closeTag.write);
  if (before) {
    const at = new Date();
    runAfterResponse('log wa_close', () => logWhatsAppEvent({
      action: 'wa_close',
      message: `encerrou o atendimento de ${before.contact?.name ?? before.contact?.phone} como ${label}`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
      metadata: {
        qualified, closeCategory, by: 'atendente',
        // O que aconteceu com o pedido em aberto (só quando havia um).
        ...(before.collect.text
          ? { collectRequest: keepRequest ? 'mantido' : concludeRequest ? 'concluido' : 'limpo' }
          : {}),
      },
      at,
    }));
    // Devolve pra Meta o desfecho decidido pelo atendente (qualificado /
    // não qualificado); outras categorias são ignoradas. Era promise solta,
    // que a Vercel podia congelar quando a action respondia.
    runAfterResponse('meta capi wa_close', () => reportLeadStageToMeta(before.contactId, closeCategory));
  }
  return { ...closePatch(closeCategory, label, { keepRequest }), ...(closeTag ? { tags: closeTag.tags } : {}) };
}

/**
 * Marca a conversa como lida PARA A EQUIPE TODA: se um atendente já abriu o
 * chat, o não-lido e as notificações do sino somem para os demais conectados.
 * De quebra, marca a última mensagem recebida como lida na Meta — o cliente
 * vê o tique azul quando alguém da equipe realmente abriu a conversa.
 *
 * Duas ondas em vez de 4 idas em série ao banco (auditoria de 24/09/2026): o
 * update da conversa já devolve contactId/numberId, então o findUnique de
 * antes saiu. Id inexistente lança (P2025) — o id vem sempre da lista.
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  const me = await requireTeamMember();
  const now = new Date();
  const [, conv] = await Promise.all([
    db.whatsAppConversationRead.upsert({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      update: { lastReadAt: now },
      create: { conversationId, userId: me.id, lastReadAt: now },
    }),
    // Leitura global (legado lastReadAt): garante que o badge some pra todo
    // mundo mesmo que a linha por-atendente acima seja só a minha.
    db.whatsAppConversation.update({
      where: { id: conversationId },
      data: { lastReadAt: now },
      select: { contactId: true, numberId: true },
    }),
  ]);

  // Sino: alguém já viu o chat → apaga o alerta pendente desse contato para
  // TODOS os destinatários (não só quem abriu).
  await db.notification.updateMany({
    where: { contactId: conv.contactId, read: false },
    data: { read: true },
  });

  // Tique azul no celular do cliente (best-effort; não bloqueia a leitura).
  // Pelo número DA CONVERSA: sem numberId o getCreds cai no número default e
  // o recibo saía pela linha errada (inclusive para a 2323 desativada). Linha
  // inativa → getCreds devolve null e o recibo simplesmente não sai.
  // Via runAfterResponse: como promise solta ela podia ser congelada quando a
  // action respondia, e o tique azul não saía.
  runAfterResponse('tique azul', async () => {
    const last = await db.whatsAppMessage.findFirst({
      where: { contactId: conv.contactId, direction: 'in', waMessageId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { waMessageId: true },
    });
    if (last?.waMessageId) await markMessageRead(last.waMessageId, false, conv.numberId);
  });
}

/**
 * Marca a conversa como NÃO LIDA para a equipe toda — o caso clássico é abrir
 * sem querer a conversa que outra pessoa está atendendo: marcar como não lida
 * devolve o badge verde pra quem realmente vai atender. Apaga as linhas de
 * leitura por atendente e zera o legado global.
 */
export async function markConversationUnread(conversationId: string): Promise<void> {
  await requireTeamMember();
  await db.whatsAppConversationRead.deleteMany({ where: { conversationId } });
  // Sentinela da época (não null): marca "não lida MANUAL" — a lista mostra um
  // marcador próprio em vez de contar o histórico inteiro como não lido (99+).
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    data: { lastReadAt: new Date(0) },
  });
}
