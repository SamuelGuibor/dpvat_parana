/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  Sparkles, Loader2, StickyNote, FileText, Download, Paperclip, Bot,
  ExternalLink, Lock, Check, RefreshCw, Image as ImageIcon, Video, Mic,
  UserRound, SquareArrowOutUpRight, Pencil, Trash2, Plus,
  ChevronDown, ChevronUp, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { suggestWhatsAppReply, summarizeWhatsAppConversation, fillClientInfoWithAI } from '@/app/_actions/whatsapp/assist';
import {
  saveClientInfo, addClientFromConversation, getClientInfo,
  type ClientInfoResult, type ClientInfoFields,
} from '@/app/_actions/whatsapp/client-info';
import {
  listClientDocuments, attachConversationMediaToCard, getClientDocumentUploadUrl,
  confirmClientDocumentUpload, deleteClientDocument, renameClientDocument,
  type ClientDocumentDTO,
} from '@/app/_actions/whatsapp/client-documents';
import { sendWhatsAppInternalNote } from '@/app/_actions/whatsapp/send-message';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { maskCpf, isValidCpf, maskCep, formatPhone } from '@/app/_shared/utils/format';
import { HospitalCombobox } from '@/app/nova-dash/card-dialog/HospitalCombobox';
import { ESTADOS, ESTADO_CIVIL } from '@/app/nova-dash/card-dialog/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import type { WhatsAppConversationDTO } from '@/app/_actions/whatsapp/conversations';
import type { WhatsAppThreadMessage } from '@/app/_shared/hooks/use-whatsapp';

// Coluna direita do inbox (redesign aprovado): Copiloto (IA) + Ficha no padrão
// do card do kanban + Notas internas + Arquivos da conversa.

type CopilotTab = 'copiloto' | 'ficha' | 'notas' | 'arquivos';

// Cache local de URLs pré-assinadas (mesmo padrão do WhatsAppInbox).
const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();
async function getMediaUrl(key: string): Promise<string | null> {
  const cached = mediaUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const fileName = key.split('/').pop() ?? 'anexo';
  const res = await downloadFileFromS3(key, fileName, true);
  if (!res.success || !res.presignedUrl) return null;
  mediaUrlCache.set(key, { url: res.presignedUrl, expiresAt: Date.now() + 55 * 60_000 });
  return res.presignedUrl;
}

function fileNameFromKey(key: string): string {
  const raw = key.split('/').pop() ?? 'arquivo';
  const noTimestamp = raw.replace(/^\d{10,}-/, '');
  try { return decodeURIComponent(noTimestamp); } catch { return noTimestamp; }
}

function mediaIcon(mediaType: string | null): React.ElementType {
  if (mediaType?.startsWith('image/')) return ImageIcon;
  if (mediaType?.startsWith('video/')) return Video;
  if (mediaType?.startsWith('audio/')) return Mic;
  return FileText;
}

const AUDIO_EXT = /\.(ogg|opus|mp3|m4a|wav|aac|weba)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic)$/i;
const PDF_EXT = /\.pdf$/i;

/** Tipo de arquivo pelo nome — os documentos do cliente não guardam mediaType. */
function previewKind(name: string): 'audio' | 'image' | 'pdf' | 'other' {
  if (AUDIO_EXT.test(name)) return 'audio';
  if (IMAGE_EXT.test(name)) return 'image';
  if (PDF_EXT.test(name)) return 'pdf';
  return 'other';
}

function timeStamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

interface Props {
  conversation: WhatsAppConversationDTO;
  messages: WhatsAppThreadMessage[];
  clientInfo: ClientInfoResult | null;
  onClientInfoChanged: (info: ClientInfoResult) => void;
  /** Abre o CardDialog do cliente vinculado (só chega aqui se registered). */
  onOpenCard: () => void;
  onRefreshMessages: () => Promise<unknown>;
  /** Incrementar esse número de fora força a aba "Ficha" a abrir (ex.: clique
   * no nome do contato no cabeçalho da thread, no lugar do modal antigo). */
  focusFicha?: number;
}

export function CopilotPanel({
  conversation, messages, clientInfo, onClientInfoChanged, onOpenCard, onRefreshMessages, focusFicha,
}: Props) {
  const contactId = conversation.contactId;
  const [tab, setTab] = useState<CopilotTab>('copiloto');

  // Clique no nome do contato (fora deste painel) força a aba Ficha — ignora
  // o primeiro render (focusFicha começa em 0/undefined, sem token ainda).
  const firstFocusRef = useRef(true);
  useEffect(() => {
    if (firstFocusRef.current) { firstFocusRef.current = false; return; }
    if (focusFicha) setTab('ficha');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFicha]);

  // Documentos da ficha: alimenta o checklist do Copiloto e o "✓ no card"
  // da aba Arquivos.
  const { data: docs, mutate: mutateDocs } = useSWR<ClientDocumentDTO[]>(
    ['wa-client-docs', contactId],
    () => listClientDocuments(contactId),
    { revalidateOnFocus: false },
  );
  const attachedKeys = useMemo(() => new Set((docs ?? []).map((d) => d.key)), [docs]);

  // "Anexar no card" feito pelo menu da mídia (na thread) avisa por evento —
  // atualiza a lista de documentos sem esperar o próximo revalidate.
  useEffect(() => {
    const refresh = () => { mutateDocs(); };
    window.addEventListener('wa-docs-changed', refresh);
    return () => window.removeEventListener('wa-docs-changed', refresh);
  }, [mutateDocs]);

  /* ---------------- aba Copiloto ---------------- */

  // Resumo e sugestão são por conversa — cache local pra não regerar à toa.
  const summaryCache = useRef(new Map<string, string>());
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    setSummary(summaryCache.current.get(contactId) ?? null);
    setSuggestion(null);
    setTab('copiloto');
  }, [contactId]);

  async function handleSummarize() {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const text = await summarizeWhatsAppConversation(contactId);
      summaryCache.current.set(contactId, text);
      setSummary(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar o resumo.');
    } finally {
      setSummarizing(false);
    }
  }

  async function handleSuggest() {
    if (suggesting) return;
    setSuggesting(true);
    try {
      setSuggestion(await suggestWhatsAppReply(contactId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar a sugestão.');
    } finally {
      setSuggesting(false);
    }
  }

  function useSuggestionInComposer() {
    if (!suggestion) return;
    window.dispatchEvent(new CustomEvent('wa-composer-insert', { detail: { text: suggestion } }));
    toast.success('Sugestão no campo — revise antes de enviar.');
  }

  // "Por que está na fila": a única fonte persistida do handoff é a nota
  // interna que o bot deixa na thread ao transferir.
  const handoffNote = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.internal && m.sentByBot && m.body && !m.deletedAt) return m;
    }
    return null;
  }, [messages]);

  // Preenchimento da ficha pela IA sob demanda (mesmo pipeline do webhook).
  const [fillingFicha, setFillingFicha] = useState(false);

  async function handleFillFichaAI() {
    if (fillingFicha) return;
    setFillingFicha(true);
    try {
      const result = await fillClientInfoWithAI(contactId);
      // O hospital citado também muda a ficha (vira a dica embaixo do select),
      // mesmo quando nenhum campo foi preenchido.
      if (result.filled.length || result.hospitalHint) {
        onClientInfoChanged(await getClientInfo(contactId));
      }
      if (result.filled.length) {
        toast.success(`IA preencheu: ${result.filled.join(', ')}.`);
      } else {
        toast.info(result.reason ?? 'A IA não encontrou dados novos na conversa.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao preencher a ficha com IA.');
    } finally {
      setFillingFicha(false);
    }
  }

  // Checklist da ficha: o que o bot (ou a equipe) já coletou.
  const fields = clientInfo?.fields ?? {};
  const checklist: { label: string; done: boolean }[] = [
    { label: 'Nome', done: !!fields.name },
    { label: 'CPF', done: !!fields.cpf },
    { label: 'Endereço', done: !!(fields.cep || fields.rua || fields.cidade) },
    { label: 'Estado civil', done: !!fields.estado_civil },
    { label: 'Profissão', done: !!fields.profissao },
    { label: `Documentos (${docs?.length ?? 0})`, done: (docs?.length ?? 0) > 0 },
  ];

  /* ---------------- aba Notas ---------------- */

  const notes = useMemo(
    () => messages.filter((m) => m.internal && !m.deletedAt).slice().reverse(),
    [messages],
  );
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  async function handleSaveNote() {
    const body = noteDraft.trim();
    if (!body || savingNote) return;
    setSavingNote(true);
    try {
      await sendWhatsAppInternalNote({ contactId, body });
      setNoteDraft('');
      await onRefreshMessages();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a nota.');
    } finally {
      setSavingNote(false);
    }
  }

  /* ---------------- aba Arquivos ---------------- */

  const mediaMessages = useMemo(
    () => messages.filter((m) => m.mediaKey && !m.deletedAt && !m.id.startsWith('temp-')).slice().reverse(),
    [messages],
  );
  const [attachingId, setAttachingId] = useState<string | null>(null);

  async function handleAttach(msg: WhatsAppThreadMessage) {
    if (attachingId) return;
    setAttachingId(msg.id);
    try {
      const updated = await attachConversationMediaToCard(msg.id);
      mutateDocs(updated, { revalidate: false });
      toast.success(clientInfo?.registered
        ? `Anexado no card${clientInfo.cardNumber ? ` #${clientInfo.cardNumber}` : ''}.`
        : 'Anexado na ficha (migra pro card quando o cliente for cadastrado).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao anexar no card.');
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <aside className="flex w-full min-w-0 flex-col border-l border-gray-200 bg-gray-50 dark:border-zinc-800">
      {/* Abas da coluna */}
      <div className="flex shrink-0 border-b border-gray-200 bg-white dark:border-zinc-800">
        {([
          { key: 'copiloto', label: '✦ Copiloto' },
          { key: 'ficha', label: 'Ficha' },
          { key: 'notas', label: 'Notas' },
          { key: 'arquivos', label: 'Arquivos' },
        ] as { key: CopilotTab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 border-b-2 px-1 py-2 text-[11px] font-bold transition-colors ${
              tab === t.key
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
            {t.key === 'notas' && notes.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">{notes.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="wa-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {/* ================= COPILOTO ================= */}
        {tab === 'copiloto' && (
          <>
            {/* Jornada do lead: situa quem pega a conversa no meio, em 2s. */}
            <CopilotCard title="Jornada do lead">
              {/* Telefone + atendente saíram do cabeçalho da thread pra cá. */}
              <p className="mb-1.5 text-xs text-gray-500 dark:text-zinc-400">
                {formatPhone(conversation.contactPhone)}
                {conversation.assignedToName ? ` · com ${conversation.assignedToName}` : ''}
              </p>
              <div className="flex flex-col gap-1">
                {(() => {
                  const origem = conversation.adPlatform === 'instagram' ? 'anúncio (Instagram)'
                    : conversation.adPlatform === 'facebook' ? 'anúncio (Facebook)' : 'orgânico';
                  const chegou = new Date(conversation.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                  const fichaOk = !!(conversation.caseLesoes || (docs?.length ?? 0) > 0);
                  const statusLabel: Record<string, string> = {
                    bot: 'bot atendendo', queued: 'na fila de espera', human: 'em atendimento',
                    standby: 'em recuperação', closed: 'encerrada',
                  };
                  const contratoOk = conversation.hasCpf && (docs?.length ?? 0) > 0;
                  const steps: { label: string; on: boolean }[] = [
                    { label: `chegou por ${origem} · ${chegou}`, on: true },
                    { label: 'bot coletou ficha', on: fichaOk },
                    { label: statusLabel[conversation.status] ?? conversation.status, on: true },
                    { label: 'contrato', on: contratoOk },
                  ];
                  return steps.map((s) => (
                    <span key={s.label} className={`flex items-center gap-2 text-sm ${s.on ? 'text-gray-700 dark:text-zinc-200' : 'text-gray-400'}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.on ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-600'}`} />
                      {s.label}
                    </span>
                  ));
                })()}
              </div>
            </CopilotCard>

            {/* Contrato: identifica item a item o que já tem e o que trava. */}
            <CopilotCard title="Contrato" highlight={!conversation.hasCpf || (docs?.length ?? 0) === 0}>
              {(conversation.caseLesoes || conversation.caseCidade || conversation.caseDataAcidente) && (
                <p className="mb-1.5 text-xs text-gray-500 dark:text-zinc-400">
                  {[conversation.caseLesoes, conversation.caseCidade, conversation.caseDataAcidente].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {([
                  { label: 'Caso informado (lesões/data)', done: !!(conversation.caseLesoes || conversation.caseDataAcidente) },
                  { label: `Documentos (${docs?.length ?? 0})`, done: (docs?.length ?? 0) > 0 },
                  { label: 'CPF', done: conversation.hasCpf },
                ] as { label: string; done: boolean }[]).map((item) => (
                  <span key={item.label} className={`flex items-center gap-2 text-sm ${item.done ? 'text-gray-700 dark:text-zinc-200' : 'text-amber-600 dark:text-amber-400'}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${item.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-amber-400 bg-white dark:bg-zinc-900'
                      }`}>
                      {item.done && <Check className="h-3 w-3" />}
                    </span>
                    {item.label}
                  </span>
                ))}
              </div>
              {!conversation.hasCpf && conversation.status !== 'closed' && (
                <button
                  onClick={() => {
                    const first = (conversation.contactName ?? '').trim().split(/\s+/)[0];
                    const text = `${first ? `${first}, ` : ''}pra eu finalizar a análise do seu caso, pode me enviar o seu CPF, por favor?`;
                    window.dispatchEvent(new CustomEvent('wa-composer-insert', { detail: { text } }));
                    toast.success('Mensagem no campo — revise antes de enviar.');
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Pedir CPF com 1 clique
                </button>
              )}
            </CopilotCard>

            <CopilotCard
              title="Resumo da conversa"
              action={summary
                ? <button onClick={handleSummarize} disabled={summarizing} title="Gerar de novo" className="text-sky-600 hover:text-sky-800 disabled:opacity-50">
                    {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                : null}
            >
              {summary ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{summary}</p>
              ) : (
                <button
                  onClick={handleSummarize}
                  disabled={summarizing}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-60"
                >
                  {summarizing
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Resumindo…</>
                    : <><Sparkles className="h-3.5 w-3.5" /> Gerar resumo com IA</>}
                </button>
              )}
            </CopilotCard>

            {handoffNote && (conversation.status === 'queued' || conversation.status === 'human') && (
              <CopilotCard title="Por que caiu na fila">
                <p className="flex items-start gap-1.5 text-sm leading-relaxed text-gray-700">
                  <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
                  <span className="whitespace-pre-wrap">{handoffNote.body}</span>
                </p>
              </CopilotCard>
            )}

            <CopilotCard title="Ficha coletada">
              <div className="flex flex-col gap-1">
                {checklist.map((item) => (
                  <span key={item.label} className={`flex items-center gap-2 text-sm ${item.done ? 'text-gray-700' : 'text-gray-400'}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      item.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white'
                    }`}>
                      {item.done && <Check className="h-3 w-3" />}
                    </span>
                    {item.label}
                  </span>
                ))}
              </div>
              <button
                onClick={handleFillFichaAI}
                disabled={fillingFicha}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
              >
                {fillingFicha
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo a conversa…</>
                  : <><Sparkles className="h-3.5 w-3.5" /> Preencher ficha com IA</>}
              </button>
              <button onClick={() => setTab('ficha')} className="mt-2 text-xs font-bold text-sky-600 hover:underline">
                Completar na aba Ficha →
              </button>
            </CopilotCard>

            <CopilotCard
              title="Resposta sugerida"
              highlight
              action={suggestion
                ? <button onClick={handleSuggest} disabled={suggesting} title="Gerar outra" className="text-sky-600 hover:text-sky-800 disabled:opacity-50">
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </button>
                : null}
            >
              {suggestion ? (
                <>
                  <p className="whitespace-pre-wrap text-sm italic leading-relaxed text-gray-700">&ldquo;{suggestion}&rdquo;</p>
                  <button
                    onClick={useSuggestionInComposer}
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-sky-700"
                  >
                    <Check className="h-3.5 w-3.5" /> Usar no campo
                  </button>
                </>
              ) : (
                <button
                  onClick={handleSuggest}
                  disabled={suggesting}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-60"
                >
                  {suggesting
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando…</>
                    : <><Sparkles className="h-3.5 w-3.5" /> Sugerir resposta</>}
                </button>
              )}
            </CopilotCard>

            <CopilotCard title="Card do cliente">
              {clientInfo?.registered ? (
                <>
                  <div className="flex flex-col text-sm">
                    <InfoRow label="Cliente" value={fields.name ?? '—'} />
                    <InfoRow label="Nº do card" value={clientInfo.cardNumber ? `#${clientInfo.cardNumber}` : '—'} />
                  </div>
                  <button
                    onClick={onOpenCard}
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
                  >
                    <SquareArrowOutUpRight className="h-3.5 w-3.5" /> Abrir card
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Este contato ainda não tem card no kanban.</p>
                  <button onClick={() => setTab('ficha')} className="mt-2 text-xs font-bold text-sky-600 hover:underline">
                    Preencher a ficha e criar o card →
                  </button>
                </>
              )}
            </CopilotCard>
          </>
        )}

        {/* ================= FICHA ================= */}
        {tab === 'ficha' && (
          <FichaTab
            contactId={contactId}
            clientInfo={clientInfo}
            onSaved={(info) => { onClientInfoChanged(info); mutateDocs(); }}
            onOpenCard={onOpenCard}
            docs={docs ?? []}
            onDocsChanged={(updated) => mutateDocs(updated, { revalidate: false })}
            onOpenArquivos={() => setTab('arquivos')}
          />
        )}

        {/* ================= NOTAS ================= */}
        {tab === 'notas' && (
          <>
            <div className="rounded-xl border border-amber-200 bg-white p-2.5">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Nova nota interna (só a equipe vê)…"
                rows={2}
                className="w-full resize-none rounded-lg border border-amber-100 bg-amber-50/50 p-2 text-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-amber-400"
              />
              <button
                onClick={handleSaveNote}
                disabled={savingNote || !noteDraft.trim()}
                className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
              >
                {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />}
                Salvar nota
              </button>
            </div>
            {notes.length === 0 && (
              <p className="px-1 text-sm text-gray-400">Nenhuma nota interna nesta conversa ainda.</p>
            )}
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-300">
                  <span className="flex items-center gap-1">
                    {n.sentByBot ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                    {n.sentByBot ? 'Bot' : n.authorName ?? 'Equipe'}
                  </span>
                  <span className="font-normal opacity-70">{timeStamp(n.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-zinc-200">{n.body}</p>
              </div>
            ))}
            <p className="px-1 text-[11px] text-gray-400">
              As notas também aparecem em âmbar dentro da conversa, no ponto em que foram criadas.
            </p>
          </>
        )}

        {/* ================= ARQUIVOS ================= */}
        {tab === 'arquivos' && (
          <ArquivosTab
            contactId={contactId}
            docs={docs ?? []}
            onDocsChanged={(updated) => mutateDocs(updated, { revalidate: false })}
            unattachedMedia={mediaMessages.filter((m) => !attachedKeys.has(m.mediaKey as string))}
            attachingId={attachingId}
            onAttach={handleAttach}
          />
        )}
      </div>
    </aside>
  );
}

/* ---------------- Ficha (padrão do dialog do card) ---------------- */

function FichaTab({
  contactId, clientInfo, onSaved, onOpenCard, docs, onDocsChanged, onOpenArquivos,
}: {
  contactId: string;
  clientInfo: ClientInfoResult | null;
  onSaved: (info: ClientInfoResult) => void;
  onOpenCard: () => void;
  docs: ClientDocumentDTO[];
  onDocsChanged: (docs: ClientDocumentDTO[]) => void;
  onOpenArquivos: () => void;
}) {
  const [fields, setFields] = useState<ClientInfoFields>(clientInfo?.fields ?? {});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  async function handleUploadDocs(list: FileList | null) {
    if (!list?.length) return;
    setUploadingDoc(true);
    try {
      for (const file of Array.from(list)) {
        const mime = file.type || 'application/octet-stream';
        const { url, key } = await getClientDocumentUploadUrl(contactId, file.name, mime);
        const put = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': mime } });
        if (!put.ok) throw new Error(`Falha ao subir "${file.name}".`);
        const updated = await confirmClientDocumentUpload(contactId, key, file.name);
        onDocsChanged(updated);
      }
      toast.success('Documento adicionado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao subir o documento.');
    } finally {
      setUploadingDoc(false);
    }
  }

  // Troca de conversa (ou primeira carga) repõe o formulário; edições em
  // andamento não são sobrescritas pelo revalidate do SWR.
  useEffect(() => {
    setFields(clientInfo?.fields ?? {});
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);
  useEffect(() => {
    if (!dirty && clientInfo) setFields(clientInfo.fields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientInfo]);

  function setField(key: keyof ClientInfoFields, value: string) {
    setDirty(true);
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  // Campo veio da IA e ainda não foi editado na mão (o selo some ao salvar
  // uma alteração). Enquanto o formulário está sujo, o selo já é escondido
  // para o campo mexido — feedback imediato.
  const aiSet = new Set(clientInfo?.aiFields ?? []);
  const byAi = (key: keyof ClientInfoFields) =>
    aiSet.has(key) && (clientInfo?.fields[key] ?? null) === (fields[key] ?? null);

  // CEP completo → busca ViaCEP e preenche rua/bairro (mesmo fluxo do CardDialog).
  async function handleCepChange(raw: string) {
    const masked = maskCep(raw);
    setField('cep', masked);
    const digits = masked.replace(/\D/g, '');
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data?.erro) { toast.warning('CEP não encontrado.'); return; }
      setFields((prev) => ({
        ...prev,
        rua: prev.rua || data.logradouro || prev.rua,
        bairro: prev.bairro || data.bairro || prev.bairro,
        cidade: prev.cidade || data.localidade || prev.cidade,
      }));
    } catch {
      toast.warning('Não foi possível consultar o CEP.');
    }
  }

  const cpfInvalid = !!fields.cpf && fields.cpf.replace(/\D/g, '').length === 11 && !isValidCpf(fields.cpf);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const info = await saveClientInfo(contactId, fields);
      onSaved(info);
      setDirty(false);
      toast.success(info.registered ? 'Ficha do cliente atualizada.' : 'Rascunho da ficha salvo.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a ficha.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCard() {
    if (creating) return;
    if (!fields.name?.trim()) { toast.error('Preencha ao menos o nome do cliente.'); return; }
    setCreating(true);
    try {
      const info = await addClientFromConversation(contactId, fields);
      onSaved(info);
      setDirty(false);
      toast.success(`Card${info.cardNumber ? ` #${info.cardNumber}` : ''} criado e vinculado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar o card.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!clientInfo && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando ficha…
        </div>
      )}
      {clientInfo && (
        <>
          <FichaSection title="Dados pessoais">
            <FField label="Nome" value={fields.name ?? ''} onChange={(v) => setField('name', v)} ai={byAi('name')} />
            <div className="grid grid-cols-2 gap-2">
              <FField label="CPF" value={fields.cpf ?? ''} onChange={(v) => setField('cpf', maskCpf(v))} error={cpfInvalid ? 'CPF inválido' : undefined} ai={byAi('cpf')} />
              <FField label="RG" value={fields.rg ?? ''} onChange={(v) => setField('rg', v)} ai={byAi('rg')} />
            </div>
            {/* Telefone vem do contato do WhatsApp — só leitura. */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Telefone</label>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-500">
                {formatPhone(clientInfo.phone)}
                <Lock className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <p className="text-[10px] italic text-gray-400">número do WhatsApp — não editável por aqui</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FField label="Nascimento" value={fields.data_nasc ?? ''} onChange={(v) => setField('data_nasc', v)} placeholder="dd/mm/aaaa" ai={byAi('data_nasc')} hint={partialDate(fields.data_nasc) ? 'data incompleta — confirme com o cliente' : undefined} />
              <FSelect label="Estado civil" value={fields.estado_civil ?? ''} onChange={(v) => setField('estado_civil', v)} options={ESTADO_CIVIL} ai={byAi('estado_civil')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FField label="Profissão" value={fields.profissao ?? ''} onChange={(v) => setField('profissao', v)} ai={byAi('profissao')} />
              <FField label="Nome da mãe" value={fields.nome_mae ?? ''} onChange={(v) => setField('nome_mae', v)} ai={byAi('nome_mae')} />
            </div>
            <FField label="E-mail" value={fields.email ?? ''} onChange={(v) => setField('email', v)} />
            <div className="grid grid-cols-2 gap-2">
              <FField label="Outro telefone" value={fields.telefone_secundario ?? ''} onChange={(v) => setField('telefone_secundario', v)} ai={byAi('telefone_secundario')} />
              <FField label="Rede social" value={fields.rede_social ?? ''} onChange={(v) => setField('rede_social', v)} ai={byAi('rede_social')} />
            </div>
          </FichaSection>

          <FichaSection title="Endereço">
            <div className="grid grid-cols-2 gap-2">
              <FField label="CEP" value={fields.cep ?? ''} onChange={handleCepChange} placeholder="00000-000" hint="preenche rua e bairro sozinho" ai={byAi('cep')} />
              <FField label="Cidade" value={fields.cidade ?? ''} onChange={(v) => setField('cidade', v)} ai={byAi('cidade')} />
            </div>
            <FField label="Rua" value={fields.rua ?? ''} onChange={(v) => setField('rua', v)} ai={byAi('rua')} />
            <div className="grid grid-cols-2 gap-2">
              <FField label="Bairro" value={fields.bairro ?? ''} onChange={(v) => setField('bairro', v)} ai={byAi('bairro')} />
              <FField label="Número" value={fields.numero ?? ''} onChange={(v) => setField('numero', v)} ai={byAi('numero')} />
            </div>
            <FSelect label="Estado" value={fields.estado ?? ''} onChange={(v) => setField('estado', v)} options={ESTADOS} ai={byAi('estado')} />
          </FichaSection>

          <FichaSection title="Dados do acidente">
            <FField
              label="Data do acidente"
              value={fields.data_acidente ?? ''}
              onChange={(v) => setField('data_acidente', v)}
              placeholder="dd/mm/aaaa"
              ai={byAi('data_acidente')}
              hint={partialDate(fields.data_acidente) ? 'o cliente só informou este período — confirme a data exata' : undefined}
            />
            {/* Mesmo combobox do card: busca nos hospitais existentes e permite "Adicionar".
                A IA NUNCA preenche este campo — só deixa a dica abaixo. */}
            <div className="flex flex-col gap-1">
              <HospitalCombobox id="hospital" label="Hospital" value={fields.hospital ?? ''} onChange={(_, v) => setField('hospital', v)} />
              {clientInfo.hospitalHint && !fields.hospital && (
                <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400">
                  atendido em {clientInfo.hospitalHint}, validar o select correto
                </p>
              )}
            </div>
            <FField label="Lesões" value={fields.lesoes ?? ''} onChange={(v) => setField('lesoes', v)} ai={byAi('lesoes')} />
            <FTextArea label="Observação" value={fields.obs ?? ''} onChange={(v) => setField('obs', v)} />
          </FichaSection>

          <FichaSection title={`Documentos (${docs.length})`}>
            <input
              ref={docInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => { handleUploadDocs(e.target.files); e.target.value = ''; }}
            />
            {docs.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum documento anexado ainda.</p>
            )}
            {docs.length > 0 && (
              <div className="flex flex-col gap-1">
                {docs.slice(0, 4).map((d) => (
                  <span key={d.id} className="flex items-center gap-1.5 truncate text-xs text-gray-600 dark:text-zinc-300">
                    <FileText className="h-3 w-3 shrink-0 text-gray-400" /> <span className="truncate">{d.name}</span>
                  </span>
                ))}
                {docs.length > 4 && (
                  <span className="text-[10px] text-gray-400">+ {docs.length - 4} outro(s)</span>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => docInputRef.current?.click()}
                disabled={uploadingDoc}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
              >
                {uploadingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar documento
              </button>
              {docs.length > 0 && (
                <button
                  onClick={onOpenArquivos}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-100"
                >
                  Ver todos
                </button>
              )}
            </div>
          </FichaSection>

          <div className="sticky bottom-0 flex gap-2 border-t border-gray-200 bg-gray-50 py-2">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar
            </button>
            {clientInfo.registered ? (
              <button
                onClick={onOpenCard}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Card {clientInfo.cardNumber ? `#${clientInfo.cardNumber}` : ''}
              </button>
            ) : (
              <button
                onClick={handleCreateCard}
                disabled={creating}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRound className="h-3.5 w-3.5" />} Criar card
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Arquivos (só o que é do cliente desta conversa) ---------------- */

interface PreviewState { doc: ClientDocumentDTO; url: string; kind: 'image' | 'pdf' }

function ArquivosTab({
  contactId, docs, onDocsChanged, unattachedMedia, attachingId, onAttach,
}: {
  contactId: string;
  docs: ClientDocumentDTO[];
  onDocsChanged: (docs: ClientDocumentDTO[]) => void;
  unattachedMedia: WhatsAppThreadMessage[];
  attachingId: string | null;
  onAttach: (m: WhatsAppThreadMessage) => void;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [showUnattached, setShowUnattached] = useState(false);

  const audioDocs = useMemo(() => docs.filter((d) => previewKind(d.name) === 'audio'), [docs]);
  const otherDocs = useMemo(() => docs.filter((d) => previewKind(d.name) !== 'audio'), [docs]);

  async function handlePreview(doc: ClientDocumentDTO) {
    const kind = previewKind(doc.name);
    if (kind !== 'image' && kind !== 'pdf') return;
    const url = await getMediaUrl(doc.key);
    if (!url) { toast.error('Não foi possível abrir o arquivo.'); return; }
    setPreview({ doc, url, kind });
  }

  async function handleDownload(doc: ClientDocumentDTO) {
    const url = await getMediaUrl(doc.key);
    if (url) window.open(url, '_blank');
    else toast.error('Não foi possível abrir o arquivo.');
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
      description: <>O arquivo <strong>{doc.name}</strong> será removido da ficha do cliente.</>,
      confirmLabel: 'Excluir',
    }))) return;
    try {
      onDocsChanged(await deleteClientDocument(contactId, doc.id));
      toast.success('Arquivo excluído.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  return (
    <>
      {confirmDialog}
      {docs.length === 0 && (
        <p className="px-1 text-sm text-gray-400">Nenhum arquivo do cliente ainda — anexe pela Ficha ou pela conversa.</p>
      )}

      {otherDocs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">Documentos e mídia</span>
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

      {unattachedMedia.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-dashed border-gray-200 pt-2">
          <button
            onClick={() => setShowUnattached((v) => !v)}
            className="flex items-center justify-between px-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400 hover:text-gray-600"
          >
            Mídia da conversa ainda não anexada ({unattachedMedia.length})
            {showUnattached ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showUnattached && unattachedMedia.map((m) => {
            const key = m.mediaKey as string;
            const Icon = mediaIcon(m.mediaType);
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 dark:border-zinc-700">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-gray-700">{fileNameFromKey(key)}</span>
                  <span className="block text-[10px] text-gray-400">
                    {timeStamp(m.createdAt)} · {m.direction === 'in' ? 'do cliente' : 'da equipe'}
                  </span>
                </span>
                <button
                  onClick={() => onAttach(m)}
                  disabled={attachingId === m.id}
                  title="Trazer pra ficha do cliente"
                  className="flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1.5 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                >
                  {attachingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                  anexar
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6 text-sm">{preview?.doc.name}</DialogTitle>
          </DialogHeader>
          {preview?.kind === 'image' && (
            <img src={preview.url} alt={preview.doc.name} className="max-h-[70vh] w-full rounded-lg object-contain" />
          )}
          {preview?.kind === 'pdf' && (
            <iframe src={preview.url} title={preview.doc.name} className="h-[70vh] w-full rounded-lg border border-gray-200" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

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
  const [thumb, setThumb] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(doc.name);

  useEffect(() => {
    setName(doc.name);
    if (kind !== 'image') return;
    let cancelled = false;
    getMediaUrl(doc.key).then((url) => { if (!cancelled) setThumb(url); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.key, doc.name]);

  function commitRename() {
    setRenaming(false);
    if (name.trim() && name.trim() !== doc.name) onRename(doc, name.trim());
    else setName(doc.name);
  }

  const Icon = kind === 'pdf' ? FileText : mediaIcon(null);
  const previewable = kind === 'image' || kind === 'pdf';

  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 dark:border-zinc-700">
      <button
        onClick={() => previewable && onPreview(doc)}
        disabled={!previewable}
        title={previewable ? 'Pré-visualizar' : undefined}
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-50 text-emerald-700"
      >
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Icon className="h-4 w-4" />}
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
        <span className="block text-[10px] text-gray-400">{timeStamp(doc.uploadedAt)}</span>
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
  const [url, setUrl] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(doc.name);

  useEffect(() => {
    setName(doc.name);
    let cancelled = false;
    getMediaUrl(doc.key).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [doc.key, doc.name]);

  function commitRename() {
    setRenaming(false);
    if (name.trim() && name.trim() !== doc.name) onRename(doc, name.trim());
    else setName(doc.name);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white p-2 dark:border-zinc-700">
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
      {url ? (
        <audio controls src={url} className="h-8 w-full" />
      ) : (
        <span className="flex items-center gap-1.5 text-[10px] text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> carregando áudio…</span>
      )}
    </div>
  );
}

/* ---------------- primitivos visuais ---------------- */

function CopilotCard({
  title, children, action, highlight,
}: {
  title: string; children: React.ReactNode; action?: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-white p-2.5 dark:bg-zinc-900 ${
      highlight ? 'border-sky-300 dark:border-sky-800' : 'border-gray-200 dark:border-zinc-700'
    }`}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center justify-between border-b border-dashed border-gray-200 py-1 last:border-0">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold text-gray-700">{value}</span>
    </span>
  );
}

function FichaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

/**
 * Data incompleta ("2019", "03/2019"): quando o cliente só lembra o ano, a IA
 * registra o que ele disse em vez de deixar o campo vazio — a ficha sinaliza
 * para o atendente fechar a data depois.
 */
function partialDate(value?: string | null): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  return !/^\d{2}\/\d{2}\/\d{4}$/.test(v);
}

/** Selo de origem: o campo foi preenchido pela IA e ainda não foi revisado. */
function AiTag() {
  return (
    <span
      title="Preenchido pela IA a partir da conversa — confira e edite se precisar"
      className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
    >
      <Sparkles className="h-2.5 w-2.5" /> IA
    </span>
  );
}

function FField({
  label, value, onChange, placeholder, error, hint, ai,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string; hint?: string; ai?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {label}{ai && <AiTag />}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border px-2.5 py-1.5 text-sm text-gray-800 outline-none transition-colors focus:ring-2 dark:bg-zinc-950 dark:text-zinc-100 ${
          error
            ? 'border-red-300 focus:ring-red-400'
            : ai
              ? 'border-violet-300 bg-violet-50/40 focus:ring-violet-400 dark:bg-violet-950/10'
              : 'border-gray-200 focus:ring-emerald-500'
        }`}
      />
      {error && <p className="text-[10px] font-semibold text-red-600">{error}</p>}
      {hint && !error && <p className="text-[10px] italic text-gray-400">{hint}</p>}
    </div>
  );
}

function FSelect({
  label, value, onChange, options, ai,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; ai?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {label}{ai && <AiTag />}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full cursor-pointer rounded-lg border bg-white px-2 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 dark:bg-zinc-950 dark:text-zinc-100 ${
          ai ? 'border-violet-300 focus:ring-violet-400' : 'border-gray-200 focus:ring-emerald-500'
        }`}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function FTextArea({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-zinc-950 dark:text-zinc-100"
      />
    </div>
  );
}
