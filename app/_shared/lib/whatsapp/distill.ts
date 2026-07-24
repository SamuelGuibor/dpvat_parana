import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/app/_shared/lib/prisma';
import { readSnapshot } from './brain';

// CÉREBRO — camada 3: transformar julgamentos humanos em regras que entram no
// prompt do bot.
//
// Dois passos, deliberadamente separados:
//   A. extractLesson()      1 review  → 1 lição curta   (na hora que o humano salva)
//   B. consolidatePlaybook() N lições → playbook novo    (em lote, sob demanda)
//
// Por que separar: a extração olha UMA review isolada — prompt pequeno, barato,
// e cada review é uma unidade limpa. A consolidação precisa ver TODAS as lições
// juntas para perceber que a lição nova já existe e apenas somar peso, em vez de
// virar a 41ª linha repetida. Deduplicar é impossível olhando uma por vez.
//
// Toda a IA roda no microserviço (CHATBOT_URL), igual ao agent-assist — o app
// Next não tem SDK nem chave da Anthropic, de propósito.

const CHATBOT_URL = process.env.CHATBOT_URL?.replace(/\/$/, '') ?? '';
const CHATBOT_SECRET = process.env.CHATBOT_SECRET ?? '';
const DISTILL_TIMEOUT_MS = 60_000;
/** Teto de regras no playbook. Acima disso o modelo passa a ignorar as regras. */
const MAX_RULES = 80;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const PLAYBOOK_CURRENT_KEY = 'whatsapp-brain/playbook/current.json';

export interface PlaybookRule {
  text: string;
  weight: number;
  states: string[];
}
export interface PlaybookSection {
  name: string;
  rules: PlaybookRule[];
}

function configured(): boolean {
  return !!CHATBOT_URL && !!CHATBOT_SECRET;
}

async function callBrain<T>(path: string, body: object): Promise<T> {
  if (!configured()) throw new Error('Serviço de IA não configurado (CHATBOT_URL/CHATBOT_SECRET).');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISTILL_TIMEOUT_MS);
  try {
    const res = await fetch(`${CHATBOT_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': CHATBOT_SECRET },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`IA respondeu HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// PASSO A — extrai a lição de uma revisão recém-salva.
// ---------------------------------------------------------------------------

/**
 * Lê a conversa do S3 + o julgamento humano e grava a lição na própria review.
 *
 * Best-effort: se a IA falhar, a revisão continua salva e sem lição — dá para
 * reprocessar depois. Nunca lança.
 *
 * Devolve a lição extraída (ou null quando não houve nada a aprender), para a
 * tela mostrar "a IA entendeu assim" logo após salvar.
 */
export async function extractLesson(reviewId: string): Promise<{
  lesson: string;
  states: string[];
  section: string;
} | null> {
  try {
    if (!configured()) return null;

    const review = await db.whatsAppReview.findUnique({
      where: { id: reviewId },
      select: {
        s3Key: true, verdict: true, comment: true, errorTags: true,
        correctReply: true, contactName: true, contactPhone: true,
      },
    });
    if (!review?.verdict) return null;

    const snapshot = await readSnapshot(review.s3Key);
    if (!snapshot) return null;

    const out = await callBrain<{ lesson: string; states: string[]; section: string }>(
      '/distill-lesson',
      {
        contact: { name: review.contactName, phone: review.contactPhone },
        // Notas internas entram: é nelas que o bot registra o porquê das decisões.
        history: snapshot.messages.map((m) => ({ role: m.role, text: m.text })),
        memory: snapshot.conversation.botMemory,
        review: {
          verdict: review.verdict,
          comment: review.comment,
          errorTags: review.errorTags,
          correctReply: review.correctReply,
          botState: snapshot.conversation.botState,
        },
      },
    );

    const lesson = (out.lesson ?? '').trim();

    await db.whatsAppReview.update({
      where: { id: reviewId },
      data: {
        // Lição vazia é resultado legítimo (nada novo a aprender) — grava null
        // e segue. Não é erro.
        lesson: lesson || null,
        lessonStates: Array.isArray(out.states) ? out.states.map(String) : [],
        lessonSection: lesson ? (out.section ?? 'OUTRO') : null,
        lessonEdited: false,
      },
    });

    return lesson ? { lesson, states: out.states ?? [], section: out.section ?? 'OUTRO' } : null;
  } catch (err) {
    console.error('[WA BRAIN] Falha ao destilar lição da review:', reviewId, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// PASSO B — consolida as lições pendentes num playbook novo (rascunho).
// ---------------------------------------------------------------------------

/**
 * Junta todas as lições ainda não destiladas com o playbook publicado e cria uma
 * versão NOVA em rascunho. Não publica: quem publica é o humano, depois de ver
 * o diff.
 */
export async function buildPlaybookDraft(): Promise<{
  playbookId: string;
  version: number;
  rulesCount: number;
  changeNote: string;
  lessonCount: number;
}> {
  if (!configured()) throw new Error('Serviço de IA não configurado.');

  const pending = await db.whatsAppReview.findMany({
    where: { distilledAt: null, lesson: { not: null }, status: 'revisado' },
    select: { id: true, lesson: true, lessonStates: true, lessonSection: true },
    orderBy: { reviewedAt: 'asc' },
    take: 200,
  });
  if (!pending.length) {
    throw new Error('Nenhuma lição nova para consolidar — revise mais conversas primeiro.');
  }

  const published = await db.whatsAppPlaybook.findFirst({
    where: { status: 'publicado' },
    orderBy: { version: 'desc' },
  });

  const out = await callBrain<{
    sections: PlaybookSection[];
    rulesCount: number;
    changeNote: string;
  }>('/consolidate-playbook', {
    lessons: pending.map((p) => ({
      lesson: p.lesson,
      states: p.lessonStates,
      section: p.lessonSection ?? 'OUTRO',
    })),
    current: published ? { sections: published.sections } : null,
    maxRules: MAX_RULES,
  });

  const last = await db.whatsAppPlaybook.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  const draft = await db.whatsAppPlaybook.create({
    data: {
      version,
      sections: out.sections as object,
      rulesCount: out.rulesCount,
      changeNote: out.changeNote,
      status: 'rascunho',
      reviewCount: pending.length,
    },
    select: { id: true, version: true, rulesCount: true },
  });

  return {
    playbookId: draft.id,
    version: draft.version,
    rulesCount: draft.rulesCount,
    changeNote: out.changeNote,
    lessonCount: pending.length,
  };
}

/**
 * Publica um rascunho: vira o playbook ativo, marca as lições como absorvidas e
 * escreve o arquivo que o bot lê.
 *
 * O arquivo no S3 é o contrato com o microserviço — ele busca essa chave fixa e
 * injeta o conteúdo no system prompt. Publicar troca o bloco e, portanto,
 * invalida o cache de prompt: por isso é uma ação em lote e deliberada, nunca
 * automática a cada revisão.
 */
export async function publishPlaybook(
  playbookId: string,
  publishedBy: string,
  /**
   * Republicação: reescreve o S3 de uma versão que JÁ está no ar, depois de
   * você editar ou excluir uma regra à mão. Pula a troca de status e a marcação
   * de lições — nada foi consolidado de novo, só corrigido.
   */
  republish = false,
): Promise<void> {
  const draft = await db.whatsAppPlaybook.findUnique({ where: { id: playbookId } });
  if (!draft) throw new Error('Versão não encontrada.');
  if (!republish && draft.status === 'publicado') throw new Error('Esta versão já está publicada.');

  const body = JSON.stringify(
    {
      version: draft.version,
      generatedAt: new Date().toISOString(),
      rulesCount: draft.rulesCount,
      sections: draft.sections,
    },
    null,
    2,
  );

  // 1. Publica no S3 ANTES do banco: se o S3 falhar, nada é marcado como
  //    publicado e dá para tentar de novo. O inverso deixaria o banco dizendo
  //    "publicado" com o bot ainda lendo a versão velha.
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: PLAYBOOK_CURRENT_KEY,
      Body: body,
      ContentType: 'application/json',
    }),
  );
  // Cópia versionada, para auditoria e rollback.
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `whatsapp-brain/playbook/v${draft.version}.json`,
      Body: body,
      ContentType: 'application/json',
    }),
  );

  // Republicação só reescreve o arquivo: o status já é "publicado" e as lições
  // já foram marcadas quando esta versão entrou no ar.
  if (republish) return;

  // 2. Aposenta a versão anterior e ativa esta.
  await db.whatsAppPlaybook.updateMany({
    where: { status: 'publicado' },
    data: { status: 'descartado' },
  });
  await db.whatsAppPlaybook.update({
    where: { id: playbookId },
    data: { status: 'publicado', publishedAt: new Date(), publishedBy },
  });

  // 3. Marca as lições absorvidas — não entram na próxima consolidação.
  await db.whatsAppReview.updateMany({
    where: { distilledAt: null, lesson: { not: null }, status: 'revisado' },
    data: { distilledAt: new Date() },
  });
}
