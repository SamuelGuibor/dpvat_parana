/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  TrendingUp, TrendingDown, Users, CheckCircle, XCircle,
  Clock, AlertTriangle, Target, Activity, Mail, MessageSquare,
  Zap, Bell,
  Loader2
} from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { TbXboxX } from "react-icons/tb";
import { CiPause1 } from "react-icons/ci";
import { FaPersonCircleQuestion } from "react-icons/fa6";
import { FaPersonCircleExclamation } from "react-icons/fa6";
import { FaPersonCircleXmark } from "react-icons/fa6";
import { FaPersonCircleCheck } from "react-icons/fa6";
import { LuAlignHorizontalJustifyStart } from "react-icons/lu";
import { count } from 'console';
import { FaSquare } from "react-icons/fa";
import { MiniKanban } from './minikanban';

type Counts = {
  contratado?: number;
  iniciado?: number;
  em_honorario?: number;
  em_conversa?: number;
  aguardando?: number;
  nao_contratado?: number;
  nao_qualificado?: number;
};

export const StrategicDashboard: React.FC = () => {
  const [counts, setCounts] = useState<Counts>({});
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  useEffect(() => {
    async function loadMonthly() {
      const res = await fetch('/api/botconversa/monthly');
      const data = await res.json();
      setMonthlyData(data);
      setLoading(false);
    }

    loadMonthly();
  }, []);

  useEffect(() => {
    async function loadCounts() {
      try {
        const res = await fetch('/api/botconversa/counts');
        const data = await res.json();
        setCounts(data);
      } finally {
        setLoading(false);
      }
    }

    loadCounts();
  }, []);

  // Dados mockados para os gráficos

  const performanceData = [
    { name: 'João Silva', processos: 89, taxa: 94, tempo: 3.2 },
    { name: 'Maria Santos', processos: 76, taxa: 97, tempo: 2.8 },
    { name: 'Pedro Oliveira', processos: 82, taxa: 91, tempo: 3.5 },
    { name: 'Ana Costa', processos: 71, taxa: 95, tempo: 3.0 },
    { name: 'Carlos Lima', processos: 64, taxa: 88, tempo: 4.1 },
    { name: 'Julia Ferreira', processos: 78, taxa: 93, tempo: 3.3 },
  ];

  const soma_indeferidos = (counts.nao_contratado ?? 0) + (counts.nao_qualificado ?? 0);
  const soma_analise = (counts.em_conversa ?? 0) + (counts.em_honorario ?? 0);
  const soma_aguardando = (counts.aguardando ?? 0) + (counts.iniciado ?? 0)

  const statusDistribution = [
    { name: 'Aprovados', value: counts.contratado ?? 0, color: '#10b981' },
    { name: 'Indeferidos', value: soma_indeferidos, color: '#ef4444' },
    { name: 'Em Análise', value: soma_analise, color: '#3b82f6' },
    { name: 'Aguardando', value: soma_aguardando, color: '#f59e0b' },
  ];

  const renderLabel = ({
    name,
    percent,
    value,
  }: {
    name: string;
    percent: number;
    value: number;
  }) => {
    if (value === 0) return null;

    return `${name}: ${(percent * 100).toFixed(0)}%`;
  };


  const leadsData = [
    { week: 'Sem 1', leads: 34, conversao: 12 },
    { week: 'Sem 2', leads: 42, conversao: 18 },
    { week: 'Sem 3', leads: 38, conversao: 15 },
    { week: 'Sem 4', leads: 51, conversao: 22 },
  ];

  const alerts = [
    { id: 1, type: 'urgent', title: 'Processo #1234 está parado há 5 dias', priority: 'high' },
    { id: 2, type: 'warning', title: '12 processos próximos do prazo', priority: 'medium' },
    { id: 3, type: 'info', title: 'Meta mensal atingida em 85%', priority: 'low' },
    { id: 4, type: 'urgent', title: 'Cliente VIP aguardando resposta', priority: 'high' },
  ];

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'warning': return <Clock className="w-5 h-5 text-yellow-600" />;
      default: return <Bell className="w-5 h-5 text-blue-600" />;
    }
  };

  const totalProcessos = statusDistribution.reduce((acc, item) => acc + item.value, 0);
  const taxaAprovacao = ((statusDistribution[0].value / totalProcessos) * 100).toFixed(1);
  const taxaRejeicao = ((statusDistribution[1].value / totalProcessos) * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl">Gestão Estratégica</h2>
          <p className="text-gray-500">Visão completa de processos, performance e integrações</p>
        </div>
      </div>

      {/* KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-md">Iniciados</CardTitle>
            <LuAlignHorizontalJustifyStart className=" text-black" size={32} />
          </CardHeader>
          <CardContent className="h-[60px] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <div className="text-3xl font-bold">{counts.iniciado ?? 0}</div>
            )}
          </CardContent>
        </Card>


        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-md">Em conversa - Explicação</CardTitle>
            <FaPersonCircleQuestion className="text-blue-600" size={30} />
          </CardHeader>
          <CardContent className="h-[60px] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <div className="text-3xl font-bold text-blue-600">
                {counts.em_conversa ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-md">Em Negociação - Honorários</CardTitle>
            <FaPersonCircleQuestion className="text-blue-600" size={30} />
          </CardHeader>
          <CardContent className="h-[60px] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <div className="text-3xl font-bold text-blue-600">
                {counts.em_honorario ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-md">Não Responde</CardTitle>
            <TbXboxX className=" text-orange-600" size={32} />
          </CardHeader>
          <CardContent className="h-[60px] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <div className="text-3xl font-bold text-orange-600">
                {counts.aguardando ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-md">Não Contratado</CardTitle>
            <FaPersonCircleXmark className="text-red-600" size={32} />
          </CardHeader>
          <CardContent className="h-[60px] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <div className="text-3xl font-bold text-red-600">
                {counts.nao_contratado ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-md">Não Qualificado</CardTitle>
            <FaPersonCircleExclamation className="text-[#8a0303]" size={32} />
          </CardHeader>
          <CardContent className="h-[60px] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <div className="text-3xl font-bold text-[#8a0303]">
                {counts.nao_qualificado ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-md">Contratado</CardTitle>
            <FaPersonCircleCheck className="text-green-600" size={32} />
          </CardHeader>
          <CardContent className="h-[60px] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            ) : (
              <div className="text-3xl font-bold text-green-600">
                {counts.contratado ?? 0}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <Tabs defaultValue="analytics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          {/* <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger> */}
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gráfico de Processos por Mês */}
            <Card>
              <CardHeader>
                <CardTitle>Processos por Mês</CardTitle>
                <CardDescription>Comparativo de aprovados, indeferidos e em andamento</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="aprovados" fill="#10b981" name="Aprovados" />
                    <Bar dataKey="indeferidos" fill="#ef4444" name="Indeferidos" />
                    <Bar dataKey="emAndamento" fill="#3b82f6" name="Em Andamento" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráfico de Pizza - Distribuição */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição de Status</CardTitle>
                <CardDescription>Visão geral do pipeline atual</CardDescription>
              </CardHeader>
              <div className="absolute space-y-1 text-sm right-10 pt-2">
                  <div className="flex items-center gap-2">
                    <FaSquare className="w-3 h-3 text-[#f59e0b]" />
                    <span>Iniciado | Não Responde</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <FaSquare className="w-3 h-3 text-[#3b82f6]" />
                    <span>Em honorário | Em conversa</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <FaSquare className="w-3 h-3 text-[#ef4444]" />
                    <span>Não Qualificado | Não contratado</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <FaSquare className="w-3 h-3 text-[#10b981]" />
                    <span>Contratado</span>
                  </div>
                </div>

              <CardContent>
                
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderLabel}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <MiniKanban />
        </TabsContent>

        {/* <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance por Pessoa</CardTitle>
              <CardDescription>Análise individual de produtividade e qualidade</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={performanceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="processos" fill="#3b82f6" name="Processos" />
                  <Bar dataKey="taxa" fill="#10b981" name="Taxa de Aprovação %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {performanceData.slice(0, 3).map((person, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{person.name}</CardTitle>
                      <CardDescription>Analista</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Processos</span>
                    <span className="font-semibold">{person.processos}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Taxa Aprovação</span>
                    <Badge variant="outline" className="bg-green-50 text-green-700">
                      {person.taxa}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Tempo Médio</span>
                    <span className="font-semibold">{person.tempo} dias</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Leads por Semana</CardTitle>
                <CardDescription>Aquisição e conversão</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={leadsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Leads" />
                    <Area type="monotone" dataKey="conversao" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Conversões" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Funil de Conversão</CardTitle>
                <CardDescription>Taxa de conversão de leads</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Leads Totais</span>
                    <span className="font-semibold">165</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Qualificados</span>
                    <span className="font-semibold">89 (54%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: '54%' }} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Convertidos</span>
                    <span className="font-semibold">67 (41%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-600 h-2 rounded-full" style={{ width: '41%' }} />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Taxa de Conversão</span>
                    <Badge className="bg-green-600">40.6%</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent> */}

        <TabsContent value="integrations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Email Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Email / Gmail</CardTitle>
                    <CardDescription>Automações de email</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  📧 Enviar Email Rápido
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  📊 Ver Estatísticas
                </Button>
                {/* <div className="pt-2 text-sm text-gray-500">
                  <p>153 emails enviados hoje</p>
                  <p className="text-green-600">Taxa de abertura: 68%</p>
                </div> */}
              </CardContent>
            </Card>

            {/* WhatsApp Integration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">WhatsApp</CardTitle>
                    <CardDescription>Mensagens instantâneas</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start bg-green-50" size="sm">
                  💬 Enviar Mensagem
                </Button>
                {/* <Button variant="outline" className="w-full justify-start" size="sm">
                  🤖 Configurar Bot
                </Button> */}
                {/* <div className="pt-2 text-sm text-gray-500">
                  <p>89 mensagens enviadas hoje</p>
                  <p className="text-green-600">Taxa de resposta: 92%</p>
                </div> */}
              </CardContent>
            </Card>

            {/* Zapier Integration */}
            {/* <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Zapier</CardTitle>
                    <CardDescription>Automações avançadas</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  ⚡ Criar Zap
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  🔗 Ver Webhooks
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  📋 Zaps Ativos
                </Button>
                <div className="pt-2 text-sm text-gray-500">
                  <p>12 automações ativas</p>
                  <p className="text-green-600">342 execuções hoje</p>
                </div>
              </CardContent>
            </Card> */}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
