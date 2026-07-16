/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, FileBadge, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  listWhatsAppTemplates, saveWhatsAppTemplate, deleteWhatsAppTemplate,
  syncWhatsAppTemplatesFromMeta, type WhatsAppTemplateDTO,
} from '@/app/_actions/whatsapp/templates';

// Cadastro dos templates aprovados na Meta Business Manager. Isso NÃO cria
// nem aprova nada na Meta — só espelha aqui o nome/idioma/variáveis de um
// template que já foi aprovado lá, pra poder escolher e enviar durante o
// atendimento (único jeito de falar com o cliente fora da janela de 24h).

const EMPTY: { id?: string; name: string; language: string; bodyVars: number; bodyPreview: string } = {
  name: '', language: 'pt_BR', bodyVars: 0, bodyPreview: '',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function WhatsAppTemplatesModal({ open, onOpenChange, onChanged }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [templates, setTemplates] = useState<WhatsAppTemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState(EMPTY);

  async function handleSync() {
    setSyncing(true);
    try {
      const { imported, skipped, error } = await syncWhatsAppTemplatesFromMeta();
      if (error) {

        toast.error(error, { duration: 12000 });
        return;
      }
      toast.success(`${imported} template(s) sincronizado(s) da Meta${skipped ? ` (${skipped} não aprovado(s) ignorado(s))` : ''}.`);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao sincronizar com a Meta.');
    } finally {
      setSyncing(false);
    }
  }

  async function reload() {
    setLoading(true);
    try { setTemplates(await listWhatsAppTemplates()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao carregar templates.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (open) { reload(); setEditing(EMPTY); }
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveWhatsAppTemplate(editing);
      toast.success('Template salvo.');
      setEditing(EMPTY);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar o template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({
      title: 'Excluir template',
      description: 'Ele sai só do cadastro do sistema — o template aprovado na Meta continua existindo.',
    }))) return;
    try {
      await deleteWhatsAppTemplate(id);
      if (editing.id === id) setEditing(EMPTY);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {confirmDialog}
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl">
            <FileBadge className="h-6 w-6 text-emerald-600" /> Templates aprovados na Meta
          </DialogTitle>
          <DialogDescription className="text-base">
            O jeito mais seguro é <b>sincronizar</b>: puxamos direto da Meta o nome, idioma e nº de variáveis
            de cada template aprovado — assim o envio nunca falha por divergência. Também dá para cadastrar
            manualmente (não cria nem aprova nada na Meta).
          </DialogDescription>
        </DialogHeader>

        <Button variant="outline" onClick={handleSync} disabled={syncing} className="w-fit gap-2 text-base">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sincronizar com a Meta
        </Button>

        <div className="flex flex-wrap gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {!loading && templates.map((t) => (
            <span key={t.id} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-base font-semibold ${editing.id === t.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20' : 'border-gray-200 text-gray-600 dark:border-zinc-700 dark:text-zinc-300'}`}>
              <button onClick={() => setEditing({ id: t.id, name: t.name, language: t.language, bodyVars: t.bodyVars, bodyPreview: t.bodyPreview ?? '' })}>
                {t.name} <span className="text-gray-400">({t.bodyVars} var.)</span>
              </button>
              <button onClick={() => handleDelete(t.id)} title="Excluir" className="text-gray-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          ))}
          <button
            onClick={() => setEditing(EMPTY)}
            className={`flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-base font-semibold ${!editing.id ? 'border-emerald-500 text-emerald-700' : 'border-gray-300 text-gray-500 hover:border-gray-400 dark:border-zinc-700 dark:text-zinc-400'}`}
          >
            <Plus className="h-4 w-4" /> Novo template
          </button>
        </div>

        <div className="space-y-3 rounded-xl border border-gray-100 p-3 dark:border-zinc-800">
          <label className="block">
            <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Nome exato na Meta</span>
            <Input value={editing.name} onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: boas_vindas_cliente" className="h-11 text-base" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Idioma</span>
              <Input value={editing.language} onChange={(e) => setEditing((f) => ({ ...f, language: e.target.value }))} placeholder="pt_BR" className="h-11 text-base" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Nº de variáveis {'{{1}}'} {'{{2}}'}...</span>
              <Input
                type="number" min={0} max={20}
                value={editing.bodyVars}
                onChange={(e) => setEditing((f) => ({ ...f, bodyVars: Number(e.target.value) }))}
                className="h-11 text-base"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-base font-semibold text-gray-600 dark:text-zinc-300">Texto de referência (opcional, só pra equipe)</span>
            <textarea
              value={editing.bodyPreview}
              onChange={(e) => setEditing((f) => ({ ...f, bodyPreview: e.target.value }))}
              placeholder="Ex.: Olá {{1}}, seu processo {{2}} está em análise."
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white p-2 text-base outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving || !editing.name.trim()} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {editing.id ? 'Salvar alterações' : 'Cadastrar template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
