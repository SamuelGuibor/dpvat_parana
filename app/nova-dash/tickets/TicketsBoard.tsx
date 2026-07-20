'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { Ticket, RefreshCw } from 'lucide-react';
import { Button } from '@/app/_shared/ui/button';
import { CreateTicketDialog } from './CreateTicketDialog';
import { TicketCard } from './TicketCard';
import { DevTicketDto, STATUS_META, TICKET_STATUS_FLOW } from './constants';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Filter = 'todos' | 'meus';

export function TicketsBoard() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<Filter>('todos');

  const { data: tickets = [], isLoading, mutate } = useSWR<DevTicketDto[]>('/api/dev-tickets', fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 10_000,
  });

  const myId = session?.user?.id;
  const visible = useMemo(() => {
    if (!Array.isArray(tickets)) return [];
    if (filter === 'meus' && myId) {
      return tickets.filter((t) => t.creatorId === myId || t.assigneeId === myId);
    }
    return tickets;
  }, [tickets, filter, myId]);

  const byStatus = useMemo(() => {
    const groups = Object.fromEntries(TICKET_STATUS_FLOW.map((s) => [s, [] as DevTicketDto[]]));
    for (const t of visible) {
      (groups[t.status] ?? groups.EM_DISTRIBUICAO).push(t);
    }
    // A API devolve em ordem de criação (fila FIFO); em Concluído faz mais
    // sentido ver as entregas mais recentes primeiro.
    groups.CONCLUIDO.reverse();
    return groups;
  }, [visible]);

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-gray-900 dark:text-zinc-100 flex items-center gap-2">
            <Ticket className="w-5 h-5 text-blue-600" />
            Tickets Dev
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Reporte bugs e alterações do site. Os devs assumem os tickets e você acompanha cada fase aqui.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 p-1">
            {([['todos', 'Todos'], ['meus', 'Meus tickets']] as [Filter, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors ${
                  filter === value
                    ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => mutate()}
            title="Atualizar"
            className="h-10 w-10 rounded-xl"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <CreateTicketDialog onCreated={() => mutate()} />
        </div>
      </div>

      {/* Colunas por fase */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {TICKET_STATUS_FLOW.map((statusKey) => {
          const meta = STATUS_META[statusKey];
          const StatusIcon = meta.icon;
          const columnTickets = byStatus[statusKey] ?? [];

          return (
            <div key={statusKey} className="bg-gray-50/80 dark:bg-zinc-900/40 rounded-2xl border border-gray-200/70 dark:border-zinc-800 p-3 space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className={`flex items-center gap-2 font-black text-xs uppercase tracking-widest ${meta.header}`}>
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  <StatusIcon className="w-3.5 h-3.5" />
                  {meta.label}
                </div>
                <span className="text-[11px] font-extrabold text-gray-400 dark:text-zinc-500 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-full px-2 py-0.5">
                  {columnTickets.length}
                </span>
              </div>

              {columnTickets.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-800 py-8 text-center">
                  <p className="text-xs text-gray-400 dark:text-zinc-600">Nenhum ticket aqui</p>
                </div>
              ) : (
                columnTickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} onChanged={() => mutate()} />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
