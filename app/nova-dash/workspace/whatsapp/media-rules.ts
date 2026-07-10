// Regras de mídia da WhatsApp Cloud API (Meta).
//
// Não é permissão de app: a Graph API tem uma lista fechada de MIME types
// aceitos por tipo de mensagem, e rejeita o resto com erro. O caso mais comum
// é vídeo .mov (video/quicktime) do iPhone — só mp4/3gpp são aceitos — e
// "arquivos" genéricos (.zip, .rar, etc.) que não estão na lista de documentos.
// O outro problema real é o navegador reportar `file.type` vazio para alguns
// formatos (comum no Windows) — sem fallback por extensão, isso virava
// "application/octet-stream", que a Meta também rejeita como documento.

export type WaKind = 'image' | 'video' | 'audio' | 'document';

const EXT_TO_MIME: Record<string, string> = {
  // Documentos
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  // Imagem
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  // Vídeo
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  // Áudio
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  amr: 'audio/amr',
  m4a: 'audio/mp4',
};

// Listas fechadas da Meta (Cloud API), fev/2026.
const SUPPORTED_IMAGE = new Set(['image/jpeg', 'image/png']);
const SUPPORTED_VIDEO = new Set(['video/mp4', 'video/3gpp']);
const SUPPORTED_AUDIO = new Set(['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg']);
const SUPPORTED_DOCUMENT = new Set([
  'text/plain', 'application/pdf',
  'application/vnd.ms-powerpoint', 'application/msword', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_MB: Record<WaKind, number> = { image: 5, video: 16, audio: 16, document: 100 };

/** MIME reportado pelo browser, com fallback por extensão quando vier vazio. */
export function resolveMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

export function kindOf(mimeType: string): WaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

export interface MediaCheck {
  ok: boolean;
  mimeType: string;
  kind: WaKind;
  reason?: string;
}

/**
 * Valida um arquivo ANTES do upload, pra não gastar uma chamada à Meta com
 * algo que ela vai recusar. `file.type` vazio é resolvido por extensão.
 */
export function checkFileForWhatsApp(file: File): MediaCheck {
  const mimeType = resolveMimeType(file);
  const kind = kindOf(mimeType);

  const maxMb = MAX_MB[kind];
  if (file.size > maxMb * 1024 * 1024) {
    return { ok: false, mimeType, kind, reason: `"${file.name}" passa do limite da Meta para ${kind} (máx. ${maxMb} MB).` };
  }

  const whitelist = kind === 'image' ? SUPPORTED_IMAGE
    : kind === 'video' ? SUPPORTED_VIDEO
      : kind === 'audio' ? SUPPORTED_AUDIO : SUPPORTED_DOCUMENT;

  if (!whitelist.has(mimeType)) {
    if (kind === 'video') {
      return { ok: false, mimeType, kind, reason: `"${file.name}": vídeo em ${mimeType || 'formato desconhecido'} não é aceito pela Meta. Só MP4 ou 3GPP — converta antes de enviar.` };
    }
    if (kind === 'audio') {
      return { ok: false, mimeType, kind, reason: `"${file.name}": áudio em ${mimeType} não é aceito pela Meta. Use AAC, MP3, OGG(opus) ou AMR.` };
    }
    if (kind === 'image') {
      return { ok: false, mimeType, kind, reason: `"${file.name}": imagem em ${mimeType} não é aceita pela Meta. Use JPG ou PNG.` };
    }
    return { ok: false, mimeType, kind, reason: `"${file.name}": este tipo de arquivo (${mimeType}) não é aceito como documento pela Meta. Use PDF, Word, Excel, PowerPoint ou TXT.` };
  }

  return { ok: true, mimeType, kind };
}
