/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Send, ImagePlus, X, Workflow, Loader2, Settings2, Pencil,
  Reply as ReplyIcon, FileText, Image as ImageIcon, Video, Mic, Check, FileBadge,
  StickyNote, Zap, Search, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { MentionsInput, Mention } from 'react-mentions';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import { Input } from '@/app/_shared/ui/input';
import { mentionsStyles } from '@/app/nova-dash/card-dialog/constants';
import { renderMentionSuggestion } from '@/app/nova-dash/workspace/chat/mention-suggestion';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/app/_shared/ui/dropdown-menu';
import { sendWhatsAppMessage, sendWhatsAppMedia, sendWhatsAppInternalNote } from '@/app/_actions/whatsapp/send-message';
import { listWhatsAppFlows, logFlowDispatched, type WhatsAppFlowDTO, type WhatsAppFlowStep } from '@/app/_actions/whatsapp/flows';
import { listWhatsAppQuickReplies, type WhatsAppQuickReplyDTO } from '@/app/_actions/whatsapp/quick-replies';
import { suggestWhatsAppReply } from '@/app/_actions/whatsapp/assist';
import type { WhatsAppThreadMessage } from '@/app/_shared/hooks/use-whatsapp';
import { WhatsAppFlowsModal } from './WhatsAppFlowsModal';
import { WhatsAppQuickRepliesModal } from './WhatsAppQuickRepliesModal';
import { WhatsAppSendTemplateModal } from './WhatsAppSendTemplateModal';
import { checkFileForWhatsApp } from './media-rules';
import { useVoiceRecorder, formatRecordingTime } from './use-voice-recorder';

const MAX_FILES = 10;

// Botões do composer: só o ícone fica visível; o rótulo desliza suave no
// hover (mesmo padrão dos chips de filtro da sidebar do inbox, 12/08/2026).
const iconPillCls = (extra: string) =>
  `group flex h-8 shrink-0 items-center overflow-hidden rounded-full px-2 transition-colors disabled:opacity-40 ${extra}`;
const iconPillLabelCls =
  'ml-0 max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold opacity-0 transition-all duration-300 ease-out group-hover:ml-1.5 group-hover:max-w-[140px] group-hover:opacity-100';

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
  // Guard SÍNCRONO contra disparo duplo do fluxo: o estado `runningFlow` só
  // atualiza no próximo render, então dois cliques rápidos (ou um clique
  // fantasma do menu) passavam juntos pela checagem e o fluxo ia 2x.
  const flowBusyRef = useRef(false);
  const { confirm, confirmDialog } = useConfirm();

  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // Modo NOTA INTERNA: o texto vai só pra thread da equipe, nunca pro cliente.
  // Funciona mesmo com a janela de 24h expirada (não passa pela Meta).
  const [noteMode, setNoteMode] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Equipe mencionável nas notas internas (@fulano) — carregada uma vez.
  const [mentionUsers, setMentionUsers] = useState<{ id: string; display: string }[]>([]);
  useEffect(() => {
    fetch('/api/admins')
      .then((r) => r.json())
      .then((list: { id: string; display: string }[]) =>
        setMentionUsers([{ id: 'everyone', display: 'everyone' }, ...list.map((u) => ({ id: u.id, display: u.display }))]))
      .catch(() => { /* sem lista: o @ simplesmente não sugere ninguém */ });
  }, []);

  // Sugestão de resposta pela IA: preenche o input; o humano revisa e envia.
  const [suggesting, setSuggesting] = useState(false);

  // Gravação de áudio (ogg/opus → chega como mensagem de voz no cliente).
  const voice = useVoiceRecorder({ onFinish: (file) => onSendMedia([file], '') });

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

  // Campo de 1 linha que cresce com o texto (até ~6 linhas) — parte do
  // redesign compacto de 12/08/2026. No modo nota o campo é o MentionsInput,
  // que cuida da própria altura — mexer no style dele desalinharia o overlay
  // de destaque das menções.
  useEffect(() => {
    if (noteMode && !editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, noteMode, editing]);

  // "Usar no campo" do Copiloto: a coluna direita injeta a sugestão aqui via
  // CustomEvent (mesmo padrão do open-whatsapp-conversation).
  useEffect(() => {
    function onInsert(e: Event) {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text;
      if (!text) return;
      setValue(text);
      textareaRef.current?.focus();
    }
    window.addEventListener('wa-composer-insert', onInsert);
    return () => window.removeEventListener('wa-composer-insert', onInsert);
  }, []);

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
    if (disabled || runningFlow || flowBusyRef.current) return;
    flowBusyRef.current = true;
    try {
      // Confirmação explícita: evita envio acidental (clique fantasma do menu
      // fechando em cima do item, clique duplo etc.).
      const ok = await confirm({
        title: `Enviar fluxo "${flow.name}"?`,
        description: `${flow.steps.length} passo${flow.steps.length === 1 ? '' : 's'} serão enviados ao cliente, na sequência e com os delays configurados.`,
        tone: 'default',
        confirmLabel: 'Enviar',
      });
      if (!ok) return;
      cancelFlowRef.current = false;
      setRunningFlow({ name: flow.name, step: 1, total: flow.steps.length });
      // Log de auditoria: quem disparou qual fluxo (os passos individuais
      // também geram seus próprios logs de texto/mídia).
      logFlowDispatched(contactId, flow.name, flow.steps.length).catch(() => { });
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
      flowBusyRef.current = false;
    }
  }

  return (
    <div className={`overflow-visible rounded-xl border bg-white transition-all focus-within:ring-2 dark:bg-zinc-900 ${noteMode && !editing
        ? 'border-amber-300 focus-within:ring-amber-500 dark:border-amber-800'
        : 'border-gray-200 focus-within:ring-emerald-500 dark:border-zinc-800'
      }`}>
      {confirmDialog}
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

      {/* Barra de gravação de áudio: substitui a linha do composer enquanto
          o microfone está aberto. Parar = envia; lixeira = descarta. */}
      {voice.recording && (
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <span className="text-sm font-semibold text-red-600 dark:text-red-400">
            Gravando áudio... {formatRecordingTime(voice.seconds)}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <button
              onClick={voice.cancel}
              title="Descartar gravação"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={voice.stopAndSend}
              title="Parar e enviar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white transition-colors hover:bg-emerald-700"
            >
              <Send className="h-4 w-4" />
            </button>
          </span>
        </div>
      )}

      {/* Linha ÚNICA (12/08/2026, redesign aprovado): ícones com tooltip à
          esquerda, campo que cresce com o texto, IA + enviar à direita. Os
          rótulos e a dica "Enter envia" viram tooltips — a conversa ganha o
          espaço que a barra de botões de 2 andares ocupava. */}
      <div className={`flex items-end gap-0.5 px-2 py-1.5 ${voice.recording ? 'hidden' : ''}`}>
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
          className={iconPillCls('text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-400 dark:hover:bg-zinc-800')}
        >
          <ImagePlus className="h-[18px] w-[18px] shrink-0" />
          <span className={iconPillLabelCls}>Anexar</span>
        </button>

        {/* Respostas rápidas: insere o texto no input com um clique */}
        <DropdownMenu onOpenChange={(o) => { if (!o) setReplySearch(''); }}>
          <DropdownMenuTrigger asChild>
            <button
              disabled={(disabled && !noteMode) || editing}
              title="Respostas rápidas"
              className={iconPillCls('text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-400 dark:hover:bg-zinc-800')}
            >
              <Zap className="h-[18px] w-[18px] shrink-0" />
              <span className={iconPillLabelCls}>Respostas rápidas</span>
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

          <DropdownMenu onOpenChange={(o) => { if (!o) setFlowSearch(''); }}>
          <DropdownMenuTrigger asChild>
            <button
              disabled={disabled || editing || !!runningFlow}
              title="Fluxos de mensagens"
              className={iconPillCls('text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-zinc-400 dark:hover:bg-zinc-800')}
            >
              <Workflow className="h-[18px] w-[18px] shrink-0" />
              <span className={iconPillLabelCls}>Fluxos</span>
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

        {/* Template: único envio que funciona com a janela de 24h expirada —
            por isso mantém a cor verde de destaque. */}
        <button
          onClick={() => setTemplateModalOpen(true)}
          disabled={editing}
          title="Enviar mensagem de template (funciona mesmo com a janela de 24h expirada)"
          className={iconPillCls('text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30')}
        >
          <FileBadge className="h-[18px] w-[18px] shrink-0" />
          <span className={iconPillLabelCls}>Template</span>
        </button>

        {/* Toggle nota interna — ativo fica âmbar preenchido (e o contorno da
            caixa toda fica âmbar pra ninguém confundir com mensagem). */}
        <button
          onClick={() => setNoteMode((v) => !v)}
          disabled={editing}
          title={noteMode ? 'Voltar a responder o cliente' : 'Nota interna (só a equipe vê)'}
          className={iconPillCls(noteMode
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            : 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30')}
        >
          <StickyNote className="h-[18px] w-[18px] shrink-0" />
          <span className={iconPillLabelCls}>Nota interna</span>
        </button>

        {noteMode && !editing ? (
          /* Nota interna: input com @menção (react-mentions). Enter com a
             lista de sugestões aberta seleciona o colega; fechado, salva. */
          <div className="min-w-0 flex-1 px-1.5 py-0.5 text-base">
            <MentionsInput
              value={value}
              onChange={(e: { target: { value: string } }) => setValue(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Nota interna (o cliente não recebe)... Use @ para mencionar"
              style={mentionsStyles}
              forceSuggestionsAboveCursor
            >
              <Mention
                trigger="@"
                data={mentionUsers}
                markup="@[__display__](__id__)"
                displayTransform={(_id: string, display: string) => `@${display}`}
                renderSuggestion={renderMentionSuggestion}
                appendSpaceOnAdd
              />
            </MentionsInput>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter envia; Shift+Enter quebra linha (dica no tooltip do enviar).
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
              : attachments.length
                ? 'Legenda do primeiro anexo (opcional)...'
                : placeholder ?? 'Mensagem... (*negrito* _itálico_ ~tachado~)'}
            rows={1}
            className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-base outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100"
          />
        )}

        {/* Gravar áudio: vira mensagem de voz (PTT) no celular do cliente */}
        <button
          onClick={voice.start}
          disabled={disabled || editing || noteMode}
          title="Gravar áudio (o cliente recebe como mensagem de voz)"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        >
          <Mic className="h-[18px] w-[18px]" />
        </button>

        {/* Sugestão de resposta pela IA (propõe → humano revisa → envia) */}
        <button
          onClick={async () => {
            if (suggesting) return;
            setSuggesting(true);
            try {
              const suggestion = await suggestWhatsAppReply(contactId);
              setValue(suggestion);
              textareaRef.current?.focus();
              toast.success('Sugestão pronta — revise antes de enviar.');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Falha ao gerar a sugestão.');
            } finally {
              setSuggesting(false);
            }
          }}
          disabled={disabled || editing || noteMode || suggesting}
          title="Sugerir resposta com IA (você revisa antes de enviar)"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${suggesting
            ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
            : 'text-gray-400 hover:bg-violet-100 hover:text-violet-600 dark:hover:bg-violet-900/40 dark:hover:text-violet-300'
            }`}
        >
          {suggesting ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Sparkles className="h-[18px] w-[18px]" />}
        </button>
        <button
          onClick={submit}
          disabled={(disabled && !noteMode) || savingEdit || savingNote || (!value.trim() && !attachments.length)}
          title={editing
            ? 'Salvar edição (Enter)'
            : noteMode
              ? 'Salvar nota interna (Enter)'
              : 'Enviar (Enter · Shift+Enter quebra linha)'}
          className={`ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:opacity-40 ${editing || noteMode
            ? 'bg-amber-600 hover:bg-amber-700'
            : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
        >
          {savingEdit || savingNote
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : editing
              ? <Check className="h-4 w-4" />
              : noteMode
                ? <StickyNote className="h-4 w-4" />
                : <Send className="h-4 w-4" />}
        </button>
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
