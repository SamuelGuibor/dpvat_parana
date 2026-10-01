// Nome legível da mídia da conversa do WhatsApp (bolha do inbox, lista do
// Copiloto, Document criado pelo "Anexar no card" e Content-Disposition da URL
// assinada).
//
// Por que existe: a mídia recebida sem nome é gravada como `<ts>-midia.<ext>`
// (downloadMediaToS3, client.ts) e o áudio gravado no inbox como
// `out-<ts>-audio-<ts>.ogg` (use-voice-recorder.ts). O card acumulava dezenas
// de "midia.jpeg" iguais e a equipe não sabia qual era o RG e qual era o laudo.
// Nome inventado pelo sistema vira "Foto 24-09-2026 14h32m05.jpeg"; nome que o
// cliente deu (PDF, documento) é preservado.
//
// A key do S3 NÃO muda (há parsers de `^\d{10,}-` e scripts que usam a key
// como está): o nome é só de exibição, calculado da key + tipo + data.

import { brDateTimeParts } from './date-br';

export interface MediaNameInput {
  /** Key do S3 da mensagem (`whatsapp/<cid>/<ts>-<nome>`, `.../out-<ts>-<nome>`…). */
  key: string;
  /** MIME gravado na mensagem (`image/jpeg`, `audio/ogg; codecs=opus`…). */
  mediaType?: string | null;
  /** Quando a mensagem foi gravada (Date, ISO ou epoch). */
  createdAt: Date | string | number;
}

// Prefixo que o app põe no nome: `<ts>-` (mídia recebida, anexo da ficha,
// biblioteca dos fluxos) e `out-<ts>-` (mídia enviada pelo atendente).
const KEY_PREFIX_RE = /^(?:out-)?\d{10,}-/;

// Nomes inventados (não são o nome que alguém deu ao arquivo), nos dois
// sentidos da conversa: `midia.<ext>` (mídia recebida sem filename),
// `audio.<ext>`/`audio-<ts>.<ext>` (PTT gravado no inbox) e `image.<ext>`
// (imagem colada da área de transferência, que o navegador chama de image.png).
const DEFAULT_NAME_RE = /^(?:midia|audio|image)(?:[-_]\d+)?(?:\.[a-z0-9]+)?$/i;

const EXT_RE = /\.([a-z0-9]{1,8})$/i;
const AUDIO_EXT_RE = /^(?:ogg|opus|oga|mp3|mpeg|m4a|aac|amr|wav|weba)$/i;
const VIDEO_EXT_RE = /^(?:mp4|3gpp?|mov|webm|mkv|avi)$/i;
const IMAGE_EXT_RE = /^(?:jpe?g|png|gif|heic|bmp)$/i;

/** Rótulo pelo tipo da mídia: Foto, Figurinha, Vídeo, Áudio ou Documento. */
export function mediaKindLabel(mediaType: string | null | undefined, ext = ''): string {
  const mt = (mediaType ?? '').toLowerCase().trim();
  // Figurinha do WhatsApp chega como image/webp; foto vem em jpeg.
  if (mt.startsWith('image/webp')) return 'Figurinha';
  if (mt.startsWith('image/')) return 'Foto';
  if (mt.startsWith('video/')) return 'Vídeo';
  if (mt.startsWith('audio/')) return 'Áudio';
  if (mt) return 'Documento';
  // Sem MIME (mensagem antiga): pela extensão.
  if (/^webp$/i.test(ext)) return 'Figurinha';
  if (IMAGE_EXT_RE.test(ext)) return 'Foto';
  if (VIDEO_EXT_RE.test(ext)) return 'Vídeo';
  if (AUDIO_EXT_RE.test(ext)) return 'Áudio';
  return 'Documento';
}

/** Extensão a partir do MIME (`audio/ogg; codecs=opus` → `ogg`). */
function extFromMime(mediaType: string | null | undefined): string {
  const sub = (mediaType ?? '').split('/')[1]?.split(';')[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9]{1,8}$/.test(sub) ? sub : '';
}

/** Último segmento da key sem o prefixo `(out-)<ts>-`, decodificado (nunca lança). */
function rawNameFromKey(key: string): string {
  const last = (key || '').split('/').pop() ?? '';
  const noPrefix = last.replace(KEY_PREFIX_RE, '');
  try {
    return decodeURIComponent(noPrefix);
  } catch {
    // "%" solto no nome ("100%.pdf") não é URI válida: fica como veio.
    return noPrefix;
  }
}

/**
 * O upload troca espaço e acento por "_" (safeName): "Laudo_hospital.pdf"
 * volta a ser "Laudo hospital.pdf" e "carta__1_.pdf" vira "carta 1.pdf".
 */
function tidyOriginalName(name: string): string {
  return name
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

/**
 * Nome de exibição da mídia. Nome inventado pelo sistema (ou vazio) vira
 * `<Rótulo> dd-mm-aaaa HHhMMmSS.<ext>` no horário de Brasília — os segundos
 * evitam dois "Foto … 14h32" iguais quando o cliente manda frente e verso do
 * RG no mesmo minuto, e "14h32" no lugar de "14:32" porque ":" é inválido em
 * nome de arquivo no Windows. Nome dado pelo cliente/atendente é preservado,
 * com "_" de volta para espaço.
 */
export function mediaDisplayName({ key, mediaType, createdAt }: MediaNameInput): string {
  const raw = rawNameFromKey(key);
  const rawExt = EXT_RE.exec(raw)?.[1] ?? '';
  const base = rawExt ? raw.slice(0, -(rawExt.length + 1)) : raw;

  if (base.trim() && !DEFAULT_NAME_RE.test(raw)) {
    const tidy = tidyOriginalName(raw);
    if (tidy && !tidy.startsWith('.')) return tidy;
  }

  const ext = (rawExt || extFromMime(mediaType)).toLowerCase();
  const label = mediaKindLabel(mediaType, ext);
  const suffix = ext ? `.${ext}` : '';
  const when = new Date(createdAt);
  // Data inválida faria o Intl lançar: melhor "Foto.jpeg" que quebrar a bolha.
  if (Number.isNaN(when.getTime())) return `${label}${suffix}`;
  const { day, time, second } = brDateTimeParts(when);
  const [yyyy, mm, dd] = day.split('-');
  const [hh, min] = time.split(':');
  return `${label} ${dd}-${mm}-${yyyy} ${hh}h${min}m${second}${suffix}`;
}

/**
 * Nome que o CLIENTE deu ao arquivo (PDF "Carta de concessão.pdf"), tirado da
 * key do S3; null quando o nome foi inventado pelo sistema (`midia.<ext>`,
 * `audio.<ext>`, `image.png`) ou está vazio. Vai para o cérebro do bot no
 * `mediaList[].fileName` (30/09/2026): na coleta de documentos, o nome do PDF
 * ajuda a IA a conferir qual item da lista chegou. Um nome inventado diria
 * "midia.pdf" em todo anexo e não ajuda em nada.
 */
export function mediaOriginalName(key: string | null | undefined, max = 120): string | null {
  if (!key) return null;
  const raw = rawNameFromKey(key);
  const rawExt = EXT_RE.exec(raw)?.[1] ?? '';
  const base = rawExt ? raw.slice(0, -(rawExt.length + 1)) : raw;
  if (!base.trim() || DEFAULT_NAME_RE.test(raw)) return null;
  const tidy = tidyOriginalName(raw);
  if (!tidy || tidy.startsWith('.')) return null;
  return tidy.length > max ? tidy.slice(0, max) : tidy;
}

// Caracteres que o Windows recusa em nome de arquivo (o download do card sai
// com este nome), o ";" que abre outro parâmetro no Content-Disposition
// (mesma regra do sanitizeDocName) e controles invisíveis.
// eslint-disable-next-line no-control-regex
const INVALID_FILE_CHARS_RE = /[\\/:*?"<>|;\u0000-\u001f\u007f]/g;
const BASE_NAME_MAX = 80;

/**
 * Nome-base digitado no "Anexar selecionadas" → nome seguro: sem os
 * caracteres que o Windows recusa, espaços juntos, sem ponto no fim, até 80
 * caracteres. Vazio = usar o nome legível de cada mídia.
 */
export function cleanBaseName(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(INVALID_FILE_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BASE_NAME_MAX)
    .replace(/[.\s]+$/, '');
}

/**
 * Nomes do "Anexar selecionadas" (aba Arquivos do Copiloto), na ordem dada
 * (a action ordena da mais antiga para a mais nova). Sem nome-base: o nome
 * legível de cada mídia. Com nome-base: "DOCUMENTO PESSOAL 1.jpeg",
 * "DOCUMENTO PESSOAL 2.pdf"… com a extensão de cada arquivo; uma mídia só
 * fica sem número ("DOCUMENTO PESSOAL.jpeg"). A extensão digitada junto do
 * nome-base ("RG.jpeg") não se repete.
 */
export function batchMediaNames(items: MediaNameInput[], baseName?: string | null): string[] {
  const base = cleanBaseName(baseName);
  if (!base) return items.map((it) => mediaDisplayName(it));
  return items.map((it, i) => {
    const ext = EXT_RE.exec(mediaDisplayName(it))?.[1]?.toLowerCase() ?? '';
    const stem = ext && base.toLowerCase().endsWith(`.${ext}`) ? base.slice(0, -(ext.length + 1)).trim() || base : base;
    const n = items.length > 1 ? ` ${i + 1}` : '';
    return `${stem}${n}${ext ? `.${ext}` : ''}`;
  });
}
