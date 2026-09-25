// Regras puras sobre as keys do bucket (mesmo bucket para documentos do card e
// mídia do WhatsApp). Prefixos de whatsapp/:
//   whatsapp/<contactId>/<ts>-*       mídia recebida do cliente
//   whatsapp/<contactId>/out-*        mídia enviada pelo atendente
//   whatsapp/<contactId>/docs/*       rascunho da ficha do cliente
//   whatsapp/flows/*                  biblioteca COMPARTILHADA dos fluxos do bot
//   whatsapp/templates/*              biblioteca COMPARTILHADA dos cabeçalhos de template

const SHARED_LIBRARY_PREFIXES = ["whatsapp/flows/", "whatsapp/templates/"];

/**
 * Key de biblioteca compartilhada: o mesmo objeto é gravado em TODA mensagem
 * de fluxo (flow-runner grava `step.mediaKey`) e em todo template com mídia.
 * Nunca pode ser apagada por causa de um Document (quem anexa o vídeo do fluxo
 * no card e depois purga quebraria o passo para todos os próximos leads).
 */
export function isSharedLibraryKey(key: string): boolean {
  return SHARED_LIBRARY_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * contactId embutido numa key `whatsapp/<contactId>/...`; null para as
 * bibliotecas compartilhadas e para qualquer outro prefixo (uploads/ etc.).
 * Serve para diagnóstico: NÃO use como filtro para decidir se um objeto pode
 * ser apagado (mensagem de contato mesclado ou movido pode apontar para a key
 * de outro contato).
 */
export function contactIdFromWhatsAppKey(key: string): string | null {
  if (!key.startsWith("whatsapp/") || isSharedLibraryKey(key)) return null;
  const parts = key.split("/");
  // Precisa de pelo menos whatsapp/<cid>/<arquivo>.
  if (parts.length < 3 || !parts[1] || !parts[parts.length - 1]) return null;
  return parts[1];
}
