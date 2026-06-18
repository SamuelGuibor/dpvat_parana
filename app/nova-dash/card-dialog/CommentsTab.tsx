/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Label } from '@/app/_components/ui/label';
import { Button } from '@/app/_components/ui/button';
import { Badge } from '@/app/_components/ui/badge';
import { Separator } from '@/app/_components/ui/separator';
import { Avatar, AvatarFallback } from '@/app/_components/ui/avatar';
import { MessageSquare, Send, Clock, Trash2, Pencil, Check, X, Bot } from 'lucide-react';
import { MentionsInput, Mention } from 'react-mentions';
import { toast } from 'sonner';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { createComment } from '@/app/_actions/comment-actions';
import { deleteComment } from '@/app/_actions/delete-comment';
import { updateComment } from '@/app/_actions/update-comment';
import { mentionsStyles } from './constants';

type MentionableUser = { id: string; display: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  cardId: string;
  isProcess: boolean;
}

const mentionRegex = /@\[(.+?)\]\((.+?)\)/g;
const palette = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
];

const colorFromId = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
};

// Renderiza texto com suporte a menções, quebras de linha e markdown básico (**bold**, *itálico*)
function renderFormattedText(text: string): React.ReactNode[] {
  // Divide o texto em linhas primeiro
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) nodes.push(<br key={`br-${lineIdx}`} />);

    // Processa menções e markdown em cada linha
    const segments = parseSegments(line);
    segments.forEach((seg, segIdx) => {
      nodes.push(<span key={`${lineIdx}-${segIdx}`}>{seg}</span>);
    });
  });

  return nodes;
}

function parseSegments(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Padrão combinado: menções (@[...](id)) + bold (**...**) + itálico (*...*)
  const combined = /(@\[(.+?)\]\((.+?)\))|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;

  for (const m of text.matchAll(combined)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));

    if (m[1]) {
      // Menção
      const display = m[2];
      const id = m[3];
      const c = colorFromId(id);
      parts.push(
        <Badge key={`${id}-${idx}`} variant="secondary" className={`mx-1 ${c.bg} ${c.text} ${c.border}`}>
          @{display}
        </Badge>
      );
    } else if (m[4] !== undefined) {
      // **bold**
      parts.push(<strong key={`b-${idx}`} className="font-bold">{m[4]}</strong>);
    } else if (m[5] !== undefined) {
      // *itálico*
      parts.push(<em key={`i-${idx}`} className="italic">{m[5]}</em>);
    }

    last = idx + m[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
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
    if (!confirm('Deseja excluir este comentário?')) return;
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

  return (
    <div className="space-y-6 px-10 pt-6">
      <div className="space-y-4">
        {/* Nova mensagem */}
        <div className="space-y-2 relative">
          <Label className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <MessageSquare className="w-3 h-3" />
            Novo Comentário / Discussão
          </Label>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-visible focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <MentionsInput
              value={newComment}
              onChange={(e: any) => setNewComment(e.target.value)}
              placeholder="Comente e use @ para mencionar membros da equipe... Use **negrito** ou *itálico*"
              style={mentionsStyles}
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
