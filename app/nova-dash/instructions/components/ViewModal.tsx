/* eslint-disable no-unused-vars */
"use client";

import { useState } from "react";
import {
  X,
  Tag,
  FileText,
  File as FileIcon,
  Download,
  Edit2,
  Trash2,
  Clock,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { LockerEntry, LockerFile } from "./LokerCard";

type Props = {
  open: boolean;
  entry: LockerEntry | null;
  onClose: () => void;
  onEdit: (entry: LockerEntry) => void;
  onDelete: (id: string) => void;
};

const COLOR_HEX: Record<LockerEntry["color"], string> = {
  amber: "#f59e0b",
  sage: "#34d399",
  rose: "#f43f5e",
  sky: "#38bdf8",
  stone: "#a8a29e",
};

const colorMap: Record<LockerEntry["color"], { tab: string; badge: string; icon: string; soft: string }> = {
  amber: { tab: "bg-amber-400", badge: "bg-amber-100 text-amber-800", icon: "text-amber-600", soft: "bg-amber-50" },
  sage:  { tab: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-800", icon: "text-emerald-600", soft: "bg-emerald-50" },
  rose:  { tab: "bg-rose-400", badge: "bg-rose-100 text-rose-800", icon: "text-rose-600", soft: "bg-rose-50" },
  sky:   { tab: "bg-sky-400", badge: "bg-sky-100 text-sky-800", icon: "text-sky-600", soft: "bg-sky-50" },
  stone: { tab: "bg-stone-400", badge: "bg-stone-100 text-stone-800", icon: "text-stone-600", soft: "bg-stone-50" },
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
const getFileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "default";
  return fileIconMap[ext] ?? fileIconMap.default;
};

export function ViewModal({ open, entry, onClose, onEdit, onDelete }: Props) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open || !entry) return null;

  const colors = colorMap[entry.color];
  const hex = COLOR_HEX[entry.color];
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

  async function copyText() {
    if (!entry?.text) return;
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {/* Color tab top */}
        <div className={`h-2 w-full ${colors.tab}`} />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${hex}1A` }}
            >
              {hasFiles && hasText ? (
                <FileText size={20} className={colors.icon} />
              ) : hasFiles ? (
                <FileIcon size={20} className={colors.icon} />
              ) : (
                <FileText size={20} className={colors.icon} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2
                className="text-foreground leading-tight truncate"
                style={{ fontFamily: "'DM Serif Display', serif", fontSize: "1.25rem" }}
              >
                {entry.title}
              </h2>
              {entry.description && (
                <p className="text-muted-foreground mt-0.5 text-sm">{entry.description}</p>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                <Clock size={11} />
                {entry.updatedAt}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${colors.badge}`}
                >
                  <Tag size={10} /> {tag}
                </span>
              ))}
            </div>
          )}

          {/* Content type badges */}
          <div className="flex items-center gap-2">
            {hasText && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-stone-100 text-stone-700">
                <FileText size={11} /> Texto
              </span>
            )}
            {hasFiles && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-stone-100 text-stone-700">
                <FileIcon size={11} /> {entry.files!.length} arquivo{entry.files!.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {hasText && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Conteúdo</p>
                <button
                  onClick={copyText}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 size={12} className="text-emerald-500" /> Copiado
                    </>
                  ) : (
                    "Copiar"
                  )}
                </button>
              </div>
              <div
                className={`rounded-xl p-4 border border-border ${colors.soft} text-foreground leading-relaxed text-sm whitespace-pre-wrap`}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {entry.text}
              </div>
            </div>
          )}

          {hasFiles && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
                Arquivos ({entry.files!.length})
              </p>
              <div className="space-y-2">
                {entry.files!.map((file) => (
                  <div
                    key={file.id ?? file.name}
                    className="flex items-center gap-3 px-3 py-3 bg-card rounded-xl border border-border hover:border-accent/40 transition-colors group"
                  >
                    <span className="text-2xl leading-none">{getFileIcon(file.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.size || "—"}</p>
                    </div>
                    <button
                      onClick={() => handleDownload(file)}
                      disabled={downloadingId === file.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-wait"
                    >
                      {downloadingId === file.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      <span className="hidden sm:inline">
                        {downloadingId === file.id ? "Baixando..." : "Baixar"}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasText && !hasFiles && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Esta instrução não possui conteúdo nem arquivos.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border flex-shrink-0 bg-card">
          <button
            onClick={() => onDelete(entry.id)}
            className="px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors border border-destructive/30 flex items-center gap-1.5"
          >
            <Trash2 size={14} /> Excluir
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
            >
              Fechar
            </button>
            <button
              onClick={() => onEdit(entry)}
              className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <Edit2 size={14} /> Editar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
