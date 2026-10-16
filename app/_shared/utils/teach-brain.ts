// Regras puras do "Ensinar o cérebro" do Copiloto (inbox WhatsApp): o
// atendente escreve uma regra a partir da conversa aberta e uma IA confere
// a regra contra o playbook publicado e contra o que o bot fez nessa conversa
// ANTES de qualquer publicação.
//
// Por quê: regra ativa que a IA não seguiu não se resolve criando a mesma regra
// de novo (duplica o playbook e não muda nada). A trilha "já existe × pedido ×
// o que esperar × o que a IA fez" mostra se o caso é reforçar, criar ou nada.

export type TeachKind = "regra" | "sugestao" | "correcao";
export type TeachRecommendation = "reforcar" | "nova" | "nada";

export interface NumberedRule {
  id: string; // R1..Rn
  section: string;
  text: string;
}

export interface TeachExisting {
  id: string;
  section: string;
  text: string;
  relation: "igual" | "parecida" | "conflita";
}

export interface TeachBotAction {
  at: string; // "dd/mm hh:mm" de Brasília
  what: string;
  verdict: "ok" | "contrariou" | "neutro";
  ruleId?: string;
}

export interface TeachAnalysis {
  request: string;
  existing: TeachExisting[];
  botActions: TeachBotAction[];
  expected: string;
  diagnosis: string;
  recommendation: TeachRecommendation;
  targetRuleId?: string;
  proposedText: string;
}

/**
 * Numeração R1..Rn — MESMA convenção do renderPlaybook do microserviço e do
 * flattenRules (rule-events.ts): seções na ordem, regras na ordem, contador
 * global, seção vazia não conta.
 */
export function numberRules(sections: { name: string; rules: { text: string }[] }[]): NumberedRule[] {
  const out: NumberedRule[] = [];
  let seq = 0;
  for (const s of sections) {
    for (const r of s.rules ?? []) out.push({ id: `R${++seq}`, section: s.name, text: r.text });
  }
  return out;
}

/** Acha seção + índice da regra pelo id R#; null se a numeração não bate. */
export function locateRule(
  sections: { name: string; rules: unknown[] }[],
  ruleId: string,
): { sectionIndex: number; ruleIndex: number } | null {
  let seq = 0;
  for (let si = 0; si < sections.length; si++) {
    const rules = sections[si].rules ?? [];
    for (let ri = 0; ri < rules.length; ri++) {
      if (`R${++seq}` === ruleId) return { sectionIndex: si, ruleIndex: ri };
    }
  }
  return null;
}

export const TEACH_SECTION = "Regras do inbox";

export const TEACH_SYSTEM = `Você ajuda o supervisor de um escritório jurídico (DPVAT/INSS) a manter o
"playbook" do bot de WhatsApp: a lista de regras numeradas (R1..Rn) que o bot
recebe no prompt e cita no campo appliedRules quando uma regra pesou na resposta.

Um atendente leu uma conversa e escreveu o que o bot deveria fazer. Sua tarefa
é conferir esse pedido ANTES de virar regra:
1. Reescreva o pedido de forma clara (request).
2. Liste as regras do playbook que já cobrem o assunto (existing), com a
   relação: "igual" (mesma instrução), "parecida" (cobre em parte) ou
   "conflita" (manda o contrário). Lista vazia se nenhuma tem a ver.
3. Liste o que o bot FEZ na conversa que tem a ver com o pedido (botActions),
   com a hora exata da transcrição, o que fez em poucas palavras e o veredito:
   "contrariou" (fez o oposto do pedido ou de uma regra existente — diga qual
   em ruleId), "ok" (fez certo) ou "neutro". Use as regras citadas em cada
   decisão (appliedRules) para saber se o bot considerou a regra.
4. Diga o que se espera do bot a partir de agora (expected).
5. Diagnóstico curto (diagnosis): a regra já existe e não foi seguida? É nova?
   O pedido já foi atendido e não precisa de nada?
6. Recomendação:
   - "reforcar": já existe regra igual/parecida — reescreva o texto DELA (em
     proposedText) mais explícito, cobrindo o caso, sem perder o que ela já
     dizia; targetRuleId = id dela.
   - "nova": nenhuma regra cobre — proposedText = regra nova curta,
     generalizável (não cite nomes, datas nem dados do cliente).
   - "nada": o bot já fez certo ou o pedido não é regra de comportamento;
     proposedText = "".
Regras são escritas no imperativo, em português, 1 a 3 frases.

Responda SOMENTE com um JSON, sem texto em volta:
{"request":"","existing":[{"id":"R1","relation":"parecida"}],"botActions":[{"at":"dd/mm hh:mm","what":"","verdict":"neutro","ruleId":"R1"}],"expected":"","diagnosis":"","recommendation":"nova","targetRuleId":"","proposedText":""}`;

const KIND_LABEL: Record<TeachKind, string> = {
  regra: "regra nova",
  sugestao: "sugestão de comportamento",
  correcao: "correção de algo que o bot fez errado",
};

export function teachUserPrompt(input: {
  kind: TeachKind;
  request: string;
  rules: NumberedRule[];
  transcript: string;
  decisions: string;
}): string {
  const rules = input.rules.length
    ? input.rules.map((r) => `[${r.id}] (${r.section}) ${r.text}`).join("\n")
    : "(playbook vazio)";
  return [
    `PEDIDO DO ATENDENTE (${KIND_LABEL[input.kind]}):\n${input.request}`,
    `PLAYBOOK PUBLICADO:\n${rules}`,
    `DECISÕES DO BOT NESTA CONVERSA (horário de Brasília):\n${input.decisions || "(nenhuma registrada)"}`,
    `CONVERSA (horário de Brasília):\n${input.transcript}`,
  ].join("\n\n");
}

/** Lê e saneia o JSON da IA; null se ilegível. Ids fora do playbook caem. */
export function parseTeachAnalysis(raw: string, rules: NumberedRule[]): TeachAnalysis | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const byId = new Map(rules.map((r) => [r.id, r]));
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const relations = ["igual", "parecida", "conflita"] as const;
  const verdicts = ["ok", "contrariou", "neutro"] as const;

  const existing: TeachExisting[] = (Array.isArray(j.existing) ? j.existing : [])
    .map((e: Record<string, unknown>) => {
      const rule = byId.get(str(e?.id));
      if (!rule) return null;
      const rel = relations.find((r) => r === e.relation) ?? "parecida";
      return { ...rule, relation: rel };
    })
    .filter((e): e is TeachExisting => !!e);

  const botActions: TeachBotAction[] = (Array.isArray(j.botActions) ? j.botActions : [])
    .map((a: Record<string, unknown>): TeachBotAction | null => {
      const what = str(a?.what);
      if (!what) return null;
      const ruleId = byId.has(str(a.ruleId)) ? str(a.ruleId) : undefined;
      return { at: str(a.at), what, verdict: verdicts.find((v) => v === a.verdict) ?? "neutro", ruleId };
    })
    .filter((a): a is TeachBotAction => !!a);

  let recommendation: TeachRecommendation =
    j.recommendation === "reforcar" || j.recommendation === "nada" ? j.recommendation : "nova";
  let targetRuleId = byId.has(str(j.targetRuleId)) ? str(j.targetRuleId) : undefined;
  // Reforçar sem regra válida não tem o que editar: vira regra nova.
  if (recommendation === "reforcar" && !targetRuleId) {
    targetRuleId = existing[0]?.id;
    if (!targetRuleId) recommendation = "nova";
  }
  if (recommendation !== "reforcar") targetRuleId = undefined;

  return {
    request: str(j.request),
    existing,
    botActions,
    expected: str(j.expected),
    diagnosis: str(j.diagnosis),
    recommendation,
    targetRuleId,
    proposedText: str(j.proposedText),
  };
}
