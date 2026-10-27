'use client';

import useSWR from 'swr';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { downloadFileFromS3 } from '@/app/_actions/documents/download-s3';
import type { TicketImage as TicketImageMeta } from './constants';

// Fotos do ticket (miniaturas no card, galeria no detalhe, zoom em tela
// cheia). Separado do TicketCard para o TicketDetail usar sem import circular.

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
export function TicketGallery({
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
export function TicketZoom({
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
