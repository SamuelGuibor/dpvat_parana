"use client";

// Busca global do CRM (Ctrl+K): encontra cards por nome, nº, CPF ou telefone
// e navega entre as abas — antes a única busca era a do kanban (nome/nº) e
// não havia nenhum atalho de teclado na aplicação.

import { useCallback, useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { Search, Trello, Archive, Ticket, UserCircle, FileText, User as UserIcon, Loader2 } from "lucide-react";
import { onlyDigits, formatPhone } from "@/app/_shared/utils/format";
import { searchArchivedCards, type ArchivedSearchHit } from "@/app/_actions/cards/search-archived";

interface CardHit {
  id: string;
  name: string;
  cpf?: string | null;
  telefone?: string | null;
  cardNumber?: number | null;
  isProcess: boolean;
  columnName?: string | null;
}

interface Props {
  // eslint-disable-next-line no-unused-vars
  onNavigate: (tab: string) => void;
  canViewArchived: boolean;
  canViewTickets: boolean;
}

export function GlobalSearch({ onNavigate, canViewArchived, canViewTickets }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CardHit[]>([]);
  const [archived, setArchived] = useState<ArchivedSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  // Arquivados entram na busca (com a divisão) — evita card duplicado de
  // cliente que já passou pelo escritório. Debounce próprio de 250ms.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setArchived([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      searchArchivedCards(q)
        .then((hits) => { if (alive) setArchived(hits); })
        .catch(() => { if (alive) setArchived([]); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [open, query]);

  // Ctrl+K / Cmd+K abre; Esc fecha (o cmdk cuida do resto).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Carrega os cards uma vez por abertura de sessão do palette (payload do
  // board reaproveitado; recarrega ao reabrir depois de 60s).
  useEffect(() => {
    if (!open || loadedRef.current) return;
    let alive = true;
    setLoading(true);
    fetch("/api/board-state", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        const users: CardHit[] = (data.users ?? []).map((u: CardHit & { label?: { name?: string } }) => ({
          id: u.id, name: u.name, cpf: u.cpf, telefone: u.telefone,
          cardNumber: u.cardNumber, isProcess: false, columnName: u.label?.name ?? null,
        }));
        const processes: CardHit[] = (data.processes ?? []).map((p: CardHit & { label?: { name?: string } }) => ({
          id: p.id, name: p.name, cpf: p.cpf, telefone: p.telefone,
          cardNumber: p.cardNumber, isProcess: true, columnName: p.label?.name ?? null,
        }));
        setCards([...users, ...processes]);
        loadedRef.current = true;
        setTimeout(() => { loadedRef.current = false; }, 60_000);
      })
      .catch(() => { /* busca segue só com navegação */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  function openCard(card: CardHit) {
    close();
    // sessionStorage cobre o caso do board ainda não estar montado quando o
    // evento dispara (mesmo padrão das notificações → inbox).
    sessionStorage.setItem("kanban-open-card", JSON.stringify({ id: card.id, isProcess: card.isProcess }));
    onNavigate("kanban");
    window.dispatchEvent(new CustomEvent("open-kanban-card", { detail: { id: card.id, isProcess: card.isProcess } }));
  }

  function goTo(tab: string) {
    close();
    onNavigate(tab);
  }

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const qDigits = onlyDigits(query);
  const cardHits = q.length < 2 ? [] : cards.filter((c) => {
    const nameHit = c.name.toLowerCase().includes(q);
    const numberHit = qDigits.length > 0 && c.cardNumber != null && String(c.cardNumber).includes(qDigits);
    const cpfHit = qDigits.length >= 4 && onlyDigits(c.cpf).includes(qDigits);
    const phoneHit = qDigits.length >= 4 && onlyDigits(c.telefone).includes(qDigits);
    return nameHit || numberHit || cpfHit || phoneHit;
  }).slice(0, 12);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[12vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <Command
        shouldFilter={false}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onKeyDown={(e) => { if (e.key === "Escape") close(); }}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 dark:border-zinc-800">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar card por nome, nº, CPF ou telefone…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-zinc-100"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 dark:border-zinc-700">ESC</kbd>
        </div>

        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Group heading="Navegação" className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 [&_[cmdk-group-items]]:mt-1">
            <PaletteItem icon={<Trello className="h-4 w-4" />} label="Quadro Kanban" onSelect={() => goTo("kanban")} />
            {canViewArchived && (
              <PaletteItem icon={<Archive className="h-4 w-4" />} label="Arquivados" onSelect={() => goTo("arquivados")} />
            )}
            {canViewTickets && (
              <PaletteItem icon={<Ticket className="h-4 w-4" />} label="Tickets Dev" onSelect={() => goTo("tickets-dev")} />
            )}
            <PaletteItem icon={<UserCircle className="h-4 w-4" />} label="Espaço de Trabalho" onSelect={() => goTo("meu-espaco")} />
          </Command.Group>

          {q.length >= 2 && (
            <Command.Group heading={`Cards (${cardHits.length})`} className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 [&_[cmdk-group-items]]:mt-1">
              {cardHits.length === 0 && archived.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm normal-case tracking-normal text-gray-400">
                  Nenhum card encontrado para “{query}”.
                </p>
              ) : (
                cardHits.map((c) => (
                  <PaletteItem
                    key={`${c.isProcess ? "p" : "u"}:${c.id}`}
                    icon={c.isProcess ? <FileText className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                    label={
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2 normal-case tracking-normal">
                        <span className="truncate font-medium">
                          {c.name}
                          {c.cardNumber != null && <span className="ml-1 text-gray-400">#{c.cardNumber}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {c.telefone ? formatPhone(c.telefone) : c.columnName ?? ""}
                        </span>
                      </span>
                    }
                    onSelect={() => openCard(c)}
                  />
                ))
              )}
            </Command.Group>
          )}

          {q.length >= 2 && archived.length > 0 && (
            <Command.Group heading={`Já arquivados (${archived.length})`} className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600 [&_[cmdk-group-items]]:mt-1">
              {archived.map((hit) => (
                <PaletteItem
                  key={`arch-${hit.isProcess ? "p" : "u"}:${hit.id}`}
                  icon={<Archive className="h-4 w-4 text-amber-500" />}
                  label={
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2 normal-case tracking-normal">
                      <span className="truncate font-medium">
                        {hit.name}
                        {hit.cardNumber != null && <span className="ml-1 text-gray-400">#{hit.cardNumber}</span>}
                      </span>
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        {hit.division}
                      </span>
                    </span>
                  }
                  onSelect={() => { if (canViewArchived) goTo("arquivados"); }}
                />
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}

function PaletteItem({ icon, label, onSelect }: { icon: React.ReactNode; label: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm normal-case tracking-normal text-gray-700 aria-selected:bg-blue-50 aria-selected:text-blue-700 dark:text-zinc-200 dark:aria-selected:bg-blue-950/40 dark:aria-selected:text-blue-300"
    >
      <span className="text-gray-400">{icon}</span>
      {label}
    </Command.Item>
  );
}
