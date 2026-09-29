/**
 * Bolha pendente de mídia no inbox do WhatsApp: preview do que está subindo e
 * "tentar de novo" da que falhou (auditoria de 24/09/2026, DOC-9). Antes a
 * bolha dizia "Enviando anexo..." até depois de falhar, e a mídia que falhava
 * não tinha retry: era anexar de novo. Regras puras, sem React: o File e os
 * object URLs ficam no `WhatsAppInbox` (`pendingMediaRef`).
 */

/** O mínimo de uma mensagem da thread para saber se ela já leva o anexo. */
export interface SentMediaProbe {
  direction: string;
  mediaKey: string | null;
}

/**
 * A mensagem da thread que já leva o anexo subido (`uploadedKey`), se houver.
 *
 * Por que existe: a Meta pode ter aceitado o envio e só a resposta da action
 * ter se perdido (rede caiu, timeout). Reenviar às cegas mandaria a MESMA foto
 * duas vezes ao cliente, proatividade não pedida numa WABA que já levou aviso
 * de spam. A key do S3 é única por upload (`out-<timestamp>-<nome>`) e o
 * `sendWhatsAppMedia` grava exatamente ela em `mediaKey`. Mensagem apagada no
 * CRM conta como enviada: o cliente recebeu do mesmo jeito.
 */
export function findSentMedia<T extends SentMediaProbe>(
  messages: readonly T[],
  uploadedKey: string | null | undefined,
): T | null {
  if (!uploadedKey) return null;
  return messages.find((m) => m.direction === 'out' && m.mediaKey === uploadedKey) ?? null;
}

/**
 * Como a bolha pendente mostra o anexo: imagem vira `<img>` do object URL do
 * File local (sem ida à rede); o resto mostra o nome do arquivo. Formato que o
 * navegador não desenha (HEIC fora do Safari) cai no nome pelo `onError`.
 */
export function pendingPreviewKind(mediaType: string | null | undefined): 'image' | 'file' {
  return mediaType?.startsWith('image/') ? 'image' : 'file';
}

/**
 * Toast da falha de envio de mídia. Texto próprio, nunca o `e.message`: erro
 * de server action chega mascarado em produção (o atendente lia o texto
 * genérico do Next). A etapa diz se o arquivo nem chegou ao S3.
 */
export function mediaSendFailedText(fileName: string, stage: 'upload' | 'send'): string {
  const name = fileName.trim() || 'anexo';
  return stage === 'upload'
    ? `Não foi possível subir "${name}". Use "tentar de novo" na bolha: não precisa anexar de novo.`
    : `Não foi possível enviar "${name}". Use "tentar de novo" na bolha: não precisa anexar de novo.`;
}

/**
 * Retry com a janela de 24 h fechada: a Meta recusaria de novo (só aceita
 * template), e o motivo não chegaria legível (erro de action mascarado).
 */
export const RETRY_WINDOW_CLOSED_TEXT =
  'Janela de 24h fechada: a Meta só aceita template aprovado até o cliente responder. Use "Enviar template".';

/**
 * Não deu para conferir se o anexo já entrou na conversa: na dúvida, NÃO
 * reenvia (a mesma foto duas vezes ao cliente é pior que um clique a mais).
 */
export const RETRY_CHECK_FAILED_TEXT =
  'Não foi possível conferir se o anexo já chegou ao cliente. Confira a conexão e tente de novo.';
