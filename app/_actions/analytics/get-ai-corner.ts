'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { canViewChatbotDashboard } from '@/app/_shared/lib/chatbot-access';
import {
  aiCornerBounds, buildAiWindowsFromGroups,
  type AiCorner, type AiOperation, type AiUsageGroup, type AiWindow,
} from '@/app/_shared/utils/ai-corner-agg';

// Canto da IA: o extrato de consumo da inteligência artificial no CRM.
//
// Regra de ouro: NADA de lista fixa de ações. Todo log que gravar
// `metadata.usage` entra na conta automaticamente — foi assim que a ficha
// automática e a auditoria de documentos ficaram de fora do painel antigo,
// que só somava wa_bot, wa_suggest e wa_summary.
//
// Duas janelas SEMPRE lado a lado, porque elas divergem e é isso que confunde
// na hora de comparar com o console da Anthropic:
//   - mês corrente (1º do mês, fuso de Brasília) — é o que o console mostra;
//   - últimos 30 dias corridos — é o que o painel antigo chamava de "mês".
//
// A soma é feita no Postgres (grupos por ação × modelo × hora UTC); a montagem
// das janelas e o corte de dia em Brasília ficam em ai-corner-agg.ts.

export type { AiCorner, AiOperation, AiWindow };

/** Rótulo de cada operação. Ação sem rótulo aqui aparece com a própria chave. */
const OPERATION_LABELS: Record<string, string> = {
  wa_bot: 'Bot do WhatsApp',
  // Fora do wa_bot de propósito: o custo por decisão do bot não conta turno
  // descartado (corrida, atendente assumiu).
  wa_bot_discarded: 'Bot — respostas descartadas',
  // IA do cron: decide se cutuca ou encerra a conversa calada.
  wa_followup: 'Bot — follow-up do cron',
  wa_transcribe: 'Transcrição de áudio',
  wa_suggest: 'Sugestão de resposta',
  wa_summary: 'Resumo da conversa',
  wa_ficha_ai: 'Ficha automática',
  ai_audit: 'Auditoria de documentos',
  roteiro_ai: 'Roteiro (IA)',
};

/** Ícone (chave lucide resolvida na UI) por operação. */
const OPERATION_ICONS: Record<string, string> = {
  wa_bot: 'bot',
  wa_bot_discarded: 'bot',
  wa_followup: 'bot',
  wa_transcribe: 'mic',
  wa_suggest: 'message',
  wa_summary: 'file',
  wa_ficha_ai: 'id',
  ai_audit: 'shield',
  roteiro_ai: 'scroll',
};

/**
 * Extrato completo do consumo de IA. Restrito à equipe (requireTeam: role do
 * banco + trava de IP) E a quem enxerga o dashboard do chatbot (mesma
 * allowlist do painel de desempenho).
 */
export async function getAiCorner(): Promise<AiCorner> {
  const ctx = await requireTeam();
  if (!canViewChatbotDashboard(ctx.email)) {
    throw new Error('Acesso restrito: você não está autorizado a ver o Canto da IA.');
  }

  const now = new Date();
  const { since } = aiCornerBounds(now);

  // Agrega no banco em vez de trazer o metadata inteiro de cada chamada
  // (~22 mil linhas / ~9,5 MB por abertura). Detalhes que mantêm os números:
  //   - jsonb_typeof(usage) = 'object' em vez de lista de ações: qualquer log
  //     que grave usage entra, e `usage: null` continua fora (o JS antigo
  //     descartava; jsonb_exists contaria como 1 execução com 0 tokens);
  //   - cada token só soma se for número no JSON (CASE, não WHERE: o Postgres
  //     não garante a ordem de avaliação e o cast de um texto derrubaria tudo);
  //   - hora UTC, não dia: o dia de Brasília sai do brDayKey(hour) na montagem;
  //   - ORDER BY min(createdAt) reproduz a ordem do laço antigo (desempates).
  const raw = await db.$queryRaw<AiUsageGroup[]>`
    SELECT action,
           metadata->'usage'->>'model' AS model,
           date_trunc('hour', "createdAt") AS hour,
           count(*)::int AS runs,
           COALESCE(sum(CASE WHEN jsonb_typeof(metadata->'usage'->'inputTokens') = 'number'
                             THEN (metadata->'usage'->>'inputTokens')::numeric END), 0)::float8 AS "inputTokens",
           COALESCE(sum(CASE WHEN jsonb_typeof(metadata->'usage'->'outputTokens') = 'number'
                             THEN (metadata->'usage'->>'outputTokens')::numeric END), 0)::float8 AS "outputTokens",
           COALESCE(sum(CASE WHEN jsonb_typeof(metadata->'usage'->'cacheReadTokens') = 'number'
                             THEN (metadata->'usage'->>'cacheReadTokens')::numeric END), 0)::float8 AS "cacheReadTokens",
           COALESCE(sum(CASE WHEN jsonb_typeof(metadata->'usage'->'cacheWriteTokens') = 'number'
                             THEN (metadata->'usage'->>'cacheWriteTokens')::numeric END), 0)::float8 AS "cacheWriteTokens"
    FROM logs
    WHERE "createdAt" >= ${since}
      AND jsonb_typeof(metadata->'usage') = 'object'
    GROUP BY 1, 2, 3
    ORDER BY min("createdAt") ASC
  `;

  return buildAiWindowsFromGroups(
    raw,
    { labels: OPERATION_LABELS, icons: OPERATION_ICONS },
    now,
  );
}
