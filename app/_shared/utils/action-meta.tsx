import React from 'react';
import {
  Activity, ArrowRightLeft, Pencil, Plus, MessageSquare, FileUp, FileX,
} from 'lucide-react';

/** Metadados visuais por tipo de ação de log (compartilhado por Meu Espaço e Gestor). */
export const ACTION_META: Record<string, { label: string; icon: React.ElementType; tint: string; ring: string; bar: string }> = {
  create:          { label: 'Criações',    icon: Plus,           tint: 'text-emerald-600 bg-emerald-50', ring: 'ring-emerald-100', bar: 'bg-emerald-500' },
  move:            { label: 'Movimentos',  icon: ArrowRightLeft, tint: 'text-blue-600 bg-blue-50',       ring: 'ring-blue-100',    bar: 'bg-blue-500' },
  update:          { label: 'Edições',     icon: Pencil,         tint: 'text-amber-600 bg-amber-50',     ring: 'ring-amber-100',   bar: 'bg-amber-500' },
  comment_add:     { label: 'Comentários', icon: MessageSquare,  tint: 'text-violet-600 bg-violet-50',   ring: 'ring-violet-100',  bar: 'bg-violet-500' },
  document_add:    { label: 'Documentos',  icon: FileUp,         tint: 'text-cyan-600 bg-cyan-50',       ring: 'ring-cyan-100',    bar: 'bg-cyan-500' },
  document_remove: { label: 'Remoções',    icon: FileX,          tint: 'text-rose-600 bg-rose-50',       ring: 'ring-rose-100',    bar: 'bg-rose-500' },
};

export function metaFor(action: string) {
  return ACTION_META[action] ?? { label: action, icon: Activity, tint: 'text-gray-600 bg-gray-100', ring: 'ring-gray-100', bar: 'bg-gray-400' };
}
