/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useMemo, useState } from 'react';
import { Hash, Loader2, Check, Search } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/app/_shared/ui/dialog';
import { Input } from '@/app/_shared/ui/input';
import { Button } from '@/app/_shared/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { toast } from 'sonner';
import { createChannel } from '@/app/_actions/chat/channels';
import type { PresenceMember } from '@/app/_shared/hooks/use-presence';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'U';
}
function avatarUrl(m: { id: string; image: string | null }) {
  return m.image || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(m.id)}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  members: PresenceMember[]; // candidatos (exclui o próprio usuário)
  onCreated: (channelId: string) => void;
}

export function NewChannelDialog({ open, onClose, members, onCreated }: Props) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () => members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())),
    [members, query],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function reset() {
    setName(''); setQuery(''); setSelected(new Set()); setSaving(false);
  }

  async function submit() {
    if (!name.trim()) { toast.error('Dê um nome ao canal.'); return; }
    setSaving(true);
    try {
      const ch = await createChannel({ name: name.trim(), memberIds: Array.from(selected) });
      toast.success(`Canal "${ch.name}" criado!`);
      onCreated(ch.id);
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar canal.');
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Hash className="h-4 w-4 text-blue-500" /> Novo canal</DialogTitle>
          <DialogDescription>Canal restrito — só os membros escolhidos veem as mensagens.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input placeholder="Nome do canal (ex.: Financeiro)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input placeholder="Buscar membros..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-100 p-1 dark:border-zinc-800">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Ninguém encontrado.</p>
            ) : filtered.map((m) => {
              const on = selected.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${on ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={avatarUrl(m)} alt={m.name} />
                    <AvatarFallback className="bg-blue-100 text-[10px] font-bold text-blue-700">{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-zinc-200">{m.name}</span>
                  <span className={`grid h-5 w-5 place-items-center rounded-full border ${on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300 dark:border-zinc-600'}`}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400">{selected.size} selecionado(s) · você entra automaticamente.</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !name.trim()} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Criando...</> : 'Criar canal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
