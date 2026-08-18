'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, BookUser, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/app/_shared/ui/avatar';
import {
  listWaContactsDirectory, openContactConversation, type WaDirectoryContact,
} from '@/app/_actions/whatsapp/contacts';

// Pasta "Contatos" do inbox (18/08/2026): a AGENDA da linha — todos os
// contatos, mesmo quem nunca trocou mensagem (os 2.224 importados do
// BotConversa vivem aqui). Clicar abre a conversa (criando-a em atendimento
// humano se não existir — fora da janela de 24h o composer oferece template).

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function formatPhone(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function ContactsDirectory({ search, numberFilter, numberLabelOf, onOpen }: {
  search: string;
  numberFilter: string | null;
  /** Etiqueta da linha (multi-número) — null quando só há um número. */
  numberLabelOf: ((numberId: string | null) => { label: string; dot: string } | null) | null;
  onOpen: (contactId: string) => void;
}) {
  const [items, setItems] = useState<WaDirectoryContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  // Busca no servidor com debounce — a agenda pode ter milhares de linhas.
  const requestSeq = useRef(0);
  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    const t = setTimeout(() => {
      listWaContactsDirectory(search, numberFilter, 0)
        .then((page) => {
          if (requestSeq.current !== seq) return;
          setItems(page.items);
          setTotal(page.total);
        })
        .catch(() => { if (requestSeq.current === seq) { setItems([]); setTotal(0); } })
        .finally(() => { if (requestSeq.current === seq) setLoading(false); });
    }, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, numberFilter]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await listWaContactsDirectory(search, numberFilter, items.length);
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch {
      toast.error('Falha ao carregar mais contatos.');
    } finally {
      setLoadingMore(false);
    }
  };

  const open = async (c: WaDirectoryContact) => {
    setOpening(c.id);
    try {
      await openContactConversation(c.id);
      onOpen(c.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao abrir a conversa.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-[#8fbcac]">
        <BookUser className="h-3.5 w-3.5" /> Agenda de contatos
        {!loading && (
          <span className="rounded-full bg-[#2e5749] px-1.5 text-[10px] font-bold text-[#cfe6db]">
            {total.toLocaleString('pt-BR')}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[#8fbcac]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-[#a7c9bc]">Nenhum contato encontrado.</p>
      ) : (
        <>
          {items.map((c) => {
            const nb = numberLabelOf ? numberLabelOf(c.numberId) : null;
            return (
              <button
                key={c.id}
                onClick={() => open(c)}
                disabled={opening === c.id}
                className="mx-1.5 mb-0.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[#d3e2db] transition-colors hover:bg-[#26483c] disabled:opacity-60"
              >
                <Avatar className="h-9 w-9 shrink-0 border border-[#3a6b58]">
                  <AvatarFallback className="bg-[#356b57] text-[11px] font-bold text-[#c5ecdb]">
                    {initials(c.name ?? c.phone)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{c.name ?? formatPhone(c.phone)}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#a7c9bc]">
                    <span className="truncate">{formatPhone(c.phone)}</span>
                    {c.importSource === 'botconversa' && (
                      <span className="shrink-0 rounded-md bg-[#33544a] px-1.5 py-0.5 text-[9px] font-bold text-[#f2d38f]">BotConversa</span>
                    )}
                    {nb && (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-[#33544a] px-1.5 py-0.5 text-[9px] font-bold text-[#cfe6db]">
                        <span className={`h-1.5 w-1.5 rounded-full ${nb.dot}`} />
                        {nb.label}
                      </span>
                    )}
                  </span>
                </span>
                {opening === c.id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#6fd6ad]" />
                ) : c.conversationStatus ? (
                  <span title="Já tem conversa — clique para abrir" className="shrink-0 text-[#6fd6ad]">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-[#3a6b58] px-2 py-0.5 text-[9px] font-bold text-[#8fbcac]">
                    sem conversa
                  </span>
                )}
              </button>
            );
          })}
          {items.length < total && (
            <div className="px-3 pt-1">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-lg border border-[#3a6b58] bg-[#2e5749] py-1.5 text-[11px] font-bold text-[#6fd6ad] hover:bg-[#356b57] disabled:opacity-60"
              >
                {loadingMore ? 'Carregando…' : `Mostrando ${items.length.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} · Carregar mais`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
