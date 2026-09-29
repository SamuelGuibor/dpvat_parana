// Regras puras sobre a mídia RECEBIDA no WhatsApp que viram fato para o
// cérebro do bot (conversationFacts.docsReceived em whatsapp/bot.ts).
//
// Até 25/09/2026 o fato contava todo anexo do contato desde que a conversa
// nasceu: áudio, figurinha e documento de atendimentos já encerrados entravam
// na conta (a conversa é 1:1 com o contato e nunca é recriada). O cérebro lia
// "o cliente mandou documento NESTE atendimento" e transferia dúvida simples
// de quem só tinha mandado áudio meses antes.

/** Figurinha do WhatsApp chega como image/webp: não é documento do cliente. */
const STICKER_MIME = "image/webp";
const PDF_MIME = "application/pdf";

/**
 * Anexo que conta como documento enviado pelo cliente: foto (image/*, menos a
 * figurinha) ou PDF. Áudio, vídeo, .docx e outros application/* ficam de fora:
 * o micro não abre esses tipos como documento, então contar seria prometer ao
 * cérebro um arquivo que ele não leu.
 */
export function isClientDocumentMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  // "audio/ogg; codecs=opus": o que vale é o tipo antes dos parâmetros.
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === PDF_MIME) return true;
  return base.startsWith("image/") && base !== STICKER_MIME;
}

/**
 * Filtro do Prisma equivalente a isClientDocumentMime, para contar no banco
 * sem trazer as linhas. O webhook grava o mime_type da Meta em minúsculas e
 * sem parâmetros (conferido em 25/09/2026: "image/jpeg", "application/pdf"),
 * por isso a comparação exata basta.
 */
export function clientDocumentMediaWhere() {
  return {
    OR: [
      { mediaType: { startsWith: "image/", not: STICKER_MIME } },
      { mediaType: PDF_MIME },
    ],
  };
}

/**
 * Início do atendimento atual: o último encerramento (closedAt), ou a criação
 * da conversa se ela nunca foi encerrada. closedAt é sempre o ÚLTIMO
 * encerramento: reabrir (mensagem nova, botão Reabrir ou saída do standby)
 * nunca o limpa, então tudo o que chegou depois dele é deste atendimento.
 */
export function docsReceivedSince(conv: { createdAt: Date; closedAt: Date | null }): Date {
  if (!conv.closedAt) return conv.createdAt;
  return conv.closedAt.getTime() > conv.createdAt.getTime() ? conv.closedAt : conv.createdAt;
}
