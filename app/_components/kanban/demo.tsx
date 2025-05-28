'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/app/_components/ui/avatar';
import { Badge } from '@/app/_components/ui/badge';
import { Input } from '@/app/_components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/_components/ui/select';
import { FaSearch } from 'react-icons/fa';
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
} from './kanban';
import DialogDash from '../dialog';
import { getUsers } from '@/app/_actions/get-user';
import type { DragEndEvent } from '@dnd-kit/core';
import { useState, useEffect } from 'react';
import type { FC } from 'react';

// Lista fixa de serviços com cores
const services = [
  { id: '1', name: 'Aplicar Filtro DPVAT', color: '#DCFCE7', text: '#166534', border: '#BBF7D0' },
  { id: '2', name: 'Gerar Procuração Automática', color: '#DCFCE7', text: '#166534', border: '#BBF7D0' },
  { id: '3', name: 'Coletar Assinatura em Cartório', color: '#CFFAFE', text: '#155E75', border: '#A5F3FC' },
  { id: '4', name: 'Coletar Assinatura Digital', color: '#CFFAFE', text: '#155E75', border: '#A5F3FC' },
  { id: '5', name: 'Agendar Coleta com Motoboy', color: '#DBEAFE', text: '#1E3A8A', border: '#BFDBFE' },
  { id: '6', name: 'Acompanhar Rota do Motoboy', color: '#DBEAFE', text: '#1E3A8A', border: '#BFDBFE' },
  { id: '7', name: 'Fazer Protocolo no Hospital', color: '#ECFCCB', text: '#3F6212', border: '#D9F99D' },
  { id: '8', name: 'Protocolar Pasta – Hospital Presencial', color: '#ECFCCB', text: '#3F6212', border: '#D9F99D' },
  { id: '9', name: 'Solicitar Prontuário por E-mail', color: '#FEF9C3', text: '#713F12', border: '#FEF08A' },
  { id: '10', name: 'Solicitar Prontuário Cajuru por E-mail', color: '#FEF9C3', text: '#713F12', border: '#FEF08A' },
  { id: '11', name: 'Acompanhar Cajuru – Solicitado', color: '#FEF9C3', text: '#713F12', border: '#FEF08A' },
  { id: '12', name: 'Solicitar Prontuário – Outros Hospitais', color: '#FEF9C3', text: '#713F12', border: '#FEF08A' },
  { id: '13', name: 'Acompanhar Prontuário – Outros Solicitados', color: '#FEF9C3', text: '#713F12', border: '#FEF08A' },
  { id: '14', name: 'Solicitar Prontuário – Ponta Grossa', color: '#FEF9C3', text: '#713F12', border: '#FEF08A' },
  { id: '15', name: 'Aguardar Prontuário – Recebimento Online', color: '#FFEDD5', text: '#7C2D12', border: '#FED7AA' },
  { id: '16', name: 'Aguardar Prontuário PG – Recebimento Online', color: '#FFEDD5', text: '#7C2D12', border: '#FED7AA' },
  { id: '17', name: 'Aguardar Prontuário PG – Presencial', color: '#FFEDD5', text: '#7C2D12', border: '#FED7AA' },
  { id: '18', name: 'Aguardar Retirada de Prontuário – Presencial', color: '#FFEDD5', text: '#7C2D12', border: '#FED7AA' },
  { id: '19', name: 'Retirar Prontuário – Pronto para Retirar', color: '#FFEDD5', text: '#7C2D12', border: '#FED7AA' },
  { id: '20', name: 'Resolver Problema com B.O.', color: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
  { id: '21', name: 'Fazer B.O. – Equipe Rubi', color: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
  { id: '22', name: 'Orientar Cliente – Fazer B.O.', color: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
  { id: '23', name: 'Enviar 1ª Mensagem – B.O.', color: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
  { id: '24', name: 'Solicitar B.O. ao Cliente – Acidente', color: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
  { id: '25', name: 'Solicitar Siate', color: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  { id: '26', name: 'Aguardar Retorno do Siate', color: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  { id: '27', name: 'Acompanhar Siate – Pronto', color: '#FEE2E2', text: '#991B1B', border: '#FECACA' },
  { id: '28', name: 'Enviar Mensagem – Previdenciário', color: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
  { id: '29', name: 'Registrar Óbito – Nova Lei', color: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
  { id: '30', name: 'Protocolar SPVAT', color: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' },
  { id: '31', name: 'Protocolar DPVAT – Caixa', color: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' },
  { id: '32', name: 'Enviar para Reanálise', color: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' },
  { id: '33', name: 'Manter SPVAT em Standby', color: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' },
  { id: '34', name: 'Aguardar Análise da Caixa', color: '#DBEAFE', text: '#1E3A8A', border: '#BFDBFE' },
  { id: '35', name: 'Acompanhar Pendências – Protocolado', color: '#F5D0FE', text: '#701A75', border: '#F0ABFC' },
  { id: '36', name: 'Protocolar Pendência de B.O.', color: '#F5D0FE', text: '#701A75', border: '#F0ABFC' },
  { id: '37', name: 'Avisar Sobre Perícia Administrativa', color: '#CCFBF1', text: '#115E59', border: '#99F6E4' },
  { id: '38', name: 'Aguardar Resultado da Perícia', color: '#CCFBF1', text: '#115E59', border: '#99F6E4' },
  { id: '39', name: 'Cobrar Honorários – Resultado Perícia', color: '#CCFBF1', text: '#115E59', border: '#99F6E4' },
  { id: '40', name: 'Aguardar Pagamento – Honorários Cobrados', color: '#CCFBF1', text: '#115E59', border: '#99F6E4' },
  { id: '41', name: 'Encerrar Processo – DPVAT', color: '#E5E7EB', text: '#1F2937', border: '#D1D5DB' },
];

// Interface para os dados dos usuários
interface User {
  id: string;
  name: string;
  type: string;
  status?: string;
}

const KanbanExample: FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('Todos');
  const [isLoading, setIsLoading] = useState(true);

  // Carregar os dados do getUsers
  useEffect(() => {
    async function fetchData() {
      try {
        const usersData = await getUsers('basic');
        if (Array.isArray(usersData)) {
          const transformedData = usersData.map((user) => ({
            ...user,
            status: user.status || user.type, // Usar o type como status inicial
          }));
          setUsers(transformedData);
          setFilteredUsers(transformedData);
        } else {
          console.error('Esperava uma lista de usuários, mas recebeu:', usersData);
          setUsers([]);
          setFilteredUsers([]);
        }
      } catch (error) {
        console.error('Erro ao carregar os dados:', error);
        setUsers([]);
        setFilteredUsers([]);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Aplicar filtros
  useEffect(() => {
    let filtered = users;

    if (searchQuery) {
      filtered = filtered.filter((user) =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (serviceFilter !== 'Todos') {
      filtered = filtered.filter((user) => user.type === serviceFilter);
    }

    setFilteredUsers(filtered);
  }, [searchQuery, serviceFilter, users]);

  // Função para lidar com o drag-and-drop
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    const newStatus = services.find((s) => s.name === over.id)?.name;

    if (!newStatus) {
      return;
    }

    setUsers((prev) =>
      prev.map((user) => {
        if (user.id === active.id) {
          return { ...user, status: newStatus, type: newStatus };
        }
        return user;
      })
    );

    setFilteredUsers((prev) =>
      prev.map((user) => {
        if (user.id === active.id) {
          return { ...user, status: newStatus, type: newStatus };
        }
        return user;
      })
    );
  };

  // Debug para o duplo clique
  const handleDoubleClick = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    console.log(`Duplo clique disparado para o usuário: ${userId}`);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Filtros */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex items-center w-full max-w-md">
          <FaSearch className="absolute left-2 text-black/70" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            type="text"
            placeholder="Pesquise um nome"
            className="pl-8 w-full"
          />
        </div>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-[360px]">
            <SelectValue placeholder="Filtrar por serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos</SelectItem>
            {services.map((service) => (
              <SelectItem key={service.name} value={service.name}>
                {service.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kanban */}
      {isLoading ? (
        <div>Carregando...</div>
      ) : (
        <div className="overflow-x-auto">
          <KanbanProvider onDragEnd={handleDragEnd} className="min-w-max">
            {services.map((service) => (
              <KanbanBoard key={service.name} id={service.name} className="w-80 min-w-80">
                <KanbanHeader name={service.name} color={service.color} />
                <KanbanCards className="max-h-[600px] overflow-y-auto">
                  {filteredUsers
                    .filter((user) => user.status === service.name)
                    .map((user, index) => (
                      <KanbanCard
                        key={user.id}
                        id={user.id}
                        name={user.name}
                        parent={service.name}
                        index={index}
                        className="mb-2"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <DialogDash
                              userId={user.id}
                              trigger={
                                <span
                                  className="cursor-pointer hover:underline font-medium text-sm"
                                  onDoubleClick={(e) => handleDoubleClick(e, user.id)}
                                >
                                  {user.name}
                                </span>
                              }
                            />
                            <Avatar className="h-4 w-4 shrink-0">
                              <AvatarImage src={`https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${user.id}`} />
                              <AvatarFallback>{user.name?.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                          </div>
                          <Badge
                            variant="outline"
                            className={`px-1.5 w-full`}
                            style={{
                              backgroundColor: service.color,
                              color: service.text,
                              borderColor: service.border,
                            }}
                          >
                            {user.type}
                          </Badge>
                        </div>
                      </KanbanCard>
                    ))}
                </KanbanCards>
              </KanbanBoard>
            ))}
          </KanbanProvider>
        </div>
      )}
    </div>
  );
};

export { KanbanExample };