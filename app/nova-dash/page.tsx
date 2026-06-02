/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { LayoutDashboard, Trello, Users } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { Button } from '@/app/_components/ui/button';
import { Badge } from '@/app/_components/ui/badge';

import { KanbanBoard } from '@/app/nova-dash/KanbanBoard';
import { StrategicDashboard } from '@/app/nova-dash/StrategicDashboard';
import Team from '../_components/team_dash';

import Link from 'next/link';
import { NotificationDropdown } from './box';
import { useSession } from 'next-auth/react';
export const dynamic = "force-dynamic";

export default function Page() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();

  if (session?.user?.role !== 'ADMIN') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="px-6">
          <div className="flex items-center justify-between">
            <Link href='/'>
              <Image src="/paranaseguros.png" width={200} height={200} alt="Logo" />
            </Link>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                🟢 Sistema Online
              </Badge>

              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Users className="w-4 h-4 mr-2" />
                Equipe
              </Button>

              <Team open={open} onClose={() => setOpen(false)} />
              <NotificationDropdown />
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard Estratégico
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <Trello className="w-4 h-4 mr-2" />
              Kanban Workflow
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <main>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="dashboard">
            <StrategicDashboard />
          </TabsContent>
          <TabsContent value="kanban">
            <KanbanBoard />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="bg-white border-t mt-12">
        <div className="px-6 py-4 text-sm text-gray-500">
          © 2025 Sistema de Gestão Seguros Paraná.
        </div>
      </footer>
    </div>
  );
}
