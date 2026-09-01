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
  // Permissão própria (antes herdava view_archived — hoje é granular).
  await requirePermission("view_pagos_uni");
  return buildFolderReport({ keyword: "UNI", from, to });
}
