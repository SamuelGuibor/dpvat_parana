/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Plus, Trash2, FileBadge, RefreshCw, Clock, CheckCircle2, XCircle,
  PauseCircle, ArrowLeft, Send, AlertTriangle, Image as ImageIcon, Video,
  FileText, Type, Ban, Upload, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  listWhatsAppTemplates, createWhatsAppTemplate, deleteWhatsAppTemplate,
  syncWhatsAppTemplatesFromMeta, getTemplateMediaUploadUrl, setTemplateHeaderMedia,
  type WhatsAppTemplateDTO,
} from '@/app/_actions/whatsapp/templates';

// Gerenciador de templates espelhando o ciclo de vida da Meta: criar (vai pra
// análise), acompanhar em "Em análise", ver o motivo quando reprova e enviar
// só os aprovados. Antes esta tela só copiava à mão nome/idioma/nº de
// variáveis de templates JÁ aprovados — quem criava um template no painel da
// Meta não tinha como acompanhar nada por aqui.

const CATEGORIES = [
  { value: 'UTILITY', label: 'Utilidade', hint: 'Aviso sobre algo que o cliente já pediu (protocolo, status, documento).' },
  { value: 'MARKETING', label: 'Marketing', hint: 'Promoção ou convite. Exige opção de descadastro no rodapé.' },
  { value: 'AUTHENTICATION', label: 'Autenticação', hint: 'Código de verificação.' },
];

const STATUS_META: Record<string, { label: string; badge: string; icon: React.ElementType }> = {
  APPROVED: { label: 'Aprovado', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', icon: CheckCircle2 },
  PENDING: { label: 'Em análise', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: Clock },
  REJECTED: { label: 'Reprovado', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: XCircle },
  PAUSED: { label: 'Pausado', badge: 'bg-gray-200 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300', icon: PauseCircle },
  DISABLED: { label: 'Desativado', badge: 'bg-gray-200 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300', icon: PauseCircle },
};

const FILTERS = [
  { key: 'ALL', label: 'Todos' },
  { key: 'APPROVED', label: 'Aprovados' },
  { key: 'PENDING', label: 'Em análise' },
  { key: 'REJECTED', label: 'Reprovados' },
  { key: 'PAUSED', label: 'Pausados' },
];

function statusOf(status: string) {
  return STATUS_META[status] ?? { label: status, badge: 'bg-gray-200 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300', icon: Clock };
}

// Tipos de cabeçalho do form de criação (a Meta chama de "format").
const HEADER_KINDS = [
  { key: 'none', label: 'Nenhum', icon: Ban },
  { key: 'text', label: 'Texto', icon: Type },
  { key: 'IMAGE', label: 'Imagem', icon: ImageIcon },
  { key: 'VIDEO', label: 'Vídeo', icon: Video },
  { key: 'DOCUMENT', label: 'PDF', icon: FileText },
] as const;
type HeaderKind = (typeof HEADER_KINDS)[number]['key'];

const HEADER_MEDIA_ACCEPT: Record<string, string> = {
  IMAGE: 'image/jpeg,image/png',
  VIDEO: 'video/mp4',
  DOCUMENT: 'application/pdf',
};

const HEADER_FORMAT_LABEL: Record<string, string> = {
  IMAGE: 'imagem', VIDEO: 'vídeo', DOCUMENT: 'documento (PDF)',
};

/** Sobe a mídia do cabeçalho direto ao S3 e devolve a chave. */
async function uploadHeaderMediaToS3(file: File): Promise<{ key: string; mimeType: string }> {
  const mimeType = file.type || 'application/octet-stream';
  const { url, key } = await getTemplateMediaUploadUrl(file.name, mimeType);
  const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } });
  if (!put.ok) throw new Error('Falha no upload da mídia.');
  return { key, mimeType };
}

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** Números das variáveis {{1}} {{2}}… presentes no corpo, em ordem. */
function varNumbers(body: string): number[] {
  const found = new Set<number>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const EMPTY_DRAFT = {
  name: '', language: 'pt_BR', category: 'UTILITY',
  headerKind: 'none' as HeaderKind,
  headerText: '', headerExample: '',
  headerMediaKey: '', headerMediaType: '', headerMediaName: '',
  bodyText: '', footerText: '', examples: {} as Record<number, string>,
};

export function WhatsAppTemplatesModal({ open, onOpenChange, onChanged }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [templates, setTemplates] = useState<WhatsAppTemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [view, setView] = useState<'list' | 'create'>('list');
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const headerFileRef = useRef<HTMLInputElement>(null);
  // "Definir mídia" de um template de mídia já existente (ex.: sincronizado).
  const [settingMediaFor, setSettingMediaFor] = useState<WhatsAppTemplateDTO | null>(null);
  const listMediaFileRef = useRef<HTMLInputElement>(null);

  async function reload() {
    setLoading(true);
    try { setTemplates(await listWhatsAppTemplates()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao carregar templates.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (open) { reload(); setView('list'); setFilter('ALL'); setDraft(EMPTY_DRAFT); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true);
    try {
      const { imported, approved, pending, rejected, error } = await syncWhatsAppTemplatesFromMeta();
      if (error) { toast.error(error, { duration: 12000 }); return; }
      toast.success(`${imported} template(s) da Meta: ${approved} aprovado(s), ${pending} em análise, ${rejected} reprovado(s).`);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao sincronizar com a Meta.');
    } finally {
      setSyncing(false);
    }
  }

  // Escolheu o arquivo do cabeçalho no form de criação: sobe já pro S3.
  async function handleHeaderFile(file: File | null) {
    if (!file) return;
    setUploadingHeader(true);
    try {
      const { key, mimeType } = await uploadHeaderMediaToS3(file);
      setDraft((d) => ({ ...d, headerMediaKey: key, headerMediaType: mimeType, headerMediaName: file.name }));
      toast.success('Mídia do cabeçalho pronta.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no upload da mídia.');
    } finally {
      setUploadingHeader(false);
      if (headerFileRef.current) headerFileRef.current.value = '';
    }
  }

  // "Definir mídia" na lista (template de mídia sem mídia padrão definida).
  async function handleListMediaFile(file: File | null) {
    const target = settingMediaFor;
    setSettingMediaFor(null);
    if (!file || !target) return;
    try {
      const { key, mimeType } = await uploadHeaderMediaToS3(file);
      const { error } = await setTemplateHeaderMedia(target.id, key, mimeType);
      if (error) { toast.error(error, { duration: 10000 }); return; }
      toast.success(`Mídia do cabeçalho de "${target.name}" definida.`);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao definir a mídia.');
    } finally {
      if (listMediaFileRef.current) listMediaFileRef.current.value = '';
    }
  }

  async function handleCreate() {
    const isMediaHeader = draft.headerKind === 'IMAGE' || draft.headerKind === 'VIDEO' || draft.headerKind === 'DOCUMENT';
    if (isMediaHeader && !draft.headerMediaKey) {
      toast.error('Anexe a mídia do cabeçalho antes de criar.');
      return;
    }
    setCreating(true);
    try {
      const nums = varNumbers(draft.bodyText);
      const { error } = await createWhatsAppTemplate({
        name: draft.name,
        language: draft.language,
        category: draft.category,
        headerText: draft.headerKind === 'text' ? draft.headerText : '',
        headerExample: draft.headerKind === 'text' ? draft.headerExample : '',
        ...(isMediaHeader ? {
          headerFormat: draft.headerKind as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
          headerMediaKey: draft.headerMediaKey,
          headerMediaType: draft.headerMediaType,
        } : {}),
        bodyText: draft.bodyText,
        bodyExamples: nums.map((n) => draft.examples[n] ?? ''),
        footerText: draft.footerText,
      });
      if (error) { toast.error(error, { duration: 12000 }); return; }
      toast.success('Template enviado para aprovação da Meta.');
      setDraft(EMPTY_DRAFT);
      setView('list');
      setFilter('PENDING');
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar o template.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(t: WhatsAppTemplateDTO) {
    if (!(await confirm({
      title: `Excluir "${t.name}"`,
      description: 'O template é apagado NA META também — some pra todo mundo e não dá pra desfazer.',
    }))) return;
    try {
      const { error } = await deleteWhatsAppTemplate(t.id);
      if (error) { toast.error(error, { duration: 10000 }); return; }
      toast.success('Template excluído.');
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: templates.length };
    for (const t of templates) map[t.status] = (map[t.status] ?? 0) + 1;
    return map;
  }, [templates]);

  const visible = filter === 'ALL' ? templates : templates.filter((t) => t.status === filter);
  const draftVars = varNumbers(draft.bodyText);

  // Prévia do corpo com os exemplos já substituídos (é o que o cliente vê).
  const draftPreview = draftVars.reduce(
    (acc, n) => acc.replaceAll(`{{${n}}}`, draft.examples[n]?.trim() || `{{${n}}}`),
    draft.bodyText,
  );
  const isTextHeader = draft.headerKind === 'text';
  const isMediaHeader = draft.headerKind === 'IMAGE' || draft.headerKind === 'VIDEO' || draft.headerKind === 'DOCUMENT';
  const headerHasVar = isTextHeader && varNumbers(draft.headerText).length > 0;
  const headerPreview = !isTextHeader
    ? ''
    : headerHasVar
      ? draft.headerText.replaceAll('{{1}}', draft.headerExample.trim() || '{{1}}')
      : draft.headerText;
  const headerTooLong = isTextHeader && draft.headerText.trim().length > 60;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {confirmDialog}
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-6xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2.5 text-xl">
            <FileBadge className="h-6 w-6 text-emerald-600" /> Templates de WhatsApp
          </DialogTitle>
          <DialogDescription className="text-base">
            {view === 'create'
              ? 'Ao criar, o template vai para a análise da Meta e fica "Em análise" até ser aprovado (costuma levar até 24h).'
              : 'O ciclo completo da Meta: criar, acompanhar a análise, ver o motivo de uma reprovação e enviar os aprovados.'}
          </DialogDescription>
        </DialogHeader>

        {view === 'list' ? (
          <>
            {/* Input oculto do "Definir mídia" — o accept segue o formato do template. */}
            <input
              ref={listMediaFileRef}
              type="file"
              accept={settingMediaFor ? HEADER_MEDIA_ACCEPT[settingMediaFor.headerFormat ?? ''] ?? undefined : undefined}
              className="hidden"
              onChange={(e) => handleListMediaFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      filter === f.key
                        ? 'bg-gray-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {f.label} <span className="opacity-60">{counts[f.key] ?? 0}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sincronizar
                </Button>
                <Button onClick={() => setView('create')} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="h-4 w-4" /> Criar template
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : visible.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
                  <p className="text-base text-gray-500 dark:text-zinc-400">
                    {templates.length === 0
                      ? 'Nenhum template ainda. Sincronize com a Meta ou crie o primeiro.'
                      : 'Nenhum template com este status.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                  {visible.map((t) => {
                    const st = statusOf(t.status);
                    const StatusIcon = st.icon;
                    return (
                      <div key={t.id} className="flex items-start gap-3 py-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-base font-semibold">{t.name}</span>
                            <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${st.badge}`}>
                              <StatusIcon className="h-3.5 w-3.5" /> {st.label}
                            </span>
                            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-zinc-800 dark:text-zinc-300">
                              {categoryLabel(t.category)}
                            </span>
                            {t.headerFormat && t.headerFormat !== 'TEXT' && (
                              <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                t.hasHeaderMedia
                                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {t.headerFormat === 'IMAGE' ? <ImageIcon className="h-3.5 w-3.5" /> : t.headerFormat === 'VIDEO' ? <Video className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                                {HEADER_FORMAT_LABEL[t.headerFormat] ?? t.headerFormat}
                                {!t.hasHeaderMedia && ' · sem mídia'}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {t.language} · {t.bodyVars} variável(is)
                            </span>
                          </div>

                          {t.headerFormat && t.headerFormat !== 'TEXT' && !t.hasHeaderMedia && (
                            <p className="mt-1.5 flex items-start gap-1.5 text-sm leading-relaxed text-red-600 dark:text-red-400">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              A Meta exige a mídia do cabeçalho em todo envio — clique em &quot;Definir mídia&quot; para poder disparar este template.
                            </p>
                          )}

                          {t.status === 'REJECTED' && t.rejectedReason ? (
                            <p className="mt-1.5 flex items-start gap-1.5 text-sm leading-relaxed text-red-600 dark:text-red-400">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              Motivo da Meta: {t.rejectedReason}
                            </p>
                          ) : t.status === 'PENDING' ? (
                            <p className="mt-1.5 text-sm text-gray-500 dark:text-zinc-400">
                              Aguardando análise da Meta — o status atualiza sozinho quando ela responder.
                            </p>
                          ) : t.bodyPreview || t.headerText ? (
                            <div className="mt-1.5">
                              {t.headerText && (
                                <p className="whitespace-pre-wrap text-sm font-bold leading-snug text-gray-700 dark:text-zinc-200">
                                  {t.headerText}
                                </p>
                              )}
                              {t.bodyPreview && (
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
                                  {t.bodyPreview}
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {t.headerFormat && t.headerFormat !== 'TEXT' && (
                            <button
                              onClick={() => { setSettingMediaFor(t); listMediaFileRef.current?.click(); }}
                              title={t.hasHeaderMedia ? 'Trocar a mídia do cabeçalho' : 'Definir a mídia do cabeçalho'}
                              className="rounded-md px-2 py-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                            >
                              {t.hasHeaderMedia ? 'Trocar mídia' : 'Definir mídia'}
                            </button>
                          )}
                          {t.status === 'APPROVED' && (
                            <span title="Pronto para envio" className="text-emerald-600">
                              <Send className="h-4 w-4" />
                            </span>
                          )}
                          <button
                            onClick={() => handleDelete(t)}
                            title="Excluir na Meta e aqui"
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <button
              onClick={() => setView('list')}
              className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-zinc-300"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar para a lista
            </button>

            <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
              <div className="space-y-3.5">
                <label className="block">
                  <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Nome</span>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="aviso_protocolo_inss"
                    className="h-11 font-mono text-base"
                  />
                  <span className="mt-1 block text-xs text-gray-400">Só letras minúsculas, números e _ (sem acento e sem espaço).</span>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Categoria</span>
                    <select
                      value={draft.category}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                      className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Idioma</span>
                    <Input
                      value={draft.language}
                      onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
                      placeholder="pt_BR"
                      className="h-11 text-base"
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-400">
                  {CATEGORIES.find((c) => c.value === draft.category)?.hint}
                </p>

                <div className="block">
                  <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">
                    Cabeçalho <span className="font-normal text-gray-400">opcional · texto em negrito ou mídia acima da mensagem</span>
                  </span>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {HEADER_KINDS.map((k) => {
                      const KindIcon = k.icon;
                      const active = draft.headerKind === k.key;
                      return (
                        <button
                          key={k.key}
                          type="button"
                          onClick={() => setDraft((d) => ({
                            ...d, headerKind: k.key,
                            headerText: '', headerExample: '',
                            headerMediaKey: '', headerMediaType: '', headerMediaName: '',
                          }))}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                            active
                              ? 'bg-emerald-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          <KindIcon className="h-3.5 w-3.5" /> {k.label}
                        </button>
                      );
                    })}
                  </div>

                  {isTextHeader && (
                    <>
                      <Input
                        value={draft.headerText}
                        onChange={(e) => setDraft((d) => ({ ...d, headerText: e.target.value }))}
                        placeholder="Seu pedido no INSS"
                        className={`h-11 text-base ${headerTooLong ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                      />
                      <span className={`mt-1 block text-xs ${headerTooLong ? 'font-semibold text-red-500' : 'text-gray-400'}`}>
                        {draft.headerText.trim().length}/60 caracteres · aceita no máximo 1 variável, e ela tem que ser {'{{1}}'}
                      </span>
                    </>
                  )}

                  {isMediaHeader && (
                    <>
                      <input
                        ref={headerFileRef}
                        type="file"
                        accept={HEADER_MEDIA_ACCEPT[draft.headerKind]}
                        className="hidden"
                        onChange={(e) => handleHeaderFile(e.target.files?.[0] ?? null)}
                      />
                      {draft.headerMediaKey ? (
                        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/20">
                          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span className="truncate">{draft.headerMediaName}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, headerMediaKey: '', headerMediaType: '', headerMediaName: '' }))}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => headerFileRef.current?.click()}
                          disabled={uploadingHeader}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-4 text-sm text-gray-500 transition-colors hover:border-emerald-400 hover:text-emerald-600 dark:border-zinc-600 dark:text-zinc-400"
                        >
                          {uploadingHeader
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                            : <><Upload className="h-4 w-4" /> Anexar {HEADER_FORMAT_LABEL[draft.headerKind]}</>}
                        </button>
                      )}
                      <span className="mt-1 block text-xs text-gray-400">
                        {draft.headerKind === 'IMAGE' && 'JPG ou PNG, até 5 MB.'}
                        {draft.headerKind === 'VIDEO' && 'MP4, até 16 MB.'}
                        {draft.headerKind === 'DOCUMENT' && 'PDF, até 100 MB.'}
                        {' '}Esta mídia vira o exemplo da análise e a mídia padrão dos envios (dá pra trocar depois).
                      </span>
                    </>
                  )}
                </div>

                {headerHasVar && (
                  <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <span className="w-10 shrink-0 font-mono text-sm text-gray-400">{'{{1}}'}</span>
                    <Input
                      value={draft.headerExample}
                      onChange={(e) => setDraft((d) => ({ ...d, headerExample: e.target.value }))}
                      placeholder="Exemplo da variável do cabeçalho"
                      className="h-10 text-base"
                    />
                  </div>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">
                    Corpo <span className="font-normal text-gray-400">use {'{{1}}'}, {'{{2}}'}… onde o texto muda</span>
                  </span>
                  <textarea
                    value={draft.bodyText}
                    onChange={(e) => setDraft((d) => ({ ...d, bodyText: e.target.value }))}
                    placeholder="Olá {{1}}, o protocolo do seu pedido no INSS é {{2}}."
                    rows={5}
                    className="w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-base leading-relaxed outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>

                {draftVars.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                    <p className="text-sm font-semibold text-gray-600 dark:text-zinc-300">
                      Exemplo de cada variável <span className="font-normal text-gray-400">(a Meta exige)</span>
                    </p>
                    {draftVars.map((n) => (
                      <div key={n} className="flex items-center gap-2">
                        <span className="w-10 shrink-0 font-mono text-sm text-gray-400">{`{{${n}}}`}</span>
                        <Input
                          value={draft.examples[n] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, examples: { ...d.examples, [n]: e.target.value } }))}
                          placeholder={n === 1 ? 'Maria' : 'exemplo'}
                          className="h-10 text-base"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">
                    Rodapé <span className="font-normal text-gray-400">opcional</span>
                  </span>
                  <Input
                    value={draft.footerText}
                    onChange={(e) => setDraft((d) => ({ ...d, footerText: e.target.value }))}
                    placeholder="Responda SAIR para não receber mais."
                    className="h-11 text-base"
                  />
                </label>
              </div>

              <div>
                <p className="mb-1.5 text-base font-semibold text-gray-600 dark:text-zinc-300">Prévia</p>
                <div className="rounded-xl bg-gray-100 p-3 dark:bg-zinc-900/60">
                  <div className="rounded-xl rounded-tl-sm bg-emerald-50 p-3 dark:bg-emerald-950/30">
                    {isMediaHeader && (
                      <div className="mb-2 flex h-24 items-center justify-center gap-2 rounded-lg bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {draft.headerKind === 'IMAGE' && <ImageIcon className="h-6 w-6" />}
                        {draft.headerKind === 'VIDEO' && <Video className="h-6 w-6" />}
                        {draft.headerKind === 'DOCUMENT' && <FileText className="h-6 w-6" />}
                        <span className="text-sm font-semibold">
                          {draft.headerMediaName || `Cabeçalho de ${HEADER_FORMAT_LABEL[draft.headerKind]}`}
                        </span>
                      </div>
                    )}
                    {headerPreview.trim() && (
                      <p className="mb-1.5 whitespace-pre-wrap text-base font-bold leading-snug text-gray-900 dark:text-zinc-50">
                        {headerPreview}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-800 dark:text-zinc-100">
                      {draftPreview || 'O texto do template aparece aqui.'}
                    </p>
                    {draft.footerText.trim() && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">{draft.footerText}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/20">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
                    Ao criar, o template vai para a análise da Meta e fica <b>Em análise</b> até ser aprovado.
                  </p>
                </div>

                <Button
                  onClick={handleCreate}
                  disabled={creating || uploadingHeader || !draft.name.trim() || !draft.bodyText.trim() || headerTooLong || (isMediaHeader && !draft.headerMediaKey)}
                  className="mt-3 w-full bg-emerald-600 text-base hover:bg-emerald-700"
                >
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Enviar para aprovação
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
