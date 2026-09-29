/* eslint-disable no-unused-vars */
// <img> e não next/image: a src é a URL assinada do S3 (troca a cada janela
// de 30 min), e o otimizador da Vercel cobraria por imagem e guardaria em
// cache documento pessoal do cliente.
/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, FileText, Download, Paperclip, Image as ImageIcon, Video, Mic,
  Pencil, Trash2, ChevronDown, ChevronUp, Eye, RefreshCw, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  attachConversationMediaBatch, deleteClientDocument, renameClientDocument,
} from '@/app/_actions/whatsapp/client-documents';
// Só tipos: copilot-data.ts importa o Prisma e não pode entrar no bundle.
import type { ClientDocumentDTO } from '@/app/_shared/lib/whatsapp/copilot-types';
import { useWhatsAppContactFiles } from '@/app/_shared/hooks/use-whatsapp';
import { ATTACH_BATCH_MAX, type ContactMediaItem } from '@/app/_shared/utils/contact-files';
import { batchMediaNames } from '@/app/_shared/utils/media-name';
import { describeFetchError } from '@/app/_shared/utils/fetch-json';
import {
  DOCUMENT_CATEGORIES, categoryLabel, inferCategory, type DocumentCategoryId,
} from '@/app/_shared/lib/document-categories';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { getMediaUrl, seedMediaUrl, useMediaUrl } from './media-url-cache';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';

// Aba Arquivos do Copiloto: os documentos do cliente (card ou rascunho da
// ficha) e a mídia da conversa que ainda não virou documento.
//
// A mídia vem de TODA a conversa (GET /api/whatsapp/inbox/contact-files),
// não só da janela de 50 mensagens da thread: 31% dos documentos que o
// cliente manda ficavam fora dela e só 2,7% das fotos recebidas chegavam ao
// card (auditoria de 24/09/2026). Por padrão só o que o CLIENTE mandou — a
// mídia de fluxo do bot (vídeo, áudio) não é documento do cliente.
//
// A grade não tem poll próprio: busca de novo quando a mídia mais recente da
// thread muda (o poll de 8 s dela já roda), quando a lista de documentos muda
// (anexar aqui ou pela thread, excluir) e ao reabrir a aba.

type PreviewKind = 'image' | 'pdf' | 'video' | 'audio';
interface PreviewState { name: string; url: string; kind: PreviewKind }

const AUDIO_EXT = /\.(ogg|opus|mp3|m4a|wav|aac|weba)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic)$/i;
const VIDEO_EXT = /\.(mp4|3gpp?|mov|webm)$/i;
const PDF_EXT = /\.pdf$/i;

/** Tipo de arquivo pelo nome — os documentos do cliente não guardam mediaType. */
function previewKind(name: string): 'audio' | 'image' | 'pdf' | 'other' {
  if (AUDIO_EXT.test(name)) return 'audio';
  if (IMAGE_EXT.test(name)) return 'image';
  if (PDF_EXT.test(name)) return 'pdf';
  return 'other';
}

/** Tipo da mídia da conversa: pelo MIME gravado na mensagem, com o nome de reserva. */
function mediaKindOf(item: ContactMediaItem): PreviewKind | 'other' {
  const mt = (item.mediaType ?? '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/')) return 'audio';
  if (mt.startsWith('application/pdf')) return 'pdf';
  if (mt) return 'other';
  if (IMAGE_EXT.test(item.name)) return 'image';
  if (VIDEO_EXT.test(item.name)) return 'video';
  if (AUDIO_EXT.test(item.name)) return 'audio';
  if (PDF_EXT.test(item.name)) return 'pdf';
  return 'other';
}

function kindIcon(kind: PreviewKind | 'other'): React.ElementType {
  if (kind === 'image') return ImageIcon;
  if (kind === 'video') return Video;
  if (kind === 'audio') return Mic;
  return FileText;
}

function timeStamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Nomes-base mais usados pela equipe (sugestão; o campo aceita qualquer texto). */
const BASE_NAME_SUGGESTIONS = [
  'DOCUMENTO PESSOAL', 'COMPROVANTE DE ENDEREÇO', 'LAUDO MÉDICO', 'BOLETIM DE OCORRÊNCIA', 'CARTEIRA DE TRABALHO',
];

export function ArquivosTab({
  contactId, docs, attachedSig, latestMediaId, registered, cardNumber, onDocsChanged,
}: {
  contactId: string;
  docs: ClientDocumentDTO[];
  /** Keys dos documentos numa string (null = lista ainda não chegou): mudou → a grade busca de novo. */
  attachedSig: string | null;
  /** Mídia mais recente da janela da thread: mudou → a grade busca de novo. */
  latestMediaId: string | null;
  registered: boolean;
  cardNumber: number | null;
  onDocsChanged: (docs: ClientDocumentDTO[]) => void;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const audioDocs = useMemo(() => docs.filter((d) => previewKind(d.name) === 'audio'), [docs]);
  const otherDocs = useMemo(() => docs.filter((d) => previewKind(d.name) !== 'audio'), [docs]);

  async function handlePreview(doc: ClientDocumentDTO) {
    const kind = previewKind(doc.name);
    if (kind !== 'image' && kind !== 'pdf') return;
    // URL que veio assinada com a lista (nome do documento); action só se não
    // houver uma válida.
    const opts = { fileName: doc.name };
    const url = seedMediaUrl(doc.key, doc.url, doc.urlExpiresAt, opts) ?? await getMediaUrl(doc.key, opts);
    if (!url) { toast.error('Não foi possível abrir o arquivo.'); return; }
    setPreview({ name: doc.name, url, kind });
  }

  async function handleDownload(doc: ClientDocumentDTO) {
    // Baixa com o NOME do documento, não o da key: o rename troca só o nome
    // (a key pode ser a mesma da mensagem da conversa). Nova aba em vez de
    // location.href para um erro do S3 não tirar o atendente do inbox.
    const res = await downloadFileFromS3(doc.key, doc.name, false).catch(() => null);
    if (res?.success && res.presignedUrl) window.open(res.presignedUrl, '_blank');
    else toast.error('Não foi possível baixar o arquivo.');
  }

  async function handleRename(doc: ClientDocumentDTO, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === doc.name) return;
    try {
      onDocsChanged(await renameClientDocument(contactId, doc.id, trimmed));
      toast.success('Arquivo renomeado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao renomear.');
    }
  }

  async function handleDelete(doc: ClientDocumentDTO) {
    if (!(await confirm({
      title: 'Excluir arquivo',
      description: registered
        ? <>O arquivo <strong>{doc.name}</strong> vai para a lixeira do card (30 dias para restaurar).</>
        : <>O arquivo <strong>{doc.name}</strong> será removido da ficha do cliente.</>,
      confirmLabel: 'Excluir',
    }))) return;
    try {
      onDocsChanged(await deleteClientDocument(contactId, doc.id));
      toast.success('Arquivo excluído.');
    } catch {
      // Erro de server action chega mascarado em produção: texto próprio.
      toast.error('Não foi possível excluir agora. Tente de novo; se persistir, recarregue a página (F5).');
    }
  }

  return (
    <>
      {confirmDialog}

      <ConversationMedia
        contactId={contactId}
        docs={docs}
        attachedSig={attachedSig}
        latestMediaId={latestMediaId}
        registered={registered}
        cardNumber={cardNumber}
        onDocsChanged={onDocsChanged}
        onPreview={setPreview}
      />

      {docs.length === 0 && (
        <p className="px-1 text-sm text-gray-400">Nenhum arquivo do cliente ainda — anexe pela conversa acima ou pela Ficha.</p>
      )}

      {otherDocs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
            {registered ? 'No card' : 'Na ficha'} · documentos e mídia
          </span>
          {otherDocs.map((d) => (
            <DocRow key={d.id} doc={d} onPreview={handlePreview} onDownload={handleDownload} onRename={handleRename} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {audioDocs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Áudios</span>
          {audioDocs.map((d) => (
            <AudioDocRow key={d.id} doc={d} onDownload={handleDownload} onRename={handleRename} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-sm">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview?.kind === 'image' && (
            <img src={preview.url} alt={preview.name} className="max-h-[70vh] w-full rounded-lg object-contain" />
          )}
          {preview?.kind === 'pdf' && (
            <iframe src={preview.url} title={preview.name} className="h-[70vh] w-full rounded-lg border border-gray-200" />
          )}
          {preview?.kind === 'video' && (
            <video src={preview.url} controls className="max-h-[70vh] w-full rounded-lg bg-black" />
          )}
          {preview?.kind === 'audio' && (
            <audio src={preview.url} controls className="w-full" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- mídia da conversa ainda não anexada ---------------- */

function ConversationMedia({
  contactId, docs, attachedSig, latestMediaId, registered, cardNumber, onDocsChanged, onPreview,
}: {
  contactId: string;
  docs: ClientDocumentDTO[];
  attachedSig: string | null;
  latestMediaId: string | null;
  registered: boolean;
  cardNumber: number | null;
  onDocsChanged: (docs: ClientDocumentDTO[]) => void;
  onPreview: (p: PreviewState) => void;
}) {
  const [onlyClient, setOnlyClient] = useState(true);
  // Aberta por padrão: é aqui que o atendente acha o RG e o laudo para anexar.
  const [open, setOpen] = useState(true);

  const {
    items, hasMore, unattachedCount, isLoading, error, loadingMore, loadMore, reload,
  } = useWhatsAppContactFiles(contactId, { kind: 'media', direction: onlyClient ? 'in' : 'all', onlyUnattached: true });

  // Mídia nova na thread (poll de 8 s) → busca de novo; é barato e dispensa
  // um poll ou um evento SSE próprio da grade.
  const seenMediaRef = useRef(latestMediaId);
  useEffect(() => {
    if (seenMediaRef.current === latestMediaId) return;
    seenMediaRef.current = latestMediaId;
    void reload();
  }, [latestMediaId, reload]);

  // Lista de documentos mudou (anexo aqui ou pelo menu da mídia na thread,
  // exclusão que devolve a mídia à grade) → busca de novo. A 1ª chegada da
  // lista (null → keys) não conta: a grade acabou de buscar.
  const seenDocsRef = useRef(attachedSig);
  useEffect(() => {
    const prev = seenDocsRef.current;
    seenDocsRef.current = attachedSig;
    if (prev === null || attachedSig === null || prev === attachedSig) return;
    void reload();
  }, [attachedSig, reload]);

  // O que já virou documento some na hora, antes de a busca nova chegar.
  const attachedKeys = useMemo(() => new Set(docs.map((d) => d.key)), [docs]);
  const visible = useMemo(() => items.filter((i) => !attachedKeys.has(i.mediaKey)), [items, attachedKeys]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedItems = useMemo(() => visible.filter((i) => selected.has(i.id)), [visible, selected]);
  const selecting = selectedItems.length > 0;
  const allSelected = visible.length > 0 && selectedItems.length === Math.min(visible.length, ATTACH_BATCH_MAX);

  const [category, setCategory] = useState<'' | DocumentCategoryId>('');
  const [baseName, setBaseName] = useState('');
  const [attaching, setAttaching] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(visible.slice(0, ATTACH_BATCH_MAX).map((i) => i.id)));
    if (visible.length > ATTACH_BATCH_MAX) {
      toast.info(`Selecionadas as ${ATTACH_BATCH_MAX} mais recentes (máximo por vez).`);
    }
  }

  // Prévia do nome e da pasta com a MESMA regra da action (da mais antiga
  // para a mais nova, extensão de cada arquivo).
  const namePreview = useMemo(() => {
    if (!selectedItems.length) return null;
    const ordered = [...selectedItems].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const names = batchMediaNames(
      ordered.map((i) => ({ key: i.mediaKey, mediaType: i.mediaType, createdAt: i.createdAt })),
      baseName,
    );
    return { first: names[0], more: names.length - 1, folder: categoryLabel(category || inferCategory(names[0])) };
  }, [selectedItems, baseName, category]);

  async function openItem(item: ContactMediaItem) {
    const kind = mediaKindOf(item);
    const opts = { fileName: item.name };
    const url = seedMediaUrl(item.mediaKey, item.mediaUrl, item.mediaUrlExpiresAt, opts)
      ?? await getMediaUrl(item.mediaKey, opts);
    if (!url) { toast.error('Não foi possível abrir o arquivo.'); return; }
    // Word, planilha etc.: o navegador não mostra — abre/baixa em outra aba.
    if (kind === 'other') { window.open(url, '_blank'); return; }
    onPreview({ name: item.name, url, kind });
  }

  async function handleAttachSelected() {
    if (attaching || !selectedItems.length) return;
    setAttaching(true);
    try {
      const res = await attachConversationMediaBatch(
        contactId,
        selectedItems.map((i) => i.id),
        { ...(category ? { category } : {}), ...(baseName.trim() ? { baseName: baseName.trim() } : {}) },
      );
      if (!res.ok) { toast.error(res.error); return; }
      onDocsChanged(res.documents);
      setSelected(new Set());
      setBaseName('');
      const where = registered
        ? `no card${cardNumber ? ` #${cardNumber}` : ''}`
        : 'na ficha (migram pro card quando o cliente for cadastrado)';
      if (res.added) toast.success(`${res.added === 1 ? '1 mídia anexada' : `${res.added} mídias anexadas`} ${where}.`);
      else toast.info('Essas mídias já estavam anexadas.');
    } catch {
      // Erro de server action chega mascarado em produção: texto próprio.
      toast.error('Não foi possível anexar agora. Tente de novo; se persistir, recarregue a página (F5).');
    } finally {
      setAttaching(false);
    }
  }

  const count = unattachedCount ?? visible.length;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between px-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400 hover:text-gray-600"
      >
        <span>Mídia da conversa ainda não anexada{isLoading && !items.length ? '' : ` (${count})`}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-500">
              <input
                type="checkbox"
                checked={onlyClient}
                onChange={(e) => { setOnlyClient(e.target.checked); setSelected(new Set()); }}
                className="accent-emerald-600"
              />
              Só do cliente
            </label>
            {visible.length > 0 && (
              <button
                onClick={() => (allSelected ? setSelected(new Set()) : selectAll())}
                className="text-[11px] font-bold text-sky-600 hover:underline"
              >
                {allSelected ? 'Desmarcar todas' : hasMore ? `Selecionar as ${Math.min(visible.length, ATTACH_BATCH_MAX)} carregadas` : 'Selecionar todas'}
              </button>
            )}
          </div>

          {isLoading && !items.length && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando a mídia da conversa…
            </div>
          )}

          {/* Com grade na tela o erro de uma nova busca só avisa; sem nada, explica e oferece de novo. */}
          {!!error && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
              <span>{items.length ? 'Lista sem atualizar: ' : 'A mídia da conversa não carregou: '}{describeFetchError(error)}</span>
              <button onClick={() => { void reload(); }} className="flex shrink-0 items-center gap-1 font-bold hover:underline">
                <RefreshCw className="h-3 w-3" /> Tentar de novo
              </button>
            </div>
          )}

          {!isLoading && !error && visible.length === 0 && (
            <p className="px-1 text-xs text-gray-400">
              {onlyClient ? 'Nenhuma mídia do cliente fora do card.' : 'Nenhuma mídia da conversa fora do card.'}
            </p>
          )}

          {visible.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {visible.map((item) => (
                <MediaTile
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  selecting={selecting}
                  showAuthor={!onlyClient}
                  onToggle={() => toggle(item.id)}
                  onOpen={() => { void openItem(item); }}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] font-bold text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-60"
            >
              {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Carregar mais antigas
            </button>
          )}

          {selecting && namePreview && (
            <div className="sticky bottom-0 z-10 flex flex-col gap-1.5 rounded-xl border border-emerald-200 bg-white p-2 shadow-md">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700">
                <span>{selectedItems.length} selecionada{selectedItems.length > 1 ? 's' : ''}</span>
                <button onClick={() => setSelected(new Set())} className="font-semibold text-gray-400 hover:text-gray-600">
                  limpar
                </button>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as '' | DocumentCategoryId)}
                className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Pasta: automática (pelo nome)</option>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <input
                list="wa-doc-base-names"
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                maxLength={80}
                placeholder="Nome (opcional) — ex.: DOCUMENTO PESSOAL"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <datalist id="wa-doc-base-names">
                {BASE_NAME_SUGGESTIONS.map((n) => <option key={n} value={n} />)}
              </datalist>
              <p className="truncate text-[10px] text-gray-400" title={namePreview.first}>
                {namePreview.first}{namePreview.more ? ` + ${namePreview.more}` : ''} → {namePreview.folder}
              </p>
              <button
                onClick={handleAttachSelected}
                disabled={attaching || selectedItems.length > ATTACH_BATCH_MAX}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {attaching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                Anexar selecionadas ({selectedItems.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Uma miniatura da grade. Foto: o ORIGINAL do S3 (não há thumbnail), num
 * quadrado de tamanho fixo com `loading="lazy"` — a página tem 24 itens para
 * não baixar dezenas de MB de uma vez. Vídeo, áudio e documento: só o ícone
 * (nada é baixado até abrir). Com alguma selecionada, o clique marca; sem
 * nenhuma, abre a pré-visualização.
 */
function MediaTile({
  item, selected, selecting, showAuthor, onToggle, onOpen,
}: {
  item: ContactMediaItem;
  selected: boolean;
  selecting: boolean;
  showAuthor: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const kind = mediaKindOf(item);
  // Mesma URL e mesmo nome da bolha da thread: cai na mesma entrada do cache.
  const { url, failed, onError } = useMediaUrl(
    kind === 'image' ? item.mediaKey : null, item.mediaUrl, item.mediaUrlExpiresAt, { fileName: item.name },
  );
  const Icon = kindIcon(kind);
  const who = !showAuthor || item.direction === 'in' ? null : item.sentByBot ? 'bot' : 'equipe';

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={selecting ? onToggle : onOpen}
        title={item.name}
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-gray-100 text-gray-500 transition-colors ${
          selected ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        {kind === 'image' && url && !failed ? (
          <img src={url} alt="" loading="lazy" decoding="async" onError={onError} className="h-full w-full object-cover" />
        ) : (
          <span className="flex min-w-0 flex-col items-center gap-1 px-1 text-center">
            <Icon className="h-5 w-5 shrink-0" />
            <span className="line-clamp-2 break-all text-[9px] font-semibold leading-tight">
              {failed ? 'Arquivo indisponível' : kind === 'image' ? '' : item.name}
            </span>
          </span>
        )}
        {who && (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">{who}</span>
        )}
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={selected ? 'Desmarcar' : 'Selecionar'}
        onClick={onToggle}
        className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-sm transition-colors ${
          selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-white bg-black/25 text-transparent hover:bg-black/40'
        }`}
      >
        <Check className="h-3 w-3" />
      </button>
      <span className="mt-0.5 block truncate text-center text-[9px] text-gray-400">{timeStamp(item.createdAt)}</span>
    </div>
  );
}

/* ---------------- documentos do cliente ---------------- */

/** Uma linha de documento/mídia (não-áudio): thumbnail se for imagem, ícone
 * genérico senão. Nome renomeável inline, com preview e download/exclusão. */
function DocRow({
  doc, onPreview, onDownload, onRename, onDelete,
}: {
  doc: ClientDocumentDTO;
  onPreview: (doc: ClientDocumentDTO) => void;
  onDownload: (doc: ClientDocumentDTO) => void;
  onRename: (doc: ClientDocumentDTO, newName: string) => void;
  onDelete: (doc: ClientDocumentDTO) => void;
}) {
  const kind = previewKind(doc.name);
  // Miniatura com a URL que veio assinada na lista (sem action por linha).
  const { url: thumb, failed: thumbFailed, onError: onThumbError } = useMediaUrl(
    kind === 'image' ? doc.key : null, doc.url, doc.urlExpiresAt, { fileName: doc.name },
  );
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(doc.name);

  useEffect(() => {
    setName(doc.name);
  }, [doc.name]);

  function commitRename() {
    setRenaming(false);
    if (name.trim() && name.trim() !== doc.name) onRename(doc, name.trim());
    else setName(doc.name);
  }

  const Icon = FileText;
  const previewable = kind === 'image' || kind === 'pdf';

  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2">
      <button
        onClick={() => previewable && onPreview(doc)}
        disabled={!previewable}
        title={previewable ? 'Pré-visualizar' : undefined}
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-50 text-emerald-700"
      >
        {thumb
          ? <img src={thumb} alt="" loading="lazy" decoding="async" onError={onThumbError} className="h-full w-full object-cover" />
          : <Icon className="h-4 w-4" />}
      </button>
      <span className="min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(doc.name); setRenaming(false); } }}
            className="w-full rounded border border-emerald-300 px-1 py-0.5 text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-emerald-400"
          />
        ) : (
          <span className="block truncate text-xs font-semibold text-gray-700">{doc.name}</span>
        )}
        <span className="block text-[10px] text-gray-400">
          {timeStamp(doc.uploadedAt)}
          {thumbFailed && <span className="font-semibold text-red-500"> · Arquivo indisponível</span>}
        </span>
      </span>
      <button onClick={() => setRenaming(true)} title="Renomear" className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {previewable && (
        <button onClick={() => onPreview(doc)} title="Pré-visualizar" className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
          <Eye className="h-3.5 w-3.5" />
        </button>
      )}
      <button onClick={() => onDownload(doc)} title="Baixar" className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
        <Download className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => onDelete(doc)} title="Excluir" className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Linha de áudio: player nativo inline (carrega a URL pré-assinada assim
 * que a lista aparece), mesmo padrão de renomear/baixar/excluir do DocRow. */
function AudioDocRow({
  doc, onDownload, onRename, onDelete,
}: {
  doc: ClientDocumentDTO;
  onDownload: (doc: ClientDocumentDTO) => void;
  onRename: (doc: ClientDocumentDTO, newName: string) => void;
  onDelete: (doc: ClientDocumentDTO) => void;
}) {
  // URL assinada junto com a lista: o player nasce pronto, sem action no mount.
  const { url, failed, onError } = useMediaUrl(doc.key, doc.url, doc.urlExpiresAt, { fileName: doc.name });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(doc.name);

  useEffect(() => {
    setName(doc.name);
  }, [doc.name]);

  function commitRename() {
    setRenaming(false);
    if (name.trim() && name.trim() !== doc.name) onRename(doc, name.trim());
    else setName(doc.name);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-2">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <Mic className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(doc.name); setRenaming(false); } }}
              className="w-full rounded border border-emerald-300 px-1 py-0.5 text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-emerald-400"
            />
          ) : (
            <span className="block truncate text-xs font-semibold text-gray-700">{doc.name}</span>
          )}
          <span className="block text-[10px] text-gray-400">{timeStamp(doc.uploadedAt)}</span>
        </span>
        <button onClick={() => setRenaming(true)} title="Renomear" className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDownload(doc)} title="Baixar" className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
          <Download className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(doc)} title="Excluir" className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {failed ? (
        <span className="text-[10px] font-semibold text-red-500">Arquivo indisponível</span>
      ) : url ? (
        <audio controls preload="metadata" src={url} onError={onError} className="h-8 w-full" />
      ) : (
        <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> carregando áudio…</span>
      )}
    </div>
  );
}
