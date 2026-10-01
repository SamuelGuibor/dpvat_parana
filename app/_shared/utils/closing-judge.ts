import { brDateTimeParts, brDayLabel } from "@/app/_shared/utils/date-br";

// Regras puras da IA que julga se a última mensagem do cliente ENCERRA o
// assunto ou RETOMA o contato (closing-ai.ts), usada onde não há cérebro
// rodando: o SLA da conversa com atendente humano (cron-tasks.ts).
//
// Por quê (01/10/2026, caso José Roberto): a lista fixa de palavras de fecho
// (ACK_WORDS) tratava "bom dia" de quem volta dois dias depois como despedida,
// e o atendente nunca era avisado. Quem decide se é fecho ou assunto novo é a
// IA, olhando os horários; a lista ficou só como pré-filtro (o que nem parece
// fecho já avisa, sem IA).

export interface ClosingJudgeMessage {
  direction: string;
  sentByBot: boolean;
  body: string | null;
  mediaType: string | null;
  createdAt: Date;
}

function who(m: ClosingJudgeMessage): string {
  if (m.direction === "in") return "Cliente";
  return m.sentByBot ? "Bot" : "Atendente";
}

function content(m: ClosingJudgeMessage): string {
  const text = (m.body ?? "").trim();
  if (text) return text;
  return m.mediaType ? `[anexo: ${m.mediaType}]` : "[mensagem vazia]";
}

/**
 * Transcrição com data e hora de Brasília em cada mensagem, em ordem
 * cronológica. `texts` (opcional) substitui o texto já mascarado (senhas).
 */
export function closingJudgeTranscript(messages: ClosingJudgeMessage[], texts?: string[]): string {
  return messages
    .map((m, i) => {
      const at = `${brDayLabel(m.createdAt)} ${brDateTimeParts(m.createdAt).time}`;
      return `[${at}] ${who(m)}: ${texts?.[i] ?? content(m)}`;
    })
    .join("\n");
}

export const CLOSING_JUDGE_SYSTEM = `Você ajuda a equipe de um escritório que atende clientes pelo WhatsApp.
A conversa abaixo está com um ATENDENTE humano e a última mensagem é do CLIENTE.
O sistema precisa saber se essa última mensagem só ENCERRA o assunto ou se o
cliente está RETOMANDO o contato / trazendo algo que espera resposta.

ENCERRA (closing=true): agradecimento, "ok", "entendi", 👍, despedida ou
"amém" que chega LOGO DEPOIS de uma orientação ou resposta da equipe e fecha
aquele assunto, sem nada novo.

RETOMA (closing=false): cumprimento ("bom dia", "boa tarde", "oi") que chega
horas ou dias depois da última conversa; qualquer pergunta, pedido, documento
ou assunto novo; "ok" que responde a uma pergunta da equipe que ainda pede
ação ou continuação.

Olhe os HORÁRIOS de cada mensagem: o tempo entre a última fala da equipe e a
mensagem do cliente é a pista principal. Na dúvida, closing=false (avisar o
atendente à toa custa menos do que deixar o cliente sem resposta).

Responda APENAS com JSON: {"closing": true|false, "reason": "motivo curto"}`;

/** Lê a resposta da IA. Formato inválido → null (quem chama avisa o atendente). */
export function parseClosingVerdict(raw: string): { closing: boolean; reason: string } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { closing?: unknown; reason?: unknown };
    if (typeof parsed.closing !== "boolean") return null;
    return { closing: parsed.closing, reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "" };
  } catch {
    return null;
  }
}
