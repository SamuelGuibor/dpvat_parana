'use client';

/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ClipboardList, ListPlus, PauseCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Textarea } from '@/app/_shared/ui/textarea';
import { listWhatsAppFlows, type WhatsAppFlowDTO } from '@/app/_actions/whatsapp/flows';
import {
  COLLECT_REQUEST_MAX_CHARS, COLLECT_SOURCE_LABELS, INSS_DOC_LIST_FLOW_NAME, appendListToRequest,
  collectPresetFromFlow, collectSummary, isCollectRequestLive, normalizeCollectRequest, sameCollectRequest,
  type CollectRequestDTO,
} from '@/app/_shared/utils/collect-request';
import { META_WINDOW_MS, PENDING_HANDOFF_MARGIN_MS } from '@/app/_shared/utils/pending-followup';

// PEDIDO EM ABERTO na tela do inbox (30/09/2026, decisão 3 do dono): o diálogo
// do "Devolver ao bot" com o campo "O que a IA deve recolher?", a barra "IA
// recolhendo" acima da thread, a pill "Lista" da linha e a confirmação do
// Encerrar com pedido aberto. Arquivo próprio para não inchar o
// WhatsAppInbox.tsx. Regras do pedido (normalizar, resumo, preset do fluxo) em
// app/_shared/utils/collect-request.ts; o servidor em
// app/_actions/whatsapp/conversations.ts (returnConversationToBot,
// setConversationCollectRequest, closeConversation).
//
// Cores fixas (sem `dark:`): o modo escuro do app é o Dark Reader.

const HOUR_MS = 60 * 60_000;
// Janela de resposta da Meta (24 h desde a última mensagem RECEBIDA): sem ela
// a IA não fala nem cobra; a fase de cobrança transfere ao dono 2 h antes de
// fechar (PENDING_HANDOFF_MARGIN_MS), mas a conversa devolvida já dentro
// dessa margem só espera o cliente escrever (planPendingFollowup). Abaixo de
// 4 h o diálogo avisa.
const WINDOW_MS = META_WINDOW_MS;
const WINDOW_WARN_MS = 4 * HOUR_MS;

function remainingLabel(ms: number): string {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  const h = Math.floor(ms / HOUR_MS);
  const min = Math.round((ms % HOUR_MS) / 60_000);
  return min ? `${h} h ${min} min` : `${h} h`;
}

/** Aviso da janela de 24 h para o diálogo (null = janela folgada). */
function windowWarning(lastInboundAt: string | null): string | null {
  const last = lastInboundAt ? new Date(lastInboundAt).getTime() : NaN;
  const left = Number.isFinite(last) ? last + WINDOW_MS - Date.now() : -1;
  if (left <= 0) {
    return 'A janela de 24 h da Meta está fechada: a IA só volta a falar quando o cliente escrever, e não consegue cobrar a lista até lá.';
  }
  if (left <= PENDING_HANDOFF_MARGIN_MS) {
    return `A janela de 24 h da Meta fecha em ${remainingLabel(left)}: a IA não cobra a lista nem devolve a conversa; ela só volta a falar quando o cliente escrever.`;
  }
  if (left < WINDOW_WARN_MS) {
    return `A janela de 24 h da Meta fecha em ${remainingLabel(left)}: não dá tempo de cobrar a lista, e a conversa volta para você 2 h antes de a janela fechar, com o pedido mantido.`;
  }
  return null;
}

/** Quem/como o pedido foi aberto, para a barra e o diálogo. */
function originLabel(v: CollectRequestDTO): string {
  if (v.source === 'fluxo_ia') return 'a IA mandou a lista';
  if (v.byName) return `pedido por ${v.byName}`;
  return COLLECT_SOURCE_LABELS[v.source];
}

/**
 * Texto do botão rápido "Lista de documentos do INSS": os itens do fluxo
 * INSS_DOC_LIST_FLOW_NAME, lidos do banco pela action que a tela Fluxos já
 * usa. Só busca com o diálogo aberto (1 vez por minuto, no máximo); fluxo
 * ausente, renomeado ou sem itens → null, e o botão some.
 */
function useInssDocListPreset(enabled: boolean): string | null {
  const { data } = useSWR<WhatsAppFlowDTO[]>(
    enabled ? 'wa-flows-presets' : null,
    () => listWhatsAppFlows(),
    { revalidateOnFocus: false, dedupingInterval: 60_000, shouldRetryOnError: false },
  );
  return useMemo(() => {
    const flow = data?.find((f) => f.name === INSS_DOC_LIST_FLOW_NAME);
    return flow ? collectPresetFromFlow(flow.steps) : null;
  }, [data]);
}

/**
 * Diálogo do "Devolver ao bot" (mode 'return') e do "Editar" da barra (mode
 * 'edit'). `onConfirm` recebe o valor no formato da action:
 * - texto: o pedido (normalizado);
 * - null: o atendente esvaziou um pedido que existia (concluir);
 * - undefined (só no Devolver): campo vazio e nenhum pedido antes, e aí o
 *   servidor mantém/detecta a última lista mandada pelo atendente.
 */
export function ReturnToBotDialog({
  open, onOpenChange, mode, current, lastInboundAt, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'return' | 'edit';
  current: CollectRequestDTO | null;
  lastInboundAt: string | null;
  onConfirm: (value: string | null | undefined) => void;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preset = useInssDocListPreset(open);

  // Cada abertura começa do pedido atual (Editar e Devolver com pedido
  // mantido). Só na abertura: um delta que mude o pedido com o diálogo aberto
  // não apaga o que o atendente está digitando.
  const currentTextRef = useRef(current?.text ?? '');
  currentTextRef.current = current?.text ?? '';
  useEffect(() => {
    if (open) setText(currentTextRef.current);
  }, [open]);

  const normalized = normalizeCollectRequest(text);
  const clearsCurrent = !!current && !normalized;
  const unchanged = !!current && sameCollectRequest(normalized, current.text);
  const warning = open ? windowWarning(lastInboundAt) : null;
  const presetAlreadyIn = !!preset && !!normalized && normalized.includes(preset);

  function applyPreset() {
    if (!preset) return;
    setText((prev) => (normalizeCollectRequest(prev) ? appendListToRequest(prev, preset) : preset));
    textareaRef.current?.focus();
  }

  // Editar sem mudança (ou vazio sem pedido) não tem o que salvar.
  const confirmDisabled = mode === 'edit' && (unchanged || (!current && !normalized));

  function confirm() {
    if (confirmDisabled) return;
    if (mode === 'edit') {
      onConfirm(normalized);
    } else {
      onConfirm(normalized ?? (current ? null : undefined));
    }
    onOpenChange(false);
  }

  const confirmLabel = mode === 'edit'
    ? (clearsCurrent ? 'Concluir o pedido' : 'Salvar')
    : normalized
      ? 'Devolver para a IA'
      : clearsCurrent ? 'Devolver e concluir o pedido' : 'Devolver sem pedido';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Editar o que a IA deve recolher' : 'Devolver para a IA'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'A IA confere cada arquivo contra esta lista, avisa o cliente do que falta e só te devolve quando estiver completa (ou se o cliente travar).'
              : 'A IA volta a responder este cliente. Se você pediu documentos, prints ou dados, escreva abaixo o que ainda falta: ela confere cada arquivo contra a lista, avisa o que falta e só te devolve quando estiver completa (ou se o cliente travar).'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="wa-collect-request" className="text-sm font-semibold text-gray-700">
              O que a IA deve recolher? <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            {preset && (
              <button
                type="button"
                onClick={applyPreset}
                disabled={presetAlreadyIn}
                title={presetAlreadyIn ? 'A lista do INSS já está no pedido' : `Preenche com os itens do fluxo "${INSS_DOC_LIST_FLOW_NAME}"`}
                className="flex shrink-0 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100 disabled:opacity-50"
              >
                <ListPlus className="h-3.5 w-3.5" /> Lista de documentos do INSS
              </button>
            )}
          </div>
          <Textarea
            id="wa-collect-request"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                confirm();
              }
            }}
            maxLength={COLLECT_REQUEST_MAX_CHARS}
            rows={7}
            placeholder={'Ex.: RG ou CNH (frente e verso)\n- comprovante de endereço\n- print do CNIS'}
            className="resize-y text-sm"
          />
          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
            <span>Um item por linha ajuda a IA a conferir. Ctrl+Enter confirma.</span>
            {/* O botão rápido pode passar do teto (maxLength só segura a
                digitação): o servidor corta, e o contador avisa. */}
            <span
              title={text.length > COLLECT_REQUEST_MAX_CHARS ? 'O que passar do limite é cortado ao salvar.' : undefined}
              className={`shrink-0 tabular-nums ${text.length > COLLECT_REQUEST_MAX_CHARS ? 'font-semibold text-red-600' : ''}`}
            >
              {text.length}/{COLLECT_REQUEST_MAX_CHARS}
            </span>
          </div>

          {clearsCurrent && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              O pedido atual ({collectSummary(current.text, 60)}) será concluído: a IA para de conferir e cobrar essa lista.
            </p>
          )}
          {mode === 'return' && unchanged && current && (
            <p className="text-xs text-gray-500">
              O pedido continua o mesmo ({originLabel(current)}); a contagem de cobranças segue.
            </p>
          )}
          {warning && (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {warning}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={confirm}
            disabled={confirmDisabled}
            className="bg-sky-600 text-white hover:bg-sky-700"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Barra acima da thread: o que a IA está recolhendo. Fora do status 'bot' o
 * pedido fica PAUSADO (o cron e o cérebro só agem com a conversa no bot) e
 * volta a valer no Devolver. `readOnly` (linha desativada) esconde as ações;
 * conversa encerrada (pedido mantido no Encerrar) só pode limpar.
 */
export function CollectRequestBar({
  value, status, readOnly, onEdit, onClear,
}: {
  value: CollectRequestDTO;
  status: string;
  readOnly: boolean;
  onEdit: () => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const paused = status !== 'bot';
  const expired = !isCollectRequestLive(new Date(value.at));
  const at = new Date(value.at);
  const meta = [
    originLabel(value),
    Number.isFinite(at.getTime()) ? `há ${formatDistanceToNow(at, { locale: ptBR })}` : null,
    value.nudges > 0 ? `${value.nudges} cobrança${value.nudges > 1 ? 's' : ''} automática${value.nudges > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`shrink-0 border-b px-4 py-2 text-xs ${paused || expired ? 'border-gray-200 bg-gray-50 text-gray-700' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
      <div className="flex items-start gap-2">
        {paused ? <PauseCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" /> : <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />}
        <div className="min-w-0 flex-1">
          <p className={expanded ? '' : 'truncate'}>
            <span className="font-bold">
              {expired ? 'Pedido vencido (a IA ignora):' : paused ? 'Pedido da IA (pausado):' : 'IA recolhendo:'}
            </span>{' '}
            {expanded ? null : collectSummary(value.text)}
          </p>
          {expanded && (
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-black/10 bg-white/70 px-2 py-1.5 text-[12px] leading-snug">
              {value.text}
            </p>
          )}
          <p className="mt-0.5 text-[11px] opacity-70">
            {meta}
            {paused && !expired && ' · a IA só recolhe com a conversa no bot'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md px-1.5 py-0.5 font-semibold hover:bg-black/5"
          >
            {expanded ? 'Recolher' : 'Ver tudo'}
          </button>
          {!readOnly && status !== 'closed' && (
            <button type="button" onClick={onEdit} className="rounded-md px-1.5 py-0.5 font-semibold hover:bg-black/5">
              Editar
            </button>
          )}
          {!readOnly && (
            <button type="button" onClick={onClear} className="rounded-md px-1.5 py-0.5 font-semibold text-red-700 hover:bg-red-50">
              Limpar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pill "Lista" na linha da conversa (lista do inbox, fundo verde-escuro). */
export function CollectRequestPill({ value, status }: { value: CollectRequestDTO; status: string }) {
  const paused = status !== 'bot';
  return (
    <span
      title={`${paused ? 'Pedido da IA (pausado)' : 'IA recolhendo'}: ${collectSummary(value.text, 200)}`}
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold ring-1 ${paused
        ? 'bg-white/5 text-[#a7c9bc] ring-white/15'
        : 'bg-sky-400/15 text-sky-300 ring-sky-400/30'
        }`}
    >
      Lista
    </span>
  );
}

/**
 * Encerrar com pedido em aberto: concluir (a lista não volta a valer) ou
 * manter (se o cliente voltar em até 7 dias, a IA retoma de onde parou).
 * Sem a pergunta, encerrar como "Qualificada" no meio da coleta apagava a
 * lista em silêncio.
 */
export function CloseWithRequestDialog({
  open, onOpenChange, closeLabel, request, onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeLabel: string;
  request: CollectRequestDTO | null;
  onChoose: (choice: 'concluir' | 'manter') => void;
}) {
  function choose(choice: 'concluir' | 'manter') {
    onChoose(choice);
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>A IA ainda está recolhendo uma lista</DialogTitle>
          <DialogDescription>
            Encerrar como &quot;{closeLabel}&quot;. O que fazer com o pedido em aberto?
          </DialogDescription>
        </DialogHeader>
        {request && (
          <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <span className="font-bold">Pedido:</span> {collectSummary(request.text, 160)}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => choose('concluir')}
            className="rounded-lg border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-gray-50"
          >
            <span className="block text-sm font-semibold text-gray-800">Concluir o pedido</span>
            <span className="block text-xs text-gray-500">A lista sai daqui e não volta a valer, mesmo se o cliente mandar mais arquivos.</span>
          </button>
          <button
            type="button"
            onClick={() => choose('manter')}
            className="rounded-lg border border-gray-200 px-3 py-2 text-left transition-colors hover:bg-gray-50"
          >
            <span className="block text-sm font-semibold text-gray-800">Manter o pedido</span>
            <span className="block text-xs text-gray-500">Se o cliente voltar em até 7 dias, a IA retoma a lista de onde parou.</span>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
