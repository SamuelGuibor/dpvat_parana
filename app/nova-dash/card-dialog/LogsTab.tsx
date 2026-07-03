/* eslint-disable @typescript-eslint/no-explicit-any */
import { Label } from '@/app/_components/ui/label';
import { Badge } from '@/app/_components/ui/badge';
import { Separator } from '@/app/_components/ui/separator';
import { Button } from '@/app/_components/ui/button';
import {
  History, Pencil, ArrowRightLeft, FilePlus, FileMinus,
  MessageSquare, Sparkles, Clock, RefreshCw, ArrowRight,
} from 'lucide-react';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  cardId: string;
  isProcess: boolean;
}

interface LogItem {
  id: string;
  action: string;
  message: string;
  authorId: string;
  authorName: string;
  metadata: any;
  createdAt: string;
}

// Estilo (ícone + cores) por tipo de evento. Classes estáticas para o Tailwind.
const ACTION_STYLES: Record<
  string,
  { icon: React.ElementType; node: string; badge: string; label: string }
> = {
  update: {
    icon: Pencil,
    node: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    label: 'Edição',
  },
  move: {
    icon: ArrowRightLeft,
    node: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
    badge: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
    label: 'Movimentação',
  },
  document_add: {
    icon: FilePlus,
    node: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    label: 'Documento',
  },
  document_remove: {
    icon: FileMinus,
    node: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    label: 'Documento',
  },
  comment_add: {
    icon: MessageSquare,
    node: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    label: 'Comentário',
  },
  create: {
    icon: Sparkles,
    node: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400',
    badge: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800',
    label: 'Criação',
  },
};

const FALLBACK_STYLE = {
  icon: History,
  node: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400',
  badge: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  label: 'Atividade',
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase() || 'U';
}

function dayLabel(date: Date) {
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}

// Comentários guardam as menções no formato bruto "@[Nome](id)". Aqui trocamos
// isso por só o nome destacado (com @), escondendo o id que poluía o log.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;
function renderMentions(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = MENTION_RE.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <span key={key++} className="not-italic font-semibold text-amber-700 dark:text-amber-400">
        @{match[1]}
      </span>,
    );
    lastIndex = MENTION_RE.lastIndex;
  }
  MENTION_RE.lastIndex = 0;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// Detalhes extras renderizados abaixo da mensagem, conforme o tipo de evento.
function LogDetails({ log }: { log: LogItem }) {
  const meta = log.metadata ?? {};

  if (log.action === 'move' && (meta.from || meta.to)) {
    return (
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {meta.from && (
          <Badge variant="outline" className="font-medium text-[11px] bg-gray-50 dark:bg-zinc-800">
            {meta.from}
          </Badge>
        )}
        <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
        <Badge variant="outline" className="font-medium text-[11px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300">
          {meta.to}
        </Badge>
      </div>
    );
  }

  if (log.action === 'update' && Array.isArray(meta.fields) && meta.fields.length) {
    return (
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {meta.fields.map((f: string, i: number) => (
          <Badge key={i} variant="secondary" className="text-[10px] font-medium bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
            {f}
          </Badge>
        ))}
      </div>
    );
  }

  if (log.action === 'comment_add' && meta.preview) {
    return (
      <p className="mt-2 text-xs italic text-gray-500 dark:text-zinc-400 border-l-2 border-amber-300 dark:border-amber-700 pl-2 line-clamp-2">
        “{renderMentions(meta.preview)}”
      </p>
    );
  }

  return null;
}

export function LogsTab({ cardId, isProcess }: Props) {
  const params = new URLSearchParams();
  if (isProcess) params.set('processId', cardId);
  else params.set('userId', cardId);

  const { data: logs = [], isLoading, mutate } = useSWR<LogItem[]>(
    `/api/logs?${params}`,
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 15_000 },
  );

  // Agrupa por dia para exibir cabeçalhos "Hoje / Ontem / data".
  const groups: { key: string; label: string; items: LogItem[] }[] = [];
  for (const log of logs) {
    const d = new Date(log.createdAt);
    const key = format(d, 'yyyy-MM-dd');
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, label: dayLabel(d), items: [] };
      groups.push(group);
    }
    group.items.push(log);
  }

  return (
    <div className="space-y-5 px-6 pt-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          Histórico de Atividades
          {logs.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 text-[10px] font-bold">
              {logs.length}
            </Badge>
          )}
        </Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => mutate()}
          className="h-7 text-xs text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className={`w-3 h-3 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Separator className="bg-gray-100 dark:bg-zinc-800" />

      {/* Timeline */}
      <div className="max-h-[460px] overflow-y-auto px-5">
        {isLoading && logs.length === 0 ? (
          <div className="space-y-4 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-zinc-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 bg-gray-100 dark:bg-zinc-800 rounded" />
                  <div className="h-3 w-2/3 bg-gray-100 dark:bg-zinc-800 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 opacity-40">
            <History className="w-12 h-12 mx-auto mb-3" />
            <p className="font-bold">Sem atividades ainda</p>
            <p className="text-sm">As alterações feitas neste card aparecerão aqui.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key}>
                {/* Cabeçalho do dia */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    {group.label}
                  </span>
                  <span className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
                </div>

                <ol className="relative ml-1 border-l-2 border-gray-100 dark:border-zinc-800 space-y-4">
                  {group.items.map((log) => {
                    const style = ACTION_STYLES[log.action] ?? FALLBACK_STYLE;
                    const Icon = style.icon;
                    const date = new Date(log.createdAt);
                    return (
                      <li key={log.id} className="ml-5">
                        {/* Nó da timeline */}
                        <span
                          className={`absolute -left-[15px] flex items-center justify-center w-7 h-7 rounded-full ring-4 ring-white dark:ring-zinc-900 ${style.node}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </span>

                        <div className="rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-sm px-3.5 py-2.5 hover:border-gray-200 dark:hover:border-zinc-700 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-gray-700 dark:text-zinc-300 leading-snug">
                                {/* Avatar textual + autor */}
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-zinc-800 text-[9px] font-bold text-gray-600 dark:text-zinc-300 mr-1.5 align-middle">
                                  {initials(log.authorName)}
                                </span>
                                <strong className="font-bold text-gray-900 dark:text-zinc-100">
                                  {log.authorName}
                                </strong>{' '}
                                {log.message}
                              </p>
                              <LogDetails log={log} />
                            </div>

                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[9px] h-5 font-bold uppercase tracking-wider ${style.badge}`}
                            >
                              {style.label}
                            </Badge>
                          </div>

                          <div
                            className="flex items-center gap-1 mt-1.5 text-[11px] text-gray-400 dark:text-zinc-500"
                            title={format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          >
                            <Clock className="w-3 h-3" />
                            <span className="capitalize">
                              {formatDistanceToNow(date, { addSuffix: true, locale: ptBR })}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
