import { db } from '../prisma';
import type { SnapshotTurn } from './brain';

// EXEMPLOS PRO CÉREBRO (16/08/2026) — few-shot com atendimentos reais.
//
// A ideia (Samuel): além das REGRAS destiladas (playbook), o bot aprende
// vendo TRECHOS DE CONVERSA que a equipe julgou — o que um atendimento
// aprovado parece na prática, e onde o reprovado errou (com a correção do
// supervisor junto). O trecho é gerado UMA vez, no momento do julgamento
// (submitReview), e fica salvo em WhatsAppReview.exampleExcerpt — o
// brain-prompt só lê do banco, sem tocar no S3 a cada requisição.
//
// ⚠️ ESTABILIDADE DE BYTES: o bloco renderizado entra no trecho CACHEADO do
// system prompt (casamento de prefixo byte a byte na Anthropic). A seleção e a
// renderização são determinísticas — o texto só muda quando uma review nova é
// julgada, o que invalida o cache uma vez (mesmo custo de publicar playbook).
//
// ⚠️ PRIVACIDADE: os exemplos saem da conversa de UM cliente e entram no
// prompt de TODAS as conversas. Por isso o trecho é ANONIMIZADO na origem
// (nome → ▮, e-mails e sequências numéricas longas → ▮▮▮) e o cabeçalho do
// bloco proíbe mencionar qualquer detalhe dos exemplos aos clientes.

const EXCERPT_MAX_TURNS = 12;
const EXCERPT_TURN_MAX_CHARS = 220;
/** Quantos exemplos entram no prompt (mais recentes primeiro, mesclando bons e ruins). */
const EXAMPLES_APPROVED = 3;
const EXAMPLES_REPROVED = 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Máscara de dados pessoais: nome do contato, e-mails e números longos. */
function scrub(text: string, contactName?: string | null): string {
  let t = text;
  for (const part of (contactName ?? '').split(/\s+/)) {
    if (part.length >= 3) t = t.replace(new RegExp(escapeRegExp(part), 'gi'), '▮');
  }
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '▮@▮');
  // CPF, RG, CEP, telefone, nº de benefício... — qualquer sequência numérica
  // longa (7+ dígitos contando separadores) é mascarada.
  t = t.replace(/\d[\d .\-\/()]{5,}\d/g, '▮▮▮');
  return t;
}

/**
 * Trecho condensado da conversa: os últimos turnos relevantes, um por linha,
 * clipados e anonimizados. Null quando não há conteúdo aproveitável.
 */
export function buildExampleExcerpt(
  messages: SnapshotTurn[] | null | undefined,
  contactName?: string | null,
): string | null {
  if (!messages?.length) return null;
  const turns = messages.filter((t) => t.role !== 'nota' && (t.text?.trim() || t.transcript?.trim()));
  if (turns.length < 4) return null; // conversa curta demais não ensina nada
  const slice = turns.slice(-EXCERPT_MAX_TURNS);
  const lines = slice.map((t) => {
    const who = t.role === 'client' ? 'CLIENTE' : t.role === 'agent' ? 'ATENDENTE' : 'BOT';
    let text = t.text?.trim() || `[áudio] ${t.transcript?.trim() ?? ''}`;
    text = text.replace(/\s+/g, ' ');
    if (text.length > EXCERPT_TURN_MAX_CHARS) text = text.slice(0, EXCERPT_TURN_MAX_CHARS) + ' […]';
    return `${who}: ${scrub(text, contactName)}`;
  });
  return lines.join('\n');
}

export interface BrainExample {
  verdict: string | null;
  closeCategory: string | null;
  comment: string | null;
  correctReply: string | null;
  exampleExcerpt: string | null;
}

const VERDICT_LABEL: Record<string, string> = {
  aprovado: 'APROVADO (conduta a IMITAR)',
  parcial: 'PARCIALMENTE APROVADO (veja o apontamento da equipe)',
  reprovado: 'REPROVADO (conduta a NUNCA repetir — veja a correção)',
};

/** Bloco renderizado dos exemplos, no mesmo estilo do playbook. Vazio = "". */
export function renderExamples(rows: BrainExample[]): string {
  const usable = rows.filter((r) => r.exampleExcerpt?.trim());
  if (!usable.length) return '';
  const body = usable
    .map((r, i) => {
      const parts = [
        `EXEMPLO ${i + 1} — ${VERDICT_LABEL[r.verdict ?? ''] ?? r.verdict ?? 'revisado'}` +
          (r.closeCategory ? ` (desfecho: ${r.closeCategory})` : '') + ':',
        r.exampleExcerpt!.trim(),
      ];
      if (r.comment?.trim()) parts.push(`O que a equipe apontou: ${r.comment.trim()}`);
      if (r.correctReply?.trim()) parts.push(`Como deveria ter respondido: ${r.correctReply.trim()}`);
      return parts.join('\n');
    })
    .join('\n\n---\n\n');
  return [
    '═══════════════════════════════════════',
    'EXEMPLOS REVISADOS PELA EQUIPE (aprenda com eles):',
    '═══════════════════════════════════════',
    '',
    'Trechos reais de atendimentos julgados por um supervisor humano. Imite a',
    'conduta dos APROVADOS; nos REPROVADOS, o erro está descrito no apontamento',
    'da equipe — nunca o repita. Os exemplos são de OUTROS clientes: NUNCA',
    'mencione nomes, dados ou situações deles na conversa atual.',
    '',
    body,
  ].join('\n');
}

/**
 * Exemplos que entram no prompt: os julgamentos mais recentes com trecho
 * salvo, mesclando aprovados e reprovados/parciais. Determinístico.
 */
export async function getBrainExamples(): Promise<{ count: number; rendered: string }> {
  const base = {
    status: 'revisado',
    exampleExcerpt: { not: null },
  } as const;
  const select = {
    verdict: true, closeCategory: true, comment: true,
    correctReply: true, exampleExcerpt: true,
  } as const;
  const [approved, reproved] = await Promise.all([
    db.whatsAppReview.findMany({
      where: { ...base, verdict: 'aprovado' },
      orderBy: { reviewedAt: 'desc' },
      take: EXAMPLES_APPROVED,
      select,
    }),
    db.whatsAppReview.findMany({
      where: { ...base, verdict: { in: ['reprovado', 'parcial'] } },
      orderBy: { reviewedAt: 'desc' },
      take: EXAMPLES_REPROVED,
      select,
    }),
  ]);
  const rows = [...approved, ...reproved];
  return { count: rows.length, rendered: renderExamples(rows) };
}
