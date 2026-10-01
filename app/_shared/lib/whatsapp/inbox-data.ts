import { Prisma } from '@prisma/client';
import { db } from '@/app/_shared/lib/prisma';
import { fetchLabels } from '@/app/_shared/lib/db/labels';
import { TEAM_ROLES } from '@/app/_shared/lib/permissions';
import { getInactiveNumberIdsCached } from '@/app/_shared/lib/whatsapp/numbers';
import { LIST_PREVIEW_MAX_CHARS, computeUnread, listPreview } from '@/app/_shared/utils/whatsapp-inbox';
import { CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';
import { fallbackCloseLabel } from '@/app/_shared/utils/close-tag-plan';
import { collectRequestPatch, isCollectSource } from '@/app/_shared/utils/collect-request';
import { INBOX_LIST_PAGE } from '@/app/_shared/utils/inbox-delta';
import {
  INBOX_FILTER_PAGE, buildInboxWhere, hasServerFilter, normalizeFilterTerm, type InboxServerFilter,
} from '@/app/_shared/utils/inbox-filter';
import type {
  InboxColumnsResponse, InboxDeltaResponse, InboxListResponse, InboxSearchResponse, InboxVersionResponse,
  WhatsAppConversationDTO,
} from './inbox-types';

// Leituras da lista do inbox do WhatsApp: lista, delta (só o que mudou), hash
// de versão, busca, hidratação de UMA conversa e contagem de não lidas.
//
// Sem "use server" e SEM guarda de acesso: quem chama já passou pela guarda —
// as rotas GET de app/api/whatsapp/inbox/* (`teamRoute`: cargo do banco +
// trava de IP) e os wrappers de app/_actions/whatsapp/conversations.ts
// (mantidos para as abas abertas com o bundle antigo). Nunca exponha estas
// funções numa rota ou action sem guarda.
//
// Por que saiu das actions (auditoria de 24/09/2026, FE-1): server actions
// saem numa fila SERIAL por aba, e a lista de 1.000 conversas + o hash de 15 s
// seguravam o clique do atendente (tag, assumir, encerrar) atrás do poll. Por
// rota GET as leituras correm em paralelo e a fila fica só com mutações.

/**
 * Quantas conversas a lista do inbox carrega de uma vez (as mais recentes).
 * O valor mora em inbox-delta.ts: o cliente corta a lista fundida pelo delta
 * no mesmo teto.
 */
export const LIST_PAGE = INBOX_LIST_PAGE;
/** Quantas conversas a busca/filtro no servidor devolve por página ("Carregar mais" pede a próxima). */
export const SEARCH_PAGE = INBOX_FILTER_PAGE;
/** Cards que o termo da busca casa pelo nome (o nome exibido na lista é o do card). */
const CARD_NAME_MATCH_CAP = 300;
/**
 * Teto do delta: mais conversas mudadas que isto (pico, aba que voltou depois
 * de horas) → `full: true` e o cliente busca a lista inteira, que sai mais
 * barata que hidratar centenas de linhas avulsas.
 */
export const DELTA_CAP = 300;
/** Cards alterados que o delta ainda segue um a um; acima disso (edição em massa), lista inteira. */
const DELTA_USERS_CAP = 500;

// Campos da ficha que a lista usa (resumo do caso + pendência de CPF). Vem do
// User quando o contato já virou card, senão do clientDraft do contato.
interface DraftFichaShape {
  cpf?: string | null; cidade?: string | null;
  lesoes?: string | null; data_acidente?: string | null;
}

/**
 * Contagem leve de conversas não lidas para o badge das abas. Não hidrata
 * contato/tags/preview — só um número.
 *
 * Mesma regra de `computeUnread` na lista: não lida = "Marcar como não lida"
 * (lastReadAt na época) OU mensagem RECEBIDA (sem nota interna) depois da
 * leitura efetiva de qualquer atendente. Não volte a lastMessageAt > leitura:
 * contava o envio do próprio atendente e do bot. Conta só as NÃO encerradas —
 * o badge do topo = linhas com bolinha verde nas pastas abertas. EXPLAIN de
 * 25/09/2026 com ~380 abertas = ~5 ms, EXISTS pelo índice (contactId,
 * createdAt), sem seq scan em whatsapp_messages.
 *
 * `TIMESTAMP 'epoch'` (e não to_timestamp(0)): as colunas são timestamp SEM
 * fuso, e a igualdade da sentinela não pode depender do TimeZone da sessão.
 */
export async function countUnreadConversations(): Promise<number> {
  const rows = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM whatsapp_conversations c
    CROSS JOIN LATERAL (
      SELECT GREATEST(c."lastReadAt", MAX(r."lastReadAt")) AS read_at
      FROM whatsapp_conversation_reads r
      WHERE r."conversationId" = c.id
    ) rr
    WHERE c.status <> 'closed'
      AND (
        rr.read_at = TIMESTAMP 'epoch'
        OR EXISTS (
          SELECT 1
          FROM whatsapp_messages m
          WHERE m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false
            AND m."createdAt" > COALESCE(rr.read_at, TIMESTAMP 'epoch')
        )
      )
  `;
  return Number(rows[0]?.n ?? 0);
}

// Montagem do DTO da lista, compartilhada pelas três entradas: a lista normal
// do inbox (mais recentes), a BUSCA no servidor e a hidratação de UMA conversa
// pelo contato. Antes só existia a lista capada — quem estava fora do topo não
// aparecia na busca nem abria pela agenda (27/08/2026).
//
// Desenho (auditoria de 24/09/2026): o findMany e depois UMA onda de consultas
// em paralelo. Antes eram ~10-12 idas e voltas em série ao Neon e a contagem
// de não lidas sozinha era 44-48% do tempo do banco (JOIN de todas as
// mensagens recebidas dos 1.000 contatos + GROUP BY, ~83 ms). Hoje são ~5-6 em
// série: o findMany com contact + tags ainda custa ~4 internas, porque o
// schema não liga `relationJoins` (próxima alavanca, fora desta mudança).
export async function loadConversations(
  where: Prisma.WhatsAppConversationWhereInput | undefined,
  take: number,
  // Páginas do filtro no servidor ("Carregar mais"). Mesma ordem do findMany:
  // lastMessageAt desc.
  skip = 0,
): Promise<WhatsAppConversationDTO[]> {
  // `select` explícito (não `include`): a conversa carrega botMemory (JSON
  // grande) e uma dúzia de colunas de controle que a lista nunca mostra —
  // 1.000 linhas disso a cada poll era tráfego puro Neon → Vercel.
  //
  // Sem `reads` aqui: sem relationJoins, `reads: { orderBy, take: 1 }` trazia
  // TODAS as leituras das 1.000 conversas e cortava em memória. A leitura
  // efetiva vem do readRows abaixo, junto com a contagem.
  const conversations = await db.whatsAppConversation.findMany({
    where,
    orderBy: { lastMessageAt: 'desc' },
    take,
    ...(skip > 0 ? { skip } : {}),
    select: {
      id: true, contactId: true, numberId: true, status: true, qualified: true,
      closeCategory: true, assignedToId: true, lastMessageAt: true,
      createdAt: true, recoveryAttempts: true,
      // Pedido em aberto (barra "IA recolhendo" + pill "Lista"). Quem grava é
      // a própria conversa por Prisma update/updateMany, que toca o
      // @updatedAt: o delta (?since=) já traz a mudança.
      collectRequest: true, collectRequestAt: true, collectRequestById: true,
      collectRequestSource: true, collectNudgeCount: true,
      contact: {
        select: {
          id: true, name: true, phone: true, optedOut: true, userId: true,
          clientDraft: true, adPlatform: true,
        },
      },
      // Ordem de aplicação, a mesma de setConversationTag e do patch otimista
      // (withTag põe a nova no fim): sem ela os chips trocavam de lugar quando
      // a recarga trazia a lista depois de um clique.
      tags: {
        orderBy: { createdAt: 'asc' },
        select: { tag: { select: { id: true, name: true, color: true } } },
      },
    },
  });
  if (!conversations.length) return [];

  const contactIds = conversations.map((c) => c.contactId);
  // Motivo do handoff só aparece na Fila — a nota do bot é buscada só pra elas.
  const queuedContactIds = conversations.filter((c) => c.status === 'queued').map((c) => c.contactId);
  // Quem pediu a lista em aberto entra na MESMA consulta de nomes dos donos
  // (nada de ida ao banco a mais).
  const assigneeIds = [...new Set(
    conversations.flatMap((c) => [c.assignedToId, c.collectRequestById]).filter((id): id is string => !!id),
  )];
  // Nome EXIBIDO: manda o nome do card quando o contato já está vinculado a um
  // cliente. O `whatsapp_contacts.name` nasce do perfil do WhatsApp (apelido,
  // "Askeladd") e nem sempre acompanha a correção feita no card — na lista quem
  // vale é o cadastro.
  const linkedUserIds = [...new Set(
    conversations.map((c) => c.contact.userId).filter((id): id is string => !!id),
  )];

  const [lastRows, assignees, handoffNotes, linkedUsers, readRows, reasonRows, inactiveIds, labels] = await Promise.all([
    // Última mensagem (preview) e última mensagem RECEBIDA (janela de 24h) por
    // contato. ATENÇÃO (14/09/2026): isto era `findMany` + `distinct:['contactId']`
    // + `orderBy createdAt`. O Prisma NÃO traduz esse distinct pra DISTINCT ON —
    // ele puxava TODAS as mensagens dos 1.000 contatos (~30 mil linhas, com
    // corpo) e deduplicava em memória, a cada poll de 15s. Era a maior fonte de
    // tráfego de saída da Neon. Agora é um LATERAL LIMIT 1 por contato no
    // Postgres, servido pelo índice (contactId, createdAt): 1 linha por contato.
    // A prévia já sai cortada (left conta caracteres, não quebra emoji) e o
    // nome do autor vem no mesmo JOIN — antes era mais uma ida ao banco.
    db.$queryRaw<{
      contactId: string;
      body: string | null; mediaType: string | null; direction: string | null;
      sentByBot: boolean | null; status: string | null;
      authorUserId: string | null; authorName: string | null;
      lastInboundAt: Date | null;
    }[]>`
      SELECT c."contactId",
             left(lm.body, ${LIST_PREVIEW_MAX_CHARS}::int) AS body,
             lm."mediaType", lm.direction, lm."sentByBot", lm.status,
             au.id AS "authorUserId", au.name AS "authorName",
             li."createdAt" AS "lastInboundAt"
      FROM unnest(${contactIds}::text[]) AS c("contactId")
      LEFT JOIN LATERAL (
        SELECT m.body, m."mediaType", m.direction, m."sentByBot", m."authorId", m.status
        FROM whatsapp_messages m
        WHERE m."contactId" = c."contactId"
        ORDER BY m."createdAt" DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN "User" au ON au.id = lm."authorId"
      LEFT JOIN LATERAL (
        SELECT m."createdAt"
        FROM whatsapp_messages m
        WHERE m."contactId" = c."contactId" AND m.direction = 'in'
        ORDER BY m."createdAt" DESC
        LIMIT 1
      ) li ON true
    `,
    assigneeIds.length
      ? db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string | null }[]),
    // Linha da Fila: 200 caracteres bastam (a lista mostra uma linha só).
    queuedContactIds.length
      ? db.$queryRaw<{ contactId: string; body: string | null }[]>`
          SELECT c."contactId", left(hn.body, 200) AS body
          FROM unnest(${queuedContactIds}::text[]) AS c("contactId")
          JOIN LATERAL (
            SELECT m.body
            FROM whatsapp_messages m
            WHERE m."contactId" = c."contactId" AND m.internal = true AND m."sentByBot" = true
            ORDER BY m."createdAt" DESC
            LIMIT 1
          ) hn ON true
        `
      : Promise.resolve([] as { contactId: string; body: string | null }[]),
    linkedUserIds.length
      ? db.user.findMany({
          where: { id: { in: linkedUserIds } },
          select: {
            id: true, name: true, role: true, labelId: true,
            cpf: true, cidade: true, lesoes: true, data_acidente: true,
          },
        })
      : Promise.resolve([] as {
          id: string; name: string | null; role: string; labelId: string | null;
          cpf: string | null; cidade: string | null; lesoes: string | null; data_acidente: string | null;
        }[]),
    // Leitura efetiva + contagem de não lidas, 1 linha por conversa. Leitura
    // GLOBAL: se QUALQUER atendente já abriu a conversa, ela deixa de contar
    // como não lida para o resto da equipe (GREATEST ignora NULL, então vale a
    // mais recente entre o lastReadAt legado e as leituras por atendente).
    // A contagem é um COUNT por contato no índice (contactId, createdAt), só
    // das mensagens RECEBIDAS depois dessa leitura. O MAX fica no FROM do
    // LATERAL (não num subselect escalar) para o Postgres calcular a leitura
    // uma vez só por conversa. Conferido 1:1 com a query antiga em 25/09/2026
    // (1.000 conversas): ~8,5 ms e ~8 mil buffers, contra ~110 ms e ~91 mil.
    db.$queryRaw<{ contactId: string; readAt: Date | null; cnt: number }[]>`
      SELECT c."contactId", rr.read_at AS "readAt", u.cnt
      FROM whatsapp_conversations c
      CROSS JOIN LATERAL (
        SELECT GREATEST(c."lastReadAt", MAX(r."lastReadAt")) AS read_at
        FROM whatsapp_conversation_reads r
        WHERE r."conversationId" = c.id
      ) rr
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM whatsapp_messages m
        WHERE m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false
          AND m."createdAt" > COALESCE(rr.read_at, to_timestamp(0))
      ) u
      WHERE c."contactId" = ANY(${contactIds})
    `,
    // Rótulos dos motivos dinâmicos (nq_*): tabela minúscula e, dentro da
    // onda, não soma latência — sem cache, para motivo novo não aparecer como
    // chave crua em outra instância.
    db.whatsAppCloseReason.findMany({ select: { key: true, label: true } }),
    getInactiveNumberIdsCached(),
    // Nome da coluna pelo labelId do card (cache com tag 'labels', o mesmo do
    // board): sem o `label` aninhado no findMany acima, que sem relationJoins
    // seria mais uma ida ao banco em série.
    fetchLabels(),
  ]);

  const previewByContact = new Map(
    lastRows.filter((r) => r.direction !== null).map((r) => [r.contactId, r]),
  );
  const inboundByContact = new Map(
    lastRows.filter((r) => r.lastInboundAt !== null).map((r) => [r.contactId, r.lastInboundAt as Date]),
  );
  const handoffByContact = new Map(handoffNotes.map((m) => [m.contactId, m.body]));
  const assigneeNameById = new Map(assignees.map((u) => [u.id, u.name ?? 'Atendente']));
  const cardNameById = new Map(linkedUsers.map((u) => [u.id, u.name]));
  // Coluna do kanban do cliente vinculado: a fonte da verdade é o labelId do
  // card; `User.role` é só a cópia do nome (diverge quando a coluna é
  // renomeada) e fica de fallback. O filtro "Coluna do Kanban" usa o id.
  const labelNameById = new Map(labels.map((l) => [l.id, l.name]));
  const columnByUserId = new Map(linkedUsers.map((u) => [
    u.id,
    { labelId: u.labelId, name: (u.labelId ? labelNameById.get(u.labelId) : undefined) ?? u.role },
  ]));
  const fichaByUserId = new Map<string, DraftFichaShape>(linkedUsers.map((u) => [u.id, u]));
  const readAtByContact = new Map(readRows.map((r) => [r.contactId, r.readAt]));
  const unreadCountByContact = new Map(readRows.map((r) => [r.contactId, Number(r.cnt)]));
  const reasonLabelByKey = new Map(reasonRows.map((r) => [r.key, r.label]));
  const inactiveNumberIds = new Set(inactiveIds);
  // Mesma regra do closeCategoryLabel (close-tags.ts): o chip da lista e o
  // nome da tag de desfecho saem iguais, nunca a chave crua ("nq_engano").
  const closeLabelOf = (cat: string | null): string | null => {
    if (!cat) return null;
    return CLOSE_CATEGORY_LABELS[cat] ?? reasonLabelByKey.get(cat) ?? fallbackCloseLabel(cat);
  };

  return conversations.map((c) => {
    const last = previewByContact.get(c.contactId);
    const inboundAt = inboundByContact.get(c.contactId) ?? null;
    // Leitura efetiva: a mais recente de QUALQUER atendente, com o lastReadAt
    // global (legado) como fallback — já resolvida no SQL.
    const effectiveReadAt = readAtByContact.get(c.contactId) ?? null;
    const unreadCount = unreadCountByContact.get(c.contactId) ?? 0;
    // Não lida só por mensagem RECEBIDA (a mesma contagem do badge verde) ou
    // pela sentinela de "Marcar como não lida". Era lastMessageAt > leitura,
    // e o envio do próprio atendente/bot reacendia a conversa (ver computeUnread).
    const { unread, manualUnread } = computeUnread({ readAt: effectiveReadAt, unreadCount });
    // Ficha do caso: do User quando o contato já virou cliente, senão do
    // rascunho coletado no atendimento (clientDraft).
    const column = c.contact.userId ? columnByUserId.get(c.contact.userId) : undefined;
    const ficha: DraftFichaShape | null = c.contact.userId
      ? fichaByUserId.get(c.contact.userId) ?? null
      : (c.contact.clientDraft as unknown as DraftFichaShape | null);
    return {
      id: c.id,
      contactId: c.contactId,
      contactName:
        (c.contact.userId ? cardNameById.get(c.contact.userId)?.trim() : null) || c.contact.name,
      contactPhone: c.contact.phone,
      status: c.status,
      qualified: c.qualified,
      closeCategory: c.closeCategory,
      closeCategoryLabel: c.status === 'closed' ? closeLabelOf(c.closeCategory) : null,
      assignedToId: c.assignedToId,
      assignedToName: c.assignedToId ? assigneeNameById.get(c.assignedToId) ?? null : null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      lastReadAt: effectiveReadAt?.toISOString() ?? null,
      lastInboundAt: inboundAt?.toISOString() ?? null,
      // Mesma regra do patch local do envio (sentMessagePatch): a linha não
      // "pula" quando o hash recarrega a lista depois de um envio.
      lastMessagePreview: last ? listPreview(last) : null,
      // authorUserId nulo = autor apagado ou mensagem sem autor humano.
      lastMessageAuthorName:
        last?.direction === 'out' && !last.sentByBot && last.authorUserId
          ? last.authorName ?? 'Atendente'
          : null,
      lastMessageFromBot: !!last?.sentByBot,
      lastMessageFromClient: last?.direction === 'in',
      lastMessageStatus: last?.direction === 'out' ? last.status ?? null : null,
      lastMessageMediaType: last?.mediaType ?? null,
      handoffReason: c.status === 'queued' ? handoffByContact.get(c.contactId) ?? null : null,
      adPlatform: c.contact.adPlatform ?? null,
      createdAt: c.createdAt.toISOString(),
      caseLesoes: ficha?.lesoes?.trim() || null,
      caseCidade: ficha?.cidade?.trim() || null,
      caseDataAcidente: ficha?.data_acidente?.trim() || null,
      hasCpf: !!ficha?.cpf?.trim(),
      recoveryAttempts: c.recoveryAttempts,
      // Mesma função do otimista da tela (collectRequestPatch), senão a barra
      // "pula" quando o delta chega. Origem desconhecida (linha antiga) vale
      // como texto do Devolver.
      ...collectRequestPatch(c.collectRequest ? {
        text: c.collectRequest,
        at: c.collectRequestAt ?? c.lastMessageAt,
        byName: c.collectRequestById ? assigneeNameById.get(c.collectRequestById) ?? null : null,
        source: isCollectSource(c.collectRequestSource) ? c.collectRequestSource : 'devolver',
        nudges: c.collectNudgeCount,
      } : null),
      unread,
      unreadCount,
      // Sentinela da época (epoch) = "Marcar como não lida" — a UI mostra um
      // marcador próprio em vez da contagem do histórico inteiro.
      manualUnread,
      kanbanColumn: column?.name ?? null,
      kanbanLabelId: column?.labelId ?? null,
      optedOut: c.contact.optedOut,
      numberId: c.numberId,
      readOnly: !!c.numberId && inactiveNumberIds.has(c.numberId),
      tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    };
  });
}

/**
 * Lista do inbox: as conversas mais recentes. As pastas do rail e os filtros
 * de leitura/número contam em cima DESTA lista (o inbox avisa que é o recorte
 * recente). Busca, tag, data de entrada e coluna do Kanban vão ao banco
 * inteiro (`queryConversations`), com o total real.
 *
 * ~1,3 MB cru (~165 KB gzip) com 1.000 linhas: abaixo do teto de 4,5 MB de
 * resposta da função. Com o delta ela desce só na montagem e a cada 10 min,
 * mas `LIST_PAGE` continua preso a esse teto.
 */
export function loadConversationList(): Promise<WhatsAppConversationDTO[]> {
  return loadConversations(undefined, LIST_PAGE);
}

/**
 * Instante do BANCO (o cursor do delta) e total real de conversas, numa ida.
 *
 * O cursor é o now() do Postgres, não o relógio da função: o cliente devolve
 * esse valor no `?since=` seguinte e o recorte compara com colunas gravadas
 * por várias instâncias. A margem de `sinceWithOverlap` (5 s) cobre relógio
 * de quem escreveu e commit que chega depois da leitura.
 *
 * Roda EM PARALELO com a leitura da lista: se o now() sair uns milissegundos
 * depois do SELECT das conversas, a mudança desse vão ainda cai dentro da
 * margem. `total` é a mesma contagem do hash antigo (~5 mil linhas, ~1 ms).
 */
async function readSyncMeta(): Promise<{ cursor: Date; total: number }> {
  const rows = await db.$queryRaw<{ cursor: Date; total: number }[]>`
    SELECT now() AS cursor, (SELECT count(*)::int FROM whatsapp_conversations) AS total
  `;
  const row = rows[0];
  return { cursor: row?.cursor ?? new Date(), total: Number(row?.total ?? 0) };
}

/**
 * Lista completa para a sincronização por delta: as `LIST_PAGE` mais recentes
 * + o cursor de onde o delta parte + o total. Só na montagem, a cada 10 min
 * (rede de segurança para o que o delta não vê) ou quando o delta pede
 * (`full: true`).
 */
export async function loadInboxList(): Promise<InboxListResponse> {
  const [meta, items] = await Promise.all([readSyncMeta(), loadConversationList()]);
  return { items, cursor: meta.cursor.toISOString(), total: meta.total };
}

/**
 * Delta da lista (auditoria de 24/09/2026, B3): só as conversas que mudaram
 * desde `since`, no MESMO DTO da lista. É o poll de 15 s do inbox — antes era
 * o hash, que a cada mudança derrubava a lista inteira (~1,3 MB) em toda aba.
 *
 * O que entra (OR em whatsapp_conversations, ~5 mil linhas; nunca varre
 * whatsapp_messages):
 * - `updatedAt`: status, dono, desfecho, leitura (markRead/markUnread gravam
 *   lastReadAt na conversa), tag (setConversationTag "toca" a conversa, senão
 *   REMOVER tag não deixava rastro), nota interna (os gravadores de nota tocam
 *   a conversa) e mídia recebida (a ingestão toca depois do download);
 * - `lastMessageAt`: mensagem nova, recebida ou enviada;
 * - tag APLICADA (`createdAt` da ligação): fluxo, qualificação e desfecho do
 *   bot criam a tag sem tocar a conversa;
 * - contato (`updatedAt`): nome, opt-out, vínculo com o card, ficha
 *   (clientDraft) e origem do anúncio;
 * - card vinculado alterado (User fora da equipe com `updatedAt` novo): nome,
 *   coluna e ficha que a lista mostra. O filtro de cargo é para o heartbeat de
 *   presença da equipe (que mexe no User.updatedAt) não puxar conversa nenhuma.
 *
 * Fora do delta (só na lista completa de 10 min): tique de status da última
 * mensagem (applyStatusUpdate só mexe em whatsapp_messages), editar/apagar
 * mensagem, docsCount, rename/recolor/exclusão de tag, nome do atendente,
 * rótulo de motivo `nq_*` novo, número desativado e EXCLUSÃO de contato
 * (cascade: quem excluiu tira da tela; as outras abas, no full ou no 404 ao
 * abrir).
 *
 * Custo: sem índice em updatedAt, o OR vira varredura das ~5 mil conversas com
 * subplans nas tags e nos contatos. EXPLAIN ANALYZE de 26/09/2026 (só
 * leitura, janela de 20 s): ~7,5 ms, ~7 mil buffers em cache; a busca dos
 * cards ~0,5 ms. Delta vazio = 3 idas curtas e nenhuma hidratação. Sem índice
 * novo por ora.
 *
 * Mais de `cap` conversas mudadas → `full: true` sem itens (a lista inteira
 * sai mais barata).
 */
export async function loadConversationsSince(since: Date, cap = DELTA_CAP): Promise<InboxDeltaResponse> {
  const [meta, changedCards] = await Promise.all([
    readSyncMeta(),
    db.user.findMany({
      where: { updatedAt: { gt: since }, role: { notIn: [...TEAM_ROLES] } },
      select: { id: true },
      take: DELTA_USERS_CAP + 1,
    }),
  ]);
  const cursor = meta.cursor.toISOString();
  if (changedCards.length > DELTA_USERS_CAP) {
    return { items: [], cursor, full: true, total: meta.total };
  }
  const cardIds = changedCards.map((u) => u.id);

  const items = await loadConversations(
    {
      OR: [
        { updatedAt: { gt: since } },
        { lastMessageAt: { gt: since } },
        { tags: { some: { createdAt: { gt: since } } } },
        { contact: { updatedAt: { gt: since } } },
        ...(cardIds.length ? [{ contact: { userId: { in: cardIds } } }] : []),
      ],
    },
    cap + 1,
  );
  if (items.length > cap) return { items: [], cursor, full: true, total: meta.total };
  return { items, cursor, full: false, total: meta.total };
}

/**
 * "Versão" do inbox (14/09/2026): um hash barato do estado que a lista
 * exibe. TRANSITÓRIO desde a sincronização por delta (`loadConversationsSince`,
 * que virou o poll de 15 s): fica só para as abas com o bundle anterior
 * (rota /api/whatsapp/inbox/version e o wrapper `getWhatsAppInboxVersion`) e
 * sai quando o delta estabilizar. No desenho antigo o poll perguntava só isto
 * e a lista completa (1.000 conversas hidratadas) descia quando o hash mudava. Cobre: qualquer conversa alterada (status,
 * atribuição, desfecho, lastMessageAt), leituras, etiquetas e o total.
 *
 * `total` sai da MESMA varredura de whatsapp_conversations que já entra no
 * hash (o count(*)): é o badge "N conversas" do topo da lista, que antes
 * tinha um poll próprio de count. O md5 é o mesmo da versão anterior
 * (conferido em 26/09/2026), então a troca não força recarga da lista.
 *
 * O termo de whatsapp_messages continua porque nota interna
 * (sendWhatsAppInternalNote, postInternalNote do bot) cria mensagem sem mexer
 * em whatsapp_conversations, e a prévia da lista mostra a nota. O custo vem
 * do índice whatsapp_messages_createdAt_idx: max("createdAt") vira Index Only
 * Scan Backward (~1 ms) em vez de seq scan da tabela toda a cada 15 s por aba.
 * EXPLAIN ANALYZE de 26/09/2026: ~4 ms no total.
 */
export async function getInboxVersion(): Promise<InboxVersionResponse> {
  const rows = await db.$queryRaw<{ v: string; total: number }[]>`
    WITH conv AS (
      SELECT count(*) AS n, max("updatedAt") AS mu, max("lastMessageAt") AS ml
      FROM whatsapp_conversations
    )
    SELECT md5(concat_ws('|',
      concat(conv.n, ':', coalesce(conv.mu::text, ''), ':', coalesce(conv.ml::text, '')),
      (SELECT coalesce(max("lastReadAt")::text, '') FROM whatsapp_conversation_reads),
      (SELECT concat(count(*), ':', coalesce(max("createdAt")::text, '')) FROM whatsapp_conversation_tags),
      (SELECT coalesce(max("createdAt")::text, '') FROM whatsapp_messages)
    )) AS v,
    conv.n::int AS total
    FROM conv
  `;
  return { version: rows[0]?.v ?? '', total: Number(rows[0]?.total ?? 0) };
}

/**
 * Filtros do inbox no BANCO INTEIRO (auditoria de 24/09/2026, E3): busca,
 * tag, data de entrada e coluna do Kanban (número e "Em fila" entram junto),
 * uma página de `SEARCH_PAGE` a partir de `f.skip` + o total que casa. Antes
 * tag e data filtravam só as 1.000 carregadas e o contador mentia (tag
 * Contratados 124 de 276; "Este mês" 861 de 1.608).
 *
 * Regras do where em `buildInboxWhere` (inbox-filter.ts, puro e testado). O
 * que ele precisa de `users` sai antes, numa onda só: cards cujo nome casa com
 * o termo (WhatsAppContact não tem relação com User, só o userId solto) e os
 * cards NÃO arquivados da coluna (o quadro não mostra arquivados). Depois a
 * página e o count em paralelo, só em whatsapp_conversations (~5 mil linhas)
 * e nas tabelas pequenas; whatsapp_messages só entra pelo LATERAL da montagem.
 *
 * Sem filtro de servidor (termo < 2 caracteres e nada mais) → vazio: a lista
 * normal já é o "sem filtro".
 */
export async function queryConversations(f: InboxServerFilter): Promise<InboxSearchResponse> {
  if (!hasServerFilter(f)) return { items: [], total: 0 };
  const term = normalizeFilterTerm(f.term);
  const [cardMatches, labelCards] = await Promise.all([
    term
      ? db.user.findMany({
          where: { name: { contains: term, mode: 'insensitive' } },
          select: { id: true },
          take: CARD_NAME_MATCH_CAP,
        })
      : Promise.resolve([] as { id: string }[]),
    f.labelId
      ? db.user.findMany({ where: { labelId: f.labelId, archivedAt: null }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  const where = buildInboxWhere(f, {
    cardIdsForTerm: cardMatches.map((u) => u.id),
    userIdsForLabel: labelCards ? labelCards.map((u) => u.id) : null,
  });
  const [items, total] = await Promise.all([
    loadConversations(where, SEARCH_PAGE, f.skip ?? 0),
    db.whatsAppConversation.count({ where }),
  ]);
  return { items, total };
}

/**
 * BUSCA por termo (27/08/2026): nome do contato, nome do CARD vinculado (o
 * nome que a lista exibe) e telefone, em TODAS as conversas. Sem isso, quem
 * tinha conversa antiga "sumia" do inbox ao ser pesquisado. Termo com menos
 * de 2 caracteres → lista vazia. Só para a action antiga
 * (`searchWhatsAppConversations`, bundle anterior); a rota usa
 * `queryConversations`.
 */
export async function searchConversations(term: string): Promise<WhatsAppConversationDTO[]> {
  return (await queryConversations({ term })).items;
}

/**
 * Colunas do Kanban para o filtro do inbox, na ordem do quadro, com quantas
 * conversas têm card NÃO arquivado em cada uma (a mesma regra do filtro). O
 * número antigo contava só as 1.000 carregadas. EXPLAIN ANALYZE de 26/09/2026
 * (só leitura): ~4 ms.
 */
export async function loadInboxColumns(): Promise<InboxColumnsResponse> {
  const rows = await db.$queryRaw<{ id: string; name: string; n: number }[]>`
    SELECT l.id, l.name, COALESCE(x.n, 0)::int AS n
    FROM "Label" l
    LEFT JOIN (
      SELECT u."labelId" AS label_id, count(*)::int AS n
      FROM whatsapp_conversations c
      JOIN whatsapp_contacts ct ON ct.id = c."contactId"
      JOIN "User" u ON u.id = ct."userId"
      WHERE u."archivedAt" IS NULL AND u."labelId" IS NOT NULL
      GROUP BY u."labelId"
    ) x ON x.label_id = l.id
    ORDER BY l."order" ASC, l.name ASC
  `;
  return { items: rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.n) })) };
}

/**
 * Hidrata UMA conversa pelo contato — usado ao abrir alguém pela agenda ou
 * pela busca: sem isso, contato fora do topo da lista abria a thread "vazia"
 * porque o cabeçalho procurava a conversa dentro da lista carregada.
 */
export async function loadConversationByContact(contactId: string): Promise<WhatsAppConversationDTO | null> {
  const [conv] = await loadConversations({ contactId }, 1);
  return conv ?? null;
}
