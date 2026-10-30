/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Badge } from '@/app/_shared/ui/badge';
import { Avatar, AvatarFallback } from '@/app/_shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/_shared/ui/dropdown-menu';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import { ArrowRight, ImageIcon, Loader2, MessageSquare, MoreHorizontal, Trash2, UserPlus } from 'lucide-react';
import { assumeDevTicket, deleteDevTicket, setDevTicketStatus } from '@/app/_actions/dev-tickets/ticket-actions';
import { isKnowledgeType, nextStatus, shortTicketId, statusesFor, temConflito } from '@/app/_shared/utils/cerebro';
import { usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';
import { DevTicketDto, STATUS_META, TYPE_META, TicketStatus, ageLabel, initials, ticketImages } from './constants';
import { TicketDetail } from './TicketDetail';
import { TicketGallery, TicketZoom } from './TicketPhotos';

interface Props {
  ticket: DevTicketDto;
  onChanged: () => void;
  /** Setor da sugestão, já resolvido pelo quadro (undefined = sem setor). */
  setor?: { name: string; color: string };
}

/** Faixa de alerta do card (conflito, desatualizado, amostra pendente…). */
export function ticketFlag(ticket: DevTicketDto): { text: string; cls: string } | null {
  const m = ticket.meta;
  if (!m) return null;
  if (m.lote) {
    const total = m.lote.amostra.length;
    const feitas = Object.keys(m.lote.decisoes ?? {}).length;
    const devolvidas = Object.values(m.lote.decisoes ?? {}).filter((d) => d.decisao === 'devolver').length;
    if (devolvidas) return { text: `${devolvidas} nota(s) da amostra devolvida(s) ao redator`, cls: 'bg-orange-50 text-orange-800' };
    if (feitas < total) return { text: `Amostra humana: ${total - feitas} de ${total} para conferir`, cls: 'bg-violet-50 text-violet-800' };
    return { text: 'Amostra conferida', cls: 'bg-emerald-50 text-emerald-800' };
  }
  if (temConflito(m)) return { text: 'Conflito com a automação ativa', cls: 'bg-orange-50 text-orange-800' };
  if (ticket.type === 'DESATUALIZADO') return { text: 'Nota fora de uso até revalidar', cls: 'bg-rose-50 text-rose-800' };
  if (ticket.type === 'LACUNA' && m.cardsAtivos) return { text: `${m.cardsAtivos} card(s) ativo(s) esperando o procedimento`, cls: 'bg-amber-50 text-amber-900' };
  return null;
}

export function TicketCard({ ticket, onChanged, setor }: Props) {
  const { data: session } = useSession();
  const { perms } = usePermissions();
  const [busy, setBusy] = useState(false);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const images = ticketImages(ticket);
  const meta = TYPE_META[ticket.type] ?? TYPE_META.OUTRO;
  const TypeIcon = meta.icon;
  const allowed = statusesFor(ticket.type);
  const status = (allowed.includes(ticket.status as TicketStatus) ? ticket.status : 'EM_DISTRIBUICAO') as TicketStatus;
  const next = nextStatus(ticket.type, status);
  const concluded = status === 'CONCLUIDO';
  const knowledge = isKnowledgeType(ticket.type);
  // Card de conhecimento: só quem tem Base de conhecimento assume/move (o servidor confere de novo).
  const canAct = !knowledge || perms.manage_knowledge;
  const isMine = session?.user?.id === ticket.assigneeId;
  const canDelete = canAct && (session?.user?.id === ticket.creatorId || session?.user?.role === 'ADMIN++');
  const flag = ticketFlag(ticket);
  const who = ticket.assigneeName ?? ticket.creatorName;

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      onChanged();
      toast.success(okMsg);
    } catch (err: any) {
      console.error(err);
      // Em produção o erro da server action chega mascarado: mensagem própria.
      toast.error(err?.message && !/Server Components render/.test(err.message) ? err.message : 'Não foi possível atualizar o ticket.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!(await confirm({
      title: 'Excluir ticket',
      description: `"${ticket.title}" será excluído permanentemente.`,
    }))) return;
    await run(() => deleteDevTicket(ticket.id), 'Ticket excluído.');
  }

  return (
    <div
      className={`group cursor-pointer space-y-2 rounded-lg border border-transparent bg-white px-3 pb-2 pt-2.5 shadow-[0_1px_2px_rgba(20,40,30,.08),0_1px_6px_rgba(20,40,30,.05)] transition hover:border-[#1a6649] ${concluded ? 'opacity-85' : ''}`}
      onClick={() => setDetailOpen(true)}
    >
      <div onClick={(e) => e.stopPropagation()}>{confirmDialog}</div>

      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-[1.35] text-gray-900">{ticket.title}</h4>
        {canAct && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button
                className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-gray-400 opacity-0 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:opacity-100 group-hover:opacity-100"
                aria-label="Ações do ticket"
                disabled={busy}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {!ticket.assigneeId && !concluded && (
                <>
                  <DropdownMenuItem onClick={() => run(() => assumeDevTicket(ticket.id), 'Ticket assumido! Ele foi para Em Análise.')}>
                    <UserPlus className="mr-2 h-3.5 w-3.5" />
                    Assumir
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-gray-400">Mover para</DropdownMenuLabel>
              {allowed.filter((s) => s !== status).map((s) => {
                const sMeta = STATUS_META[s];
                const SIcon = sMeta.icon;
                return (
                  <DropdownMenuItem key={s} onClick={() => run(() => setDevTicketStatus(ticket.id, s), `Ticket movido para ${sMeta.label}.`)}>
                    <SIcon className="mr-2 h-3.5 w-3.5" />
                    {sMeta.label}
                  </DropdownMenuItem>
                );
              })}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600">
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Excluir ticket
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {flag && <div className={`rounded-[5px] px-2 py-1 text-[11px] font-medium ${flag.cls}`}>{flag.text}</div>}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={`gap-1 rounded border-none px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${meta.badge}`}>
          <TypeIcon className="h-3 w-3" />
          {meta.label}
        </Badge>
        {ticket.meta?.hospital && (
          <Badge className="max-w-[160px] truncate rounded border-none bg-[#eceeea] px-1.5 py-0 text-[10.5px] font-medium text-[#4f5a55]" title={ticket.meta.hospital}>
            {ticket.meta.hospital}
          </Badge>
        )}
        {ticket.meta?.skill && (
          <Badge className="rounded border-none bg-[#eceeea] px-1.5 py-0 font-mono text-[10.5px] font-medium text-[#4f5a55]">/{ticket.meta.skill}</Badge>
        )}
        {ticket.meta?.regra && (
          <Badge className="rounded border-none bg-[#eceeea] px-1.5 py-0 font-mono text-[10.5px] font-medium text-[#4f5a55]">{ticket.meta.regra}</Badge>
        )}
        {setor && (
          <Badge className="gap-1 rounded border-none bg-[#eceeea] px-1.5 py-0 text-[10.5px] font-medium text-[#4f5a55]">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: setor.color }} aria-hidden="true" />
            {setor.name}
          </Badge>
        )}
      </div>

      <TicketGallery images={images} onZoom={setZoomIndex} />

      <div className="flex items-center gap-2.5 pt-0.5 text-xs text-gray-500">
        <span className="font-mono text-[11.5px] font-medium text-[#114a34]">{shortTicketId(ticket.id, ticket.type)}</span>
        {images.length > 0 && (
          <span className="flex items-center gap-0.5 tabular-nums" title={`${images.length} foto(s) anexada(s)`}>
            <ImageIcon className="h-3.5 w-3.5" />
            {images.length}
          </span>
        )}
        {(ticket.meta?.historico?.length ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 tabular-nums" title="Registros no histórico">
            <MessageSquare className="h-3.5 w-3.5" />
            {ticket.meta?.historico?.length}
          </span>
        )}
        <span className="flex-1" />
        <span className="tabular-nums" title={new Date(ticket.createdAt).toLocaleString('pt-BR')}>
          {concluded && ticket.concludedAt ? ageLabel(ticket.concludedAt) : ageLabel(ticket.createdAt)}
        </span>
        {canAct && next && !concluded ? (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void run(() => setDevTicketStatus(ticket.id, next), `Ticket movido para ${STATUS_META[next].label}.`);
            }}
            aria-label={`Avançar para ${STATUS_META[next].label}`}
            title={`Avançar para ${STATUS_META[next].label}`}
            className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-[#e3f1ea] hover:text-[#114a34] focus:opacity-100 group-hover:opacity-100"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <Avatar className="h-[22px] w-[22px] shrink-0" title={ticket.assigneeName ? `Com ${ticket.assigneeName}` : `Criado por ${ticket.creatorName}`}>
          <AvatarFallback className={`text-[9.5px] font-semibold text-white ${ticket.assigneeName ? 'bg-[#1a6649]' : 'bg-gray-400'}`}>
            {isMine ? 'EU' : initials(who)}
          </AvatarFallback>
        </Avatar>
      </div>

      <TicketDetail
        ticket={ticket}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        canAct={canAct}
        canDelete={canDelete}
        busy={busy}
        onAssume={() => run(() => assumeDevTicket(ticket.id), 'Ticket assumido! Ele foi para Em Análise.')}
        onMove={(s) => run(() => setDevTicketStatus(ticket.id, s), `Ticket movido para ${STATUS_META[s].label}.`)}
        onDelete={handleDelete}
      />

      {/* Zoom das miniaturas do card */}
      <TicketZoom images={images} index={zoomIndex} onIndex={setZoomIndex} onClose={() => setZoomIndex(null)} />
    </div>
  );
}
