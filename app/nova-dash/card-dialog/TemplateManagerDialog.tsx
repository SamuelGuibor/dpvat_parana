"use client";

// Gerenciador dos modelos .docx do "Gerar Procuração": enviar novos,
// renomear e excluir sem deploy. Modelos do repositório não somem de
// verdade — ficam ocultos e dá pra restaurar. Permissão: manage_templates.

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/_shared/ui/dialog";
import { Button } from "@/app/_shared/ui/button";
import {
  Check,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/app/_shared/lib/utils";
import {
  confirmDocTemplateUpload,
  deleteDocTemplate,
  getDocTemplateUploadUrl,
  listDocTemplatesAdmin,
  renameDocTemplate,
  restoreDocTemplate,
  type DocTemplateInfo,
  type DocTemplateKind,
} from "@/app/_actions/templates/doc-templates";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function TemplateManagerDialog({
  open,
  onClose,
}: {
  open: boolean;
  /** Recebe true quando algo mudou (o seletor da aba precisa recarregar). */
  onClose: (changed: boolean) => void;
}) {
  // Dois grupos: modelos do "Gerar Procuração" e modelos do contrato que o
  // bot manda pra assinatura eletrônica (KIT).
  const [kind, setKind] = useState<DocTemplateKind>("procuracao");
  const [templates, setTemplates] = useState<DocTemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocTemplateInfo | null>(null);
  const changedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditing(null);
    listDocTemplatesAdmin(kind)
      .then(setTemplates)
      .catch((err) => toast.error(err?.message || "Erro ao carregar modelos"))
      .finally(() => setLoading(false));
  }, [open, kind]);

  useEffect(() => {
    if (open) changedRef.current = false;
  }, [open]);

  async function handleUpload(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Só arquivos .docx (os modelos usam tags [[campo]] do Word).");
      return;
    }
    setUploading(true);
    try {
      const { url, key, filename } = await getDocTemplateUploadUrl(file.name, kind);
      const put = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": DOCX_MIME },
        body: file,
      });
      if (!put.ok) throw new Error(`Falha no envio (${put.status})`);
      const list = await confirmDocTemplateUpload({ key, filename, kind });
      setTemplates(list);
      changedRef.current = true;
      toast.success(`Modelo "${filename}" adicionado!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar o modelo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRename(t: DocTemplateInfo) {
    const label = editValue.trim();
    if (!label || label === t.label) {
      setEditing(null);
      return;
    }
    setBusy(t.filename);
    try {
      const list = await renameDocTemplate(t.filename, label, kind);
      setTemplates(list);
      changedRef.current = true;
      toast.success("Modelo renomeado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao renomear");
    } finally {
      setBusy(null);
      setEditing(null);
    }
  }

  async function handleDelete(t: DocTemplateInfo) {
    setBusy(t.filename);
    try {
      const list = await deleteDocTemplate(t.filename, kind);
      setTemplates(list);
      changedRef.current = true;
      toast.success(
        t.source === "custom"
          ? "Modelo excluído."
          : "Modelo ocultado — dá pra restaurar quando quiser.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setBusy(null);
      setDeleteTarget(null);
    }
  }

  async function handleRestore(t: DocTemplateInfo) {
    setBusy(t.filename);
    try {
      const list = await restoreDocTemplate(t.filename, kind);
      setTemplates(list);
      changedRef.current = true;
      toast.success("Modelo restaurado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao restaurar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(changedRef.current); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col gap-0 p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <FileText className="w-5 h-5 text-indigo-600" />
              Modelos de procuração e contrato
            </DialogTitle>
            <DialogDescription>
              {kind === "procuracao"
                ? <>Modelos do botão &quot;Gerar Procuração&quot;. Usam as tags <span className="font-mono">[[campo]]</span> do gerador (mesmo formato dos atuais). Excluir um modelo original apenas o oculta.</>
                : <>Modelos do CONTRATO que o bot manda pra assinatura eletrônica — o pacote assinável é montado com os modelos ativos abaixo, nesta ordem. Além das tags <span className="font-mono">[[campo]]</span>, o .docx precisa da âncora <span className="font-mono">&lt;&lt;assinatura_cliente&gt;&gt;</span> em cada linha de assinatura.</>}
            </DialogDescription>
          </DialogHeader>
          {/* Abas dos dois grupos */}
          <div className="mt-3 flex gap-1 rounded-xl bg-gray-100 dark:bg-zinc-800 p-1 w-fit">
            <button
              onClick={() => setKind("procuracao")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                kind === "procuracao"
                  ? "bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-300 shadow-sm"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-700",
              )}
            >
              Gerar Procuração
            </button>
            <button
              onClick={() => setKind("assinatura")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
                kind === "assinatura"
                  ? "bg-white dark:bg-zinc-900 text-emerald-700 dark:text-emerald-300 shadow-sm"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-700",
              )}
            >
              Contrato do bot (assinatura)
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 bg-gray-50/60 dark:bg-zinc-950/40">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-gray-50 dark:divide-zinc-800/60 overflow-hidden">
              {templates.map((t) => (
                <div
                  key={t.filename}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    t.hidden && "opacity-50",
                  )}
                >
                  <FileText className="w-4 h-4 shrink-0 text-indigo-400" />
                  <div className="min-w-0 flex-1">
                    {editing === t.filename ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(t);
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="flex-1 rounded-lg border border-indigo-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-950 dark:border-zinc-700"
                        />
                        <button onClick={() => handleRename(t)} className="p-1 text-emerald-600" title="Salvar">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditing(null)} className="p-1 text-gray-400" title="Cancelar">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate">
                          {t.label}
                          {t.hidden && (
                            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:bg-zinc-800 dark:text-zinc-400">
                              oculto
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-zinc-500 truncate">
                          {t.filename}
                          {t.source === "custom" ? " · enviado pela equipe" : " · original do sistema"}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {busy === t.filename ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : t.hidden ? (
                      <button
                        onClick={() => handleRestore(t)}
                        className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        title="Restaurar"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditing(t.filename);
                            setEditValue(t.label);
                          }}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800"
                          title="Renomear"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-gray-400">Nenhum modelo.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <input
            ref={fileRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button
            variant="outline"
            className="rounded-xl border-indigo-200 text-indigo-700 dark:border-indigo-900 dark:text-indigo-300"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Adicionar modelo (.docx)</>
            )}
          </Button>
          <Button className="rounded-xl" onClick={() => onClose(changedRef.current)}>
            Fechar
          </Button>
        </div>

        {deleteTarget && (
          <Dialog open onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Excluir &quot;{deleteTarget.label}&quot;?</DialogTitle>
                <DialogDescription>
                  {deleteTarget.source === "custom"
                    ? "O arquivo enviado é apagado de vez — não dá pra desfazer."
                    : "É um modelo original do sistema: ele só fica oculto e dá pra restaurar depois."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setDeleteTarget(null)}>
                  Cancelar
                </Button>
                <Button
                  className="rounded-xl bg-red-600 hover:bg-red-700"
                  onClick={() => handleDelete(deleteTarget)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  {deleteTarget.source === "custom" ? "Excluir de vez" : "Ocultar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
