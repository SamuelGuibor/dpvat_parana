// Nome de exibição de um Document (aba Arquivos do card e ficha do WhatsApp).
//
// Renomear troca SÓ o `name`: a `key` do S3 pode ser compartilhada com
// WhatsAppMessage.mediaKey (anexo vindo da conversa) ou com a biblioteca de
// fluxos, e mover/apagar o objeto quebrava a mídia na thread. Por isso a
// extensão continua vindo da key (é o formato real do arquivo) e o download sai
// com o nome novo via Content-Disposition.

/**
 * Tira do nome o que quebra o header `Content-Disposition: ...; filename="…"`
 * montado em `downloadFileFromS3`: aspas duplas (fecham o valor), `;` (abre
 * outro parâmetro), `\r`/`\n` e demais caracteres de controle (injetam header),
 * barra e contrabarra (viram pasta no "Salvar como" de alguns navegadores).
 */
export function sanitizeDocName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f"\\/;]/g, "").trim();
}

/** Extensão (com ponto) do último segmento da key; "" se não houver. */
export function extensionFromKey(key: string): string {
  const last = key.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  // dot 0 = arquivo oculto (".algo"), não extensão; ponto no fim = sem extensão.
  if (dot <= 0 || dot === last.length - 1) return "";
  return last.slice(dot);
}

/**
 * Nome limpo com a extensão da key garantida (sem duplicar, ignorando caixa).
 * Devolve "" quando não sobra nada do nome depois da limpeza — quem chama
 * trata como nome inválido.
 */
export function ensureDocExtension(newName: string, key: string): string {
  const clean = sanitizeDocName(newName);
  if (!clean) return "";
  const ext = extensionFromKey(key);
  if (ext && !clean.toLowerCase().endsWith(ext.toLowerCase())) return clean + ext;
  return clean;
}
