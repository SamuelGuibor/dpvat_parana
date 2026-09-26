'use client';

import { Loader2 } from 'lucide-react';

// Véu sobre um painel que ainda mostra os números da consulta ANTERIOR
// (keepPreviousData do `usePanelSWR`) enquanto a do período/número novo
// carrega. Trocar o período antes apagava a tela e devolvia o gestor para a
// aba Analytics (PAINEL-4); agora o conteúdo fica, coberto. O véu precisa ser
// óbvio para ninguém ler número velho como novo, e bloqueia cliques (abrir um
// drill-down de um período que já não é o escolhido).
//
// O pai precisa ser `relative`. Sem classes dark: (o modo escuro é o Dark
// Reader, que escurece o branco translúcido sozinho). O aviso é sticky para
// continuar à vista quando o painel é mais alto que a tela.
export function StaleDataVeil({ show, label = 'Atualizando para o período escolhido…' }: {
  show: boolean;
  label?: string;
}) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 cursor-wait rounded-2xl bg-white/70 backdrop-blur-[2px]"
    >
      <div className="sticky top-24 flex justify-center pt-10">
        <span className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-md">
          <Loader2 className="h-4 w-4 animate-spin" /> {label}
        </span>
      </div>
    </div>
  );
}
