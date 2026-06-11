/* eslint-disable no-unused-vars */
"use client";

import { useState } from "react";
import {
  FileText,
  File,
  MoreVertical,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Tag,
  Clock,
  Eye,
  Download,
  Loader2,
} from "lucide-react";

export type LockerFile = {
  id?: string;
  name: string;
  size: string;
  type: string;
  key?: string;
};

export type LockerEntry = {
  id: string;
  title: string;
  description?: string;
  text?: string;
  files?: LockerFile[];
  tags?: string[];
  updatedAt: string;
  color: "amber" | "sage" | "rose" | "sky" | "stone";
  folderName?: string;
};

const colorMap: Record<LockerEntry["color"], { tab: string; badge: string; icon: string }> = {
  amber: { tab: "bg-amber-600", badge: "bg-amber-200 text-amber-900", icon: "text-amber-700" },
  sage:  { tab: "bg-emerald-600", badge: "bg-emerald-200 text-emerald-900", icon: "text-emerald-700" },
  rose:  { tab: "bg-rose-600", badge: "bg-rose-200 text-rose-900", icon: "text-rose-700" },
  sky:   { tab: "bg-sky-600", badge: "bg-sky-200 text-sky-900", icon: "text-sky-700" },
  stone: { tab: "bg-stone-600", badge: "bg-stone-200 text-stone-900", icon: "text-stone-700" },
};

const fileIconMap: Record<string, string> = {
  pdf: "📄",
  doc: "📝",
  docx: "📝",
  xls: "📊",
  xlsx: "📊",
  png: "🖼️",
  jpg: "🖼️",
  jpeg: "🖼️",
  zip: "🗜️",
  default: "📎",
};

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "default";
  return fileIconMap[ext] ?? fileIconMap.default;
}

type Props = {
  entry: LockerEntry;
  onEdit: (entry: LockerEntry) => void;
  onDelete: (id: string) => void;
  onView?: (entry: LockerEntry) => void;
};

export function LockerCard({ entry, onEdit, onDelete, onView }: Props) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const colors = colorMap[entry.color];
  const hasText = !!entry.text;
  const hasFiles = entry.files && entry.files.length > 0;

  async function handleDownload(file: LockerFile) {
    if (!file.id) return;
    try {
      setDownloadingId(file.id);
      const res = await fetch(
        `/api/instructions/download?fileId=${file.id}&mode=download`,
      );
      if (!res.ok) throw new Error("Falha");
      const { url } = await res.json();
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
      alert("Não foi possível baixar o arquivo.");
    } finally {
      setDownloadingId(null);
    }
  }

  function handleCardClick() {
    if (onView) {
      onView(entry);
    } else {
      setOpen((v) => !v);
    }
  }

  return (
    <div
      className="relative bg-card rounded-xl border border-border shadow-sm hover:shadow-md hover:border-accent/40 transition-all duration-200 overflow-hidden group"
      style={{ fontFamily: "'Rubik', sans-serif" }}
    >
      {/* Color tab */}
      <div className={`h-1.5 w-full ${colors.tab}`} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
              {hasFiles && hasText ? (
                <FileText size={18} className={colors.icon} />
              ) : hasFiles ? (
                <File size={18} className={colors.icon} />
              ) : (
                <FileText size={18} className={colors.icon} />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-foreground">{entry.title}</h3>
              {entry.description && (
                <p className="truncate text-muted-foreground" style={{ fontSize: "0.8125rem" }}>
                  {entry.description}
                </p>
              )}
            </div>
          </div>

          {/* Actions menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-20 bg-card border border-border rounded-xl shadow-lg py-1 w-36 overflow-hidden">
                  {onView && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onView(entry); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Eye size={14} /> Visualizar
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(entry); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Edit2 size={14} /> Editar
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(entry.id); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    <Trash2 size={14} /> Excluir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tags */}
        {entry.tags && entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {entry.tags.map((tag) => (
              <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${colors.badge}`}>
                <Tag size={10} /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* Type badges */}
        <div className="flex items-center gap-2 mt-3">
          {hasText && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600">
              <FileText size={10} /> Texto
            </span>
          )}
          {hasFiles && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-600">
              <File size={10} /> {entry.files!.length} arquivo{entry.files!.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Expand / open button */}
        <button
          onClick={handleCardClick}
          className="mt-4 w-full flex items-center justify-between pt-3 border-t border-border text-muted-foreground hover:text-foreground transition-colors"
          style={{ fontSize: "0.8125rem" }}
        >
          <span className="flex items-center gap-1.5">
            <Clock size={12} />
            {entry.updatedAt}
          </span>
          <span className="flex items-center gap-1">
            {onView ? (
              <>
                <Eye size={13} /> Abrir
              </>
            ) : (
              <>
                {open ? "Fechar" : "Abrir"}
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </>
            )}
          </span>
        </button>
      </div>

      {/* Expanded content (only when onView NOT provided) */}
      {!onView && open && (
        <div className="px-5 pb-5 border-t border-border bg-background/50">
          {hasText && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">Conteúdo</p>
              <div className="text-foreground leading-relaxed bg-card rounded-lg p-4 border border-border text-sm whitespace-pre-wrap">
                {entry.text}
              </div>
            </div>
          )}
          {hasFiles && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-widest">Arquivos</p>
              <div className="space-y-2">
                {entry.files!.map((file) => (
                  <div
                    key={file.id ?? file.name}
                    className="flex items-center gap-3 px-3 py-2.5 bg-card rounded-lg border border-border hover:border-accent/40 transition-colors"
                  >
                    <span className="text-lg leading-none">{getFileIcon(file.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.size}</p>
                    </div>
                    {file.id && (
                      <button
                        onClick={() => handleDownload(file)}
                        disabled={downloadingId === file.id}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-accent hover:bg-accent/10 disabled:opacity-40"
                      >
                        {downloadingId === file.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Download size={12} />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
