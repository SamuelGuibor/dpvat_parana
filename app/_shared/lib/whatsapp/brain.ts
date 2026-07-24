import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/app/_shared/lib/prisma';

// CÉREBRO DA IA — camada 1 (arquivo bruto) e camada 2 (índice).
//
// Toda conversa encerrada vira:
//   1. um SNAPSHOT JSON imutável no S3 (thread completa + ficha + desfecho)
//   2. uma linha em WhatsAppReview (o índice que alimenta a fila de revisão)
//
// Por que S3 e não só o banco: o snapshot é grande (thread inteira), imutável e
// só é lido quando alguém abre a conversa pra revisar. Guardar isso no Postgres
// incharia a tabela sem nenhum ganho — o S3 custa ~zero e é infinito. O banco
// fica só com os metadados que a LISTA precisa (filtrar/ordenar/contar).
//
// ⚠️ ORDEM IMPORTA: três dos quatro caminhos de encerramento apagam
// botMemory/botState no mesmo update. captureConversation() precisa rodar ANTES
// desse update, senão a ficha que a IA construiu se perde e o snapshot nasce
// cego. Todos os chamadores respeitam isso.
//
// Tudo aqui é BEST-EFFORT: uma falha de S3 nunca pode impedir o encerramento de
// um atendimento. Falhou, loga e segue.

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const PREFIX = 'whatsapp-brain/conversas';

/** Motivo do encerramento — quem tomou a decisão. */
export type ClosedReason = 'bot_disqualify' | 'bot_resolve' | 'cron_silencio' | 'manual';

export interface SnapshotTurn {
  at: string;
  role: 'client' | 'bot' | 'agent' | 'nota';
  text: string;
  mediaType?: string | null;
  /** Transcrição de áudio, quando existir (o texto real do que o cliente falou). */
  transcript?: string | null;
  authorName?: string | null;
}

export interface ConversationSnapshot {
  version: 1;
  capturedAt: string;
  closedReason: ClosedReason;
  contact: {
    id: string;
    phone: string;
    name: string | null;
    /** Origem do lead (Click-to-WhatsApp), quando veio de anúncio. */
    adPlatform: string | null;
    adSourceId: string | null;
    adHeadline: string | null;
    /** Vínculo com o CRM, se o contato já virou cliente/card. */
    userId: string | null;
    processId: string | null;
  };
  conversation: {
    id: string | null;
    qualified: boolean | null;
    closeCategory: string | null;
    /** A ficha de fatos que a IA montou — o "raciocínio" acumulado dela. */
    botMemory: string | null;
    botState: string | null;
    botFailCount: number;
    urgent: boolean;
    createdAt: string | null;
    lastMessageAt: string | null;
  };
  messages: SnapshotTurn[];
  stats: {
    total: number;
    fromClient: number;
    fromBot: number;
    fromAgent: number;
    /** Duração do atendimento, da primeira à última mensagem (ms). */
    durationMs: number | null;
  };
}

function configured(): boolean {
  return !!BUCKET && !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
}

/**
 * Texto legível de uma mensagem. Áudio já transcrito entra como o texto falado
 * — sem isso metade das conversas viraria "📎 (anexo)" e a revisão seria cega.
 */
function turnText(m: {
  body: string | null;
  transcript: string | null;
  mediaType: string | null;
}): string {
  if (m.body?.trim()) return m.body.trim();
  if (m.transcript?.trim()) return `[áudio] ${m.transcript.trim()}`;
  if (m.mediaType) return `📎 (${m.mediaType})`;
  return '';
}

/**
 * Captura o snapshot de uma conversa que está sendo encerrada e cria a linha na
 * fila de revisão.
 *
 * Chame ANTES do update que muda status para "closed" (ver aviso no topo).
 *
 * `outcome` existe porque três dos quatro caminhos definem o desfecho NO MESMO
 * update que estamos antecipando — sem ele, o snapshot gravaria a categoria
 * antiga (em geral null) e a fila nasceria toda "sem desfecho". Quem já sabe o
 * desfecho passa aqui; o cron, que não mexe nisso, omite e usa o do banco.
 *
 * Nunca lança: devolve o id da review criada, ou null se pulou/falhou.
 */
export async function captureConversation(
  contactId: string,
  closedReason: ClosedReason,
  outcome?: { closeCategory?: string | null; qualified?: boolean | null },
): Promise<string | null> {
  try {
    if (!configured()) {
      console.warn('[WA BRAIN] S3 não configurado — snapshot pulado.');
      return null;
    }

    const [contact, conversation] = await Promise.all([
      db.whatsAppContact.findUnique({
        where: { id: contactId },
        select: {
          id: true, phone: true, name: true, userId: true, processId: true,
          adPlatform: true, adSourceId: true, adHeadline: true,
        },
      }),
      db.whatsAppConversation.findUnique({
        where: { contactId },
        select: {
          id: true, qualified: true, closeCategory: true, botMemory: true,
          botState: true, botFailCount: true, urgent: true, createdAt: true,
          lastMessageAt: true,
        },
      }),
    ]);
    if (!contact) return null;

    // ---- Guarda anti-duplicata --------------------------------------------
    // Encerramentos podem correr em paralelo (cron + atendente clicando ao
    // mesmo tempo) ou o mesmo caminho pode rodar duas vezes num retry. Se já
    // existe uma review criada DEPOIS da última mensagem, nada novo aconteceu
    // desde o último snapshot — não captura de novo.
    const last = await db.whatsAppReview.findFirst({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    if (last && conversation?.lastMessageAt && last.createdAt >= conversation.lastMessageAt) {
      return null;
    }

    // ---- Thread ------------------------------------------------------------
    // Só as mensagens DESTE atendimento: tudo desde o snapshot anterior. Sem
    // esse corte, um cliente recorrente teria a conversa antiga repetida em
    // toda review, e o mesmo erro seria contado várias vezes na destilação.
    const messages = await db.whatsAppMessage.findMany({
      where: {
        contactId,
        deletedAt: null,
        ...(last ? { createdAt: { gt: last.createdAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true, direction: true, sentByBot: true, body: true,
        transcript: true, mediaType: true, internal: true, authorId: true,
      },
      take: 500,
    });

    // Nada trocado neste ciclo (ex.: encerramento de uma conversa vazia) — não
    // gera fila de revisão só para constar.
    if (!messages.length) return null;

    const authorIds = [...new Set(messages.map((m) => m.authorId).filter((a): a is string => !!a))];
    const authors = authorIds.length
      ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
      : [];
    const authorName = new Map(authors.map((a) => [a.id, a.name]));

    const turns: SnapshotTurn[] = messages
      .map((m): SnapshotTurn | null => {
        const text = turnText(m);
        if (!text) return null;
        // Notas internas entram como contexto da revisão: é nelas que a IA
        // registra por que qualificou/escalou. Sem isso, o revisor vê a decisão
        // mas não a justificativa.
        const role: SnapshotTurn['role'] = m.internal
          ? 'nota'
          : m.direction === 'in'
            ? 'client'
            : m.sentByBot
              ? 'bot'
              : 'agent';
        return {
          at: m.createdAt.toISOString(),
          role,
          text,
          mediaType: m.mediaType,
          transcript: m.transcript,
          authorName: m.authorId ? (authorName.get(m.authorId) ?? null) : null,
        };
      })
      .filter((t): t is SnapshotTurn => !!t);

    const fromClient = turns.filter((t) => t.role === 'client').length;
    const fromBot = turns.filter((t) => t.role === 'bot').length;
    const fromAgent = turns.filter((t) => t.role === 'agent').length;
    const first = messages[0]?.createdAt;
    const lastMsg = messages[messages.length - 1]?.createdAt;

    // Desfecho: o do chamador vence o do banco quando informado. Testa a
    // PRESENÇA da chave, não o valor — `qualified: null` é um desfecho legítimo
    // (perguntas / novo acidente / transferido) e `??` o descartaria.
    const closeCategory =
      outcome && 'closeCategory' in outcome
        ? (outcome.closeCategory ?? null)
        : (conversation?.closeCategory ?? null);
    const qualified =
      outcome && 'qualified' in outcome
        ? (outcome.qualified ?? null)
        : (conversation?.qualified ?? null);

    const snapshot: ConversationSnapshot = {
      version: 1,
      capturedAt: new Date().toISOString(),
      closedReason,
      contact: {
        id: contact.id,
        phone: contact.phone,
        name: contact.name,
        adPlatform: contact.adPlatform,
        adSourceId: contact.adSourceId,
        adHeadline: contact.adHeadline,
        userId: contact.userId,
        processId: contact.processId,
      },
      conversation: {
        id: conversation?.id ?? null,
        qualified,
        closeCategory,
        botMemory: conversation?.botMemory ?? null,
        botState: conversation?.botState ?? null,
        botFailCount: conversation?.botFailCount ?? 0,
        urgent: conversation?.urgent ?? false,
        createdAt: conversation?.createdAt?.toISOString() ?? null,
        lastMessageAt: conversation?.lastMessageAt?.toISOString() ?? null,
      },
      messages: turns,
      stats: {
        total: turns.length,
        fromClient,
        fromBot,
        fromAgent,
        durationMs: first && lastMsg ? lastMsg.getTime() - first.getTime() : null,
      },
    };

    // Chave determinística por captura: contato + instante. Ordena sozinha e
    // nunca colide (o timestamp é do momento da captura).
    const key = `${PREFIX}/${contactId}/${snapshot.capturedAt.replace(/[:.]/g, '-')}.json`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: JSON.stringify(snapshot, null, 2),
        ContentType: 'application/json',
      }),
    );

    const review = await db.whatsAppReview.create({
      data: {
        contactId,
        conversationId: conversation?.id ?? null,
        s3Key: key,
        contactName: contact.name,
        contactPhone: contact.phone,
        closeCategory,
        qualified,
        closedReason,
        messageCount: turns.length,
        botOnly: fromAgent === 0,
      },
      select: { id: true },
    });

    return review.id;
  } catch (err) {
    // Best-effort de verdade: o atendimento fecha mesmo que o cérebro falhe.
    console.error('[WA BRAIN] Falha ao capturar snapshot da conversa:', contactId, err);
    return null;
  }
}

/** Lê um snapshot do S3. Usado pela tela de revisão e, depois, pela destilação. */
export async function readSnapshot(s3Key: string): Promise<ConversationSnapshot | null> {
  try {
    if (!configured()) return null;
    const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    const body = await out.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as ConversationSnapshot;
  } catch (err) {
    console.error('[WA BRAIN] Falha ao ler snapshot:', s3Key, err);
    return null;
  }
}
