'use client';

// Correção manual de um dia. Existe porque esquecer de bater é a falha mais
// comum do ponto: sem isto, o dia ficava errado para sempre. Toda gravação
// carimba quem corrigiu (`editedById`) e a tela mostra o selo "corrigido".

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import {
  BREAK_LABEL, clockToIso, fmtDayLabel, isoToClock, parseBreaks,
  type BreakKind, type PontoSession,
} from '@/app/_shared/lib/ponto';

interface DraftBreak { start: string; end: string; kind: BreakKind }

interface Props {
  open: boolean;
  userId: string;
  userName: string;
  dateKey: string;
  session: PontoSession | null;
  onClose: () => void;
  onSaved: () => void;
}

const field = 'rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400';

export function EditSessionDialog({ open, userId, userName, dateKey, session, onClose, onSaved }: Props) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [breaks, setBreaks] = useState<DraftBreak[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStart(isoToClock(session?.startedAt));
    setEnd(isoToClock(session?.finishedAt));
    setNote(session?.note ?? '');
    setBreaks(
      session
        ? parseBreaks(session).map((b) => ({ start: isoToClock(b.start), end: isoToClock(b.end), kind: b.kind }))
        : [],
    );
  }, [open, session]);

  async function save() {
    if (!start) { toast.error('Informe o horário de entrada.'); return; }
    const startIso = clockToIso(dateKey, start);
    if (!startIso) { toast.error('Entrada inválida — use HH:MM.'); return; }
    const endIso = end ? clockToIso(dateKey, end) : null;
    if (end && !endIso) { toast.error('Saída inválida — use HH:MM.'); return; }

    const payloadBreaks = [];
    for (const b of breaks) {
      if (!b.start) continue;
      const bs = clockToIso(dateKey, b.start);
      if (!bs) { toast.error('Pausa com horário inválido.'); return; }
      const be = b.end ? clockToIso(dateKey, b.end) : null;
      if (b.end && !be) { toast.error('Pausa com horário inválido.'); return; }
      payloadBreaks.push({ start: bs, end: be, kind: b.kind });
    }

    setSaving(true);
    try {
      const res = await fetch('/api/work-session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session?.id,
          userId,
          date: dateKey,
          startedAt: startIso,
          finishedAt: endIso,
          breaks: payloadBreaks,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Não foi possível salvar.'); return; }
      toast.success('Ponto corrigido.');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!session) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/work-session?id=${session.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Não foi possível excluir.');
        return;
      }
      toast.success('Registro do dia excluído.');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corrigir ponto — {fmtDayLabel(dateKey)}</DialogTitle>
          <DialogDescription>
            {userName}. Horários no fuso de Brasília. Fica registrado que você fez a correção.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Entrada</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={`${field} w-full`} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600">Saída</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={`${field} w-full`} />
              <span className="block text-[10px] text-gray-400">Em branco = turno ainda aberto.</span>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">Pausas</span>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                onClick={() => setBreaks((b) => [...b, { start: '', end: '', kind: 'almoco' }])}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </button>
            </div>

            {breaks.length === 0 && (
              <p className="text-xs text-gray-400">Nenhuma pausa no dia.</p>
            )}

            {breaks.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={b.kind}
                  onChange={(e) => setBreaks((list) => list.map((x, j) => (j === i ? { ...x, kind: e.target.value as BreakKind } : x)))}
                  className={`${field} text-xs`}
                >
                  {(Object.keys(BREAK_LABEL) as BreakKind[]).map((k) => (
                    <option key={k} value={k}>{BREAK_LABEL[k]}</option>
                  ))}
                </select>
                <input
                  type="time" value={b.start} className={`${field} flex-1`}
                  onChange={(e) => setBreaks((list) => list.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                />
                <span className="text-xs text-gray-400">até</span>
                <input
                  type="time" value={b.end} className={`${field} flex-1`}
                  onChange={(e) => setBreaks((list) => list.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1.5 text-red-400 hover:bg-red-50"
                  onClick={() => setBreaks((list) => list.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600">Observação</span>
            <input
              value={note} maxLength={500} className={`${field} w-full`}
              placeholder="Ex.: esqueceu de bater a saída, confirmado com o gestor"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {session ? (
            <button
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-500 hover:bg-red-50"
              onClick={remove}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4" /> Excluir dia
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={save} disabled={saving}>
              Salvar
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
