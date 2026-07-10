/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { listWhatsAppTags, saveWhatsAppTag, deleteWhatsAppTag, type WhatsAppTagDTO } from '@/app/_actions/whatsapp/tags';

// Gerenciador de tags livres pra organizar conversas (ex.: "Urgente", "VIP").

const SWATCHES = ['#10b981', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#64748b', '#14b8a6'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function WhatsAppTagsModal({ open, onOpenChange, onChanged }: Props) {
  const [tags, setTags] = useState<WhatsAppTagDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try { setTags(await listWhatsAppTags()); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao carregar tags.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (open) { reload(); setName(''); setColor(SWATCHES[0]); setEditingId(null); }
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveWhatsAppTag({ id: editingId ?? undefined, name, color });
      toast.success('Tag salva.');
      setName(''); setColor(SWATCHES[0]); setEditingId(null);
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar a tag.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Excluir esta tag? Ela sai de todas as conversas.')) return;
    try {
      await deleteWhatsAppTag(id);
      if (editingId === id) { setEditingId(null); setName(''); }
      await reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="h-5 w-5 text-emerald-600" /> Tags de conversa
          </DialogTitle>
          <DialogDescription>Organize as conversas com etiquetas livres (ex.: Urgente, VIP, Recontato).</DialogDescription>
        </DialogHeader>

        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        ) : (
          <div className="space-y-1.5">
            {tags.length === 0 && <p className="text-sm text-gray-400">Nenhuma tag criada ainda.</p>}
            {tags.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 dark:border-zinc-800">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                <button
                  onClick={() => { setEditingId(t.id); setName(t.name); setColor(t.color); }}
                  className="min-w-0 flex-1 truncate text-left text-base hover:underline"
                >
                  {t.name}
                </button>
                <button onClick={() => handleDelete(t.id)} title="Excluir" className="text-gray-400 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-gray-100 p-3 dark:border-zinc-800">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da tag" className="h-9" />
          <div className="flex items-center gap-1.5">
            {SWATCHES.map((sw) => (
              <button
                key={sw}
                onClick={() => setColor(sw)}
                title={sw}
                className={`h-6 w-6 rounded-full transition-transform ${color === sw ? 'scale-110 ring-2 ring-offset-2 ring-gray-400' : ''}`}
                style={{ backgroundColor: sw }}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {editingId && (
            <Button variant="outline" onClick={() => { setEditingId(null); setName(''); setColor(SWATCHES[0]); }}>
              Cancelar edição
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {editingId ? 'Salvar alterações' : 'Criar tag'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
