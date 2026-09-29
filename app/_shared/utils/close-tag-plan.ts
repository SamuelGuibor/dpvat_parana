// Regras puras da tag automática de desfecho (a conversa encerrada leva uma
// tag com o rótulo do desfecho: "Transferidos ao atendente", "Não qualificada
// — Acidente muito antigo"...). A parte com banco fica em
// app/_shared/lib/whatsapp/close-tags.ts; aqui só a decisão, para os testes
// (tests/close-tag-plan.test.ts) rodarem sem banco.

import {
  HIRED_TAG_NAME, QUALIFIED_BY_CATEGORY, QUALIFIED_TAG_NAME,
} from '@/app/_shared/lib/whatsapp/close-categories';

/**
 * Prefixo do rótulo legível de um motivo `nq_*` que não está no mapa estático
 * nem em whatsapp_close_reasons (motivo apagado da tabela, chave nova do
 * cérebro). O mesmo prefixo dos sub-motivos estáticos, para a pasta "Não
 * qualificadas" agrupar e limpar o prefixo igual.
 */
export const NQ_FALLBACK_LABEL_PREFIX = 'Não qualif. — ';

/**
 * Rótulo para categoria sem rótulo conhecido. Nunca a chave crua: ela vira
 * nome de tag e aparece no filtro e no chip "Encerrada · …" da lista.
 */
export function fallbackCloseLabel(category: string): string {
  const words = (s: string) => s.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  if (category.startsWith('nq_')) {
    const reason = words(category.slice(3));
    return reason ? `${NQ_FALLBACK_LABEL_PREFIX}${reason}` : 'Não qualificado';
  }
  const text = words(category);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Encerrada';
}

/**
 * Desfecho que DESFAZ a qualificação: não qualificado (genérico ou `nq_*`) e
 * descartado (spam/engano/bloqueio). Só nesses a tag-marco "Qualificada" sai
 * no encerramento (decisão de 25/09/2026). Nos demais (transferido, perguntas,
 * sem_resposta, novo_acidente, churn) ela fica: o cron encerra por silêncio
 * lead que já foi qualificado, e o funil (bot-funnel.ts) perderia o
 * qualificado toda vez.
 */
export function isDisqualifyingCategory(category: string): boolean {
  return QUALIFIED_BY_CATEGORY[category] === false || category.startsWith('nq_') || category === 'descartado';
}

/** Tags que o sync de desfecho nunca tira da conversa neste encerramento. */
export function closeTagProtectedNames(category: string): Set<string> {
  // "Contratados" nunca é rótulo de desfecho, mas fica protegida por
  // garantia: ela é a régua do KPI Contratados.
  return new Set(isDisqualifyingCategory(category) ? [HIRED_TAG_NAME] : [QUALIFIED_TAG_NAME, HIRED_TAG_NAME]);
}

/**
 * Quais tags da conversa saem ao aplicar o desfecho `label`: as de desfecho
 * ANTERIOR (nome em `knownLabels` — rótulos estáticos, do menu e da tabela de
 * motivos — ou com o prefixo do fallback de `nq_*`), menos a do desfecho atual
 * e as protegidas. Tag manual da equipe ("VIP", "Recontato") nunca sai.
 */
export function planCloseTagSync(
  current: { tagId: string; name: string }[],
  label: string,
  knownLabels: ReadonlySet<string>,
  protectedNames: ReadonlySet<string>,
): { removeTagIds: string[] } {
  const isOutcomeTag = (name: string) => knownLabels.has(name) || name.startsWith(NQ_FALLBACK_LABEL_PREFIX);
  return {
    removeTagIds: current
      .filter((t) => t.name !== label && !protectedNames.has(t.name) && isOutcomeTag(t.name))
      .map((t) => t.tagId),
  };
}
