// Regras puras da lista do inbox do WhatsApp, compartilhadas entre o servidor
// (loadConversations em app/_actions/whatsapp/conversations.ts) e o cliente,
// para a prévia montada no navegador bater com a que vem do banco.

/**
 * Tamanho máximo da prévia da última mensagem na lista. O corte é feito no SQL
 * (`left(body, 160)`): a linha da lista mostra uma linha só, e mandar o corpo
 * inteiro das 1.000 conversas a cada recarga era peso morto no payload.
 */
export const LIST_PREVIEW_MAX_CHARS = 160;

/**
 * Rótulo de fallback quando a última mensagem é mídia sem legenda. A lista
 * mostra um ícone do tipo na frente, então aqui vai só o nome curto.
 */
export function mediaTypeLabel(mediaType: string): string {
  if (mediaType.startsWith('image/')) return 'Foto';
  if (mediaType.startsWith('video/')) return 'Vídeo';
  if (mediaType.startsWith('audio/')) return 'Áudio';
  return 'Documento';
}
