// Fatos do contrato na ZapSign para o cérebro do bot (30/09/2026).
//
// A assinatura eletrônica própria está desligada: hoje o atendente manda o
// contrato por um link da ZapSign, digitado na conversa, e o cérebro não sabia
// disso. O cliente dizia "não achei o link" ou mandava "podemos conversar?" e
// a IA transferia ou recomeçava a triagem. Agora vão dois fatos neutros em
// conversationFacts (o micro só lista, as instruções dizem o que fazer):
// - cardColumn: coluna (Label) do card vinculado. O processInfo.etapa chega
//   como "Processo iniciado" para a maioria dos cards em COLHER-ASSINATURA e
//   não diz onde o caso está;
// - contractPending: o ÚLTIMO link da ZapSign mandado por um ATENDENTE ao
//   mesmo contato nos últimos 10 dias, enquanto o card ainda está em
//   COLHER-ASSINATURA (ou não há card). O link é copiado da mensagem do
//   atendente, nunca montado nem tirado de mensagem do cliente.
//
// Puro, sem Prisma: a consulta fica no bot.ts.

/** Janela do link: contrato mandado há mais tempo já não é "pendente". */
export const CONTRACT_PENDING_WINDOW_MS = 10 * 24 * 60 * 60_000;

/** Link da ZapSign dentro do texto, sem a pontuação que cola no fim. */
export function extractZapSignLink(body: string | null | undefined): string | null {
  if (typeof body !== "string") return null;
  const match = /https?:\/\/[^\s<>"'`]*zapsign\.com[^\s<>"'`]*/i.exec(body);
  if (!match) return null;
  const link = match[0].replace(/[.,;:!?)\]}*_~]+$/, "");
  return link.length <= 500 ? link : null;
}

/** "COLHER-ASSINATURA", "Colher assinatura", "COLHER_ASSINATURA" → mesma coluna. */
export function isSignatureColumn(name: string | null | undefined): boolean {
  if (!name) return false;
  const folded = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return folded === "COLHER ASSINATURA";
}

export interface ContractPendingFact {
  link: string;
  /** ISO: quando o atendente mandou o link. */
  sentAt: string;
}

/**
 * Fato contractPending: link da última mensagem de atendente com ZapSign, só
 * sem card ou com o card em COLHER-ASSINATURA. Card em outra coluna = o
 * contrato já andou (ou nem é o caso); sem link válido → null.
 */
export function buildContractPending(input: {
  message: { body: string | null; createdAt: Date } | null;
  hasCard: boolean;
  cardColumn: string | null;
  now?: number;
}): ContractPendingFact | null {
  const { message } = input;
  if (!message) return null;
  if (input.hasCard && !isSignatureColumn(input.cardColumn)) return null;
  if ((input.now ?? Date.now()) - message.createdAt.getTime() > CONTRACT_PENDING_WINDOW_MS) return null;
  const link = extractZapSignLink(message.body);
  return link ? { link, sentAt: message.createdAt.toISOString() } : null;
}
