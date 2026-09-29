// Regras puras sobre as keys do bucket (mesmo bucket para documentos do card e
// mídia do WhatsApp). Anexo da aba Arquivos do card:
//   uploads/{user|process}_<cardId>/<ts>-<nome>
// Prefixos de whatsapp/:
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

/**
 * Key do anexo enviado pela aba Arquivos do card. O índice do arquivo no lote
 * entra SOMADO ao timestamp (em vez de um `-<idx>-` a mais) para manter o
 * formato `<número>-<nome>` das keys já gravadas. Sem o índice, dois arquivos
 * de mesmo nome no mesmo lote (ex.: dois "rg.pdf" de pastas diferentes) caíam
 * na MESMA key: o 2º PUT sobrescrevia o 1º e o card ficava com dois registros
 * apontando para o mesmo objeto.
 */
export function cardUploadKey(
  itemId: string,
  isProcess: boolean,
  batchTs: number,
  idx: number,
  fileName: string,
): string {
  return `uploads/${isProcess ? "process" : "user"}_${itemId}/${batchTs + idx}-${fileName}`;
}

// ---------------------------------------------------------------------------
// Leitura (URL pré-assinada de GET)
// ---------------------------------------------------------------------------

/**
 * Prefixos que o app grava para arquivos de cliente/atendimento. É a allowlist
 * de quem assina URL de leitura: `downloadFileFromS3` é invocável de página
 * pública (área do cliente), e sem esta lista viraria um leitor arbitrário do
 * bucket inteiro. Prefixo novo de arquivo de cliente → acrescentar aqui.
 */
export const ALLOWED_KEY_PREFIXES = [
  "uploads/",
  "whatsapp/",
  "roteiro-temp/",
  "instructions/",
  "automation-templates/",
  "chat/",
  "dev-tickets/",
] as const;

/**
 * Traversal é um segmento de caminho igual a ".." — não qualquer ".." na
 * string: nome de arquivo legítimo pode ter ponto duplo ("DOC-123..pdf") e a
 * checagem por substring bloqueava o download desses anexos.
 */
export function hasTraversalSegment(key: string): boolean {
  return key.split("/").includes("..");
}

/** Key num prefixo permitido e sem segmento "..". */
export function isAllowedKeyPrefix(key: string): boolean {
  if (!key || hasTraversalSegment(key)) return false;
  return ALLOWED_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Nome amigável a partir da key. As keys de mídia têm o formato
 * ".../{timestamp}-{nome}": tira o prefixo numérico e decodifica.
 * Ex.: "whatsapp/abc/1720000000000-contrato.pdf" → "contrato.pdf".
 */
export function fileNameFromKey(key: string): string {
  const raw = key.split("/").pop() || "arquivo";
  const noTimestamp = raw.replace(/^\d{10,}-/, "");
  try {
    return decodeURIComponent(noTimestamp);
  } catch {
    return noTimestamp;
  }
}

/**
 * Header Content-Disposition para a URL assinada. O `filename="…"` sozinho
 * não aguenta acento (o S3 devolve o header como veio e o navegador mostra
 * lixo no "Salvar como"): vai também o `filename*=UTF-8''…` (RFC 6266/5987),
 * que os navegadores preferem, com um fallback ASCII sem aspas nem `;`/`\`
 * dentro do valor (eles fechariam o parâmetro ou injetariam outro).
 */
export function contentDisposition(inline: boolean, fileName: string): string {
  const type = inline ? "inline" : "attachment";
  // eslint-disable-next-line no-control-regex
  const clean = (fileName || "").replace(/[\u0000-\u001f\u007f"\\/;]/g, "").trim() || "arquivo";
  const ascii =
    clean
      .normalize("NFD")
      // Tira o acento (combinante) e troca o resto que não é ASCII por "_".
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .trim() || "arquivo";
  // encodeURIComponent deixa passar ' ( ) * — que o RFC 5987 não aceita cru.
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Janela de assinatura das URLs de mídia: 30 min. */
export const SIGNING_WINDOW_MS = 30 * 60_000;
/** Validade da URL assinada: 90 min a partir do INÍCIO da janela. */
export const SIGNED_URL_EXPIRES_S = 90 * 60;

/**
 * Data de assinatura "arredondada" para o início da janela. Com a mesma
 * `signingDate`, a mesma key e o mesmo Content-Disposition, a assinatura SigV4
 * sai idêntica: a thread refaz o GET a cada 8 s e, sem isso, cada poll traria
 * uma URL nova — o <img> recarregaria (e piscaria) a cada poll e o cache HTTP
 * do navegador nunca seria usado. Validade de 90 min contada do início da
 * janela garante ≥ 60 min de URL válida em qualquer ponto dela.
 */
export function signingWindow(
  now: number | Date,
  windowMs: number = SIGNING_WINDOW_MS,
  expiresInS: number = SIGNED_URL_EXPIRES_S,
): { signingDate: Date; expiresAt: Date } {
  const t = typeof now === "number" ? now : now.getTime();
  const start = Math.floor(t / windowMs) * windowMs;
  return { signingDate: new Date(start), expiresAt: new Date(start + expiresInS * 1000) };
}
