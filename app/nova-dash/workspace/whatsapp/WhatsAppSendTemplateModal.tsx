/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send, FileBadge, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  listWhatsAppTemplates, sendWhatsAppTemplateMessage, type WhatsAppTemplateDTO,
} from '@/app/_actions/whatsapp/templates';
import { WhatsAppTemplatesModal } from './WhatsAppTemplatesModal';

// Aberto pelo aviso de "janela de 24h expirada": único jeito de falar com o
// cliente de novo é um template aprovado na Meta. Escolhe o template, preenche
// as variáveis e envia — não passa pelo composer normal (texto livre falha).

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onSent: () => Promise<void>;
}

export function WhatsAppSendTemplateModal({ open, onOpenChange, contactId, onSent }: Props) {
  const [templates, setTemplates] = useState<WhatsAppTemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [vars, setVars] = useState<string[]>([]);
  const [manageOpen, setManageOpen] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const list = await listWhatsAppTemplates();
      setTemplates(list);
      if (list.length && !list.some((t) => t.id === selectedId)) setSelectedId(list[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (open) reload(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    setVars(selected ? Array.from({ length: selected.bodyVars }, () => '') : []);
  }, [selected?.id, selected?.bodyVars]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = selected?.bodyPreview
    ? vars.reduce((acc, v, i) => acc.replaceAll(`{{${i + 1}}}`, v || `{{${i + 1}}}`), selected.bodyPreview)
    : null;

  async function handleSend() {
    if (!selected) return;
    setSending(true);
    try {
      await sendWhatsAppTemplateMessage(contactId, selected.id, vars);
      toast.success('Template enviado.');
      await onSent();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar o template.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-xl">
              <FileBadge className="h-6 w-6 text-emerald-600" /> Enviar mensagem de template
            </DialogTitle>
            <DialogDescription className="text-base">
              A janela de 24h expirou — só um template aprovado na Meta chega ao cliente agora.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-base text-gray-400 dark:border-zinc-700">
              Nenhum template cadastrado ainda.
              <Button variant="outline" onClick={() => setManageOpen(true)} className="mx-auto mt-3 flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> Cadastrar template
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Template</span>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.language})</option>
                  ))}
                </select>
              </label>

              {selected && selected.bodyVars > 0 && (
                <div className="space-y-2.5">
                  <span className="block text-base font-semibold text-gray-600 dark:text-zinc-300">Variáveis</span>
                  {vars.map((v, i) => (
                    <Input
                      key={i}
                      value={v}
                      onChange={(e) => setVars((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))}
                      placeholder={`Variável {{${i + 1}}}`}
                      className="h-11 text-base"
                    />
                  ))}
                </div>
              )}

              {preview && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-base leading-relaxed text-gray-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-zinc-200">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Pré-visualização</span>
                  <span className="whitespace-pre-wrap">{preview}</span>
                </div>
              )}

              <button onClick={() => setManageOpen(true)} className="flex items-center gap-1.5 text-base text-gray-500 underline underline-offset-2 hover:text-gray-700 dark:hover:text-zinc-300">
                <Settings2 className="h-4 w-4" /> Gerenciar templates cadastrados
              </button>
            </div>
          )}

          <DialogFooter>
            <Button size="lg" onClick={handleSend} disabled={!selected || sending} className="bg-emerald-600 text-base hover:bg-emerald-700">
              {sending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
              Enviar template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplatesModal open={manageOpen} onOpenChange={setManageOpen} onChanged={reload} />
    </>
  );
}
