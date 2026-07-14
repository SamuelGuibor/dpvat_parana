"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, FolderOpen, SlidersHorizontal, X, Loader2 } from "lucide-react";
import { LockerCard } from "./components/LokerCard";
import { LockerModal } from "./components/LokerModal";
import { ViewModal } from "./components/ViewModal";
import { DeleteConfirm } from "./components/DeleteConfirm";
import type { LockerEntry } from "./components/LokerCard";
import { toast } from 'sonner';

{/* MARKER-MAKE-KIT-INVOKED */}
{/* MARKER-MAKE-KIT-DISCOVERY-READ */}

const FILTER_COLORS: { value: LockerEntry["color"] | "all"; label: string; dot: string }[] = [
  { value: "all", label: "Todas", dot: "bg-muted-foreground" },
  { value: "amber", label: "Âmbar", dot: "bg-amber-400" },
  { value: "sage", label: "Verde", dot: "bg-emerald-400" },
  { value: "rose", label: "Rosa", dot: "bg-rose-400" },
  { value: "sky", label: "Azul", dot: "bg-sky-400" },
  { value: "stone", label: "Cinza", dot: "bg-stone-400" },
];

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "Atualizado agora mesmo";
  const min = Math.floor(sec / 60);
  if (min < 60) return `Atualizado há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `Atualizado há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Atualizado ontem";
  if (days < 7) return `Atualizado há ${days} dias`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `Atualizado há ${weeks} sem${weeks > 1 ? "anas" : ""}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Atualizado há ${months} ${months === 1 ? "mês" : "meses"}`;
  return date.toLocaleDateString("pt-BR");
}

type ApiInstruction = {
  id: string;
  title: string;
  description: string | null;
  text: string | null;
  color: LockerEntry["color"];
  tags: string[];
  folderName: string;
  updatedAt: string;
  files: { id: string; name: string; key: string; size: string | null; type: string | null }[];
};

function fromApi(i: ApiInstruction): LockerEntry {
  return {
    id: i.id,
    title: i.title,
    description: i.description ?? undefined,
    text: i.text ?? undefined,
    files: i.files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ?? "",
      type: f.type ?? "default",
      key: f.key,
    })),
    tags: i.tags ?? [],
    color: i.color,
    updatedAt: formatRelative(i.updatedAt),
    folderName: i.folderName,
  };
}

export default function App() {
  const [entries, setEntries] = useState<LockerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [colorFilter, setColorFilter] = useState<LockerEntry["color"] | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<LockerEntry | null>(null);
  const [viewEntry, setViewEntry] = useState<LockerEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  async function loadEntries() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/instructions", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar");
      const data: ApiInstruction[] = await res.json();
      setEntries(data.map(fromApi));
    } catch (e) {
      console.error(e);
      setError("Não foi possível carregar as instruções. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const q = search.toLowerCase();
      const matchesSearch =
        e.title.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q));
      const matchesColor = colorFilter === "all" || e.color === colorFilter;
      return matchesSearch && matchesColor;
    });
  }, [entries, search, colorFilter]);

  function handleSave(entry: LockerEntry) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        const arr = [...prev];
        arr[idx] = entry;
        return arr;
      }
      return [entry, ...prev];
    });
    setModalOpen(false);
    setEditEntry(null);
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/instructions/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Falha ao excluir");
      setEntries((prev) => prev.filter((e) => e.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível excluir a instrução.");
    } finally {
      setDeleting(false);
    }
  }

  const deleteEntry = entries.find((e) => e.id === deleteId);

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Rubik', sans-serif" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2.5 mr-auto">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FolderOpen size={16} className="text-primary-foreground" />
            </div>
            <div>
              <h1
                className="text-foreground leading-tight"
                style={{ fontSize: "1.125rem" }}
              >
                Armário de Instruções
              </h1>
              <p className="text-muted-foreground hidden sm:block" style={{ fontSize: "0.75rem" }}>
                {entries.length} instrução{entries.length !== 1 ? "ões" : ""} armazenadas
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
              showFilters || colorFilter !== "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            }`}
          >
            <SlidersHorizontal size={15} />
            <span className="hidden sm:inline">Filtros</span>
            {colorFilter !== "all" && (
              <span className="w-4 h-4 rounded-full bg-accent text-accent-foreground text-xs flex items-center justify-center leading-none">1</span>
            )}
          </button>

          <button
            onClick={() => { setEditEntry(null); setModalOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nova instrução</span>
            <span className="sm:hidden">Nova</span>
          </button>
        </div>

        {/* Search & filters */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm transition"
              placeholder="Pesquisar por título, descrição ou tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 mt-3">
              {FILTER_COLORS.map((fc) => (
                <button
                  key={fc.value}
                  onClick={() => setColorFilter(fc.value)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors ${
                    colorFilter === fc.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${fc.dot}`} />
                  {fc.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <button
              onClick={loadEntries}
              className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90"
            >
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FolderOpen size={28} className="text-muted-foreground" />
            </div>
            <h3 className="text-foreground mb-1">Nenhuma instrução encontrada</h3>
            <p className="text-muted-foreground text-sm mb-6">
              {search || colorFilter !== "all"
                ? "Tente ajustar os filtros de busca."
                : "Comece criando sua primeira instrução."}
            </p>
            {!search && colorFilter === "all" && (
              <button
                onClick={() => { setEditEntry(null); setModalOpen(true); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus size={16} /> Criar primeira instrução
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm mb-5">
              {filtered.length} {filtered.length === 1 ? "instrução" : "instruções"}
              {(search || colorFilter !== "all") && " encontrada" + (filtered.length !== 1 ? "s" : "")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((entry) => (
                <LockerCard
                  key={entry.id}
                  entry={entry}
                  onView={(e) => setViewEntry(e)}
                  onEdit={(e) => { setEditEntry(e); setModalOpen(true); }}
                  onDelete={(id) => setDeleteId(id)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      <LockerModal
        open={modalOpen}
        entry={editEntry}
        onClose={() => { setModalOpen(false); setEditEntry(null); }}
        onSave={handleSave}
      />
      <ViewModal
        open={!!viewEntry}
        entry={viewEntry}
        onClose={() => setViewEntry(null)}
        onEdit={(e) => { setViewEntry(null); setEditEntry(e); setModalOpen(true); }}
        onDelete={(id) => { setViewEntry(null); setDeleteId(id); }}
      />
      <DeleteConfirm
        open={!!deleteId}
        title={deleteEntry?.title ?? ""}
        loading={deleting}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
