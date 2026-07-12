/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Send, ImagePlus, X, Workflow, Loader2, Settings2, Pencil,
  Reply as ReplyIcon, FileText, Image as ImageIcon, Video, Mic, Check, FileBadge,
  StickyNote, Zap, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/app/_shared/ui/dropdown-menu';
import { sendWhatsAppMessage, sendWhatsAppMedia, sendWhatsAppInternalNote } from '@/app/_actions/whatsapp/send-message';
import { listWhatsAppFlows, logFlowDispatched, type WhatsAppFlowDTO, type WhatsAppFlowStep } from '@/app/_actions/whatsapp/flows';
import { listWhatsAppQuickReplies, type WhatsAppQuickReplyDTO } from '@/app/_actions/whatsapp/quick-replies';
import type { WhatsAppThreadMessage } from '@/app/_shared/hooks/use-whatsapp';
import { WhatsAppFlowsModal } from './WhatsAppFlowsModal';
import { WhatsAppQuickRepliesModal } from './WhatsAppQuickRepliesModal';
import { WhatsAppSendTemplateModal } from './WhatsAppSendTemplateModal';
import { checkFileForWhatsApp } from './media-rules';

const MAX_FILES = 10;

export const FLOW_KIND_ICON: Record<WhatsAppFlowStep['kind'], React.ElementType> = {
  text: FileText, image: ImageIcon, video: Video, audio: Mic, document: FileText,
};

interface Props {
  contactId: string;
  disabled?: boolean;
  placeholder?: string;
  replyTo: WhatsAppThreadMessage | null;
  onCancelReply: () => void;
  editTarget: WhatsAppThreadMessage | null;
  onCancelEdit: () => void;
  /** Otimista: o Inbox mostra a mensagem como "enviando" na hora — não bloqueia o input. */
  onSendText: (text: string) => void;
  onSendMedia: (files: File[], caption: string) => void;
  onEditSubmit: (id: string, text: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

/**
 * Composer da conversa com cliente: texto (com envio otimista), múltiplos
 * anexos de qualquer tipo (upload direto ao S3), resposta/edição de mensagem
 * e fluxos de mensagens pré-setadas (texto/imagem/vídeo/áudio com delay).
 */
export function WhatsAppComposer({
  contactId, disabled, placeholder, replyTo, onCancelReply,
  editTarget, onCancelEdit, onSendText, onSendMedia, onEditSubmit, onRefresh,
}: Props) {
  const [value, setValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [flows, setFlows] = useState<WhatsAppFlowDTO[]>([]);
  const [flowsOpen, setFlowsOpen] = useState(false);
  const [flowSearch, setFlowSearch] = useState('');
  const [runningFlow, setRunningFlow] = useState<{ name: string; step: number; total: number } | null>(null);
  const cancelFlowRef = useRef(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // Modo NOTA INTERNA: o texto vai só pra thread da equipe, nunca pro cliente.
  // Funciona mesmo com a janela de 24h expirada (não passa pela Meta).
  const [noteMode, setNoteMode] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Respostas rápidas (snippets) — inseridas no input com um clique.
  const [quickReplies, setQuickReplies] = useState<WhatsAppQuickReplyDTO[]>([]);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [replySearch, setReplySearch] = useState('');

  const editing = !!editTarget;

  async function reloadFlows() {
    try { setFlows(await listWhatsAppFlows()); } catch { /* sem permissão/offline: dropdown fica vazio */ }
  }
  async function reloadQuickReplies() {
    try { setQuickReplies(await listWhatsAppQuickReplies()); } catch { /* idem */ }
  }
  useEffect(() => { reloadFlows(); reloadQuickReplies(); }, []);

  const filteredFlows = flows.filter((f) => f.name.toLowerCase().includes(flowSearch.trim().toLowerCase()));
  const filteredQuickReplies = quickReplies.filter((q) => {
    const term = replySearch.trim().toLowerCase();
    return q.title.toLowerCase().includes(term) || q.body.toLowerCase().includes(term);
  });

  // Entrar no modo edição carrega o texto original no input.
  useEffect(() => {
    if (editTarget) {
      setValue(editTarget.body ?? '');
      textareaRef.current?.focus();
    }
  }, [editTarget]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  function pickFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const valid = incoming.filter((f) => {
      const check = checkFileForWhatsApp(f);
      if (!check.ok) toast.error(check.reason);
      return check.ok;
    });
    setAttachments((prev) => {
      const merged = [...prev, ...valid];
      if (merged.length > MAX_FILES) toast.error(`Máximo de ${MAX_FILES} arquivos por vez.`);
      return merged.slice(0, MAX_FILES);
    });
  }

  async function submit() {
    const text = value.trim();
    // Nota interna não passa pela Meta — funciona com a janela de 24h expirada.
    if (disabled && !noteMode) return;

    if (noteMode && !editing) {
      if (!text) return;
      setSavingNote(true);
      try {
        await sendWhatsAppInternalNote({ contactId, body: text });
        setValue('');
        await onRefresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Falha ao salvar a nota.');
      } finally {
        setSavingNote(false);
      }
      return;
    }

    if (editing && editTarget) {
      if (!text) return;
      setSavingEdit(true);
      try {
        await onEditSubmit(editTarget.id, text);
        setValue('');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Falha ao editar.');
      } finally {
        setSavingEdit(false);
      }
      return;
    }

    if (!text && !attachments.length) return;

    // Envio otimista: limpa o input imediatamente; o Inbox mostra a mensagem
    // como "enviando" e atualiza os ticks quando a Meta confirmar.
    if (attachments.length) {
      const files = attachments;
      setAttachments([]);
      setValue('');
      onSendMedia(files, text);
    } else {
      setValue('');
      onSendText(text);
    }
  }

  async function runFlow(flow: WhatsAppFlowDTO) {
    if (disabled || runningFlow) return;
    cancelFlowRef.current = false;
    try {
      // Log de auditoria: quem disparou qual fluxo (os passos individuais
      // também geram seus próprios logs de texto/mídia).
      logFlowDispatched(contactId, flow.name, flow.steps.length).catch(() => {});
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i];
        setRunningFlow({ name: flow.name, step: i + 1, total: flow.steps.length });
        if (i > 0 && step.delayMs > 0) {
          await new Promise((r) => setTimeout(r, step.delayMs));
        }
        if (cancelFlowRef.current) break;
        if (step.kind === 'text') {
          await sendWhatsAppMessage({ contactId, body: step.body });
        } else if (step.mediaKey) {
          await sendWhatsAppMedia({
            contactId,
            key: step.mediaKey,
            mimeType: step.mediaType ?? 'application/octet-stream',
            fileName: step.fileName ?? undefined,
            caption: step.body || undefined,
          });
        }
        await onRefresh();
      }
      if (!cancelFlowRef.current) toast.success(`Fluxo "${flow.name}" enviado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Falha no fluxo "${flow.name}".`);
      await onRefresh();
    } finally {
      setRunningFlow(null);
    }
  }

  return (
    <div className={`overflow-visible rounded-xl border bg-white transition-all focus-within:ring-2 dark:bg-zinc-900 ${
      noteMode && !editing
        ? 'border-amber-300 focus-within:ring-amber-500 dark:border-amber-800'
        : 'border-gray-200 focus-within:ring-emerald-500 dark:border-zinc-800'
    }`}>
      {/* Barra do modo nota interna */}
      {noteMode && !editing && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <StickyNote className="h-3.5 w-3.5 shrink-0" />
          Nota interna — só a equipe vê, o cliente NÃO recebe.
          <button onClick={() => setNoteMode(false)} title="Voltar a responder o cliente" className="ml-auto text-amber-600 hover:text-red-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Barra de resposta (quote) */}
      {replyTo && !editing && (
        <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-zinc-800">
          <ReplyIcon className="h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1 rounded-lg border-l-2 border-emerald-500 bg-gray-50 px-2 py-1 dark:bg-zinc-950/50">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              {replyTo.direction === 'out' ? (replyTo.authorName ?? 'Equipe') : 'Cliente'}
            </p>
            <p className="truncate text-sm text-gray-500 dark:text-zinc-400">{replyTo.body ?? '📎 Anexo'}</p>
          </div>
          <button onClick={onCancelReply} title="Cancelar resposta" className="text-gray-400 hover:text-red-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Barra de edição */}
      {editing && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          Editando mensagem (a alteração vale só pra thread da equipe — o celular do cliente mantém o original)
          <button onClick={() => { onCancelEdit(); setValue(''); }} title="Cancelar edição" className="ml-auto text-amber-600 hover:text-red-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Anexos escolhidos */}
      {attachments.length > 0 && !editing && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-zinc-800">
          {attachments.map((file, idx) => (
            <AttachmentChip key={`${file.name}-${idx}`} file={file} onRemove={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))} />
          ))}
        </div>
      )}

      {/* Progresso de fluxo */}
      {runningFlow && (
        <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Enviando fluxo &quot;{runningFlow.name}&quot; ({runningFlow.step}/{runningFlow.total})...
          <button onClick={() => { cancelFlowRef.current = true; }} className="ml-auto underline">cancelar</button>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Enter envia; Shift+Enter quebra linha.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape' && editing) {
            onCancelEdit();
            setValue('');
          }
        }}
        disabled={disabled && !noteMode}
        placeholder={editing
          ? 'Novo texto da mensagem...'
          : noteMode
            ? 'Escreva uma nota interna para a equipe (o cliente não recebe)...'
            : attachments.length
              ? 'Legenda do primeiro anexo (opcional)...'
              : placeholder ?? 'Escreva uma mensagem para o cliente... (*negrito* _itálico_ ~tachado~)'}
        rows={2}
        className="w-full resize-none bg-transparent p-3 text-base outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100"
      />
      <div className="flex items-center justify-between border-t bg-gray-50 px-3 py-2 dark:bg-zinc-950">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || editing || noteMode}
            title="Anexar arquivos (pode selecionar vários)"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <ImagePlus className="h-6 w-6" />
          </button>

          <DropdownMenu onOpenChange={(o) => { if (!o) setFlowSearch(''); }}>
            <DropdownMenuTrigger asChild>
              <button
                disabled={disabled || editing || !!runningFlow}
                title="Fluxos de mensagens"
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <Workflow className="h-6 w-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel className="text-sm">Fluxos de mensagens</DropdownMenuLabel>
              {flows.length > 0 && (
                <div className="relative px-2 pb-1.5">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={flowSearch}
                    onChange={(e) => setFlowSearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Buscar fluxo..."
                    className="h-8 pl-7 text-sm"
                  />
                </div>
              )}
              {flows.length === 0 && (
                <DropdownMenuItem disabled className="text-sm text-gray-400">Nenhum fluxo criado ainda.</DropdownMenuItem>
              )}
              {flows.length > 0 && filteredFlows.length === 0 && (
                <DropdownMenuItem disabled className="text-sm text-gray-400">Nenhum fluxo encontrado.</DropdownMenuItem>
              )}
              {filteredFlows.map((f) => (
                <DropdownMenuItem key={f.id} onClick={() => runFlow(f)} className="gap-2 text-base">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{f.name}</span>
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      {f.steps.slice(0, 6).map((s, i) => {
                        const Icon = FLOW_KIND_ICON[s.kind] ?? FileText;
                        return <Icon key={i} className="h-3 w-3" />;
                      })}
                      {f.steps.length > 6 && `+${f.steps.length - 6}`}
                      <span className="ml-1">{f.steps.length} passo(s)</span>
                    </span>
                  </span>
                  <Send className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFlowsOpen(true)} className="text-base">
                <Settings2 className="mr-2 h-4 w-4" /> Gerenciar fluxos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => setTemplateModalOpen(true)}
            disabled={editing}
            title="Enviar mensagem de template (funciona mesmo com a janela de 24h expirada)"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <FileBadge className="h-6 w-6" />
          </button>

          {/* Respostas rápidas: insere o texto no input com um clique */}
          <DropdownMenu onOpenChange={(o) => { if (!o) setReplySearch(''); }}>
            <DropdownMenuTrigger asChild>
              <button
                disabled={(disabled && !noteMode) || editing}
                title="Respostas rápidas"
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <Zap className="h-6 w-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-sm">Respostas rápidas</DropdownMenuLabel>
              {quickReplies.length > 0 && (
                <div className="relative px-2 pb-1.5">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={replySearch}
                    onChange={(e) => setReplySearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Buscar resposta..."
                    className="h-8 pl-7 text-sm"
                  />
                </div>
              )}
              {quickReplies.length === 0 && (
                <DropdownMenuItem disabled className="text-sm text-gray-400">Nenhuma resposta criada ainda.</DropdownMenuItem>
              )}
              {quickReplies.length > 0 && filteredQuickReplies.length === 0 && (
                <DropdownMenuItem disabled className="text-sm text-gray-400">Nenhuma resposta encontrada.</DropdownMenuItem>
              )}
              {filteredQuickReplies.map((q) => (
                <DropdownMenuItem
                  key={q.id}
                  onClick={() => {
                    setValue((prev) => (prev.trim() ? `${prev}\n${q.body}` : q.body));
                    textareaRef.current?.focus();
                  }}
                  className="flex-col items-start gap-0.5 text-base"
                >
                  <span className="w-full truncate font-semibold">{q.title}</span>
                  <span className="w-full truncate text-[11px] text-gray-400">{q.body}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setQuickRepliesOpen(true)} className="text-base">
                <Settings2 className="mr-2 h-4 w-4" /> Gerenciar respostas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Toggle nota interna */}
          <button
            onClick={() => setNoteMode((v) => !v)}
            disabled={editing}
            title={noteMode ? 'Voltar a responder o cliente' : 'Nota interna (só a equipe vê)'}
            className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
              noteMode
                ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300'
                : 'text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <StickyNote className="h-6 w-6" />
          </button>

          <p className="ml-2 hidden text-[11px] text-gray-400 sm:block">Enter envia · Shift+Enter nova linha</p>
        </div>
        <Button
          onClick={submit}
          disabled={(disabled && !noteMode) || savingEdit || savingNote || (!value.trim() && !attachments.length)}
          size="sm"
          className={`h-8 px-4 ${editing || noteMode ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
        >
          {editing
            ? <>{savingEdit ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Check className="mr-2 h-3 w-3" />} Salvar edição</>
            : noteMode
              ? <>{savingNote ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <StickyNote className="mr-2 h-3 w-3" />} Salvar nota</>
              : <><Send className="mr-2 h-3 w-3" /> Enviar</>}
        </Button>
      </div>

      <WhatsAppFlowsModal open={flowsOpen} onOpenChange={setFlowsOpen} onChanged={reloadFlows} />
      <WhatsAppQuickRepliesModal open={quickRepliesOpen} onOpenChange={setQuickRepliesOpen} onChanged={reloadQuickReplies} />
      <WhatsAppSendTemplateModal
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        contactId={contactId}
        onSent={onRefresh}
      />
    </div>
  );
}

function AttachmentChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 py-1 pl-1.5 pr-2 dark:border-zinc-700 dark:bg-zinc-950/50">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={file.name} className="h-8 w-8 rounded-md border border-gray-200 object-cover dark:border-zinc-700" />
      ) : (
        <span className="text-base">📎</span>
      )}
      <span className="max-w-[140px] truncate text-sm text-gray-500 dark:text-zinc-400">{file.name}</span>
      <button onClick={onRemove} title="Remover" className="text-gray-400 hover:text-red-500">
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
