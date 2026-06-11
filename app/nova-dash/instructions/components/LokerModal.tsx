/* eslint-disable no-unused-vars */
"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, Upload, Loader2, FileText, File as FileIcon } from "lucide-react";
import type { LockerEntry, LockerFile } from "./LokerCard";

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

type Props = {
  open: boolean;
  entry?: LockerEntry | null;
  onClose: () => void;
  onSave: (entry: LockerEntry) => void;
};

const COLORS: LockerEntry["color"][] = ["amber", "sage", "rose", "sky", "stone"];
const COLOR_LABELS: Record<LockerEntry["color"], string> = {
  amber: "#f59e0b",
  sage: "#34d399",
  rose: "#f43f5e",
  sky: "#38bdf8",
  stone: "#a8a29e",
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

type PendingFile = { localId: string; file: File };

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

function apiToEntry(i: ApiInstruction): LockerEntry {
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

export function LockerModal({ open, entry, onClose, onSave }: Props) {
  const isEdit = !!entry;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [color, setColor] = useState<LockerEntry["color"]>("amber");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [existingFiles, setExistingFiles] = useState<LockerFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([]);
  const [hasText, setHasText] = useState(true);
  const [hasFiles, setHasFiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setTitle(entry.title);
      setDescription(entry.description ?? "");
      setText(entry.text ?? "");
      setColor(entry.color);
      setTags(entry.tags ?? []);
      setExistingFiles(entry.files ?? []);
      setHasText(!!entry.text);
      setHasFiles(!!(entry.files && entry.files.length > 0));
    } else {
      setTitle("");
      setDescription("");
      setText("");
      setColor("amber");
      setTags([]);
      setExistingFiles([]);
      setHasText(true);
      setHasFiles(false);
    }
    setPendingFiles([]);
    setRemovedFileIds([]);
    setTagInput("");
    setError(null);
  }, [entry, open]);

  function handleTagAdd() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    const next: PendingFile[] = [];
    for (let i = 0; i < list.length; i++) {
      next.push({
        localId: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        file: list[i],
      });
    }
    setPendingFiles((prev) => [...prev, ...next]);
    e.target.value = "";
  }

  function removePending(id: string) {
    setPendingFiles((prev) => prev.filter((p) => p.localId !== id));
  }

  function removeExisting(id?: string) {
    if (!id) return;
    setRemovedFileIds((prev) => [...prev, id]);
    setExistingFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function formatPendingSize(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  async function uploadPending(instructionId: string) {
    for (const p of pendingFiles) {
      const fd = new FormData();
      fd.append("instructionId", instructionId);
      fd.append("file", p.file);
      const res = await fetch("/api/instructions/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("Falha no upload de arquivo");
    }
  }

  async function deleteRemoved() {
    for (const id of removedFileIds) {
      const res = await fetch(`/api/instructions/files/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Falha ao remover arquivo");
    }
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        text: hasText && text.trim() ? text.trim() : null,
        color,
        tags: tags.length > 0 ? tags : [],
      };

      const url = isEdit ? `/api/instructions/${entry!.id}` : "/api/instructions";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      const saved: ApiInstruction = await res.json();

      if (isEdit) await deleteRemoved();
      if (hasFiles && pendingFiles.length > 0) await uploadPending(saved.id);

      const refreshed = await fetch(`/api/instructions/${saved.id}`, {
        cache: "no-store",
      });
      if (!refreshed.ok) throw new Error("Falha ao recarregar");
      const full: ApiInstruction = await refreshed.json();

      onSave(apiToEntry(full));
    } catch (e) {
      console.error(e);
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={saving ? undefined : onClose} />

      <div
        className="relative bg-card w-full max-w-xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-foreground" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {isEdit ? "Editar instrução" : "Nova instrução"}
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="px-3 py-2 rounded-lg text-sm bg-destructive/10 text-destructive border border-destructive/30">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-foreground mb-1.5">
              Título <span className="text-destructive">*</span>
            </label>
            <input
              className="w-full px-3 py-2.5 rounded-lg bg-input-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/60 transition text-sm"
              placeholder="Nome da instrução..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-foreground mb-1.5">Descrição breve</label>
            <input
              className="w-full px-3 py-2.5 rounded-lg bg-input-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/60 transition text-sm"
              placeholder="Subtítulo ou resumo..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-foreground mb-2">Cor de identificação</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none"
                  style={{
                    backgroundColor: COLOR_LABELS[c],
                    boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${COLOR_LABELS[c]}` : "none",
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-foreground mb-1.5">Tags</label>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-lg bg-input-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/60 transition text-sm"
                placeholder="Adicionar tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleTagAdd(); } }}
              />
              <button
                onClick={handleTagAdd}
                className="px-3 py-2 rounded-lg bg-secondary text-secondary-foreground border border-border hover:bg-muted transition text-sm"
              >
                <Plus size={16} />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground cursor-pointer hover:bg-muted transition"
                    onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  >
                    {tag} <X size={10} />
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm text-foreground mb-2">Tipo de conteúdo</label>
            <div className="flex gap-3">
              <button
                onClick={() => setHasText((v) => !v)}
                className={`flex-1 py-2 rounded-lg border text-sm transition-colors flex items-center justify-center gap-1.5 ${
                  hasText
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                <FileText size={14} /> Texto
              </button>
              <button
                onClick={() => setHasFiles((v) => !v)}
                className={`flex-1 py-2 rounded-lg border text-sm transition-colors flex items-center justify-center gap-1.5 ${
                  hasFiles
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                <FileIcon size={14} /> Arquivos
              </button>
            </div>
          </div>

          {hasText && (
            <div>
              <label className="block text-sm text-foreground mb-1.5">Conteúdo de texto</label>
              <textarea
                className="w-full px-3 py-2.5 rounded-lg bg-input-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/60 transition text-sm resize-none"
                placeholder="Escreva suas instruções aqui..."
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}

          {hasFiles && (
            <div>
              <label className="block text-sm text-foreground mb-1.5">Arquivos</label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilePick}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors text-sm"
              >
                <Upload size={16} />
                Selecionar arquivos
              </button>

              {(existingFiles.length > 0 || pendingFiles.length > 0) && (
                <div className="mt-2 space-y-2">
                  {existingFiles.map((file) => (
                    <div key={file.id ?? file.name} className="flex items-center gap-3 px-3 py-2 bg-muted rounded-lg">
                      <span className="text-lg leading-none">{getFileIcon(file.name)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{file.size || "—"} · salvo</p>
                      </div>
                      <button
                        onClick={() => removeExisting(file.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {pendingFiles.map((p) => (
                    <div key={p.localId} className="flex items-center gap-3 px-3 py-2 bg-accent/5 border border-accent/30 rounded-lg">
                      <span className="text-lg leading-none">{getFileIcon(p.file.name)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{p.file.name}</p>
                        <p className="text-xs text-accent">{formatPendingSize(p.file.size)} · novo (será enviado ao salvar)</p>
                      </div>
                      <button
                        onClick={() => removePending(p.localId)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border flex-shrink-0 bg-card">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-5 py-2 rounded-lg text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Salvar alterações" : "Criar instrução"}
          </button>
        </div>
      </div>
    </div>
  );
}
