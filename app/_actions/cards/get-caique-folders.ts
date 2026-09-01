"use server";

import { unstable_noStore as noStore } from "next/cache";
import { requirePermission } from "../../_shared/lib/permissions-server";
import {
  buildFolderReport,
  type FolderOutcome,
  type FolderRow,
  type FolderReportResult,
} from "../../_shared/lib/folder-report";

// Planilha de controle das "pastas enviadas pro Caique" — colunas do Kanban
// que citam CAIQUE. A lógica mora em _shared/lib/folder-report.ts, comum a
// esta e à planilha da UNI (get-uni-folders.ts).

export type CaiqueOutcome = FolderOutcome;
export type CaiqueFolderRow = FolderRow;
export type CaiqueFoldersResult = FolderReportResult;

interface GetCaiqueFoldersProps {
  /** ISO — início do período (filtra por enviadoEm). */
  from: string;
  /** ISO — fim do período. */
  to: string;
}

export async function getCaiqueFolders({ from, to }: GetCaiqueFoldersProps): Promise<CaiqueFoldersResult> {
  noStore();
  // Permissão própria (antes herdava view_archived — hoje é granular).
  await requirePermission("view_pagos_caique");
  return buildFolderReport({ keyword: "CAIQUE", from, to });
}
