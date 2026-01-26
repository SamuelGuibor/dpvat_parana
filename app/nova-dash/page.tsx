'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { LayoutDashboard, Trello, Users } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/nova-dash/nova_dash/Complete Workflow Dashboard/src/app/components/ui/tabs';
import { Button } from '@/app/nova-dash/nova_dash/Complete Workflow Dashboard/src/app/components/ui/button';
import { Badge } from '@/app/nova-dash/nova_dash/Complete Workflow Dashboard/src/app/components/ui/badge';

import { KanbanBoard } from '@/app/nova-dash/nova_dash/Complete Workflow Dashboard/src/app/components/KanbanBoard';
import { StrategicDashboard } from '@/app/nova-dash/nova_dash/Complete Workflow Dashboard/src/app/components/StrategicDashboard';
import Team from '../_components/team_dash';

import { NotificationDropdown } from '@/app/nova-dash/nova_dash/Complete Workflow Dashboard/src/app/components/box';
import { DbNotification } from '@/app/_types/notifications';

export default function Page() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);

  useEffect(() => {
  async function load() {
    const res = await fetch('/api/notification', {
      cache: 'no-store',
    });
    const data = await res.json();
    setNotifications(data);
  }

  load();
  const interval = setInterval(load, 10000);
  return () => clearInterval(interval);
}, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="px-6">
          <div className="flex items-center justify-between">
            <Image src="/paranaseguros.png" width={200} height={200} alt="Logo" />

            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                🟢 Sistema Online
              </Badge>

              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Users className="w-4 h-4 mr-2" />
                Equipe
              </Button>

              <Team open={open} onClose={() => setOpen(false)} />
              <NotificationDropdown notifications={notifications} />
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
          © 2025 Sistema de Gestão.
        </div>
      </footer>
    </div>
  );
}
