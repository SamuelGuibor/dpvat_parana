'use client';

import { useState } from 'react';
import { mutate } from 'swr';
import { ClipboardList, ClipboardCheck, Loader2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { applyFormReplyToCadastro, previewFormReplyApply } from '@/app/_actions/whatsapp/forms';
import { copilotUrl } from '@/app/_shared/utils/copilot-api';
import { formFieldsToFicha, type WaInteractive } from '@/app/_shared/utils/wa-forms';
import { formatWaText } from './wa-format';

// Conteúdo da bolha de uma mensagem com formulário do WhatsApp (Meta Flow):
// o formulário que a equipe/bot mandou (texto + botão) ou a resposta do
// cliente em campos legíveis, com "Aplicar ao cadastro" quando a resposta tem
// nome, CPF ou endereço.

export function WaFormBubble({ data, body, mine, messageId, contactId }: {
  data: WaInteractive;
  body: string | null;
  mine: boolean;
  messageId: string;
  contactId: string;
}) {
  if (data.kind === 'flow') {
    // body = "📋 Formulário enviado — X\n<texto>\n[botão: Y]": a bolha mostra o texto.
    const lines = (body ?? '').split('\n');
    const text = lines.length > 2 ? lines.slice(1, -1).join('\n') : body ?? '';
    return (
      <div className="min-w-[220px]">
        <p className={`mb-1 flex items-center gap-1.5 text-xs font-bold ${mine ? 'text-white/80' : 'text-cyan-700'}`}>
          <ClipboardList className="h-3.5 w-3.5" /> Formulário · {data.flowName.replace(/\s+v\d+$/i, '')} v{data.version}
        </p>
        {data.header && <p className="font-bold">{data.header}</p>}
        <p className="whitespace-pre-wrap break-words leading-relaxed">{formatWaText(text)}</p>
        {data.footer && <p className={`mt-1 text-xs ${mine ? 'text-white/70' : 'text-gray-400'}`}>{data.footer}</p>}
        <div className={`mt-2 rounded-lg border px-3 py-1.5 text-center text-sm font-semibold ${mine ? 'border-white/40 text-white' : 'border-cyan-200 text-cyan-700'}`}>
          {data.cta}
        </div>
      </div>
    );
  }

  return <FormReply data={data} messageId={messageId} contactId={contactId} />;
}

function FormReply({ data, messageId, contactId }: {
  data: Extract<WaInteractive, { kind: 'flow_reply' }>;
  messageId: string;
  contactId: string;
}) {
  const applicable = formFieldsToFicha(data.fields).length > 0;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewFormReplyApply>> | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  async function openApply() {
    setOpen(true);
    setLoading(true);
    setPreview(null);
    try {
      const r = await previewFormReplyApply(messageId);
      setPreview(r);
      if (r.ok) setChosen(new Set(r.changes.filter((c) => c.current !== c.next).map((c) => c.field)));
    } catch {
      setPreview({ ok: false, error: 'Falha ao ler o cadastro. Atualize a página (F5).' });
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    setSaving(true);
    try {
      const r = await applyFormReplyToCadastro(messageId, [...chosen]);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(`Aplicado ao ${r.target.label}: ${r.applied.length} campo(s).`);
      setOpen(false);
      void mutate(copilotUrl(contactId));
    } catch {
      toast.error('Falha ao aplicar. Atualize a página (F5) e tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-[220px]">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-cyan-700">
        <ClipboardCheck className="h-3.5 w-3.5" /> Formulário respondido{data.flowName ? ` · ${data.flowName.replace(/\s+v\d+$/i, '')}` : ''}
      </p>
      {data.fields.length === 0 ? (
        <p className="text-sm text-gray-400">Resposta sem campos.</p>
      ) : (
        <dl className="space-y-1 text-sm">
          {data.fields.map((f) => (
            <div key={f.key} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2">
              <dt className="truncate text-gray-500 dark:text-zinc-400" title={f.key}>{f.label}</dt>
              <dd className="break-words font-medium">{f.value || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      {applicable && (
        <button
          type="button"
          onClick={openApply}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-cyan-200 px-2.5 py-1 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-50 dark:border-cyan-800 dark:hover:bg-cyan-900/30"
        >
          <UserCheck className="h-3.5 w-3.5" /> Aplicar ao cadastro
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aplicar a resposta ao cadastro</DialogTitle>
            <DialogDescription>
              {preview?.ok ? `Vai para o ${preview.target.label}. Marque o que deve ser gravado.` : 'Confira o que muda antes de gravar.'}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : !preview ? null : !preview.ok ? (
            <p className="text-sm text-red-600">{preview.error}</p>
          ) : (
            <div className="space-y-2">
              {preview.changes.map((c) => {
                const same = c.current === c.next;
                return (
                  <label key={c.field} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${same ? 'border-gray-100 opacity-60' : 'border-gray-200 dark:border-zinc-700'}`}>
                    <input
                      type="checkbox"
                      disabled={same}
                      checked={chosen.has(c.field)}
                      onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(c.field); else n.delete(c.field); return n; })}
                      className="mt-0.5 h-4 w-4 accent-cyan-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{c.label}</span>
                      {same ? (
                        <span className="text-xs text-gray-500">já está assim: {c.next}</span>
                      ) : (
                        <span className="text-xs">
                          <span className="text-gray-400 line-through">{c.current || 'vazio'}</span>
                          <span className="mx-1 text-gray-400">→</span>
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">{c.next}</span>
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={apply} disabled={saving || chosen.size === 0} className="bg-cyan-600 hover:bg-cyan-700">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gravar {chosen.size} campo(s)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
