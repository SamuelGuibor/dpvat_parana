/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
export const dynamic = "force-dynamic";

import React, { useState, useEffect, useRef } from 'react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  Clock, MessageSquare, Paperclip, Edit, User as UserIcon, Briefcase,
  ChevronRight, ChevronLeft, Search, Loader2, Trash2, MoreVertical, Plus, Tag,
  User,
} from 'lucide-react';
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
            <p className="text-[11px] text-gray-500">Cards nessa etiqueta ficam destacados em vermelho após esse prazo.</p>
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

const DraggableCard: React.FC<DraggableCardProps> = ({ card, columnId, onCardClick, onQuickAction, onDelete }) => {
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
          "mb-3 border-none shadow-sm hover:shadow-lg transition-all duration-200 relative overflow-hidden bg-white",
          card.isProcess ? "ring-1 ring-blue-100" : "ring-1 ring-gray-100"
        )}>
          <div className={cn("absolute top-0 left-0 w-1.5 h-full", card.isProcess ? "bg-blue-600" : "bg-gray-400")} />
          <CardContent className="p-4 pl-6">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-bold text-sm text-gray-900 leading-tight flex-1 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => onCardClick(card)}>
                {card.title}
              </h4>
              <div className="shrink-0 ml-2">
                {card.isProcess ? (
                  <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-100">
                    <Briefcase className="w-3 h-3 text-blue-600" />
                  </div>
                ) : (
                  <div className="bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                    <UserIcon className="w-3 h-3 text-gray-600" />
                  </div>
                )}
              </div>
            </div>
            <div className="mb-3">
              <div className="text-[11px] text-gray-500 bg-gray-50/50 p-2 rounded-lg border border-gray-100/50 line-clamp-2 italic">
                {card.description || 'Nenhuma descrição detalhada.'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="outline" className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border-none shadow-sm hover:bg-gray-200" style={{ backgroundColor: style.bgColor, color: style.textColor }}>
                {card.service}
              </Badge>
              <div className="relative flex items-center gap-1 ml-auto">
                <Clock className="w-4 h-4" />
                {renderTimerBadge(card)}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-50 pt-3">
              <div className="flex items-center gap-3 text-gray-400">
                <div className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-bold">{card.comments.length}</span>
                </div>
                <div className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-bold">{card.attachments.length}</span>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <Button size="icon" variant="secondary" className="h-7 w-7 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-600" onClick={() => onCardClick(card)}>
                  <Edit className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="secondary" className="h-7 w-7 rounded-lg bg-gray-50 hover:bg-red-50 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>
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

// =============================================
// DroppableColumn
// =============================================
interface DroppableColumnProps {
  column: Column;
  onDrop: (cardId: string, sourceColumnId: string, targetColumnId: string) => void;
  onCardClick: (card: KanbanCard) => void;
  onQuickAction: (cardId: string, action: string) => void;
  onDelete: (cardId: string) => void;
  onLabelEdit: (id: string, data: LabelInput) => Promise<void>;
  onLabelDelete: (id: string) => Promise<void>;
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({
  column, onDrop, onCardClick, onQuickAction, onDelete,
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
  drop(ref);

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
        isOver ? "bg-blue-50 border-blue-200" : "bg-white border-gray-100 shadow-sm"
      )}>
        <div className="flex flex-col items-center h-full">
          <Button variant="ghost" size="icon" className="mb-4 h-10 w-10 rounded-xl hover:bg-gray-100" onClick={toggleCollapse}>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Button>
          <div className="flex-1 flex flex-col items-center gap-4 overflow-hidden">
            <Badge className="bg-gray-100 text-gray-600 border-none font-black h-8 w-8 flex items-center justify-center rounded-xl hover:bg-gray-200">
              {column.cards.length}
            </Badge>
            <h3 className="font-black text-[10px] uppercase tracking-widest text-gray-400 [writing-mode:vertical-rl] whitespace-nowrap text-center">
              {column.title}
            </h3>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-lg bg-gray-50 hover:bg-gray-100"
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
        isOver ? "bg-blue-50 border-blue-400 ring-2 ring-blue-100" : "bg-gray-50/50 border-gray-200"
      )}>
        <div className="p-4 rounded-t-2xl flex items-center justify-between border-b bg-white shadow-sm" style={{ borderTop: `4px solid ${columnColor}` }}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: columnColor, boxShadow: `0 0 8px ${columnColor}66` }} />
            <h3 className="font-black text-xs uppercase tracking-tight text-gray-700 truncate">{column.title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-gray-100 text-gray-600 border-none font-bold px-2 py-0.5 rounded-lg text-[10px]">
              {column.cards.length}
            </Badge>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7 rounded-lg bg-gray-50 hover:bg-gray-100"
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
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-gray-400 hover:text-gray-900" onClick={toggleCollapse}>
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
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-2">
                <Briefcase className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Sem processos</p>
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
// KanbanBoard
// =============================================
export const KanbanBoard: React.FC = () => {
  const [columns, setColumns] = useState<Column[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('Todos');
  const [isLoading, setIsLoading] = useState(true);
  const [collapsedColumns, setCollapsedColumns] = useState<{ [key: string]: boolean }>({});
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

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
    let filtered = items;
    if (searchQuery) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (serviceFilter !== 'Todos') {
      filtered = filtered.filter((item) => item.label?.name === serviceFilter);
    }
    setFilteredItems(filtered);
  }, [searchQuery, serviceFilter, items]);

  useEffect(() => {
    const kanbanCards: KanbanCard[] = filteredItems.map(item => ({
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
    }));

    const displayedLabels = serviceFilter === 'Todos'
      ? labels
      : labels.filter(l => l.name === serviceFilter);

    const newColumns = displayedLabels.map(label => ({
      id: label.id,
      title: label.name,
      color: label.color,
      timeLimitDays: label.timeLimitDays,
      cards: kanbanCards.filter(c => c.labelId === label.id),
    }));

    setColumns(newColumns);
  }, [filteredItems, labels, serviceFilter]);

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

  const handleQuickAction = (cardId: string, action: string) => {
    const card = columns.flatMap(col => col.cards).find(c => c.id === cardId);
    if (!card) return;
    if (action === 'email') alert(`📧 Enviando email para ${card.assignee} sobre: ${card.title}`);
    else if (action === 'whatsapp') alert(`💬 Enviando WhatsApp para ${card.assignee} sobre: ${card.title}`);
  };

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

  const handleDeleteCard = (cardId: string) => {
    setColumns((prev) =>
      prev.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== cardId) }))
    );
    setItems((prev) => prev.filter((i) => i.id !== cardId));
    setFilteredItems((prev) => prev.filter((i) => i.id !== cardId));
    if (selectedCard?.id === cardId) setSelectedCard(null);
  };

  const toggleCollapse = (colId: string) => {
    setCollapsedColumns((prev) => ({ ...prev, [colId]: !prev[colId] }));
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="p-6 bg-[#f8fafc] min-h-screen">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 mb-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row flex-1 gap-4">
            <div className="relative flex items-center flex-1">
              <Search className="absolute left-3 text-gray-400 w-4 h-4" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                type="text"
                placeholder="Pesquisar por nome ou processo..."
                className="pl-10 h-12 w-full rounded-2xl border-gray-200 focus:ring-blue-500 bg-gray-50/50"
              />
            </div>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-full md:w-[280px] h-12 rounded-2xl border-gray-200 bg-gray-50/50">
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
            <div className="h-10 w-[1px] bg-gray-100 mx-2 hidden lg:block" />
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
                <div className="w-4 h-4 bg-white rounded-full" />
              </div>
            </div>
            <p className="font-black text-xs text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Workflow...</p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <div className="flex gap-6 pb-6 min-w-max">
              {columns.map((column) => (
                <DroppableColumn
                  key={column.id}
                  column={column}
                  onDrop={handleDrop}
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
      </div>
    </DndProvider>
  );
};