import {
  Bug,
  PencilLine,
  Sparkles,
  HelpCircle,
  Inbox,
  SearchCode,
  Code2,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';

// Espelha as listas validadas no servidor (app/_actions/dev-tickets/ticket-actions.ts).
export const TICKET_STATUS_FLOW = [
  'EM_DISTRIBUICAO',
  'EM_ANALISE',
  'EM_DESENVOLVIMENTO',
  'CONCLUIDO',
] as const;

export type TicketStatus = (typeof TICKET_STATUS_FLOW)[number];

export interface DevTicketDto {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  imageKey: string | null;
  imageName: string | null;
  creatorId: string;
  creatorName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  concludedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const TYPE_META: Record<string, { label: string; icon: LucideIcon; badge: string }> = {
  BUG: {
    label: 'Bug',
    icon: Bug,
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  ALTERACAO: {
    label: 'Alteração',
    icon: PencilLine,
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  MELHORIA: {
    label: 'Melhoria',
    icon: Sparkles,
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  OUTRO: {
    label: 'Outro',
    icon: HelpCircle,
    badge: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400',
  },
};

export const STATUS_META: Record<TicketStatus, { label: string; icon: LucideIcon; dot: string; header: string }> = {
  EM_DISTRIBUICAO: {
    label: 'Em Distribuição',
    icon: Inbox,
    dot: 'bg-blue-500',
    header: 'text-blue-600 dark:text-blue-400',
  },
  EM_ANALISE: {
    label: 'Em Análise',
    icon: SearchCode,
    dot: 'bg-amber-500',
    header: 'text-amber-600 dark:text-amber-400',
  },
  EM_DESENVOLVIMENTO: {
    label: 'Em Desenvolvimento',
    icon: Code2,
    dot: 'bg-violet-500',
    header: 'text-violet-600 dark:text-violet-400',
  },
  CONCLUIDO: {
    label: 'Concluído',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    header: 'text-emerald-600 dark:text-emerald-400',
  },
};

export const NEXT_STATUS: Partial<Record<TicketStatus, TicketStatus>> = {
  EM_DISTRIBUICAO: 'EM_ANALISE',
  EM_ANALISE: 'EM_DESENVOLVIMENTO',
  EM_DESENVOLVIMENTO: 'CONCLUIDO',
};
