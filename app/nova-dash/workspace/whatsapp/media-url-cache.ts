'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { fileNameFromKey } from '@/app/_shared/utils/s3-keys';

// Cache ÚNICO de URLs de leitura de mídia do inbox (bolhas da thread e aba
// Arquivos do Copiloto).
//
// A URL chega pronta do servidor (rota da thread / listClientDocuments),
// assinada numa janela estável de 30 min — o servidor devolve a MESMA URL a
// cada poll. A server action (downloadFileFromS3) ficou só como fallback:
// mensagem sem URL (key fora da allowlist) ou aba parada além da validade.
// Antes cada bolha disparava uma action no mount e abrir uma conversa
// enfileirava de 3 a 11 delas na fila serial do navegador.
//
// Chave = key + modo + nome: a URL carrega o Content-Disposition, então a
// mesma key com o nome da mensagem (bolha) e com o nome do Document (Copiloto)
// são entradas diferentes — senão o PDF aberto pelo Copiloto sairia com o
// nome da mensagem.

export interface MediaUrlOpts {
  /** Nome no Content-Disposition. Padrão: nome tirado da key (fileNameFromKey). */
  fileName?: string;
  /** true (padrão) abre no navegador; false força download. */
  inline?: boolean;
}

interface Entry { url: string; expiresAt: number }

// Margem antes do vencimento real: a URL precisa sobreviver ao tempo entre o
// render e o navegador terminar de baixar o arquivo.
const EXPIRY_MARGIN_MS = 5 * 60_000;
// downloadFileFromS3 assina por 1 h a partir de agora.
const ACTION_TTL_MS = 60 * 60_000;

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();
// URLs que o navegador já recusou (<img>/<audio> onError): não voltam a ser
// usadas nem como semente, senão a bolha ficaria presa na mesma URL quebrada.
const rejectedUrls = new Set<string>();
// Mídias que falharam de novo com URL nova: objeto apagado/purgado no S3.
// Mostra "Arquivo indisponível" direto nas próximas aberturas, sem gastar action.
const unavailable = new Set<string>();

function resolveOpts(key: string, opts?: MediaUrlOpts) {
  const inline = opts?.inline ?? true;
  const fileName = opts?.fileName || fileNameFromKey(key);
  return { inline, fileName, cacheKey: `${key}|${inline}|${fileName}` };
}

function validEntry(cacheKey: string): Entry | null {
  const e = cache.get(cacheKey);
  if (!e) return null;
  if (e.expiresAt > Date.now() && !rejectedUrls.has(e.url)) return e;
  cache.delete(cacheKey);
  return null;
}

/**
 * Registra a URL que veio do servidor e devolve a URL a usar. Uma entrada
 * válida já existente VENCE a semente: quando a janela de assinatura vira, o
 * servidor manda outra URL, mas a mídia já carregada não troca de src (não
 * recarrega nem pisca). Semente vencida, recusada ou ausente → null.
 */
export function seedMediaUrl(
  key: string,
  url: string | null | undefined,
  expiresAt: string | null | undefined,
  opts?: MediaUrlOpts,
): string | null {
  const { cacheKey } = resolveOpts(key, opts);
  const existing = validEntry(cacheKey);
  if (existing) return existing.url;
  if (!url || !expiresAt || rejectedUrls.has(url)) return null;
  const exp = Date.parse(expiresAt) - EXPIRY_MARGIN_MS;
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  cache.set(cacheKey, { url, expiresAt: exp });
  return url;
}

/**
 * URL válida do cache ou, sem ela, uma nova pela server action (fallback).
 * Pedidos simultâneos da mesma entrada compartilham a mesma action.
 */
export async function getMediaUrl(key: string, opts?: MediaUrlOpts): Promise<string | null> {
  const { cacheKey, inline, fileName } = resolveOpts(key, opts);
  const hit = validEntry(cacheKey);
  if (hit) return hit.url;
  const pending = inflight.get(cacheKey);
  if (pending) return pending;
  const p = downloadFileFromS3(key, fileName, inline)
    .then((res) => {
      if (!res.success || !res.presignedUrl) return null;
      cache.set(cacheKey, { url: res.presignedUrl, expiresAt: Date.now() + ACTION_TTL_MS - EXPIRY_MARGIN_MS });
      return res.presignedUrl;
    })
    .catch(() => null)
    .finally(() => { inflight.delete(cacheKey); });
  inflight.set(cacheKey, p);
  return p;
}

// Duas falhas dentro deste intervalo (a da URL antiga e a da nova, buscada
// logo depois) = arquivo indisponível. Folgado para cobrir a fila de actions
// e o download de uma imagem grande numa rede lenta.
const REPEAT_ERROR_WINDOW_MS = 2 * 60_000;

interface FailState { cacheKey: string | null; errors: number; lastErrorAt: number; failed: boolean }
const NO_FAIL: FailState = { cacheKey: null, errors: 0, lastErrorAt: 0, failed: false };

function rejectMediaUrl(cacheKey: string, url: string) {
  rejectedUrls.add(url);
  if (cache.get(cacheKey)?.url === url) cache.delete(cacheKey);
}

/**
 * URL estável de uma mídia para <img>/<audio>/<video>.
 * - Com semente válida (ou entrada no cache), a URL sai já no 1º render: a
 *   mídia nasce junto com o texto, sem spinner e sem action.
 * - Sem semente, busca pela action uma vez (fallback).
 * - `onError` do elemento: a 1ª falha descarta a URL e busca uma nova (URL
 *   vencida numa aba parada); outra falha logo em seguida marca `failed` —
 *   objeto que não existe mais no S3 — e a UI mostra "Arquivo indisponível".
 * `key` null desliga o hook (ex.: linha que não é imagem).
 */
export function useMediaUrl(
  key: string | null,
  seedUrl?: string | null,
  seedExpiresAt?: string | null,
  opts?: MediaUrlOpts,
): { url: string | null; failed: boolean; onError: () => void; retry: () => void } {
  const inline = opts?.inline ?? true;
  const fileName = opts?.fileName;
  const cacheKey = key ? resolveOpts(key, { inline, fileName }).cacheKey : null;

  // Falhas desta entrada (a chave do estado evita herdar a falha de outra
  // mídia quando o componente é reaproveitado com outra key).
  const [fail, setFail] = useState<FailState>(NO_FAIL);
  const [, setFetchTick] = useState(0);
  const failed = !!cacheKey && (unavailable.has(cacheKey) || (fail.cacheKey === cacheKey && fail.failed));

  // Resolvida no render (idempotente): cache válido > semente do servidor.
  const url = key && !failed ? seedMediaUrl(key, seedUrl, seedExpiresAt, { inline, fileName }) : null;

  useEffect(() => {
    if (!key || !cacheKey || url || failed) return;
    let cancelled = false;
    getMediaUrl(key, { inline, fileName }).then((u) => {
      if (cancelled) return;
      // Com URL, o cache já tem a entrada: basta renderizar de novo.
      if (u) setFetchTick((t) => t + 1);
      else setFail((f) => ({ ...(f.cacheKey === cacheKey ? f : NO_FAIL), cacheKey, failed: true }));
    });
    return () => { cancelled = true; };
  }, [key, cacheKey, url, failed, inline, fileName]);

  const onError = useCallback(() => {
    if (!cacheKey || !url) return;
    rejectMediaUrl(cacheKey, url);
    // Só conta como "de novo" a falha que vem logo depois da anterior: numa
    // sessão longa a URL vence uma vez por hora, e isso não é arquivo sumido.
    const now = Date.now();
    const recent = fail.cacheKey === cacheKey && now - fail.lastErrorAt < REPEAT_ERROR_WINDOW_MS;
    const errors = recent ? fail.errors + 1 : 1;
    if (errors >= 2) unavailable.add(cacheKey);
    setFail({ cacheKey, errors, lastErrorAt: now, failed: errors >= 2 });
  }, [cacheKey, url, fail]);

  const retry = useCallback(() => {
    if (!cacheKey) return;
    unavailable.delete(cacheKey);
    setFail({ ...NO_FAIL, cacheKey });
  }, [cacheKey]);

  return { url, failed, onError, retry };
}
