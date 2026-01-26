import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { KanbanBoard } from './components/KanbanBoard';
import { StrategicDashboard } from './components/StrategicDashboard';
import { LayoutDashboard, Trello, Settings } from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Sistema de Gestão Completo</h1>
                <p className="text-sm text-gray-500">Kanban & Analytics Avançado</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                🟢 Sistema Online
              </Badge>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard Estratégico
            </TabsTrigger>
            <TabsTrigger value="kanban" className="flex items-center gap-2">
              <Trello className="w-4 h-4" />
              Kanban Workflow
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {/* Content */}
      <main>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="dashboard" className="m-0">
            <StrategicDashboard />
          </TabsContent>

          <TabsContent value="kanban" className="m-0">
            <KanbanBoard />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <p>© 2024 Sistema de Gestão. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
