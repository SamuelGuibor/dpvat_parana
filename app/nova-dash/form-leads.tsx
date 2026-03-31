/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect, useTransition } from 'react';
import { getContacts } from "@/app/_actions/getContact";
import { DeleteContact } from "@/app/_actions/deletContact";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/_components/ui/card';
import { Badge } from '@/app/_components/ui/badge';
import { Trash2, Phone, User, FileText, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface Lead {
  id: string;
  nome: string;
  telefone: string;
  descricao: string;
  createdAt: string;
}

export const LeadsTable: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPending, startTransition] = useTransition();

  // 🔥 Buscar contatos
  const loadLeads = () => {
    startTransition(async () => {
      const data = await getContacts();

      const formatted: Lead[] = data.map((c: any) => ({
        id: c.id,
        nome: c.name,
        telefone: c.number,
        descricao: c.desc || '',
        createdAt: c.createdAt,
      }));

      setLeads(formatted);
    });
  };

  useEffect(() => {
    loadLeads();

    const interval = setInterval(() => {
      loadLeads();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // 🔥 Filtro (sem status agora)
  const filteredLeads = leads.filter(lead => {
    return (
      lead.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.telefone.includes(searchTerm) ||
      lead.descricao.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // 🗑️ deletar
  const deleteLead = async (id: string) => {
    await DeleteContact(id);
    toast.success('Lead excluído com sucesso');
    loadLeads();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';

    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-blue-600">{leads.length}</p>
              </div>
              <UserPlus className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <User className="w-6 h-6 text-blue-600" />
                Leads da Landing Page
              </CardTitle>
              <CardDescription>
                Gerencie os leads recebidos do formulário do site
              </CardDescription>
            </div>

            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 w-fit">
              {filteredLeads.length} Lead{filteredLeads.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {/* Busca */}
          <div className="flex gap-4 pt-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone ou descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-4 px-4">Cliente</th>
                  <th className="text-left py-4 px-4">Telefone</th>
                  <th className="text-left py-4 px-4">Descrição</th>
                  <th className="text-left py-4 px-4">Data</th>
                  <th className="text-center py-4 px-4">Ações</th>
                </tr>
              </thead>

              <tbody>
                <AnimatePresence>
                  {filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto" />
                        <p className="text-gray-500">Nenhum lead encontrado</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead, index) => (
                      <motion.tr
                        key={lead.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: index * 0.03 }}
                        className="border-b hover:bg-blue-50 group"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">
                              {lead.nome.charAt(0)}
                            </div>
                            <p className="font-bold">{lead.nome}</p>
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {lead.telefone}
                          </div>
                        </td>

                        <td className="py-4 px-4 max-w-md">
                          {lead.descricao}
                        </td>

                        <td className="py-4 px-4">
                          {formatDate(lead.createdAt)}
                        </td>

                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => deleteLead(lead.id)}
                            className="p-2 bg-red-50 text-red-600 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};