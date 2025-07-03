'use client';

import { Badge } from '@/app/_components/ui/badge';
import { Input } from '@/app/_components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/_components/ui/select';
import { FaSearch } from 'react-icons/fa';
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanProvider,
} from './kanban';
import DialogDash from '../dialog';
import { getUsers } from '@/app/_actions/get-user';
import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { Loader2 } from 'lucide-react';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const services = [
  { id: '1', name: 'Aplicar Filtro DPVAT', color: '#164b35', border: '#50253f' },
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
  { id: '20', name: 'Resolver Problema com B.O.', color: '#5d1f1a', border: '#50253f' },
  { id: '21', name: 'Fazer B.O. – Equipe Rubi', color: '#5d1f1a', border: '#50253f' },
  { id: '22', name: 'Orientar Cliente – Fazer B.O.', color: '#5d1f1a', border: '#50253f' },
  { id: '23', name: 'Enviar 1ª Mensagem – B.O.', color: '#5d1f1a', border: '#50253f' },
  { id: '24', name: 'Solicitado ao Cliente fazer B.O. – Acidente', color: '#5d1f1a', border: '#50253f' },
  { id: '25', name: 'Solicitar Siate', color: '#5d1f1a', border: '#50253f' },
  { id: '26', name: 'Aguardar Retorno do Siate', color: '#5d1f1a', border: '#50253f' },
  { id: '27', name: 'Acompanhar Siate – Pronto', color: '#5d1f1a', border: '#50253f' },
  { id: '28', name: 'Enviar Mensagem – Previdenciário', color: '#09326c', border: '#50253f' },
  { id: '29', name: 'Registrar Óbito – Nova Lei', color: '#09326c', border: '#50253f' },
  { id: '30', name: 'Protocolar SPVAT', color: '#5d1f1a', border: '#50253f' },
  { id: '31', name: 'Protocolar SPVAT - Standby', color: '#5d1f1a', border: '#50253f' },
  { id: '32', name: 'Enviar para Reanálise', color: '#352c63', border: '#50253f' },
  { id: '33', name: 'Protocolar DPVAT – Caixa', color: '#352c63', border: '#50253f' },
  { id: '24', name: 'Aguardar Análise da Caixa', color: '#352c63', border: '#50253f' },
  { id: '35', name: 'Acompanhar Pendências – Protocolado', color: '#50253f', border: '#50253f' },
  { id: '36', name: 'Protocolar Pendência de B.O.', color: '#50253f', border: '#50253f' },
  { id: '37', name: 'Avisar Sobre Perícia Administrativa', color: '#164b35', border: '#50253f' },
  { id: '38', name: 'Aguardar Resultado da Perícia', color: '#164b35', border: '#50253f' },
  { id: '39', name: 'Cobrar Honorários – Resultado Perícia', color: '#164b35', border: '#50253f' },
  { id: '40', name: 'Aguardar Pagamento – Honorários Cobrados', color: '#164b35', border: '#50253f' },
  { id: '41', name: 'Encerrar Processo – DPVAT', color: '#352c63', border: '#50253f' },
];

// Função para escurecer a cor em 20%


// Mapeamento de estilos para user.service
const serviceStyles: { [key: string]: { bgColor: string; textColor: string } } = {
  INSS: { bgColor: '#DCFCE7', textColor: '#15803D' },
  'outro exemplo': { bgColor: '#CFFAFE', textColor: '#0E7490' }, // Ciano claro para fundo, ciano escuro para texto
  DPVAT: { bgColor: '#E0E7FF', textColor: '#1E3A8A' }, // Azul claro para fundo, azul escuro para texto
};

// Estilo padrão para serviços não mapeados ou undefined
const defaultServiceStyle = {
  bgColor: 'transparent',
  textColor: '#000000',
};

interface User {
  id: string;
  name: string;
  type: string;
  status?: string;
  statusStartedAt?: string | null;
  service?: string;
  obs?: string;
}

const roleTimeLimits: { [key: string]: number | null } = {
  'Aplicar Filtro DPVAT': 7,
  'Gerar Procuração Automática': 3,
  'Coletar Assinatura em Cartório': 5,
  'Coletar Assinatura Digital': 3,
  'Agendar Coleta com Motoboy': 2,
  'Acompanhar Rota do Motoboy': 2,
  'Fazer Protocolo no Hospital': 5,
  'Protocolar Pasta – Hospital Presencial': 5,
  'Solicitar Prontuário por E-mail': 7,
  'Solicitar Prontuário Cajuru por E-mail': 7,
  'Acompanhar Cajuru – Solicitado': 10,
  'Solicitar Prontuário – Outros Hospitais': 7,
  'Acompanhar Prontuário – Outros Solicitados': 10,
  'Solicitar Prontuário – Ponta Grossa': 7,
  'Aguardar Prontuário – Recebimento Online': 15,
  'Aguardar Prontuário PG – Recebimento Online': 15,
  'Aguardar Prontuário PG – Presencial': 15,
  'Aguardar Retirada de Prontuário – Presencial': 10,
  'Retirar Prontuário – Pronto para Retirar': 5,
  'Resolver Problema com B.O.': 7,
  'Fazer B.O. – Equipe Rubi': 5,
  'Orientar Cliente – Fazer B.O.': 3,
  'Enviar 1ª Mensagem – B.O.': 2,
  'Solicitar B.O. ao Cliente – Acidente': 5,
  'Solicitar Siate': 3,
  'Aguardar Retorno do Siate': 7,
  'Acompanhar Siate – Pronto': 5,
  'Enviar Mensagem – Previdenciário': 3,
  'Registrar Óbito – Nova Lei': 5,
  'Protocolar SPVAT': 7,
  'Protocolar DPVAT – Caixa': 7,
  'Enviar para Reanálise': 5,
  'Manter SPVAT em Standby': null,
  'Aguardar Análise da Caixa': 15,
  'Acompanhar Pendências – Protocolado': 10,
  'Protocolar Pendência de B.O.': 5,
  'Avisar Sobre Perícia Administrativa': 3,
  'Aguardar Resultado da Perícia': 15,
  'Cobrar Honorários – Resultado Perícia': 5,
  'Aguardar Pagamento – Honorários Cobrados': 7,
  'Encerrar Processo – DPVAT': null,
  USER: null,
  ADMIN: null,
};

const KanbanExample: FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('Todos');
  const [isLoading, setIsLoading] = useState(true);
  const [collapsedBoards, setCollapsedBoards] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    async function fetchData() {
      try {
        const usersData = await getUsers('basic');
        if (Array.isArray(usersData)) {
          const transformedData = usersData.map((user) => ({
            ...user,
            status: user.status || user.type,
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

  useEffect(() => {
    let filtered = users;

    if (searchQuery) {
      filtered = filtered.filter((user) =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (serviceFilter !== 'Todos') {
      filtered = filtered.filter((user) => user.status === serviceFilter);
    }

    setFilteredUsers(filtered);
  }, [searchQuery, serviceFilter, users]);

  const renderTimerBadge = (user: User) => {
    if (!user.type || !user.statusStartedAt) {
      return (
        <Badge
          variant="outline"
          className="px-2 text-center text-xs sm:text-sm"
          style={{ backgroundColor: 'transparent', color: '#000000' }}
        >
          Sem data de início
        </Badge>
      );
    }

    const statusStartedAt = new Date(user.statusStartedAt);
    if (isNaN(statusStartedAt.getTime())) {
      console.error('Data inválida para statusStartedAt:', user.statusStartedAt);
      return (
        <Badge
          variant="outline"
          className="px-2 text-center text-xs sm:text-sm"
          style={{ backgroundColor: 'transparent', color: '#000000' }}
        >
          Data inválida
        </Badge>
      );
    }

    const daysInRole = differenceInDays(new Date(), statusStartedAt);
    const timeLimit = roleTimeLimits[user.type] ?? null;
    const isOverdue = timeLimit !== null && daysInRole > timeLimit;

    return (
      <Badge
        variant="outline"
        className={`px-2 text-center text-xs sm:text-sm ${
          isOverdue ? 'text-red-600 font-semibold' : 'text-blue-700 font-semibold'
        }`}
        style={{ backgroundColor: 'transparent' }}
      >
        {formatDistanceToNow(statusStartedAt, {
          locale: ptBR,
          addSuffix: true,
        })}
        {isOverdue && (
          <span className="ml-1 text-[10px] sm:text-xs font-semibold">
            (Excedeu {daysInRole - timeLimit} dias)
          </span>
        )}
      </Badge>
    );
  };

  const toggleCollapse = (boardId: string) => {
    setCollapsedBoards((prev) => ({
      ...prev,
      [boardId]: !prev[boardId],
    }));
  };

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-4 w-full">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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

      {/* Kanban */}
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      ) : (
        <div className="w-full overflow-x-auto">
          <KanbanProvider className="flex flex-row gap-4 p-2 sm:p-4 min-w-fit">
            {serviceFilter === 'Todos'
              ? services.map((service) => {
                  const cardCount = filteredUsers.filter(
                    (user) => user.status === service.name
                  ).length;
                  return (
                    <KanbanBoard
                      key={service.name}
                      id={service.name}
                      className={
                        collapsedBoards[service.name]
                          ? 'w-[50px] min-w-[50px]'
                          : 'w-80 min-w-80 max-w-80 mb-4 sm:mb-0'
                      }
                      style={{
                        backgroundColor: service.color,
                        border: `2px solid ${service.border}`,
                      }}
                      isCollapsed={collapsedBoards[service.name] || false}
                      toggleCollapse={() => toggleCollapse(service.name)}
                      cardCount={cardCount}
                    >
                      <KanbanCards className="max-h-[450px] overflow-y-auto overflow-x-hidden">
                        {filteredUsers
                          .filter((user) => user.status === service.name)
                          .map((user, index) => (
                            <KanbanCard
                              key={user.id}
                              id={user.id}
                              name={user.name}
                              parent={service.name}
                              index={index}
                              className="mb-2 w-full"
                            >
                              <div className="flex flex-col gap-1 w-full">
                                <div className="flex items-center justify-between gap-2">
                                  <DialogDash
                                    userId={user.id}
                                    trigger={
                                      <span className="cursor-pointer hover:underline font-medium text-xs sm:text-sm">
                                        {user.name}
                                      </span>
                                    }
                                  />
                                </div>
                                <Badge
                                  variant="outline"
                                  className="px-2 text-center text-xs sm:text-sm"
                                  style={{
                                    backgroundColor:
                                      user.service && serviceStyles[user.service]
                                        ? serviceStyles[user.service].bgColor
                                        : defaultServiceStyle.bgColor,
                                    color:
                                      user.service && serviceStyles[user.service]
                                        ? serviceStyles[user.service].textColor
                                        : defaultServiceStyle.textColor,
                                  }}
                                >
                                  {user.service || 'Sem serviço'}
                                </Badge>
                                <div
                                  className="p-2 border rounded-md bg-gray-50 text-xs sm:text-sm text-gray-700"
                                  style={{ maxHeight: '60px', overflowY: 'auto' }}
                                >
                                  {user.obs || 'Sem observações'}
                                </div>
                                {renderTimerBadge(user)}
                              </div>
                            </KanbanCard>
                          ))}
                      </KanbanCards>
                    </KanbanBoard>
                  );
                })
              : services
                  .filter((service) => service.name === serviceFilter)
                  .map((service) => {
                    const cardCount = filteredUsers.filter(
                      (user) => user.status === service.name
                    ).length;
                    return (
                      <KanbanBoard
                        key={service.name}
                        id={service.name}
                        className={
                          collapsedBoards[service.name]
                            ? 'w-[50px] min-w-[50px]'
                            : 'w-80 min-w-80 max-w-80'
                        }
                        style={{
                          backgroundColor: service.color,
                          border: `2px solid ${service.border}`,
                        }}
                        isCollapsed={collapsedBoards[service.name] || false}
                        toggleCollapse={() => toggleCollapse(service.name)}
                        cardCount={cardCount}
                      >
                        <KanbanCards className="max-h-[450px] overflow-y-auto overflow-x-hidden">
                          {filteredUsers
                            .filter((user) => user.status === service.name)
                            .map((user, index) => (
                              <KanbanCard
                                key={user.id}
                                id={user.id}
                                name={user.name}
                                parent={service.name}
                                index={index}
                                className="mb-2 w-full"
                              >
                                <div className="flex flex-col gap-1 w-full">
                                  <div className="flex items-center justify-between gap-2">
                                    <DialogDash
                                      userId={user.id}
                                      trigger={
                                        <span className="cursor-pointer hover:underline font-medium text-xs sm:text-sm">
                                          {user.name}
                                        </span>
                                      }
                                    />
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="px-2 text-center text-xs sm:text-sm"
                                    style={{
                                      backgroundColor:
                                        user.service && serviceStyles[user.service]
                                          ? serviceStyles[user.service].bgColor
                                          : defaultServiceStyle.bgColor,
                                      color:
                                        user.service && serviceStyles[user.service]
                                          ? serviceStyles[user.service].textColor
                                          : defaultServiceStyle.textColor,
                                    }}
                                  >
                                    {user.service || 'Sem serviço'}
                                  </Badge>
                                  <div
                                    className="p-2 border rounded-md bg-gray-50 text-xs sm:text-sm text-gray-700"
                                    style={{ maxHeight: '60px', overflowY: 'auto' }}
                                  >
                                    {user.obs || 'Sem observações'}
                                  </div>
                                  {renderTimerBadge(user)}
                                </div>
                              </KanbanCard>
                            ))}
                        </KanbanCards>
                      </KanbanBoard>
                    );
                  })}
          </KanbanProvider>
        </div>
      )}
    </div>
  );
};

export { KanbanExample };