/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Label } from '@/app/_shared/ui/label';
import { Button } from '@/app/_shared/ui/button';
import { Badge } from '@/app/_shared/ui/badge';
import { Separator } from '@/app/_shared/ui/separator';
import { Avatar, AvatarFallback } from '@/app/_shared/ui/avatar';
import { MessageSquare, Send, Clock, Trash2, Pencil, Check, X, Bot, Sparkles, ShieldCheck, ShieldAlert, ShieldX, Loader2, ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import { MentionsInput, Mention } from 'react-mentions';
import { toast } from 'sonner';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { createComment } from '@/app/_actions/comments/comment-actions';
import { deleteComment } from '@/app/_actions/comments/delete-comment';
import { updateComment } from '@/app/_actions/comments/update-comment';
import { mentionsStyles } from './constants';
import { renderFormattedText } from '@/app/_shared/utils/render-message';
import { runManualAiAudit, submitAiAuditFeedback, cancelAiAudit, deleteAiAuditComment, type AiAuditFeedbackRating } from '@/app/_actions/ai-audit';
import { usePermissions } from '../_components/PermissionsProvider';

type MentionableUser = { id: string; display: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Auditoria IA ────────────────────────────────────────────────────────────
// Comentários da IA de auditoria começam com "[[AI_AUDIT|tipo|status]]"; os
// feedbacks humanos, com "[[AI_AUDIT_FEEDBACK|commentId|rating]]". Aqui esses
// marcadores viram um cartão destacado com status + botões de avaliação.

const AUDIT_RE = /^\[\[AI_AUDIT\|([a-z_]+)\|([a-z]+)\]\]\n?/;
const AUDIT_PENDING_RE = /^\[\[AI_AUDIT_PENDING\|([a-z_]+)\]\]/;
const AUDIT_FB_RE = /^\[\[AI_AUDIT_FEEDBACK\|([^|]+)\|([a-z_]+)\]\]\n?/;

type AuditInfo = { auditType: string; status: string; body: string };

function parseAudit(text: string): AuditInfo | null {
  const m = AUDIT_RE.exec(text ?? '');
  if (!m) return null;
  return { auditType: m[1], status: m[2], body: text.replace(AUDIT_RE, '') };
}

function parseAuditFeedback(text: string): { auditCommentId: string; rating: string; body: string } | null {
  const m = AUDIT_FB_RE.exec(text ?? '');
  if (!m) return null;
  return { auditCommentId: m[1], rating: m[2], body: text.replace(AUDIT_FB_RE, '') };
}

const AUDIT_STATUS_UI: Record<string, { label: string; icon: React.ElementType; chip: string; ring: string; header: string }> = {
  ok: {
    label: 'Aprovado',
    icon: ShieldCheck,
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    ring: 'border-emerald-200 dark:border-emerald-800',
    header: 'from-emerald-50 to-white dark:from-emerald-900/20 dark:to-zinc-900',
  },
  alerta: {
    label: 'Com alertas',
    icon: ShieldAlert,
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    ring: 'border-amber-200 dark:border-amber-800',
    header: 'from-amber-50 to-white dark:from-amber-900/20 dark:to-zinc-900',
  },
  reprovado: {
    label: 'Reprovado',
    icon: ShieldX,
    chip: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    ring: 'border-red-200 dark:border-red-800',
    header: 'from-red-50 to-white dark:from-red-900/20 dark:to-zinc-900',
  },
  erro: {
    label: 'Falhou',
    icon: ShieldAlert,
    chip: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300',
    ring: 'border-gray-200 dark:border-zinc-700',
    header: 'from-gray-50 to-white dark:from-zinc-800/50 dark:to-zinc-900',
  },
};

const AUDIT_TYPE_LABELS: Record<string, string> = {
  documento_pessoal: 'Documento Pessoal (RG/CNH/CIN)',
  // A chave "inss_roteiro" é legado (está gravada nos comentários antigos) —
  // o rótulo virou "Pré-roteiro" quando surgiu a auditoria de pré-envio.
  inss_roteiro: 'Docs INSS — Pré-roteiro',
  inss_pre_envio: 'Docs INSS — Pré-envio de pastas',
};

const FEEDBACK_LABELS: Record<string, string> = {
  nao: '👎 Não satisfatória',
  sim: '👍 Satisfatória',
  sim_alem: '🌟 Satisfatória, além do esperado',
};

/** Cartão animado exibido enquanto a IA está auditando os documentos. */
function AuditPendingCard({
  commentId,
  auditType,
  canReview,
  onCancelled,
}: {
  commentId: string;
  auditType: string;
  canReview: boolean;
  onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelAiAudit({ pendingCommentId: commentId });
      toast.success('Auditoria cancelada.');
      onCancelled();
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao cancelar.');
      setCancelling(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 border-violet-200 dark:border-violet-800 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-violet-50 via-fuchsia-50 to-violet-50 dark:from-violet-900/20 dark:via-fuchsia-900/10 dark:to-violet-900/20 px-4 py-3 flex items-center gap-3 animate-pulse">
        <span className="relative w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-violet-500 animate-ping" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-violet-800 dark:text-violet-200 leading-tight flex items-center gap-2">
            Auditoria por IA em andamento
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
          </p>
          <p className="text-[11px] font-semibold text-violet-500 dark:text-violet-400">
            {AUDIT_TYPE_LABELS[auditType] ?? auditType} — lendo os documentos do card...
          </p>
        </div>
        {canReview && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-800 bg-white/80 dark:bg-zinc-900/80 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
          >
            {cancelling ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Cancelar
          </button>
        )}
      </div>
      {/* Shimmer de "digitando" */}
      <div className="px-4 py-3 bg-white dark:bg-zinc-900/60 space-y-2">
        <div className="h-2.5 w-3/4 rounded-full bg-violet-100 dark:bg-violet-900/30 animate-pulse" />
        <div className="h-2.5 w-1/2 rounded-full bg-violet-100 dark:bg-violet-900/30 animate-pulse [animation-delay:150ms]" />
        <div className="h-2.5 w-2/3 rounded-full bg-violet-100 dark:bg-violet-900/30 animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}

/** Cartão destacado de uma auditoria da IA, com botões de feedback. */
function AuditCard({
  comment,
  audit,
  canReview,
  hasFeedback,
  onFeedbackSent,
  onDelete,
}: {
  comment: any;
  audit: AuditInfo;
  canReview: boolean;
  hasFeedback: boolean;
  onFeedbackSent: () => void;
  onDelete: () => void;
}) {
  const ui = AUDIT_STATUS_UI[audit.status] ?? AUDIT_STATUS_UI.erro;
  const StatusIcon = ui.icon;
  const [pendingRating, setPendingRating] = useState<AiAuditFeedbackRating | null>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendFeedback(rating: AiAuditFeedbackRating, withReason: boolean) {
    if (withReason && !reason.trim()) { toast.error('Descreva o motivo para ajudar a IA a melhorar.'); return; }
    setSending(true);
    try {
      await submitAiAuditFeedback({ commentId: comment.id, rating, reason: withReason ? reason : undefined });
      setSent(true);
      setPendingRating(null);
      setReason('');
      toast.success('Feedback registrado — obrigado!');
      onFeedbackSent();
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao registrar feedback.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`rounded-2xl border-2 ${ui.ring} overflow-hidden shadow-sm`}>
      {/* Cabeçalho */}
      <div className={`bg-gradient-to-r ${ui.header} px-4 py-3 flex items-center justify-between gap-2 flex-wrap`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-gray-900 dark:text-zinc-100 leading-tight">Auditoria por IA</p>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 truncate">
              {AUDIT_TYPE_LABELS[audit.auditType] ?? audit.auditType}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${ui.chip}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {ui.label}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-zinc-500">
            <Clock className="w-3 h-3" />
            {new Date(comment.createdAt).toLocaleString('pt-BR')}
          </span>
          {canReview && (
            <button
              onClick={onDelete}
              title="Excluir auditoria"
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Corpo */}
      <div className="px-4 py-3 bg-white dark:bg-zinc-900/60">
        <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {renderFormattedText(audit.body)}
        </p>
      </div>

      {/* Feedback */}
      {canReview && audit.status !== 'erro' && (
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950/40">
          {hasFeedback || sent ? (
            <p className="text-[11px] font-semibold text-gray-400 dark:text-zinc-500 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-500" /> Avaliação registrada — veja abaixo nos comentários.
            </p>
          ) : pendingRating ? (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-600 dark:text-zinc-300">
                {pendingRating === 'nao' ? 'O que faltou ou saiu errado na análise?' : 'O que a IA fez além do esperado?'}
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Descreva o motivo — isso alimenta o aprimoramento da IA."
                className="w-full text-sm rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-zinc-900 p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={sending} onClick={() => sendFeedback(pendingRating, true)} className="h-7 bg-violet-600 hover:bg-violet-700 text-xs">
                  {sending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                  Enviar feedback
                </Button>
                <Button size="sm" variant="ghost" disabled={sending} onClick={() => setPendingRating(null)} className="h-7 text-xs">
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                A resposta foi satisfatória?
              </span>
              <button
                onClick={() => setPendingRating('nao')}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-800 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              >
                <ThumbsDown className="w-3 h-3" /> Não
              </button>
              <button
                onClick={() => sendFeedback('sim', false)}
                disabled={sending}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
              >
                <ThumbsUp className="w-3 h-3" /> Sim
              </button>
              <button
                onClick={() => setPendingRating('sim_alem')}
                className="inline-flex items-center gap-1 rounded-full border border-violet-200 dark:border-violet-800 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
              >
                <Star className="w-3 h-3" /> Sim, além do esperado
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  cardId: string;
  isProcess: boolean;
}

export function CommentsTab({ cardId, isProcess }: Props) {
  const { data: session } = useSession();
  const params = new URLSearchParams();
  if (isProcess) params.set('processId', cardId);
  else params.set('userId', cardId);

  const { data: comments = [], mutate } = useSWR(`/api/comments?${params}`, fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 8_000,
  });

  const { data: mentionUsers = [] } = useSWR<MentionableUser[]>('/api/admins', fetcher);

  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  async function send() {
    if (!newComment.trim()) return;
    try {
      await createComment({
        text: newComment,
        ...(isProcess ? { processId: cardId } : { userId: cardId }),
      });
      setNewComment('');
      mutate();
      toast.success('Comentário adicionado!');
    } catch (err) {
      console.error(err);
      toast.error('Falha ao enviar comentário.');
    }
  }

  async function handleDelete(commentId: string) {
    if (!(await confirm({
      title: 'Excluir comentário',
      description: 'Essa ação não pode ser desfeita.',
    }))) return;
    setLoadingId(commentId);
    try {
      await deleteComment(commentId);
      mutate();
      toast.success('Comentário excluído.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao excluir.');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleEdit(commentId: string) {
    if (!editText.trim()) return;
    setLoadingId(commentId);
    try {
      await updateComment({ commentId, text: editText });
      setEditingId(null);
      mutate();
      toast.success('Comentário atualizado.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao editar.');
    } finally {
      setLoadingId(null);
    }
  }

  const currentUserId = session?.user?.id;
  const isBot = (c: any) => (c.authorName as string)?.includes('Bot') || (c.authorName as string)?.includes('Automação');

  async function handleDeleteAudit(commentId: string) {
    if (!(await confirm({
      title: 'Excluir auditoria',
      description: 'A auditoria e os feedbacks ligados a ela serão apagados. Essa ação não pode ser desfeita.',
    }))) return;
    try {
      await deleteAiAuditComment({ commentId });
      mutate();
      toast.success('Auditoria excluída.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao excluir a auditoria.');
    }
  }

  // Auditoria IA: permissão + disparo manual + feedbacks já registrados.
  const { perms } = usePermissions();
  const canAudit = !!perms?.run_ai_audit;
  const [auditing, setAuditing] = useState<string | null>(null);
  const feedbackByAudit = new Set(
    (comments as any[])
      .map((c) => parseAuditFeedback(c.text)?.auditCommentId)
      .filter(Boolean) as string[],
  );

  async function triggerAudit(auditType: 'documento_pessoal' | 'inss_roteiro' | 'inss_pre_envio') {
    // Já existe auditoria deste tipo no card? Confirma antes de refazer.
    const existing = (comments as any[]).some((c) => parseAudit(c.text)?.auditType === auditType);
    if (existing) {
      const ok = await confirm({
        title: 'Refazer auditoria?',
        description: `Este card já tem uma auditoria de ${AUDIT_TYPE_LABELS[auditType]?.toLowerCase() ?? auditType}. Deseja rodar de novo? A auditoria anterior continua nos comentários (você pode excluí-la pelo ícone de lixeira).`,
        tone: 'default',
        confirmLabel: 'Refazer',
      });
      if (!ok) return;
    }
    // Alguma auditoria ainda em andamento? Não empilha outra.
    const running = (comments as any[]).some((c) => AUDIT_PENDING_RE.test(c.text ?? ''));
    if (running) {
      toast.error('Já existe uma auditoria em andamento neste card — aguarde ou cancele.');
      return;
    }
    setAuditing(auditType);
    try {
      // O placeholder "[[AI_AUDIT_PENDING|...]]" é criado no servidor logo no
      // início — estes mutate() antecipados fazem o cartão de carregamento
      // aparecer na lista sem esperar a auditoria terminar.
      setTimeout(() => mutate(), 1200);
      setTimeout(() => mutate(), 3000);
      await runManualAiAudit({ cardId, isProcess, auditType });
      mutate();
      toast.success('Auditoria concluída! Veja o resultado nos comentários.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao rodar a auditoria.');
    } finally {
      setAuditing(null);
    }
  }

  return (
    <div className="space-y-6 px-10 pt-6">
      {confirmDialog}
      <div className="space-y-4">
        {/* Nova mensagem */}
        <div className="space-y-2 relative">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
              <MessageSquare className="w-3 h-3" />
              Novo Comentário / Discussão
            </Label>
            {canAudit && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-500 dark:text-violet-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Auditoria IA:
                </span>
                <button
                  onClick={() => triggerAudit('documento_pessoal')}
                  disabled={!!auditing}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors disabled:opacity-50"
                >
                  {auditing === 'documento_pessoal' && <Loader2 className="w-3 h-3 animate-spin" />}
                  Documento pessoal
                </button>
                <button
                  onClick={() => triggerAudit('inss_roteiro')}
                  disabled={!!auditing}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors disabled:opacity-50"
                >
                  {auditing === 'inss_roteiro' && <Loader2 className="w-3 h-3 animate-spin" />}
                  Docs INSS — pré-roteiro
                </button>
                <button
                  onClick={() => triggerAudit('inss_pre_envio')}
                  disabled={!!auditing}
                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-2.5 py-1 text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors disabled:opacity-50"
                >
                  {auditing === 'inss_pre_envio' && <Loader2 className="w-3 h-3 animate-spin" />}
                  Docs INSS — pré-envio
                </button>
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-visible focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <MentionsInput
              value={newComment}
              onChange={(e: any) => setNewComment(e.target.value)}
              placeholder="Comente e use @ para mencionar membros da equipe... Use **negrito** ou *itálico*"
              style={mentionsStyles}
              allowSuggestionsAboveCursor
            >
              <Mention
                trigger="@"
                data={mentionUsers}
                markup="@[__display__](__id__)"
                displayTransform={(_id: string, display: string) => `@${display}`}
                renderSuggestion={(s: any) => (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold">
                      {s.display.charAt(0)}
                    </div>
                    <span className="font-semibold text-sm">{s.display}</span>
                  </div>
                )}
                appendSpaceOnAdd
              />
            </MentionsInput>
            <div className="bg-gray-50 dark:bg-zinc-950 px-3 py-2 border-t flex items-center justify-between">
              <p className="text-[10px] text-gray-400">**negrito**  *itálico*  Enter = nova linha</p>
              <Button onClick={send} size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 px-4">
                <Send className="w-3 h-3 mr-2" /> Publicar
              </Button>
            </div>
          </div>
        </div>

        <Separator className="bg-gray-100 dark:bg-zinc-800" />

        {/* Lista de comentários */}
        <div className="space-y-6 max-h-[400px] overflow-y-auto">
          {comments.length === 0 ? (
            <div className="text-center py-16 opacity-40">
              <MessageSquare className="w-12 h-12 mx-auto mb-3" />
              <p className="font-bold">Sem discussões</p>
              <p className="text-sm">Seja o primeiro a comentar.</p>
            </div>
          ) : (
            comments.map((c: any) => {
              // Auditoria em andamento → cartão animado de carregamento.
              const pendingMatch = AUDIT_PENDING_RE.exec(c.text ?? '');
              if (pendingMatch) {
                return (
                  <AuditPendingCard
                    key={c.id}
                    commentId={c.id}
                    auditType={pendingMatch[1]}
                    canReview={canAudit}
                    onCancelled={() => mutate()}
                  />
                );
              }

              // Auditoria da IA → cartão destacado com status e feedback.
              const audit = parseAudit(c.text);
              if (audit) {
                return (
                  <AuditCard
                    key={c.id}
                    comment={c}
                    audit={audit}
                    canReview={canAudit}
                    hasFeedback={feedbackByAudit.has(c.id)}
                    onFeedbackSent={() => mutate()}
                    onDelete={() => handleDeleteAudit(c.id)}
                  />
                );
              }

              // Feedback humano sobre uma auditoria → balão compacto violeta.
              const fb = parseAuditFeedback(c.text);
              if (fb) {
                return (
                  <div key={c.id} className="flex items-start gap-2.5 pl-6">
                    <span className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 mt-0.5">
                      <Star className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                    </span>
                    <div className="flex-1 min-w-0 rounded-xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-900/10 px-3 py-2">
                      <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300 flex items-center gap-2 flex-wrap">
                        {c.authorName} avaliou a auditoria
                        <span className="font-black">{FEEDBACK_LABELS[fb.rating] ?? fb.rating}</span>
                        <span className="font-medium text-violet-400 ml-auto">{new Date(c.createdAt).toLocaleString('pt-BR')}</span>
                      </p>
                      {fb.body.trim() && (
                        <p className="text-xs text-gray-600 dark:text-zinc-300 mt-1 whitespace-pre-wrap">
                          {renderFormattedText(fb.body)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              const bot = isBot(c);
              const isOwner = currentUserId && c.authorId === currentUserId;
              const isEditing = editingId === c.id;
              const busy = loadingId === c.id;

              return (
                <div key={c.id} className="flex gap-4 group">
                  <Avatar className={`w-10 h-10 border shadow-sm shrink-0 ${bot ? 'bg-yellow-50 border-yellow-200' : ''}`}>
                    <AvatarFallback className={`font-bold text-xs uppercase ${bot ? 'bg-yellow-50 text-yellow-600' : 'bg-blue-50 text-blue-600'}`}>
                      {bot ? <Bot className="w-4 h-4" /> : (typeof c.author === 'string' ? c.author : c.author?.name ?? 'U').charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <h5 className="text-sm font-black text-gray-900 dark:text-zinc-100 flex items-center gap-2 flex-wrap">
                        {c.authorName ?? (typeof c.author === 'string' ? c.author : c.author?.name)}
                        <Badge variant="secondary" className={`text-[9px] h-4 font-bold uppercase tracking-widest border-none ${bot ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-gray-100 dark:bg-zinc-800'}`}>
                          {bot ? '🤖 BOT' : 'MEMBRO'}
                        </Badge>
                      </h5>
                      <div className="flex items-center gap-2 text-gray-400 dark:text-zinc-500 shrink-0">
                        <Clock className="w-3 h-3" />
                        <span className="text-[11px] font-medium">
                          {new Date(c.createdAt).toLocaleString('pt-BR')}
                        </span>
                        {/* Botões editar/excluir — só para o autor */}
                        {isOwner && !isEditing && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingId(c.id); setEditText(c.text); }}
                              disabled={busy}
                              className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(c.id)}
                              disabled={busy}
                              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                          className="w-full text-sm rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-900 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleEdit(c.id)}
                            disabled={busy || !editText.trim()}
                            className="h-7 bg-blue-600 hover:bg-blue-700"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            {busy ? 'Salvando...' : 'Salvar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                            disabled={busy}
                            className="h-7"
                          >
                            <X className="w-3 h-3 mr-1" /> Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-4 rounded-2xl rounded-tl-none border shadow-sm ${bot ? 'bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-100 dark:border-yellow-900/30' : 'bg-gray-50 dark:bg-zinc-950/80 border-gray-100 dark:border-zinc-800'}`}>
                        <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                          {renderFormattedText(c.text)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
