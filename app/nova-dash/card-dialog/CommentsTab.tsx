/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { Label } from '@/app/_components/ui/label';
import { Button } from '@/app/_components/ui/button';
import { Badge } from '@/app/_components/ui/badge';
import { Separator } from '@/app/_components/ui/separator';
import { Avatar, AvatarFallback } from '@/app/_components/ui/avatar';
import { MessageSquare, Send, Clock } from 'lucide-react';
import { MentionsInput, Mention } from 'react-mentions';
import { toast } from 'sonner';
import useSWR from 'swr';
import { createComment } from '@/app/_actions/comment-actions';
import { MENTIONABLE_USERS, mentionsStyles } from './constants';

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

const renderText = (text: string) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(mentionRegex)) {
    const [full, display, id] = m;
    const idx = m.index ?? 0;
    parts.push(text.slice(last, idx));
    const c = colorFromId(id);
    parts.push(
      <Badge key={`${id}-${idx}`} variant="secondary" className={`mx-1 ${c.bg} ${c.text} ${c.border}`}>
        @{display}
      </Badge>
    );
    last = idx + full.length;
  }
  parts.push(text.slice(last));
  return parts;
};

export function CommentsTab({ cardId, isProcess }: Props) {
  const params = new URLSearchParams();
  if (isProcess) params.set('processId', cardId);
  else params.set('userId', cardId);

  const { data: comments = [], mutate } = useSWR(`/api/comments?${params}`, fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 8_000,
  });

  const [newComment, setNewComment] = useState('');

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

  return (
    <div className="space-y-6 px-10 pt-6">
      <div className="space-y-4">
        <div className="space-y-2 relative">
          <Label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <MessageSquare className="w-3 h-3" />
            Novo Comentário / Discussão
          </Label>
          <div className="bg-white rounded-xl border border-gray-200 overflow-visible focus-within:ring-2 focus-within:ring-blue-500 transition-all">
            <MentionsInput
              value={newComment}
              onChange={(e: any) => setNewComment(e.target.value)}
              placeholder="Comente e use @ para mencionar membros da equipe..."
              style={mentionsStyles}
            >
              <Mention
                trigger="@"
                data={MENTIONABLE_USERS}
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
            <div className="bg-gray-50 px-3 py-2 border-t flex items-center justify-between">
              <Button onClick={send} size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 px-4">
                <Send className="w-3 h-3 mr-2" /> Publicar
              </Button>
            </div>
          </div>
        </div>

        <Separator className="bg-gray-100" />

        <div className="space-y-6 max-h-[400px]">
          {comments.length === 0 ? (
            <div className="text-center py-16 opacity-40">
              <MessageSquare className="w-12 h-12 mx-auto mb-3" />
              <p className="font-bold">Sem discussões</p>
              <p className="text-sm">Seja o primeiro a comentar.</p>
            </div>
          ) : (
            comments.map((c: any) => (
              <div key={c.id} className="flex gap-4">
                <Avatar className="w-10 h-10 border shadow-sm">
                  <AvatarFallback className="bg-blue-50 text-blue-600 font-bold text-xs uppercase">
                    {(typeof c.author === 'string' ? c.author : c.author?.name ?? 'U').charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-sm font-black text-gray-900 flex items-center gap-2">
                      {typeof c.author === 'string' ? c.author : c.author?.name}
                      <Badge variant="secondary" className="text-[9px] h-4 bg-gray-100 font-bold uppercase tracking-widest border-none">
                        MEMBRO
                      </Badge>
                    </h5>
                    <div className="flex items-center gap-2 text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span className="text-[11px] font-medium">
                        {new Date(c.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-50/80 p-4 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm">
                    <p className="text-sm text-gray-700 leading-relaxed">{renderText(c.text)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}