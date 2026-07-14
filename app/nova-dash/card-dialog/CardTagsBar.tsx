/* eslint-disable no-unused-vars */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tag as TagIcon, Plus, X, Check, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/_shared/ui/popover';
import { Input } from '@/app/_shared/ui/input';
import { Button } from '@/app/_shared/ui/button';
import { useConfirm } from '@/app/_shared/ui/confirm-dialog';

// Tags do CARD (CardTag): chips ao lado do título no diálogo do card + badge
// no kanban. Este é o ÚNICO lugar onde tags são gerenciadas (criar, renomear,
// recolorir, excluir) — no card do kanban elas são somente leitura.

export interface CardTagDTO {
  id: string;
  name: string;
  color: string;
}

const TAG_SWATCHES = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#10b981', '#84cc16',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#64748b',
];

interface Props {
  cardId: string;
  isProcess: boolean;
  /** Avisa o pai (kanban) que as tags do card mudaram. */
  onTagsChange?: (tags: CardTagDTO[]) => void;
}

export function CardTagsBar({ cardId, isProcess, onTagsChange }: Props) {
  const [allTags, setAllTags] = useState<CardTagDTO[]>([]);
  const [cardTags, setCardTags] = useState<CardTagDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busyTagId, setBusyTagId] = useState<string | null>(null);

  // Criação
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_SWATCHES[0]);
  const [creating, setCreating] = useState(false);

  // Edição inline de uma tag existente
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(TAG_SWATCHES[0]);
  const [savingEdit, setSavingEdit] = useState(false);

  const { confirm, confirmDialog } = useConfirm();

  async function loadAll() {
    try {
      const [tagsRes, mineRes] = await Promise.all([
        fetch('/api/card-tags', { cache: 'no-store' }),
        fetch('/api/card-tags/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isProcess ? { processIds: [cardId] } : { userIds: [cardId] }),
        }),
      ]);
      if (!tagsRes.ok || !mineRes.ok) throw new Error('Falha ao carregar as tags.');
      const tags: CardTagDTO[] = await tagsRes.json();
      const mine = await mineRes.json();
      const current: CardTagDTO[] = (isProcess ? mine.processes?.[cardId] : mine.users?.[cardId]) ?? [];
      setAllTags(tags);
      setCardTags(current);
    } catch (e) {
      console.error('[card-tags]', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, isProcess]);

  function applyCardTags(tags: CardTagDTO[]) {
    setCardTags(tags);
    onTagsChange?.(tags);
  }

  async function toggleTag(tag: CardTagDTO, on: boolean) {
    setBusyTagId(tag.id);
    try {
      const res = await fetch('/api/card-tags/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, isProcess, tagId: tag.id, on }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Falha ao atualizar a tag.');
      const data = await res.json();
      applyCardTags(data.tags);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar a tag.');
    } finally {
      setBusyTagId(null);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/card-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Falha ao criar a tag.');
      const tag: CardTagDTO = await res.json();
      setAllTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      // Já aplica a tag recém-criada neste card (é o que se quer em 99% das vezes).
      await toggleTag(tag, true);
      toast.success(`Tag "${tag.name}" criada e aplicada.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar a tag.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/card-tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editName.trim(), color: editColor }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Falha ao salvar a tag.');
      const tag: CardTagDTO = await res.json();
      setAllTags((prev) => prev.map((t) => (t.id === tag.id ? tag : t)));
      applyCardTags(cardTags.map((t) => (t.id === tag.id ? tag : t)));
      setEditingId(null);
      toast.success('Tag atualizada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteTag(tag: CardTagDTO) {
    if (!(await confirm({
      title: `Excluir a tag "${tag.name}"`,
      description: 'Ela sai de TODOS os cards que a usam. Essa ação não pode ser desfeita.',
    }))) return;
    try {
      const res = await fetch(`/api/card-tags?id=${encodeURIComponent(tag.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao excluir a tag.');
      setAllTags((prev) => prev.filter((t) => t.id !== tag.id));
      applyCardTags(cardTags.filter((t) => t.id !== tag.id));
      if (editingId === tag.id) setEditingId(null);
      toast.success('Tag excluída.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(term));
  }, [allTags, search]);

  const activeIds = new Set(cardTags.map((t) => t.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {confirmDialog}

      {cardTags.map((tag) => (
        <span
          key={tag.id}
          className="group/tag flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm"
          style={{ backgroundColor: tag.color }}
        >
          {tag.name}
          <button
            onClick={() => toggleTag(tag, false)}
            title="Remover tag deste card"
            className="hidden rounded-full hover:bg-black/20 group-hover/tag:block"
          >
            {busyTagId === tag.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          </button>
        </span>
      ))}

      {/* modal: o popover é portalado pra fora do Dialog do card, e o Dialog
          (modal) desliga pointer-events no body — sem isto, nada dentro do
          popover é clicável. Com modal, o Radix devolve os pointer-events. */}
      <Popover modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSearch(''); setEditingId(null); } }}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-[11px] font-bold text-gray-500 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
            title="Gerenciar tags do card"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <TagIcon className="h-3 w-3" />}
            {cardTags.length === 0 ? 'Tags' : ''}
            <Plus className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b border-gray-100 p-2.5 dark:border-zinc-800">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">Tags do card</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tag..."
                className="h-8 pl-7 text-sm"
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-gray-400">
                {allTags.length === 0 ? 'Nenhuma tag criada ainda — crie a primeira abaixo.' : 'Nenhuma tag encontrada.'}
              </p>
            )}
            {filtered.map((tag) => {
              const active = activeIds.has(tag.id);
              const editing = editingId === tag.id;
              if (editing) {
                return (
                  <div key={tag.id} className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50/50 p-2 dark:border-blue-900 dark:bg-blue-950/20">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-sm" />
                    <div className="flex flex-wrap gap-1">
                      {TAG_SWATCHES.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className={`h-4 w-4 rounded-full ${editColor === c ? 'ring-2 ring-offset-1 ring-gray-500' : ''}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingId(null)}>Cancelar</Button>
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSaveEdit} disabled={savingEdit || !editName.trim()}>
                        {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={tag.id} className="group/row flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-gray-50 dark:hover:bg-zinc-800/60">
                  <button
                    onClick={() => toggleTag(tag, !active)}
                    disabled={busyTagId === tag.id}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${active ? '' : 'opacity-40'}`}
                      style={{ backgroundColor: tag.color }}
                    >
                      {busyTagId === tag.id
                        ? <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                        : active && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className={`truncate text-sm ${active ? 'font-semibold text-gray-800 dark:text-zinc-100' : 'text-gray-500 dark:text-zinc-400'}`}>
                      {tag.name}
                    </span>
                  </button>
                  <button
                    onClick={() => { setEditingId(tag.id); setEditName(tag.name); setEditColor(tag.color); }}
                    title="Renomear / mudar cor"
                    className="hidden rounded p-1 text-gray-400 hover:text-blue-600 group-hover/row:block"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteTag(tag)}
                    title="Excluir tag (sai de todos os cards)"
                    className="hidden rounded p-1 text-gray-400 hover:text-red-500 group-hover/row:block"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Criar nova tag */}
          <div className="space-y-1.5 border-t border-gray-100 p-2.5 dark:border-zinc-800">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Nova tag</p>
            <div className="flex gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="Nome da tag..."
                maxLength={30}
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8 shrink-0 px-2.5" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {TAG_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${newColor === c ? 'ring-2 ring-offset-1 ring-gray-500 dark:ring-offset-zinc-900' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
