/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
export const dynamic = "force-dynamic";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  Clock, MessageSquare, Paperclip, Edit, User as UserIcon, Briefcase,
  ChevronRight, ChevronLeft, Search, Loader2, Trash2, MoreVertical, Plus, Tag,
  User, GripVertical, Zap, CheckSquare,
} from 'lucide-react';
import { AutomationsPanel } from './AutomationsPanel';
import { getStatusOrderByService } from './card-dialog/constants';
import { Card, CardContent } from '@/app/_components/ui/card';
import { Badge } from '@/app/_components/ui/badge';
import { Button } from '@/app/_components/ui/button';
import { Input } from '@/app/_components/ui/input';
import { Label as UILabel } from '@/app/_components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/app/_components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/app/_components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/app/_components/ui/dropdown-menu';
import { CardDialog } from './CardDialog';
import { cn } from '@/app/_utils/utils';
import { getUsers } from '@/app/_actions/get-user';
import { getProcess } from '@/app/_actions/get-process';
import { CreateNewCard } from '@/app/_components/create-newcard';
import { differenceInDays } from 'date-fns';
import { updateKanbanStatus } from '@/app/_actions/update-kanban';
import useSWR from 'swr';
import { getLabels } from '../_actions/get-labels';
import { deleteCard } from '../_actions/delete-card';
import { createUser } from '../_actions/create-user';
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function useComments({ userId, processId }: { userId?: string; processId?: string }) {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  if (processId) params.append('processId', processId);
  const query = params.toString() ? `/api/comments?${params.toString()}` : '/api/comments';
  return useSWR(query, fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });
}

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  assignee: string;
  status?: string
  timer: number;
  comments: Comment[];
  attachments: Attachment[];
  observations: string;
  checklistItems: ChecklistItem[];
  createdAt: Date;
  updatedAt: Date;
  statusStartedAt?: string | null;
  service?: string;
  type?: string;
  isProcess: boolean;
  cpf?: string;
  data_nasc?: string;
  email?: string;
  rua?: string;
  bairro?: string;
  numero?: string;
  cep?: string;
  rg?: string;
  nome_mae?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  estado_civil?: string;
  profissao?: string;
  nacionalidade?: string;
  data_acidente?: string;
  atendimento_via?: string;
  hospital?: string;
  outro_hospital?: string;
  lesoes?: string;
  role?: string;
  obs?: string;
  nome_res?: string;
  rg_res?: string;
  cpf_res?: string;
  estado_civil_res?: string;
  profissao_res?: string;
  fixed?: boolean;
  labelId?: string | null
  label?: Label | null
  ownerId?: string
  cardId?: string
  commentCount?: number;
  attachmentCount?: number;
  cardNumber?: number | null;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  mentions: string[];
  createdAt: Date;
}

export interface Attachment {
  id?: string;
  key: string;
  name: string;
  size?: number;
  uploadedAt: Date;
  url?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  order: number;
}

interface Column {
  id: string;
  title: string;
  color?: string;
  timeLimitDays?: number | null;
  cards: KanbanCard[];
}

interface Label {
  id: string
  name: string
  color: string
  timeLimitDays: number | null
  order?: number
}

interface LabelInput {
  name: string;
  color: string;
  timeLimitDays?: number | null;
}

const services = [
  { id: '1', name: 'Filtro de Cartões', color: '#1e3a8a', border: '#1e3a8a' },
  { id: '2', name: 'Gerar Procuração Automática', color: '#4338ca', border: '#4338ca' },
  { id: '3', name: 'Coletar Assinatura em Cartório', color: '#6d28d9', border: '#6d28d9' },
  { id: '4', name: 'Coletar Assinatura Digital', color: '#7c3aed', border: '#7c3aed' },
  { id: '5', name: 'Agendar Coleta com Motoboy', color: '#2563eb', border: '#2563eb' },
  { id: '6', name: 'Acompanhar Rota do Motoboy', color: '#3b82f6', border: '#3b82f6' },
  { id: '7', name: 'Fazer Protocolo no Hospital', color: '#059669', border: '#059669' },
  { id: '8', name: 'Protocolar Pasta – Hospital Presencial', color: '#10b981', border: '#10b981' },
  { id: '9', name: 'Solicitar Prontuário por E-mail', color: '#d97706', border: '#d97706' },
  { id: '10', name: 'Solicitar Prontuário Cajuru por E-mail', color: '#ea580c', border: '#ea580c' },
  { id: '11', name: 'Acompanhar Cajuru – Solicitado', color: '#f97316', border: '#f97316' },
  { id: '12', name: 'Solicitar Prontuário – Outros Hospitais', color: '#f59e0b', border: '#f59e0b' },
  { id: '13', name: 'Acompanhar Prontuário – Outros Solicitados', color: '#fbbf24', border: '#fbbf24' },
  { id: '14', name: 'Solicitar Prontuário – Ponta Grossa', color: '#d97706', border: '#d97706' },
  { id: '15', name: 'Aguardar Prontuário – Recebimento Online', color: '#9a3412', border: '#9a3412' },
  { id: '16', name: 'Aguardar Prontuário PG – Recebimento Online', color: '#c2410c', border: '#c2410c' },
  { id: '17', name: 'Aguardar Prontuário PG – Presencial', color: '#ea580c', border: '#ea580c' },
  { id: '18', name: 'Aguardar Retirada de Prontuário – Presencial', color: '#9a3412', border: '#9a3412' },
  { id: '19', name: 'Retirar Prontuário – Pronto para Retirar', color: '#431407', border: '#431407' },
  { id: '20', name: 'Solicitado ao Cliente fazer B.O. – Acidente', color: '#b91c1c', border: '#b91c1c' },
  { id: '21', name: 'Solicitar Siate', color: '#dc2626', border: '#dc2626' },
  { id: '22', name: 'Aguardar Retorno do Siate', color: '#ef4444', border: '#ef4444' },
  { id: '23', name: 'Enviar Mensagem – Previdenciário', color: '#1e40af', border: '#1e40af' },
  { id: '24', name: 'Registrar Óbito – Nova Lei', color: '#111827', border: '#111827' },
  { id: '25', name: 'Protocolar SPVAT', color: '#0369a1', border: '#0369a1' },
  { id: '26', name: 'Protocolar SPVAT - Standby', color: '#0ea5e9', border: '#0ea5e9' },
  { id: '27', name: 'Enviar para Reanálise', color: '#4f46e5', border: '#4f46e5' },
  { id: '28', name: 'Protocolar DPVAT – Caixa', color: '#4338ca', border: '#4338ca' },
  { id: '29', name: 'Aguardar Análise da Caixa', color: '#3730a3', border: '#3730a3' },
  { id: '30', name: 'Acompanhar Pendências – Protocolado', color: '#701a75', border: '#701a75' },
  { id: '31', name: 'Protocolar Pendência de B.O.', color: '#a21caf', border: '#a21caf' },
  { id: '32', name: 'Avisar Sobre Perícia Administrativa', color: '#15803d', border: '#15803d' },
  { id: '33', name: 'Aguardar Resultado da Perícia', color: '#166534', border: '#166534' },
  { id: '34', name: 'Cobrar Honorários – Resultado Perícia', color: '#065f46', border: '#065f46' },
  { id: '35', name: 'Aguardar Pagamento – Honorários Cobrados', color: '#064e3b', border: '#064e3b' },
  { id: '36', name: 'Encerrar Processo – DPVAT', color: '#312e81', border: '#312e81' },
  { id: '37', name: 'Descartaveis', color: '#4b5563', border: '#4b5563' },
];

const serviceStyles: { [key: string]: { bgColor: string; textColor: string } } = {
  INSS: { bgColor: '#fef9c3', textColor: '#854d0e' },
  'Seguro de Vida': { bgColor: '#f5f3ff', textColor: '#5b21b6' },
  DPVAT: { bgColor: '#ffedd5', textColor: '#9a3412' },
  RCF: { bgColor: '#f0fdf4', textColor: '#166534' },
  SPVAT: { bgColor: '#eff6ff', textColor: '#1e40af' },
  TRABALHISTA: { bgColor: '#fef2f2', textColor: '#991b1b' },
};

const defaultServiceStyle = { bgColor: '#f3f4f6', textColor: '#374151' };

interface Item {
  id: string
  name: string
  type?: string
  labelId?: string | null
  label?: Label | null
  statusStartedAt?: string | null
  service?: string
  obs?: string
  observacao?: string
  fixed?: boolean
  isProcess?: boolean
  userId?: string
  status?: string
  ownerId?: string
  cardNumber?: number | null
}

const renderTimerBadge = (card: KanbanCard) => {
  if (!card.statusStartedAt) return <Badge variant="outline">Sem data</Badge>
  const startedAt = new Date(card.statusStartedAt)
  if (isNaN(startedAt.getTime())) return <Badge variant="outline">Data inválida</Badge>
  const days = differenceInDays(new Date(), startedAt)
  const limit = card.label?.timeLimitDays ?? null
  const overdue = limit !== null && days > limit
  return (
    <Badge variant="outline" className={`px-2 text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-blue-700 font-semibold'}`}>
      {days} dias
      {overdue && <span className="ml-1 text-[10px] font-bold">(Excedeu {days - limit!} dias)</span>}
    </Badge>
  )
}

// =============================================
// Modal genérico de Etiqueta (criar OU editar)
// =============================================
interface LabelDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: { name: string; color: string; timeLimitDays: number | null };
  title: string;
  submitLabel: string;
  onSubmit: (data: LabelInput) => Promise<void>;
}

const LabelDialog: React.FC<LabelDialogProps> = ({ open, onOpenChange, initial, title, submitLabel, onSubmit }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? '#3b82f6');
  const [timeLimit, setTimeLimit] = useState<string>(initial?.timeLimitDays?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? '#3b82f6');
      setTimeLimit(initial?.timeLimitDays?.toString() ?? '');
    }
  }, [open, initial]);

  async function handle() {
    if (!name.trim()) {
      toast.error('Informe um nome para a etiqueta.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        color,
        timeLimitDays: timeLimit ? parseInt(timeLimit, 10) : null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Configure os dados da etiqueta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <UILabel>Nome</UILabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Aguardando perícia" />
          </div>
          <div className="space-y-2">
            <UILabel>Cor</UILabel>
            <div className="flex items-center gap-3">
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
            </div>
          </div>
          <div className="space-y-2">
            <UILabel>Dias limite (opcional)</UILabel>
            <Input
              type="number"
              min={0}
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
              placeholder="Ex: 7"
            />
            <p className="text-[11px] text-gray-500 dark:text-zinc-400">Cards nessa etiqueta ficam destacados em vermelho após esse prazo.</p>
          </div>
        </div>
        <DialogFooter className="flex flex-row gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handle} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =============================================
// Botão "Criar Etiqueta" pro header
// =============================================
const CreateLabelButton: React.FC<{ onCreate: (data: LabelInput) => Promise<void> }> = ({ onCreate }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="h-12 rounded-2xl">
        <Tag className="w-4 h-4 mr-2" />
        Criar Etiqueta
      </Button>
      <LabelDialog
        open={open}
        onOpenChange={setOpen}
        title="Criar Etiqueta"
        submitLabel="Criar"
        onSubmit={onCreate}
      />
    </>
  );
};

const CreatePerson: React.FC<{ labels: Label[]; onCreated: () => void }> = ({ labels, onCreated }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [labelId, setLabelId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setCpf('');
      setPassword('');
      setEmail('');
      setLabelId('');
    }
  }, [open]);

  async function handle() {
    if (!name.trim() || !cpf.trim() || !password.trim()) {
      toast.error('Nome, CPF e senha são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      await createUser({
        name: name.trim(),
        cpf: cpf.trim(),
        password: password.trim(),
        email: email.trim() || undefined,
        labelId: labelId || undefined,
        role: labels.find(l => l.id === labelId)?.name || undefined,
      });
      toast.success('Cliente criado com sucesso!');
      setOpen(false);
      onCreated();
    } catch {
      toast.error('Erro ao criar cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="h-12 rounded-2xl">
        <User className="w-4 h-4 mr-2" />
        Criar Card Cliente
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Criar Card Cliente</DialogTitle>
            <DialogDescription>Preencha os dados do novo cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <UILabel>Nome *</UILabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-2">
              <UILabel>CPF *</UILabel>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-2">
              <UILabel>Senha *</UILabel>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha de acesso" />
            </div>
            <div className="space-y-2">
              <UILabel>Email (opcional)</UILabel>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="inserir-email@gmail.com" />
            </div>
            <div className="space-y-2">
              <UILabel>Etiqueta</UILabel>
              <Select value={labelId} onValueChange={setLabelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Primeira etiqueta (padrão)" />
                </SelectTrigger>
                <SelectContent>
                  {labels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                        {l.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handle} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// =============================================
// DraggableCard
// =============================================
interface DraggableCardProps {
  card: KanbanCard;
  columnId: string;
  onCardClick: (card: KanbanCard) => void;
  onQuickAction: (cardId: string, action: string) => void;
  onDelete: (cardId: string) => void;
}

const DraggableCardBase: React.FC<DraggableCardProps> = ({ card, columnId, onCardClick, onQuickAction, onDelete }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'CARD',
    item: { cardId: card.id, sourceColumnId: columnId },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }));
  const ref = useRef<HTMLDivElement>(null);
  drag(ref);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteCard({ id: card.id, isProcess: card.isProcess });
      toast.success("Card excluído!");
      onDelete(card.id);
    } catch (e: any) {
      toast.error("Erro ao excluir: " + e.message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const style = card.service && serviceStyles[card.service] ? serviceStyles[card.service] : defaultServiceStyle;

  return (
    <>
      <div ref={ref} style={{ opacity: isDragging ? 0.5 : 1 }} className="cursor-move group">
        <Card className={cn(
          "mb-3 border-none shadow-sm hover:shadow-lg transition-all duration-200 relative overflow-hidden bg-white dark:bg-zinc-900",
          card.isProcess ? "ring-1 ring-blue-100" : "ring-1 ring-gray-100"
        )}>
          <div className={cn("absolute top-0 left-0 w-1.5 h-full", card.isProcess ? "bg-blue-600" : "bg-gray-400 dark:bg-zinc-600")} />
          <CardContent className="p-4 pl-6">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-bold text-sm text-gray-900 dark:text-zinc-100 leading-tight flex-1 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onCardClick(card)}>
                {card.cardNumber != null && (
                  <span className="mr-1.5 inline-block px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 text-[10px] font-mono font-bold align-middle">
                    #{card.cardNumber}
                  </span>
                )}
                {card.title}
              </h4>
              <div className="shrink-0 ml-2">
                {card.isProcess ? (
                  <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-100">
                    <Briefcase className="w-3 h-3 text-blue-600" />
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-zinc-950 p-1.5 rounded-lg border border-gray-100 dark:border-zinc-800">
                    <UserIcon className="w-3 h-3 text-gray-600 dark:text-zinc-400" />
                  </div>
                )}
              </div>
            </div>
            <div className="mb-3">
              <div className="text-[11px] text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-950/50 p-2 rounded-lg border border-gray-100 dark:border-zinc-800/50 line-clamp-2 italic">
                {card.description || 'Nenhuma descrição detalhada.'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline" className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border-none shadow-sm hover:bg-gray-200 dark:hover:bg-zinc-700 dark:bg-zinc-800" style={{ backgroundColor: style.bgColor, color: style.textColor }}>
                {card.service}
              </Badge>
              <div className="relative flex items-center gap-1 ml-auto">
                <Clock className="w-4 h-4" />
                {renderTimerBadge(card)}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-50 pt-3">
              <div className="flex items-center gap-3 text-gray-400 dark:text-zinc-500">
                <div className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-extrabold">{card.commentCount ?? card.comments.length}</span>
                </div>
                <div className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-extrabold">{card.attachmentCount ?? card.attachments.length}</span>
                </div>
                {(() => {
                  const order = getStatusOrderByService(card.service);
                  const idx = card.status ? order.indexOf(card.status) : -1;
                  const done = Math.max(0, idx + 1);
                  const total = order.length;
                  const allDone = done === total && done > 0;
                  return (
                    <div className={`flex items-center gap-1 transition-colors ${allDone ? 'text-green-500' : 'hover:text-blue-500'}`}>
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-extrabold">{done}/{total}</span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <Button size="icon" variant="secondary" className="h-7 w-7 rounded-lg bg-gray-50 dark:bg-zinc-950 hover:bg-blue-50 hover:text-blue-600" onClick={() => onCardClick(card)}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="secondary" className="h-7 w-7 rounded-lg bg-gray-50 dark:bg-zinc-950 hover:bg-red-50 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Excluir card</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{card.title}</strong>? Essa ação é irreversível.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const DraggableCard = React.memo(DraggableCardBase, (prev, next) => {
  const a = prev.card;
  const b = next.card;
  return (
    prev.columnId === next.columnId &&
    prev.onCardClick === next.onCardClick &&
    prev.onQuickAction === next.onQuickAction &&
    prev.onDelete === next.onDelete &&
    a.id === b.id &&
    a.title === b.title &&
    a.description === b.description &&
    a.labelId === b.labelId &&
    a.statusStartedAt === b.statusStartedAt &&
    a.service === b.service &&
    a.cardNumber === b.cardNumber &&
    a.commentCount === b.commentCount &&
    a.attachmentCount === b.attachmentCount &&
    a.status === b.status &&
    a.isProcess === b.isProcess
  );
});

// =============================================
// DroppableColumn
// =============================================
interface DroppableColumnProps {
  column: Column;
  index: number;
  onDrop: (cardId: string, sourceColumnId: string, targetColumnId: string) => void;
  onColumnReorder: (dragIndex: number, hoverIndex: number) => void;
  onCardClick: (card: KanbanCard) => void;
  onQuickAction: (cardId: string, action: string) => void;
  onDelete: (cardId: string) => void;
  onLabelEdit: (id: string, data: LabelInput) => Promise<void>;
  onLabelDelete: (id: string) => Promise<void>;
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({
  column, index, onDrop, onColumnReorder, onCardClick, onQuickAction, onDelete,
  onLabelEdit, onLabelDelete, isCollapsed, toggleCollapse,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [confirmDeleteLabel, setConfirmDeleteLabel] = useState(false);
  const [deletingLabel, setDeletingLabel] = useState(false);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'CARD',
    drop: (item: { cardId: string; sourceColumnId: string }) => {
      onDrop(item.cardId, item.sourceColumnId, column.id);
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver() }),
  }));

  const [{ isOverColumn }, columnDrop] = useDrop(() => ({
    accept: 'COLUMN',
    hover: (item: { index: number }) => {
      if (item.index !== index) {
        onColumnReorder(item.index, index);
        item.index = index;
      }
    },
    collect: (monitor) => ({ isOverColumn: !!monitor.isOver() }),
  }), [index, onColumnReorder]);

  const [{ isDraggingColumn }, columnDrag, columnPreview] = useDrag(() => ({
    type: 'COLUMN',
    item: { index },
    collect: (monitor) => ({ isDraggingColumn: !!monitor.isDragging() }),
  }), [index]);

  drop(ref);
  columnDrop(ref);
  columnPreview(ref);

  // prefere a cor da label salva no banco; cai no services hardcoded só como fallback
  const fallbackColor = services.find(s => s.name === column.title)?.color;
  const columnColor = column.color || fallbackColor || '#3b82f6';

  async function handleConfirmDelete() {
    setDeletingLabel(true);
    try {
      await onLabelDelete(column.id);
      setConfirmDeleteLabel(false);
    } finally {
      setDeletingLabel(false);
    }
  }

  if (isCollapsed) {
    return (
      <div ref={ref} className={cn(
        "flex-shrink-0 w-14 rounded-2xl p-2 transition-all duration-300 border h-[calc(100vh-200px)]",
        isDraggingColumn && "opacity-40",
        isOver ? "bg-blue-50 border-blue-200" : "bg-white dark:bg-zinc-900 border-gray-100 dark:border-zinc-800 shadow-sm"
      )}>
        <div className="flex flex-col items-center h-full">
          <div ref={(node) => { columnDrag(node); }} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 transition-colors mb-1">
            <GripVertical className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
          </div>
          <Button variant="ghost" size="icon" className="mb-4 h-10 w-10 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800" onClick={toggleCollapse}>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
          </Button>
          <div className="flex-1 flex flex-col items-center gap-4 overflow-hidden">
            <Badge className="bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-none font-black h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-200 dark:hover:bg-zinc-700 dark:bg-zinc-800">
              {column.cards.length}
            </Badge>
            <h3 className="font-black text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 [writing-mode:vertical-rl] whitespace-nowrap text-center">
              {column.title}
            </h3>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-lg bg-gray-50 dark:bg-zinc-950 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-48">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setTimeout(() => setIsEditOpen(true), 0);
                  }}
                  className="cursor-pointer"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar etiqueta
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setTimeout(() => setConfirmDeleteLabel(true), 0);
                  }}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir etiqueta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={ref} className={cn(
        "flex-shrink-0 w-[450px] rounded-2xl flex flex-col h-[calc(100vh-200px)] transition-all duration-300 border shadow-sm",
        isDraggingColumn && "opacity-40",
        isOver ? "bg-blue-50 border-blue-400 ring-2 ring-blue-100" : "bg-gray-50 dark:bg-zinc-950/50 border-gray-200 dark:border-zinc-800"
      )}>
        <div className="p-4 rounded-t-2xl flex items-center justify-between border-b bg-white dark:bg-zinc-900 shadow-sm" style={{ borderTop: `4px solid ${columnColor}` }}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div ref={(node) => { columnDrag(node); }} className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 transition-colors shrink-0">
              <GripVertical className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
            </div>
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: columnColor, boxShadow: `0 0 8px ${columnColor}66` }} />
            <h3 className="font-black text-xs uppercase tracking-tight text-gray-700 dark:text-zinc-300 truncate">{column.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border-none font-bold px-2 py-0.5 rounded-lg text-[10px]">
              {column.cards.length}
            </Badge>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-lg bg-gray-50 dark:bg-zinc-950 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-48">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setTimeout(() => setIsEditOpen(true), 0);
                  }}
                  className="cursor-pointer"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar etiqueta
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setTimeout(() => setConfirmDeleteLabel(true), 0);
                  }}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir etiqueta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-zinc-100 dark:text-zinc-100" onClick={toggleCollapse}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 p-4">
          {column.cards.map((card) => (
            <DraggableCard
              key={card.id}
              card={card}
              columnId={column.id}
              onCardClick={onCardClick}
              onQuickAction={onQuickAction}
              onDelete={onDelete}
            />
          ))}
          {column.cards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 opacity-30">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-2">
                <Briefcase className="w-6 h-6 text-gray-400 dark:text-zinc-500" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-zinc-400">Sem processos</p>
            </div>
          )}
        </div>
      </div>

      <LabelDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        initial={{
          name: column.title,
          color: column.color || '#3b82f6',
          timeLimitDays: column.timeLimitDays ?? null,
        }}
        title="Editar Etiqueta"
        submitLabel="Salvar"
        onSubmit={(data) => onLabelEdit(column.id, data)}
      />

      <Dialog open={confirmDeleteLabel} onOpenChange={setConfirmDeleteLabel}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Excluir etiqueta</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{column.title}</strong>?
              {column.cards.length > 0 && (
                <span className="block mt-2 text-red-600 font-medium">
                  Atenção: {column.cards.length} card{column.cards.length > 1 ? 's' : ''} ficar{column.cards.length > 1 ? 'ão' : 'á'} sem etiqueta.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDeleteLabel(false)} disabled={deletingLabel}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={handleConfirmDelete} disabled={deletingLabel}>
              {deletingLabel ? <Loader2 className="w-4 h-4 animate-spin" /> : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// =============================================
// ColumnDropZone – persiste ordem ao soltar
// =============================================
const ColumnDropZone: React.FC<{ onDropEnd: () => void; children: React.ReactNode }> = ({ onDropEnd, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [, drop] = useDrop(() => ({
    accept: 'COLUMN',
    drop: () => { onDropEnd(); },
  }), [onDropEnd]);
  drop(ref);
  return <div ref={ref}>{children}</div>;
};

// =============================================
// KanbanBoard
// =============================================
export const KanbanBoard: React.FC = () => {
  const [columns, setColumns] = useState<Column[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('Todos');
  const [isLoading, setIsLoading] = useState(true);
  const [automationsPanelOpen, setAutomationsPanelOpen] = useState(false);
  const [collapsedColumns, setCollapsedColumns] = useState<{ [key: string]: boolean }>({});
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState<{
    users: Record<string, { comments: number; attachments: number }>;
    processes: Record<string, { comments: number; attachments: number }>;
  }>({ users: {}, processes: {} });
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchMatches = React.useMemo(() => {
    const q = debouncedQuery.trim();
    if (!q) return [];
    return filteredItems.slice(0, 8);
  }, [filteredItems, debouncedQuery]);

  function openCardFromItem(item: Item) {
    const bucket = item.isProcess ? counts.processes : counts.users;
    const c = bucket?.[item.id];
    const card: KanbanCard = {
      id: item.id,
      title: item.name ?? '',
      description: item.obs ?? '',
      assignee: item.type ?? '',
      labelId: item.labelId,
      label: item.label ?? null,
      status: item.label?.name ?? 'Filtro de Cartões',
      timer: 0,
      comments: [],
      attachments: [],
      observations: item.obs ?? '',
      checklistItems: [],
      createdAt: new Date(item.statusStartedAt ?? Date.now()),
      updatedAt: new Date(),
      statusStartedAt: item.statusStartedAt,
      service: item.service,
      type: item.type,
      isProcess: !!item.isProcess,
      ownerId: item.ownerId,
      commentCount: c?.comments ?? 0,
      attachmentCount: c?.attachments ?? 0,
      cardNumber: item.cardNumber ?? null,
    };
    setSelectedCard(card);
    setSearchOpen(false);
  }

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [labelsData, usersData, processesData] = await Promise.all([
          getLabels(),
          getUsers('basic'),
          getProcess('basic'),
        ]);
        setLabels(labelsData);
        const users = Array.isArray(usersData)
          ? usersData.map(u => ({ ...u, isProcess: false, ownerId: u.id }))
          : [];
        const processes = Array.isArray(processesData)
          ? processesData.map(p => ({ ...p, obs: p.observacao, isProcess: true, ownerId: p.userId }))
          : [];
        const combined = [...users, ...processes];
        setItems(combined);
        setFilteredItems(combined);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [refreshKey]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 180);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    let filtered = items;
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, '');
      filtered = filtered.filter((item) => {
        const nameHit = item.name.toLowerCase().includes(q);
        const numberHit = qDigits.length > 0 && item.cardNumber != null && String(item.cardNumber).includes(qDigits);
        return nameHit || numberHit;
      });
    }
    if (serviceFilter !== 'Todos') {
      filtered = filtered.filter((item) => item.label?.name === serviceFilter);
    }
    setFilteredItems(filtered);
  }, [debouncedQuery, serviceFilter, items]);

  // Busca contagens reais (comentários + documentos) em lote sempre que
  // os items são atualizados.
  useEffect(() => {
    if (items.length === 0) {
      setCounts({ users: {}, processes: {} });
      return;
    }
    const userIds = items.filter((i) => !i.isProcess).map((i) => i.id);
    const processIds = items.filter((i) => i.isProcess).map((i) => i.id);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/card-counts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds, processIds }),
        });
        if (!res.ok) throw new Error('Falha ao buscar contagens');
        const data = await res.json();
        if (!cancelled) setCounts(data);
      } catch (err) {
        console.error('[card-counts]', err);
      }
    })();

    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    const kanbanCards: KanbanCard[] = filteredItems.map(item => {
      const bucket = item.isProcess ? counts.processes : counts.users;
      const c = bucket?.[item.id];
      return {
        id: item.id,
        title: item.name ?? '',
        description: item.obs ?? '',
        assignee: item.type ?? '',
        labelId: item.labelId,
        label: item.label ?? null,
        status: item.label?.name ?? 'Filtro de Cartões',
        timer: 0,
        comments: [],
        attachments: [],
        observations: item.obs ?? '',
        checklistItems: [],
        createdAt: new Date(item.statusStartedAt ?? Date.now()),
        updatedAt: new Date(),
        statusStartedAt: item.statusStartedAt,
        service: item.service,
        type: item.type,
        isProcess: !!item.isProcess,
        ownerId: item.ownerId,
        commentCount: c?.comments ?? 0,
        attachmentCount: c?.attachments ?? 0,
        cardNumber: item.cardNumber ?? null,
      };
    });

    const displayedLabels = serviceFilter === 'Todos'
      ? labels
      : labels.filter(l => l.name === serviceFilter);

    let newColumns = displayedLabels.map(label => ({
      id: label.id,
      title: label.name,
      color: label.color,
      timeLimitDays: label.timeLimitDays,
      cards: kanbanCards.filter(c => c.labelId === label.id),
    }));

    // Durante busca, esconde colunas vazias
    if (debouncedQuery.trim()) {
      newColumns = newColumns.filter(col => col.cards.length > 0);
    }

    setColumns(newColumns);
  }, [filteredItems, labels, serviceFilter, counts, debouncedQuery]);

  // ============= LABEL CRUD =============
  async function createLabel(data: LabelInput) {
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao criar etiqueta');
      const newLabel: Label = await res.json();
      setLabels((prev) => [...prev, newLabel]);
      toast.success('Etiqueta criada!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message);
      throw err;
    }
  }

  async function updateLabel(id: string, data: LabelInput) {
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao atualizar etiqueta');
      const updated: Label = await res.json();
      setLabels((prev) => prev.map((l) => (l.id === id ? updated : l)));
      toast.success('Etiqueta atualizada!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message);
      throw err;
    }
  }

  async function deleteLabel(id: string) {
    try {
      const res = await fetch(`/api/labels/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir etiqueta');
      setLabels((prev) => prev.filter((l) => l.id !== id));
      // tira a etiqueta dos cards que estavam nela (no client; backend deve fazer o mesmo)
      setItems((prev) => prev.map((it) =>
        it.labelId === id ? { ...it, labelId: null, label: null } : it
      ));
      toast.success('Etiqueta excluída!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message);
      throw err;
    }
  }

  const handleDrop = async (cardId: string, sourceColumnId: string, targetColumnId: string) => {
    if (sourceColumnId === targetColumnId) return;

    const targetLabel = labels.find(l => l.id === targetColumnId) ?? null;
    let droppedCard: KanbanCard | null = null;

    setColumns((prev) => {
      const newCols = structuredClone(prev);
      const source = newCols.find(c => c.id === sourceColumnId);
      const target = newCols.find(c => c.id === targetColumnId);
      if (!source || !target) return prev;
      const index = source.cards.findIndex(c => c.id === cardId);
      if (index === -1) return prev;
      const [card] = source.cards.splice(index, 1);
      card.labelId = targetColumnId;
      card.label = targetLabel;
      card.status = target.title;
      card.statusStartedAt = new Date().toISOString();
      target.cards.push(card);
      droppedCard = card;
      return newCols;
    });

    setItems((prev) =>
      prev.map((it) =>
        it.id === cardId
          ? { ...it, labelId: targetColumnId, label: targetLabel }
          : it
      )
    );

    if (droppedCard) {
      try {
        await updateKanbanStatus({
          id: (droppedCard as KanbanCard).id,
          labelId: targetColumnId,
          isProcess: (droppedCard as KanbanCard).isProcess,
        });
      } catch (err) {
        console.error("Erro ao salvar:", err);
        toast.error("Erro ao mover card");
      }
    }
  };

  const columnsRef = useRef(columns);
  useEffect(() => { columnsRef.current = columns; }, [columns]);

  const handleQuickAction = useCallback((cardId: string, action: string) => {
    const card = columnsRef.current.flatMap(col => col.cards).find(c => c.id === cardId);
    if (!card) return;
    if (action === 'email') alert(`📧 Enviando email para ${card.assignee} sobre: ${card.title}`);
    else if (action === 'whatsapp') alert(`💬 Enviando WhatsApp para ${card.assignee} sobre: ${card.title}`);
  }, []);

  const handleCardUpdate = (updatedCard: KanbanCard) => {
    const safeStatus = updatedCard.status ?? 'Filtro de Cartões';
    const safeCard: KanbanCard = { ...updatedCard, status: safeStatus };

    setItems((prev) =>
      prev.map((it) =>
        it.id === safeCard.id
          ? { ...it, labelId: safeCard.labelId, label: safeCard.label }
          : it
      )
    );
  };

  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedCard?.id ?? null; }, [selectedCard]);

  const handleDeleteCard = useCallback((cardId: string) => {
    setColumns((prev) =>
      prev.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== cardId) }))
    );
    setItems((prev) => prev.filter((i) => i.id !== cardId));
    setFilteredItems((prev) => prev.filter((i) => i.id !== cardId));
    if (selectedIdRef.current === cardId) setSelectedCard(null);
  }, []);

  const toggleCollapse = (colId: string) => {
    setCollapsedColumns((prev) => ({ ...prev, [colId]: !prev[colId] }));
  };

  const handleColumnReorder = useCallback((dragIndex: number, hoverIndex: number) => {
    setLabels((prev) => {
      const updated = [...prev];
      const [dragged] = updated.splice(dragIndex, 1);
      updated.splice(hoverIndex, 0, dragged);
      return updated;
    });
  }, []);

  const persistColumnOrder = useCallback(async () => {
    const orderedIds = labels.map(l => l.id);
    try {
      await fetch('/api/labels/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (err) {
      console.error('Erro ao salvar ordem:', err);
      toast.error('Erro ao salvar ordem das colunas');
    }
  }, [labels]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="p-6 bg-[#f8fafc] min-h-screen">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 mb-8 bg-white dark:bg-zinc-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-zinc-800">
          <div className="flex flex-col md:flex-row flex-1 gap-4">
            <div ref={searchBoxRef} className="relative flex items-center flex-1">
              <Search className="absolute left-3 text-gray-400 dark:text-zinc-500 w-4 h-4 z-10" />
              <Input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => { if (searchQuery.trim()) setSearchOpen(true); }}
                type="text"
                placeholder="Pesquisar por nome ou nº do card (ex: 4001)..."
                className="pl-10 h-12 w-full rounded-2xl border-gray-200 dark:border-zinc-800 focus:ring-blue-500 bg-gray-50 dark:bg-zinc-950/50"
              />
              {searchOpen && searchQuery.trim() && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
                  {searchMatches.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-zinc-400">
                      Nenhum card encontrado
                    </div>
                  ) : (
                    <ul className="max-h-[400px] overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800">
                      {searchMatches.map((item) => {
                        const labelColor = item.label?.color ?? '#9ca3af';
                        const labelName = item.label?.name ?? 'Sem etiqueta';
                        const style = item.service && serviceStyles[item.service]
                          ? serviceStyles[item.service]
                          : defaultServiceStyle;
                        return (
                          <li
                            key={item.id}
                            onClick={() => openCardFromItem(item)}
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <div className="shrink-0 px-2 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-base font-mono font-bold">
                              {item.cardNumber != null ? `#${item.cardNumber}` : '—'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-gray-900 dark:text-zinc-100 truncate">
                                  {item.name || 'Sem nome'}
                                </span>
                                {item.isProcess && (
                                  <Briefcase className="w-3 h-3 text-blue-600 shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: labelColor }}
                                  />
                                  <span className="text-[11px] text-gray-600 dark:text-zinc-400 font-medium truncate">
                                    {labelName}
                                  </span>
                                </div>
                                {item.service && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider"
                                    style={{ backgroundColor: style.bgColor, color: style.textColor }}
                                  >
                                    {item.service}
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-full md:w-[280px] h-12 rounded-2xl border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/50">
                <SelectValue placeholder="Filtrar Etapa" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="Todos">Todas as Etapas</SelectItem>
                {labels.map((label) => (
                  <SelectItem key={label.id} value={label.name}>{label.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="h-10 w-[1px] bg-gray-100 dark:bg-zinc-800 mx-2 hidden lg:block" />
            <button
              onClick={() => setAutomationsPanelOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors"
              title="Automações"
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Automações</span>
            </button>
            <CreateLabelButton onCreate={createLabel} />
            <CreatePerson labels={labels} onCreated={() => setRefreshKey((k) => k + 1)} />
            <CreateNewCard />
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 bg-white dark:bg-zinc-900 rounded-full" />
              </div>
            </div>
            <p className="font-black text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-widest animate-pulse">Sincronizando Workflow...</p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <ColumnDropZone onDropEnd={persistColumnOrder}>
              <div className="flex gap-6 pb-6 min-w-max">
                {columns.map((column, idx) => (
                  <DroppableColumn
                    key={column.id}
                    column={column}
                    index={idx}
                    onDrop={handleDrop}
                    onColumnReorder={handleColumnReorder}
                    onCardClick={setSelectedCard}
                    onQuickAction={handleQuickAction}
                    onDelete={handleDeleteCard}
                    onLabelEdit={updateLabel}
                    onLabelDelete={deleteLabel}
                    isCollapsed={collapsedColumns[column.id] || false}
                    toggleCollapse={() => toggleCollapse(column.id)}
                  />
                ))}
              </div>
            </ColumnDropZone>
          </div>
        )}

        {selectedCard && (
          <CardDialog
            card={selectedCard}
            open={!!selectedCard}
            onClose={() => setSelectedCard(null)}
            onUpdate={handleCardUpdate}
            onDelete={handleDeleteCard}
            cardId={selectedCard.id}
            ownerId={selectedCard.ownerId}
            isProcess={selectedCard.isProcess}
          />
        )}

        <AutomationsPanel
          open={automationsPanelOpen}
          onClose={() => setAutomationsPanelOpen(false)}
          labels={labels}
        />
      </div>
    </DndProvider>
  );
};