/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Save, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import {
  listWhatsAppQuickReplies, createWhatsAppQuickReply, updateWhatsAppQuickReply,
  deleteWhatsAppQuickReply, type WhatsAppQuickReplyDTO,
} from '@/app/_actions/whatsapp/quick-replies';
import { ManagedListSelect } from './ManagedListSelect';

// Gerenciador de respostas rápidas (snippets) — mesmo desenho do modal de tags.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function WhatsAppQuickRepliesModal({ open, onOpenChange, onChanged }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [items, setItems] = useState<WhatsAppQuickReplyDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try { setItems(await listWhatsAppQuickReplies()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao carregar respostas rápidas.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (open) { reload(); setTitle(''); setBody(''); setEditingId(null); }
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      if (editingId) await updateWhatsAppQuickReply(editingId, title, body);
      else await createWhatsAppQuickReply(title, body);
      toast.success('Resposta rápida salva.');
      setTitle(''); setBody(''); setEditingId(null);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm({
      title: 'Excluir resposta rápida',
      description: 'Ela some do menu de respostas de todos os atendentes.',
    }))) return;
    try {
      await deleteWhatsAppQuickReply(id);
      if (editingId === id) { setEditingId(null); setTitle(''); setBody(''); }
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {confirmDialog}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-600" /> Respostas rápidas
          </DialogTitle>
          <DialogDescription>
            Textos prontos que a equipe insere na conversa com um clique (ex.: chave PIX, lista de documentos).
          </DialogDescription>
        </DialogHeader>

        {/* Lista suspensa — mesmo desenho do gerenciador de fluxos. */}
        <div className="flex items-center gap-2">
          <ManagedListSelect
            items={items.map((q) => ({ id: q.id, title: q.title, subtitle: q.body }))}
            selectedId={editingId}
            loading={loading}
            placeholder="Escolha uma resposta para editar..."
            emptyText="Nenhuma resposta rápida criada ainda."
            onSelect={(id) => {
              const q = items.find((x) => x.id === id);
              if (!q) return;
              setEditingId(q.id); setTitle(q.title); setBody(q.body);
            }}
            onDelete={handleDelete}
          />
          <button
            onClick={() => { setEditingId(null); setTitle(''); setBody(''); }}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-dashed px-3.5 text-base font-semibold ${!editingId ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20' : 'border-gray-300 text-gray-500 hover:border-gray-400 dark:border-zinc-700 dark:text-zinc-400'}`}
          >
            <Plus className="h-4 w-4" /> Nova
          </button>
        </div>

        <div className="space-y-2 rounded-xl border border-gray-100 p-3 dark:border-zinc-800">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome (ex.: Documentos necessários)" className="h-9" />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Texto que será inserido na conversa..."
            rows={4}
            className="w-full resize-none rounded-md border border-gray-200 bg-transparent p-2 text-base outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:text-zinc-100"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {editingId && (
            <Button variant="outline" onClick={() => { setEditingId(null); setTitle(''); setBody(''); }}>
              Cancelar edição
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !title.trim() || !body.trim()} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {editingId ? 'Salvar alterações' : 'Criar resposta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
