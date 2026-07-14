'use client';

/* eslint-disable no-unused-vars */
import { useCallback, useRef, useState } from 'react';
import { Trash2, AlertTriangle, HelpCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';

// Dialog de confirmação padrão do app — substitui os window.confirm()/alert()
// nativos. Dois jeitos de usar:
//
// 1. Componente controlado:
//    <ConfirmDialog open={open} onOpenChange={setOpen} title="Excluir tag"
//      description="Ela sai de todas as conversas." onConfirm={handleDelete} />
//
// 2. Hook imperativo (troca 1-pra-1 com window.confirm):
//    const { confirm, confirmDialog } = useConfirm();
//    ...
//    if (!(await confirm({ title: 'Excluir fluxo?', description: '...' }))) return;
//    ...
//    return (<> ... {confirmDialog} </>);

export type ConfirmTone = 'danger' | 'warning' | 'default';

const TONE_META: Record<ConfirmTone, {
  Icon: React.ElementType;
  iconWrap: string;
  confirmClass: string;
}> = {
  danger: {
    Icon: Trash2,
    iconWrap: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    Icon: AlertTriangle,
    iconWrap: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
    confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  default: {
    Icon: HelpCircle,
    iconWrap: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
    confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
};

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  tone?: ConfirmTone;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open, onOpenChange, title, description,
  tone = 'danger', confirmLabel, cancelLabel = 'Cancelar', onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const { Icon, iconWrap, confirmClass } = TONE_META[tone];

  async function handle() {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="max-w-sm gap-0 rounded-2xl p-0">
        <div className="flex flex-col items-center px-6 pb-2 pt-8 text-center">
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${iconWrap}`}>
            <Icon className="h-6 w-6" />
          </div>
          <DialogTitle className="text-lg font-bold text-gray-900 dark:text-zinc-100">{title}</DialogTitle>
          {description && (
            <div className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-zinc-400">{description}</div>
          )}
        </div>
        <div className="flex gap-2 p-4 pt-5">
          <Button variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button className={`h-10 flex-1 rounded-xl ${confirmClass}`} onClick={handle} disabled={loading}>
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : (confirmLabel ?? (tone === 'danger' ? 'Excluir' : 'Confirmar'))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  tone?: ConfirmTone;
  confirmLabel?: string;
  cancelLabel?: string;
}

/**
 * Substituto 1-pra-1 do window.confirm(): `await confirm({...})` devolve
 * true/false. Renderize `confirmDialog` uma vez no JSX do componente.
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOpts(options);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOpts(null);
  }, []);

  const confirmDialog = opts ? (
    <ConfirmDialog
      open
      onOpenChange={(o) => { if (!o) settle(false); }}
      title={opts.title}
      description={opts.description}
      tone={opts.tone ?? 'danger'}
      confirmLabel={opts.confirmLabel}
      cancelLabel={opts.cancelLabel}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
