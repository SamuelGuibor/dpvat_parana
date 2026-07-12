import React from 'react';
import {
  Activity, ArrowRightLeft, Pencil, Plus, MessageSquare, FileUp, FileX,
  ListChecks, Archive, MessageCircle, Image as ImageIcon, FileText, Workflow,
  LayoutTemplate, StickyNote, Bot, UserCheck, RotateCcw, CheckCircle2, Code2,
} from 'lucide-react';

/** Metadados visuais por tipo de ação de log (compartilhado por Meu Espaço e Gestor).
 *  `hex` é a cor em hexadecimal (para gráficos recharts, que não aceitam classe). */
export const ACTION_META: Record<string, { label: string; icon: React.ElementType; tint: string; ring: string; bar: string; hex: string }> = {
  create:          { label: 'Criações',    icon: Plus,           tint: 'text-emerald-600 bg-emerald-50', ring: 'ring-emerald-100', bar: 'bg-emerald-500', hex: '#10b981' },
  dev_commit:      { label: 'Desenvolvimento', icon: Code2,       tint: 'text-indigo-600 bg-indigo-50',   ring: 'ring-indigo-100',  bar: 'bg-indigo-600', hex: '#4f46e5' },
  move:            { label: 'Movimentos',  icon: ArrowRightLeft, tint: 'text-blue-600 bg-blue-50',       ring: 'ring-blue-100',    bar: 'bg-blue-500', hex: '#3b82f6' },
  update:          { label: 'Edições',     icon: Pencil,         tint: 'text-amber-600 bg-amber-50',     ring: 'ring-amber-100',   bar: 'bg-amber-500', hex: '#f59e0b' },
  status_change:   { label: 'Status',      icon: ListChecks,     tint: 'text-indigo-600 bg-indigo-50',   ring: 'ring-indigo-100',  bar: 'bg-indigo-500', hex: '#6366f1' },
  archive:         { label: 'Arquivados',  icon: Archive,        tint: 'text-slate-600 bg-slate-100',    ring: 'ring-slate-100',   bar: 'bg-slate-500', hex: '#64748b' },
  comment_add:     { label: 'Comentários', icon: MessageSquare,  tint: 'text-violet-600 bg-violet-50',   ring: 'ring-violet-100',  bar: 'bg-violet-500', hex: '#8b5cf6' },
  document_add:    { label: 'Documentos',  icon: FileUp,         tint: 'text-cyan-600 bg-cyan-50',       ring: 'ring-cyan-100',    bar: 'bg-cyan-500', hex: '#06b6d4' },
  document_remove: { label: 'Remoções',    icon: FileX,          tint: 'text-rose-600 bg-rose-50',       ring: 'ring-rose-100',    bar: 'bg-rose-500', hex: '#f43f5e' },
  // WhatsApp (auditoria do atendimento)
  wa_text:         { label: 'WhatsApp: mensagens', icon: MessageCircle,  tint: 'text-green-600 bg-green-50',   ring: 'ring-green-100',   bar: 'bg-green-500', hex: '#22c55e' },
  wa_media:        { label: 'WhatsApp: mídias',    icon: ImageIcon,      tint: 'text-teal-600 bg-teal-50',     ring: 'ring-teal-100',    bar: 'bg-teal-500', hex: '#14b8a6' },
  wa_document:     { label: 'WhatsApp: arquivos',  icon: FileText,       tint: 'text-cyan-700 bg-cyan-50',     ring: 'ring-cyan-100',    bar: 'bg-cyan-600', hex: '#0891b2' },
  wa_flow:         { label: 'WhatsApp: fluxos',    icon: Workflow,       tint: 'text-purple-600 bg-purple-50', ring: 'ring-purple-100',  bar: 'bg-purple-500', hex: '#a855f7' },
  wa_template:     { label: 'WhatsApp: templates', icon: LayoutTemplate, tint: 'text-fuchsia-600 bg-fuchsia-50', ring: 'ring-fuchsia-100', bar: 'bg-fuchsia-500', hex: '#d946ef' },
  wa_note:         { label: 'WhatsApp: notas',     icon: StickyNote,     tint: 'text-yellow-600 bg-yellow-50', ring: 'ring-yellow-100',  bar: 'bg-yellow-500', hex: '#eab308' },
  wa_assign:       { label: 'WhatsApp: assumiu',   icon: UserCheck,      tint: 'text-sky-600 bg-sky-50',       ring: 'ring-sky-100',     bar: 'bg-sky-500', hex: '#0ea5e9' },
  wa_reopen:       { label: 'WhatsApp: reaberto',  icon: RotateCcw,      tint: 'text-orange-600 bg-orange-50', ring: 'ring-orange-100',  bar: 'bg-orange-500', hex: '#f97316' },
  wa_return_bot:   { label: 'WhatsApp: p/ bot',    icon: Bot,            tint: 'text-gray-600 bg-gray-100',    ring: 'ring-gray-100',    bar: 'bg-gray-500', hex: '#6b7280' },
  wa_close:        { label: 'WhatsApp: encerrou',  icon: CheckCircle2,   tint: 'text-lime-600 bg-lime-50',     ring: 'ring-lime-100',    bar: 'bg-lime-600', hex: '#65a30d' },
  wa_bot:          { label: 'WhatsApp: bot (IA)',  icon: Bot,            tint: 'text-zinc-500 bg-zinc-100',    ring: 'ring-zinc-100',    bar: 'bg-zinc-400', hex: '#a1a1aa' },
};

export function metaFor(action: string) {
  return ACTION_META[action] ?? { label: action, icon: Activity, tint: 'text-gray-600 bg-gray-100', ring: 'ring-gray-100', bar: 'bg-gray-400', hex: '#94a3b8' };
}
