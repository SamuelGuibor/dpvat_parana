/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useDrag, useDrop, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Clock, MessageSquare, Paperclip, Edit } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { getUsers } from '@/app/_actions/get-user';
import { getProcess } from '@/app/_actions/get-process';
import { Loader2 } from 'lucide-react';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CreateNewCard } from '@/app/_components/create-newcard';
import { Input } from '@/app/_components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/_components/ui/select';
import { FaSearch } from 'react-icons/fa';
import { CardDialog } from './CardDialog';
import { useRef } from 'react';


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
  priority: 'low' | 'medium' | 'high';
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
  cards: KanbanCard[];
}

const services = [
  { id: '1', name: 'Filtro de Cartões', color: '#164b35', border: '#50253f' },
  { id: '2', name: 'Gerar Procuração Automática', color: '#000000', border: '#50253f' },
  { id: '3', name: 'Coletar Assinatura em Cartório', color: '#164555', border: '#50253f' },
  { id: '4', name: 'Coletar Assinatura Digital', color: '#164555', border: '#50253f' },
  { id: '5', name: 'Agendar Coleta com Motoboy', color: '#09326c', border: '#50253f' },
  { id: '6', name: 'Acompanhar Rota do Motoboy', color: '#09326c', border: '#50253f' },
  { id: '7', name: 'Fazer Protocolo no Hospital', color: '#37471f', border: '#50253f' },
  { id: '8', name: 'Protocolar Pasta – Hospital Presencial', color: '#37471f', border: '#50253f' },
  { id: '9', name: 'Solicitar Prontuário por E-mail', color: '#533f04', border: '#50253f' },
  { id: '10', name: 'Solicitar Prontuário Cajuru por E-mail', color: '#533f04', border: '#50253f' },
  { id: '11', name: 'Acompanhar Cajuru – Solicitado', color: '#533f04', border: '#50253f' },
  { id: '12', name: 'Solicitar Prontuário – Outros Hospitais', color: '#533f04', border: '#50253f' },
  { id: '13', name: 'Acompanhar Prontuário – Outros Solicitados', color: '#533f04', border: '#50253f' },
  { id: '14', name: 'Solicitar Prontuário – Ponta Grossa', color: '#533f04', border: '#50253f' },
  { id: '15', name: 'Aguardar Prontuário – Recebimento Online', color: '#702e00', border: '#50253f' },
  { id: '16', name: 'Aguardar Prontuário PG – Recebimento Online', color: '#702e00', border: '#50253f' },
  { id: '17', name: 'Aguardar Prontuário PG – Presencial', color: '#702e00', border: '#50253f' },
  { id: '18', name: 'Aguardar Retirada de Prontuário – Presencial', color: '#702e00', border: '#50253f' },
  { id: '19', name: 'Retirar Prontuário – Pronto para Retirar', color: '#702e00', border: '#50253f' },
  { id: '20', name: 'Solicitado ao Cliente fazer B.O. – Acidente', color: '#5d1f1a', border: '#50253f' },
  { id: '21', name: 'Solicitar Siate', color: '#5d1f1a', border: '#50253f' },
  { id: '22', name: 'Aguardar Retorno do Siate', color: '#5d1f1a', border: '#50253f' },
  { id: '23', name: 'Enviar Mensagem – Previdenciário', color: '#09326c', border: '#50253f' },
  { id: '24', name: 'Registrar Óbito – Nova Lei', color: '#09326c', border: '#50253f' },
  { id: '25', name: 'Protocolar SPVAT', color: '#5d1f1a', border: '#50253f' },
  { id: '26', name: 'Protocolar SPVAT - Standby', color: '#5d1f1a', border: '#50253f' },
  { id: '27', name: 'Enviar para Reanálise', color: '#352c63', border: '#50253f' },
  { id: '28', name: 'Protocolar DPVAT – Caixa', color: '#352c63', border: '#50253f' },
  { id: '29', name: 'Aguardar Análise da Caixa', color: '#352c63', border: '#50253f' },
  { id: '30', name: 'Acompanhar Pendências – Protocolado', color: '#50253f', border: '#50253f' },
  { id: '31', name: 'Protocolar Pendência de B.O.', color: '#50253f', border: '#50253f' },
  { id: '32', name: 'Avisar Sobre Perícia Administrativa', color: '#164b35', border: '#50253f' },
  { id: '33', name: 'Aguardar Resultado da Perícia', color: '#164b35', border: '#50253f' },
  { id: '34', name: 'Cobrar Honorários – Resultado Perícia', color: '#164b35', border: '#50253f' },
  { id: '35', name: 'Aguardar Pagamento – Honorários Cobrados', color: '#164b35', border: '#50253f' },
  { id: '36', name: 'Encerrar Processo – DPVAT', color: '#352c63', border: '#50253f' },
  { id: '37', name: 'Descartaveis', color: '#352c63', border: '#50253f' },
];

const serviceStyles: { [key: string]: { bgColor: string; textColor: string } } = {
  INSS: { bgColor: '#f5cd47', textColor: '#533f04' },
  'Seguro de Vida': { bgColor: '#9f8fef', textColor: 'ffffff' },
  DPVAT: { bgColor: '#FEA362', textColor: '#FFFFFF' },
  RCF: { bgColor: '#00ff00', textColor: '#000000' },
  SPVAT: { bgColor: '#0c66e4', textColor: '#ffffff' },
  TRABALHISTA: { bgColor: '#C9372C', textColor: '#ffffff' },
};

const defaultServiceStyle = {
  bgColor: 'transparent',
  textColor: '#000000',
};

const roleTimeLimits: { [key: string]: number | null } = {
  'Filtro de Cartões': 1,
  'Gerar Procuração Automática': 1,
  'Coletar Assinatura em Cartório': 7,
  'Coletar Assinatura Digital': 3,
  'Agendar Coleta com Motoboy': 2,
  'Acompanhar Rota do Motoboy': 2,
  'Fazer Protocolo no Hospital': 1,
  'Protocolar Pasta – Hospital Presencial': 5,
  'Solicitar Prontuário por E-mail': 2,
  'Solicitar Prontuário Cajuru por E-mail': 1,
  'Acompanhar Cajuru – Solicitado': 15,
  'Solicitar Prontuário – Outros Hospitais': 3,
  'Acompanhar Prontuário – Outros Solicitados': 20,
  'Solicitar Prontuário – Ponta Grossa': 3,
  'Aguardar Prontuário – Recebimento Online': 15,
  'Aguardar Prontuário PG – Recebimento Online': 15,
  'Aguardar Prontuário PG – Presencial': 30,
  'Aguardar Retirada de Prontuário – Presencial': 30,
  'Retirar Prontuário – Pronto para Retirar': 5,
  'Resolver Problema com B.O.': 5,
  'Fazer B.O. – Equipe Rubi': 5,
  'Orientar Cliente – Fazer B.O.': 3,
  'Enviar 1ª Mensagem – B.O.': 2,
  'Solicitar B.O. ao Cliente – Acidente': 5,
  'Solicitar Siate': 3,
  'Aguardar Retorno do Siate': 7,
  'Acompanhar Siate – Pronto': 5,
  'Enviar Mensagem – Previdenciário': 3,
  'Registrar Óbito – Nova Lei': null,
  'Protocolar SPVAT': null,
  'Protocolar DPVAT – Caixa': 5,
  'Enviar para Reanálise': 5,
  'Manter SPVAT em Standby': null,
  'Aguardar Análise da Caixa': 15,
  'Acompanhar Pendências – Protocolado': 5,
  'Protocolar Pendência de B.O.': 5,
  'Avisar Sobre Perícia Administrativa': 1,
  'Aguardar Resultado da Perícia': 2,
  'Cobrar Honorários – Resultado Perícia': 1,
  'Aguardar Pagamento – Honorários Cobrados': 1,
  'Encerrar Processo – DPVAT': null,
  USER: null,
  PROCESS: null,
  ADMIN: null,
};

interface Item {
  id: string;
  name: string;
  type: string;
  status?: string;
  statusStartedAt?: string | null;
  service?: string;
  fixed?: boolean;
  roleFixed?: string;
  obs?: string;
  isProcess?: boolean;
}

interface DraggableCardProps {
  card: KanbanCard;
  columnId: string;
  onCardClick: (card: KanbanCard) => void;
  onQuickAction: (cardId: string, action: string) => void;
}

const DraggableCard: React.FC<DraggableCardProps> = ({ card, columnId, onCardClick, onQuickAction }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'CARD',
    item: { cardId: card.id, sourceColumnId: columnId },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // let priorityColorClass = getPriorityColor(card.priority);

  // if (card.statusStartedAt) {
  //   const statusStartedAt = new Date(card.statusStartedAt);
  //   if (!isNaN(statusStartedAt.getTime())) {
  //     const days = differenceInDays(new Date(), statusStartedAt);
  //     const timeLimit = roleTimeLimits[card.status];
  //     const isOverdue = timeLimit !== null && days > timeLimit;
  //     if (isOverdue) {
  //       priorityColorClass = 'bg-red-100 text-red-800 border-red-200';
  //     }
  //   }
  // }

  const ref = useRef<HTMLDivElement>(null);

  drag(ref);

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className="cursor-move"
    >
      <Card className={`mb-3 border-l-4 hover:shadow-md transition-shadow`}>
        <CardContent className="p-3">
          <div className="flex items-start justify-between mb-2">
            <h4 className="font-semibold flex-1 cursor-pointer" onClick={() => onCardClick(card)}>
              {card.title} <span className="font-bold">{card.isProcess ? '(Processo)' : '(Usuário)'}</span>
            </h4>
          </div>

          <div className="p-2 border rounded-md bg-gray-50 text-xs text-gray-700" style={{ maxHeight: '60px', overflowY: 'auto' }}>
            {card.description || 'Sem observações'}
          </div>

          <Badge
            variant="outline"
            className="px-2 text-center text-xs mt-2 block"
            style={{
              backgroundColor: card.service && serviceStyles[card.service] ? serviceStyles[card.service].bgColor : defaultServiceStyle.bgColor,
              color: card.service && serviceStyles[card.service] ? serviceStyles[card.service].textColor : defaultServiceStyle.textColor,
            }}
          >
            <span className="mx-auto font-bold uppercase">
              {card.service || 'Sem serviço'}
              {card.isProcess && card.type ? ` - ${card.type}` : ''}
            </span>
          </Badge>

          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
            {/* <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {card.statusStartedAt ? (
                (() => {
                  const statusStartedAt = new Date(card.statusStartedAt);
                  if (isNaN(statusStartedAt.getTime())) {
                    return <span>Data inválida</span>;
                  }
                  const days = differenceInDays(new Date(), statusStartedAt);
                  const timeLimit = roleTimeLimits[card.status];
                  const isOverdue = timeLimit !== null && days > timeLimit;
                  return (
                    <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-blue-700 font-semibold'}>
                      {formatDistanceToNow(statusStartedAt, { locale: ptBR, addSuffix: true })}
                      {isOverdue && <span> (Excedeu {days - timeLimit} dias)</span>}
                    </span>
                  );
                })()
              ) : (
                <span>Sem data de início</span>
              )}
            </div> */}
            <div className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>{card.comments.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <Paperclip className="w-3 h-3" />
              <span>{card.attachments.length}</span>
            </div>
          </div>

          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onQuickAction(card.id, 'email')}
            >
              📧 Email
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onQuickAction(card.id, 'whatsapp')}
            >
              💬 WhatsApp
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onCardClick(card)}
            >
              <Edit className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

interface DroppableColumnProps {
  column: Column;
  onDrop: (cardId: string, sourceColumnId: string, targetColumnId: string) => void;
  onCardClick: (card: KanbanCard) => void;
  onQuickAction: (cardId: string, action: string) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({ column, onDrop, onCardClick, onQuickAction, isCollapsed, toggleCollapse }) => {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drop] = useDrop(() => ({
    accept: 'CARD',
    drop: (item: { cardId: string; sourceColumnId: string }) => {
      onDrop(item.cardId, item.sourceColumnId, column.id);
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isOver(),
    }),
  }));

  const service = services.find(s => s.name === column.title);
  const bgColor = isDragging ? '#eff6ff' : service?.color || '#f0f0f0';
  const borderColor = service?.border || '#d1d5db';

  drop(ref);
  if (isCollapsed) {
    return (
      <div
        ref={ref}
        style={{ backgroundColor: bgColor, border: `2px solid ${isDragging ? '#93c5fd' : borderColor}` }}
        className={`flex-shrink-0 w-12 rounded-lg p-1 ${isDragging ? 'border-blue-300' : ''}`}
      >
        <div className="flex flex-col items-center">
          <Badge variant="secondary" className="mb-2 text-xs">{column.cards.length}</Badge>
          <h3 className="font-semibold text-xs writing-mode-vertical-rl transform rotate-180 cursor-pointer" onClick={toggleCollapse}>
            {column.title}
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      className={`flex-shrink-0 w-80 rounded-lg p-3 ${isDragging ? 'border-2 border-blue-300' : 'border'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold cursor-pointer" onClick={toggleCollapse}>{column.title}</h3>
        <Badge variant="secondary">{column.cards.length}</Badge>
      </div>

      <ScrollArea className="h-[calc(100vh-250px)]">
        <div className="pr-3">
          {column.cards.map((card) => (
            <DraggableCard
              key={card.id}
              card={card}
              columnId={column.id}
              onCardClick={onCardClick}
              onQuickAction={onQuickAction}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export const KanbanBoard: React.FC = () => {
  const [columns, setColumns] = useState<Column[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('Todos');
  const [isLoading, setIsLoading] = useState(true);
  const [collapsedColumns, setCollapsedColumns] = useState<{ [key: string]: boolean }>({});
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [usersData, processesData] = await Promise.all([
          getUsers('basic'),
          getProcess('basic'),
        ]);

        const users = Array.isArray(usersData)
          ? usersData.map((user) => ({
            ...user,
            status: user.status || user.type,
            isProcess: false,
          }))
          : [];
        const processes = Array.isArray(processesData)
          ? processesData.map((process) => ({
            ...process,
            status: process.status || process.role,
            isProcess: true,
          }))
          : [];

        const combinedData = [...users, ...processes];
        setItems(combinedData);
        setFilteredItems(combinedData);
      } catch (error) {
        console.error('Erro ao carregar os dados:', error);
        setItems([]);
        setFilteredItems([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = items;

    if (searchQuery) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (serviceFilter !== 'Todos') {
      filtered = filtered.filter((item) => item.status === serviceFilter);
    }

    setFilteredItems(filtered);
  }, [searchQuery, serviceFilter, items]);

  useEffect(() => {
    const kanbanCards: KanbanCard[] = filteredItems.map((item) => ({
      id: item.id,
      title: item.name,
      description: item.obs || '',
      assignee: item.type || '',
      status: item.status || 'Filtro de Cartões',
      timer: 0,
      comments: [],
      attachments: [],
      observations: item.obs || '',
      priority: 'medium',
      checklistItems: [],
      createdAt: new Date(item.statusStartedAt || Date.now()),
      updatedAt: new Date(),
      statusStartedAt: item.statusStartedAt,
      service: item.service,
      type: item.type,
      isProcess: !!item.isProcess,
    }));

    const columnTitles = services.map((s) => s.name);
    const displayedTitles = serviceFilter === 'Todos' ? columnTitles : columnTitles.filter((t) => t === serviceFilter);

    const newColumns = services
      .filter((s) => displayedTitles.includes(s.name))
      .map((service, index) => ({
        id: service.id,
        title: service.name,
        cards: kanbanCards.filter((card) => card.status === service.name),
      }));

    setColumns(newColumns);
  }, [filteredItems]);

  const handleDrop = (cardId: string, sourceColumnId: string, targetColumnId: string) => {
    if (sourceColumnId === targetColumnId) return;

    setColumns((prevColumns) => {
      const newColumns = [...prevColumns];
      const sourceColumn = newColumns.find(col => col.id === sourceColumnId);
      const targetColumn = newColumns.find(col => col.id === targetColumnId);

      if (!sourceColumn || !targetColumn) return prevColumns;

      const cardIndex = sourceColumn.cards.findIndex(card => card.id === cardId);
      if (cardIndex === -1) return prevColumns;

      const [movedCard] = sourceColumn.cards.splice(cardIndex, 1);
      movedCard.status = targetColumn.title;
      movedCard.updatedAt = new Date();
      movedCard.statusStartedAt = new Date().toISOString(); // Reset start time on move
      targetColumn.cards.push(movedCard);

      return newColumns;
    });
  };

  const handleQuickAction = (cardId: string, action: string) => {
    const card = columns.flatMap(col => col.cards).find(c => c.id === cardId);
    if (!card) return;

    if (action === 'email') {
      alert(`📧 Enviando email para ${card.assignee} sobre: ${card.title}`);
    } else if (action === 'whatsapp') {
      alert(`💬 Enviando WhatsApp para ${card.assignee} sobre: ${card.title}`);
    }
  };

  const handleCardUpdate = (updatedCard: KanbanCard) => {
    const safeStatus = updatedCard.status ?? 'Filtro de Cartões'; // ou outro default que faça sentido

    const safeCard: KanbanCard = {
      ...updatedCard,
      status: safeStatus,
      // Se precisar garantir outros campos obrigatórios do KanbanCard:
      // title: updatedCard.title ?? '',
      // description: updatedCard.description ?? '',
      // etc.
    };

    setColumns((prevColumns) => {
      return prevColumns.map(column => ({
        ...column,
        cards: column.cards.map(card =>
          card.id === safeCard.id ? safeCard : card
        )
      }));
    });
  };

  const toggleCollapse = (colId: string) => {
    setCollapsedColumns((prev) => ({
      ...prev,
      [colId]: !prev[colId],
    }));
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="relative flex items-center w-full max-w-md">
            <FaSearch className="absolute left-2 text-black/70 text-sm sm:text-base" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text"
              placeholder="Pesquise um nome"
              className="pl-8 w-full text-xs sm:text-sm"
            />
          </div>
          <CreateNewCard />
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-full sm:w-[360px] text-xs sm:text-sm">
              <SelectValue placeholder="Filtrar por serviço" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos" className="text-xs sm:text-sm">
                Todos
              </SelectItem>
              {services.map((service) => (
                <SelectItem
                  key={service.name}
                  value={service.name}
                  className="text-xs sm:text-sm"
                >
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
        ) : (
          <div className="overflow-x-auto w-full">
            <div className="flex gap-4 pb-4 min-w-max">
              {columns.map((column) => (
                <DroppableColumn
                  key={column.id}
                  column={column}
                  onDrop={handleDrop}
                  onCardClick={setSelectedCard}
                  onQuickAction={handleQuickAction}
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
            userId={selectedCard.id}
            isProcess={selectedCard.isProcess}
          />
        )}
      </div>
    </DndProvider>
  );
};