"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setArchiveStatus, type ArchiveStatus } from "@/app/_actions/cards/archive-card";
import {
  ARCHIVE_LABELS, ARCHIVE_GROUPS, ARCHIVE_CHIP_CLASS, DESTRUCTIVE_ARCHIVE,
} from "@/app/_shared/lib/archive-catalog";
import { useConfirm } from "@/app/_shared/ui/confirm-dialog";

// ARQUIVAR DE DENTRO DO CARD (27/08/2026).
//
// Antes, arquivar só existia no menu "⋮" do card no quadro: quem abria o card
// para conferir os anexos tinha que fechar tudo, achar o card de novo no meio
// da coluna e só então arquivar. Aqui os destinos aparecem como uma lista de
// chips (mesma ideia das tags), um clique cada.
//
// A lista fica FECHADA por padrão: aberta ela empurraria os botões de salvar
// para fora da tela em card com muita informação.

interface Props {
  cardId: string;
  isProcess: boolean;
  cardName: string;
  /** Estado atual (null = card ativo no quadro). */
  current: ArchiveStatus | null;
  /** Pode arquivar? (permissão archive_cards) */
  canArchive: boolean;
  /** Arquivou/desarquivou: o quadro remove/repõe o card e o diálogo fecha. */
  onChanged: (status: ArchiveStatus | null) => void;
}

export function ArchiveBar({ cardId, isProcess, cardName, current, canArchive, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  if (!canArchive) {
    // Sem permissão de arquivar, mostra só o estado (útil ao abrir um card
    // arquivado pela caixa de menções ou pela busca).
    return current ? (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        <Archive className="h-3.5 w-3.5" /> Arquivado: {ARCHIVE_LABELS[current] ?? current}
      </span>
    ) : null;
  }

  async function apply(status: ArchiveStatus | null) {
    if (saving) return;
    if (status && DESTRUCTIVE_ARCHIVE.includes(status)) {
      const ok = await confirm({
        title: "Confirmar arquivamento",
        description: `Arquivar ${cardName || "este card"} como "${ARCHIVE_LABELS[status]}"? O card sai do quadro (dá para restaurar pela aba Arquivados).`,
        confirmLabel: "Arquivar",
        tone: "danger",
      });
      if (!ok) return;
    }
    setSaving(status ?? "__none__");
    try {
      await setArchiveStatus({ id: cardId, isProcess, status });
      toast.success(status ? `Card arquivado: ${ARCHIVE_LABELS[status]}` : "Card desarquivado — voltou para o quadro.");
      setOpen(false);
      onChanged(status);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível arquivar o card.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        {current ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <Archive className="h-3.5 w-3.5" /> Arquivado: {ARCHIVE_LABELS[current] ?? current}
            </span>
            <button
              type="button"
              onClick={() => apply(null)}
              disabled={!!saving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {saving === "__none__" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
              Desarquivar
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <Archive className="h-3.5 w-3.5" />
          {current ? "Mudar o arquivo" : "Arquivar em…"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
          {ARCHIVE_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => apply(status)}
                    disabled={!!saving || status === current}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${ARCHIVE_CHIP_CLASS[group.tone]}`}
                  >
                    {saving === status && <Loader2 className="h-3 w-3 animate-spin" />}
                    {ARCHIVE_LABELS[status]}
                    {status === current && " ✓"}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-400 dark:text-zinc-500">
            Arquivar tira o card do quadro sem apagar nada — ele continua na aba Arquivados e pode voltar a qualquer momento.
          </p>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
