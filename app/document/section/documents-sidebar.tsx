// @/app/document/section/custom-documents-sidebar.tsx
"use client";

import React from "react";
import { FolderIcon } from "lucide-react";
import Link from "next/link";

const folders = [
  { name: "Contratos", url: "/document/contracts" },
  { name: "Relatórios", url: "/document/reports" },
  { name: "Notas Fiscais", url: "/document/invoices" },
];

export default function CustomDocumentsSidebar() {
  return (
    <div className="w-64 h-full bg-gray-100 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">Pastas</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        <ul className="p-2 space-y-1">
          {folders.map((folder) => (
            <li key={folder.name}>
              <Link
                href={folder.url}
                className="flex items-center gap-2 p-2 text-sm text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
              >
                <FolderIcon className="h-5 w-5 text-gray-500" />
                <span>{folder.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}