/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/app/_shared/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/_shared/ui/dialog';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import { ArrowRight, ChevronLeft, ChevronRight, Clock, ImageIcon, Loader2, MoreHorizontal, Trash2, UserPlus, UserCheck } from 'lucide-react';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import { assumeDevTicket, deleteDevTicket, setDevTicketStatus } from '@/app/_actions/dev-tickets/ticket-actions';
import { DevTicketDto, NEXT_STATUS, STATUS_META, TICKET_STATUS_FLOW, TYPE_META, TicketImage as TicketImageMeta, TicketStatus, ticketImages } from './constants';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** Uma foto do ticket: presigned GET sob demanda, cacheado pelo SWR. */
function TicketPhoto({
  image,
  onZoom,
  className,
  badge,
}: {
  image: TicketImageMeta;
  onZoom?: () => void;
  className: string;
  badge?: string;
}) {
  const { data } = useSWR(
    ['dev-ticket-image', image.key],
    () => downloadFileFromS3(image.key, image.name || 'imagem', true),
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );

  if (!data?.success || !data.presignedUrl) {
    return <div className={`${className} rounded-xl bg-gray-100 dark:bg-zinc-800 animate-pulse`} />;
  }

  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.presignedUrl}
        alt={image.name || 'Print do ticket'}
        onClick={(e) => { e.stopPropagation(); onZoom?.(); }}
        className={`w-full rounded-xl border border-gray-100 dark:border-zinc-800 cursor-zoom-in hover:opacity-90 transition-opacity ${className}`}
      />
      {badge && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </div>
  );
}

/**
 * Galeria de fotos do ticket. No card mostra até 3 miniaturas (a última leva o
 * contador do que sobrou); no detalhe mostra todas, uma embaixo da outra.
 */
function TicketGallery({
  images,
  onZoom,
  full = false,
}: {
  images: TicketImageMeta[];
  onZoom: (index: number) => void;
  full?: boolean;
}) {
  if (!images.length) return null;

  if (full) {
    return (
      <div className="space-y-2">
        {images.map((img, i) => (
          <TicketPhoto
            key={img.key}
            image={img}
            onZoom={() => onZoom(i)}
            className="max-h-96 object-contain bg-gray-50 dark:bg-zinc-950/50"
          />
        ))}
      </div>
    );
  }

  const shown = images.slice(0, 3);
  const hidden = images.length - shown.length;

  return (
    <div className={shown.length === 1 ? '' : 'grid grid-cols-3 gap-1.5'}>
      {shown.map((img, i) => (
        <TicketPhoto
          key={img.key}
          image={img}
          onZoom={() => onZoom(i)}
          className={shown.length === 1 ? 'h-24 object-cover' : 'h-16 object-cover'}
          badge={hidden > 0 && i === shown.length - 1 ? `+${hidden}` : undefined}
        />
      ))}
    </div>
  );
}

/** Visualizador em tela cheia com navegação entre as fotos do ticket. */
function TicketZoom({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: TicketImageMeta[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const current = index !== null ? images[index] : null;

  return (
    <Dialog open={index !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-5xl p-2 bg-black/90 border-none"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{current?.name || 'Imagem do ticket'}</DialogTitle>
        </DialogHeader>

        {current && (
          <div className="relative">
            <TicketPhoto image={current} className="max-h-[80vh] object-contain" />

            {images.length > 1 && index !== null && (
              <>
                <button
                  type="button"
                  onClick={() => onIndex((index - 1 + images.length) % images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  title="Foto anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onIndex((index + 1) % images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  title="Próxima foto"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-[11px] font-bold text-white">
                  {index + 1} / {images.length}
                </span>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface Props {
  ticket: DevTicketDto;
  onChanged: () => void;
}

export function TicketCard({ ticket, onChanged }: Props) {
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const images = ticketImages(ticket);
  const meta = TYPE_META[ticket.type] ?? TYPE_META.OUTRO;
  const TypeIcon = meta.icon;
  const status = (TICKET_STATUS_FLOW.includes(ticket.status as TicketStatus)
    ? ticket.status
    : 'EM_DISTRIBUICAO') as TicketStatus;
  const next = NEXT_STATUS[status];
  const concluded = status === 'CONCLUIDO';
  const isMine = session?.user?.id === ticket.assigneeId;
  const canDelete = session?.user?.id === ticket.creatorId || session?.user?.role === 'ADMIN++';

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      onChanged();
      toast.success(okMsg);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? 'Erro ao atualizar o ticket.');
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
      className={`bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm p-4 space-y-3 cursor-pointer hover:shadow-md transition-shadow ${concluded ? 'opacity-75' : ''}`}
      onClick={() => setDetailOpen(true)}
    >
      <div onClick={(e) => e.stopPropagation()}>{confirmDialog}</div>

      <div className="flex items-center justify-between gap-2">
        <Badge className={`gap-1 border-none text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>
          <TypeIcon className="w-3 h-3" />
          {meta.label}
        </Badge>
        <div className="flex items-center gap-1.5 text-gray-400 dark:text-zinc-500">
          <Clock className="w-3 h-3" />
          <span className="text-[10px] font-medium">
            {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                title="Ações do ticket"
                disabled={busy}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-gray-400">
                Mover para
              </DropdownMenuLabel>
              {TICKET_STATUS_FLOW.filter((s) => s !== status).map((s) => {
                const sMeta = STATUS_META[s];
                const SIcon = sMeta.icon;
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => run(() => setDevTicketStatus(ticket.id, s), `Ticket movido para ${sMeta.label}.`)}
                  >
                    <SIcon className="w-3.5 h-3.5 mr-2" />
                    {sMeta.label}
                  </DropdownMenuItem>
                );
              })}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="text-red-600 focus:text-red-600">
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    Excluir ticket
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-black text-gray-900 dark:text-zinc-100 leading-snug">
          {ticket.title}
        </h4>
        <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400 leading-relaxed line-clamp-3 whitespace-pre-wrap">
          {ticket.description}
        </p>
      </div>

      <TicketGallery images={images} onZoom={setZoomIndex} />

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-1.5 min-w-0" title={`Criado por ${ticket.creatorName}`}>
          <Avatar className="w-5 h-5 border shrink-0">
            <AvatarFallback className="bg-gray-100 dark:bg-zinc-800 text-[8px] font-bold">
              {initials(ticket.creatorName)}
            </AvatarFallback>
          </Avatar>
          <span className="text-[10px] text-gray-400 dark:text-zinc-500 truncate">{ticket.creatorName}</span>
          {images.length > 1 && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-zinc-500 shrink-0"
              title={`${images.length} fotos anexadas`}
            >
              <ImageIcon className="w-3 h-3" />
              {images.length}
            </span>
          )}
        </div>

        <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center gap-1.5">
          {ticket.assigneeId ? (
            <Badge variant="secondary" className="gap-1 text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-none">
              <UserCheck className="w-3 h-3" />
              {isMine ? 'Você' : ticket.assigneeName}
            </Badge>
          ) : !concluded ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => assumeDevTicket(ticket.id), 'Ticket assumido! Ele foi para Em Análise.')}
              className="h-7 px-2.5 rounded-lg text-[11px] font-bold text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-900 dark:hover:bg-blue-950/40"
            >
              <UserPlus className="w-3 h-3 mr-1" />
              Assumir
            </Button>
          ) : null}

          {next && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => setDevTicketStatus(ticket.id, next), `Ticket movido para ${STATUS_META[next].label}.`)}
              title={`Avançar para ${STATUS_META[next].label}`}
              className="h-7 px-2 rounded-lg bg-blue-600 hover:bg-blue-700"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {concluded && ticket.concludedAt && (
        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
          ✓ Concluído em {new Date(ticket.concludedAt).toLocaleString('pt-BR')}
        </p>
      )}

      {/* Detalhe completo do ticket */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`gap-1 border-none text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>
                <TypeIcon className="w-3 h-3" />
                {meta.label}
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[10px] border-none">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[status].dot}`} />
                {STATUS_META[status].label}
              </Badge>
            </div>
            <DialogTitle className="text-lg font-black leading-snug pt-1">{ticket.title}</DialogTitle>
            <DialogDescription className="text-xs">
              Criado por {ticket.creatorName} em {new Date(ticket.createdAt).toLocaleString('pt-BR')}
              {ticket.assigneeName ? ` · Assumido por ${ticket.assigneeName}` : ' · Aguardando um dev assumir'}
              {ticket.concludedAt ? ` · Concluído em ${new Date(ticket.concludedAt).toLocaleString('pt-BR')}` : ''}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {ticket.description}
          </p>
          <TicketGallery images={images} onZoom={setZoomIndex} full />
        </DialogContent>
      </Dialog>

      {/* Zoom das imagens */}
      <TicketZoom
        images={images}
        index={zoomIndex}
        onIndex={setZoomIndex}
        onClose={() => setZoomIndex(null)}
      />
    </div>
  );
}
