import type { ArchiveStatus } from "@/app/_actions/cards/archive-card";

// Catálogo dos destinos de arquivamento, em um lugar só.
//
// Os rótulos viviam copiados no menu do card do kanban, no handler do board e
// na action do servidor — três listas que precisavam ser editadas juntas. Aqui
// ficam o rótulo, o agrupamento da UI e quais destinos pedem confirmação.
// (A action do servidor tem "use server" e só pode exportar função async, por
// isso este módulo é separado dela.)

export const ARCHIVE_LABELS: Record<ArchiveStatus, string> = {
  pagos_ccs: "APTOS CCS",
  pagos_uni: "APTOS UNI",
  enviados_taynara: "ENVIADOS TAYNARA",
  enviados_evelyn: "ENVIADOS EVELYN",
  enviados_joinville: "ENVIADOS JOINVILLE",
  pastas_negadas_ccs: "PASTAS NEGADAS CCS",
  pastas_negadas_uni: "PASTAS NEGADAS UNI",
  perdeu_contato_definitivo: "PERDEU CONTATO - DEFINITIVO",
  nao_assinaram_procuracao: "NÃO ASSINARAM PROCURAÇÃO",
  descartados_analise_interna: "DESCARTADOS ANÁLISE INTERNA",
  desistiram_expressamente: "DESISTIRAM EXPRESSAMENTE",
  voltar_um_dia: "VOLTAR UM DIA",
};

/** Destinos que encerram a relação com o cliente — pedem confirmação. */
export const DESTRUCTIVE_ARCHIVE: ArchiveStatus[] = [
  "perdeu_contato_definitivo",
  "desistiram_expressamente",
  "descartados_analise_interna",
];

export type ArchiveTone = "green" | "blue" | "amber" | "red" | "gray";

/** Mesma ordem e as mesmas cores do menu "⋮" do card no kanban. */
export const ARCHIVE_GROUPS: { title: string; tone: ArchiveTone; items: ArchiveStatus[] }[] = [
  { title: "Pagamentos", tone: "green", items: ["pagos_ccs", "pagos_uni"] },
  { title: "Envios", tone: "blue", items: ["enviados_taynara", "enviados_evelyn", "enviados_joinville"] },
  { title: "Pastas negadas", tone: "amber", items: ["pastas_negadas_ccs", "pastas_negadas_uni"] },
  {
    title: "Outros",
    tone: "red",
    items: [
      "perdeu_contato_definitivo",
      "nao_assinaram_procuracao",
      "descartados_analise_interna",
      "desistiram_expressamente",
    ],
  },
  { title: "Standby", tone: "gray", items: ["voltar_um_dia"] },
];

/** Classes do chip por tom — literais completas para o Tailwind não podar. */
export const ARCHIVE_CHIP_CLASS: Record<ArchiveTone, string> = {
  green:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  blue:
    "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  red:
    "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  gray:
    "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};
