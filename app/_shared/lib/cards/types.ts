// Contrato comum das libs de escrita no card (mover, tag, comentário, arquivo).
//
// Uma função por ação, chamada pela UI (server action/rota), pelo executor de
// automações e pela IA de operação (/api/op). Nenhuma lê sessão: quem chama já
// fez o guard e passa o autor. Assim o autor do log é sempre quem agiu de fato
// — o operador "(via IA)", o atendente no site ou o "Bot (Automação)".

/** Quem fez. `id` vai para Log.authorId (texto livre, sem FK). */
export interface WriteAuthor {
  id: string;
  name: string;
}

/** Rastro da IA de operação: liga o Log à linha de op_tool_calls. */
export interface OpTrace {
  sessionId: string | null;
  requestId: string | null;
}

/** De onde veio a escrita. "op" = IA de operação (Claude Code). */
export type WriteSource = "ui" | "automation" | "op";

export interface WriteCommon {
  cardId: string;
  isProcess: boolean;
  author: WriteAuthor;
  source?: WriteSource;
  op?: OpTrace | null;
}

/** Erro esperado (card não existe, coluna apagada…): o chamador decide a resposta. */
export class CardWriteError extends Error {
  constructor(
    public code: "card_nao_encontrado" | "coluna_nao_encontrada" | "tag_nao_encontrada" | "texto_vazio" | "destinatario_invalido" | "email_em_uso",
    message: string,
  ) {
    super(message);
    this.name = "CardWriteError";
  }
}

/** Campos de metadata que toda lib grava: origem e, na IA, o rastro do op_tool_calls. */
export function sourceMeta(source: WriteSource | undefined, op: OpTrace | null | undefined): Record<string, unknown> {
  return {
    ...(source && source !== "ui" ? { source } : {}),
    ...(op ? { op } : {}),
  };
}

export function cardRef(isProcess: boolean, cardId: string) {
  return { userId: isProcess ? null : cardId, processId: isProcess ? cardId : null };
}
