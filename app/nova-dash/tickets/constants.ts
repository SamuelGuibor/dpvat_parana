import {
  Bug,
  PencilLine,
  Sparkles,
  HelpCircle,
  Inbox,
  SearchCode,
  Code2,
  CheckCircle2,
  BrainCircuit,
  BookOpen,
  MapPinOff,
  History,
  type LucideIcon,
} from 'lucide-react';
import { TICKET_STATUS_FLOW, type CerebroMeta, type TicketStatus } from '@/app/_shared/utils/cerebro';

// Listas e fluxo: app/_shared/utils/cerebro.ts (validadas também no servidor,
// app/_actions/dev-tickets/ticket-actions.ts). Aqui só a cara de cada uma.
export { TICKET_STATUS_FLOW };
export type { TicketStatus };

export interface TicketImage {
  key: string;
  name: string;
}

export interface DevTicketDto {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  // Legado (primeira foto dos tickets antigos) — use ticketImages() para ler.
  imageKey: string | null;
  imageName: string | null;
  images: TicketImage[] | null;
  creatorId: string;
  creatorName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  concludedAt: string | null;
  // Cérebro APP: dados do card de conhecimento (null nos tickets comuns).
  meta: CerebroMeta | null;
  createdAt: string;
  updatedAt: string;
}

/** Máximo de fotos por ticket — espelha MAX_IMAGES_PER_TICKET no servidor. */
export const MAX_TICKET_IMAGES = 8;

/**
 * Fotos do ticket já normalizadas: o array novo mais, para tickets criados
 * antes do suporte a várias fotos, o par imageKey/imageName.
 */
export function ticketImages(ticket: DevTicketDto): TicketImage[] {
  const list = Array.isArray(ticket.images)
    ? ticket.images.filter((img) => typeof img?.key === 'string')
    : [];
  if (ticket.imageKey && !list.some((img) => img.key === ticket.imageKey)) {
    return [{ key: ticket.imageKey, name: ticket.imageName ?? 'imagem' }, ...list];
  }
  return list;
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
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  },
  MELHORIA: {
    label: 'Melhoria',
    icon: Sparkles,
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  OUTRO: {
    label: 'Outro',
    icon: HelpCircle,
    badge: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400',
  },
  CONHECIMENTO: {
    label: 'Conhecimento',
    icon: BookOpen,
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  },
  LACUNA: {
    label: 'Lacuna',
    icon: MapPinOff,
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300',
  },
  DESATUALIZADO: {
    label: 'Desatualizado',
    icon: History,
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  },
};

export const STATUS_META: Record<TicketStatus, { label: string; icon: LucideIcon; dot: string; header: string; hint: string; short: string }> = {
  EM_DISTRIBUICAO: {
    label: 'Em Distribuição',
    icon: Inbox,
    dot: 'bg-gray-400',
    header: 'text-gray-700 dark:text-zinc-300',
    hint: 'Sugestões e tickets novos esperando alguém assumir.',
    short: 'esperando alguém',
  },
  EM_ANALISE: {
    label: 'Em Análise',
    icon: SearchCode,
    dot: 'bg-amber-500',
    header: 'text-amber-700 dark:text-amber-400',
    hint: 'Quem assumiu está entendendo o pedido.',
    short: 'entendendo o pedido',
  },
  EM_DESENVOLVIMENTO: {
    label: 'Em Implementação',
    icon: Code2,
    dot: 'bg-blue-500',
    header: 'text-blue-700 dark:text-blue-400',
    hint: 'Dev no código; conhecimento com a IA (/conhecimento implementar).',
    short: '/conhecimento implementar',
  },
  VALIDACAO_IA: {
    label: 'Validação IA',
    icon: BrainCircuit,
    dot: 'bg-violet-500',
    header: 'text-violet-700 dark:text-violet-400',
    hint: 'Redator escreveu; validador e amostra humana conferem contra a fonte.',
    short: 'amostra humana',
  },
  CONCLUIDO: {
    label: 'Concluído',
    icon: CheckCircle2,
    dot: 'bg-emerald-500',
    header: 'text-emerald-700 dark:text-emerald-400',
    hint: 'Publicado no vault e no S3; ticket encerrado.',
    short: 'últimos 14 dias',
  },
};

/**
 * Nome da coluna por quadro (layout aprovado em 27/10): no Cérebro a primeira
 * coluna é "Sugestões" (qualquer pessoa envia) e a última "Publicado".
 */
export function columnLabel(view: 'cerebro' | 'dev', status: TicketStatus): string {
  if (view === 'cerebro' && status === 'EM_DISTRIBUICAO') return 'Sugestões';
  if (view === 'cerebro' && status === 'CONCLUIDO') return 'Publicado';
  return STATUS_META[status].label;
}

/** Iniciais para o avatar ("Samuel Guibor" → "SG"). */
export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** "agora" · "3 h" · "2 d" · "24/10" (mais de uma semana). */
export function ageLabel(iso: string, now = Date.now()) {
  const ms = now - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'agora';
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
