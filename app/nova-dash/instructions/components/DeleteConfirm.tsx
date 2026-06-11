"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteConfirm({ open, title, loading, onCancel, onConfirm }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
        onClick={loading ? undefined : onCancel}
      />
      <div
        className="relative bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-border p-6"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle size={22} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-foreground">Excluir instrução?</h3>
            <p className="text-muted-foreground mt-1" style={{ fontSize: "0.875rem" }}>
              <strong className="text-foreground">{title}</strong> será permanentemente removida (texto e arquivos no S3). Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-2 rounded-lg text-sm bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
