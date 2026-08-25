"use server";

import { unstable_noStore as noStore } from "next/cache";
import { requirePermission } from "../../_shared/lib/permissions-server";
import {
  buildFolderReport,
  type FolderOutcome,
  type FolderRow,
  type FolderReportResult,
} from "../../_shared/lib/folder-report";

// Planilha de controle das "pastas enviadas pra UNI" — colunas do Kanban que
// citam UNI ("ENVIAR EMAIL UNI" / "ENVIADOS P/ UNI"). Espelho exato da do
// Caique; a lógica mora em _shared/lib/folder-report.ts.

export type UniOutcome = FolderOutcome;
export type UniFolderRow = FolderRow;
export type UniFoldersResult = FolderReportResult;

interface GetUniFoldersProps {
  /** ISO — início do período (filtra por enviadoEm). */
  from: string;
  /** ISO — fim do período. */
  to: string;
}

export async function getUniFolders({ from, to }: GetUniFoldersProps): Promise<UniFoldersResult> {
  noStore();
  // Mesma permissão da aba Arquivados — a planilha vive dentro dela.
  await requirePermission("view_archived");
  return buildFolderReport({ keyword: "UNI", from, to });
}
