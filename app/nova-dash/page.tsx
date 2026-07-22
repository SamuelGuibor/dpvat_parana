/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { LayoutDashboard, Trello, Users, Sun, Moon, Clock, Archive, UserCircle, Ticket, HelpCircle } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_shared/ui/tabs';
import { Button } from '@/app/_shared/ui/button';
import { Badge } from '@/app/_shared/ui/badge';

import { KanbanBoard } from '@/app/nova-dash/KanbanBoard';
import { ArchivedCards } from '@/app/nova-dash/ArchivedCards';
import { StrategicDashboard } from '@/app/nova-dash/StrategicDashboard';
import { Workspace } from '@/app/nova-dash/workspace/Workspace';
import Team from '@/app/nova-dash/_components/team_dash';
import { WorkSessionPanel } from '@/app/nova-dash/_components/WorkSession';
import { TicketsBoard } from '@/app/nova-dash/tickets/TicketsBoard';

import Link from 'next/link';
import { NotificationDropdown } from './box';
import { UserMenu } from './UserMenu';
import { TeamPresence } from './TeamPresence';
import { DarkModeToggle, useDarkMode } from '@/app/nova-dash/_components/DarkModeToggle';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useUnread } from '@/app/_shared/hooks/use-chat';
import { useWhatsAppUnread } from '@/app/_shared/hooks/use-whatsapp';
import { PermissionsProvider, usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';
import { GlobalSearch } from '@/app/nova-dash/_components/GlobalSearch';
import { isTeamRole } from '@/app/_shared/lib/permissions';
import { DashboardTour, START_DASH_TOUR_EVENT } from '@/app/nova-dash/_components/DashboardTour';
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <PermissionsProvider>
      <PageInner />
    </PermissionsProvider>
  );
}

function PageInner() {
  const [activeTab, setActiveTab] = useState('kanban');
  const [open, setOpen] = useState(false);
  const { isDark: darkReaderOn } = useDarkMode();
  const { perms } = usePermissions();
  const { data: session, status } = useSession();
  const router = useRouter();
  const { unread } = useUnread();
  const chatUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  // Badge único da aba: soma não-lidas do chat interno + do WhatsApp.
  const whatsappUnread = useWhatsAppUnread();
  const workspaceUnread = chatUnread + whatsappUnread;

  // O dark mode oficial é o Dark Reader (DarkModeToggle). Este era um toggle
  // legado que aplicava `.dark` no <html> por cima — se um usuário tivesse
  // 'nova-dash-theme'='dark' salvo de versão antiga, as classes dark: do
  // Tailwind ativavam E o Dark Reader invertia por cima (cores duplamente
  // invertidas). Removemos o sistema legado e limpamos a chave antiga.
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try { localStorage.removeItem('nova-dash-theme'); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    function handleOpenCard() {
      setActiveTab('kanban');
    }
    // Notificação de WhatsApp clicada → vai pra aba do Espaço de Trabalho
    // (o Workspace troca pra seção WhatsApp e o inbox abre a conversa).
    function handleOpenWhatsApp() {
      setActiveTab('meu-espaco');
    }
    window.addEventListener('open-kanban-card', handleOpenCard);
    window.addEventListener('open-whatsapp-conversation', handleOpenWhatsApp);
    return () => {
      window.removeEventListener('open-kanban-card', handleOpenCard);
      window.removeEventListener('open-whatsapp-conversation', handleOpenWhatsApp);
    };
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  const isDark = false;

  // Enquanto a sessão é resolvida, mantém a tela estável (sem flash de "deslogado").
  if (status === 'loading') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-50 text-gray-900'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
          <p className="text-sm opacity-70">Carregando sessão</p>
        </div>
      </div>
    );
  }


  if (status === 'unauthenticated') return null;
  if (!isTeamRole(session?.user?.role)) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-50 text-gray-900'}`}>
        <p className="text-sm opacity-70">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const isWorkspace = activeTab === 'meu-espaco';
  const kanban = activeTab === 'kanban';

  // Permissões vêm do servidor (cargo + overrides do ADMIN++) via
  // PermissionsProvider — nada mais de listas de IDs hardcoded aqui.
  const canViewArchived = perms.view_archived;
  const canViewTickets = perms.view_tickets;

  // Kanban + Espaço de Trabalho são fixos; Arquivados e Tickets Dev entram
  // conforme a permissão. Classes literais para o Tailwind não perder o JIT.
  // Mobile: as abas viram uma linha com scroll lateral; o grid só vale no md+.
  const visibleTabs = 2 + (canViewArchived ? 1 : 0) + (canViewTickets ? 1 : 0);
  const tabsGridCols =
    visibleTabs === 4 ? "md:grid-cols-4" : visibleTabs === 3 ? "md:grid-cols-3" : "md:grid-cols-2";

  return (
    <div className={`flex h-screen flex-col overflow-hidden ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-50 text-gray-900'}`}>
      <header className={`shrink-0 z-50 border-b ${
        isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'
      }`}>
        <div className="px-3 md:px-6">
          <div className="flex items-center justify-between gap-2">
            <Link href='/' className="flex shrink-0 items-center">
              <Image
                src={darkReaderOn ? '/logo_text_white.png' : '/paranaseguros.png'}
                width={200}
                height={200}
                alt="Logo"
                className="h-auto w-[140px] md:w-[200px]"
              />
            </Link>
            <div className="flex items-center gap-1.5 md:gap-3">
              {/* Rever o tutorial de onboarding a qualquer momento. */}
              <Button
                variant="ghost"
                size="icon"
                title="Rever tutorial"
                aria-label="Rever tutorial"
                onClick={() => window.dispatchEvent(new Event(START_DASH_TOUR_EVENT))}
              >
                <HelpCircle className="h-5 w-5 text-gray-500" />
              </Button>
              <span data-tour="dark-mode" className="inline-flex">
                <DarkModeToggle />
              </span>

              {/* Presença da equipe é larga demais para o celular. */}
              <div className="hidden md:block">
                <TeamPresence isDark={isDark} onOpenTeam={() => setOpen(true)} />
              </div>

              <Team open={open} onClose={() => setOpen(false)} />

              <div className="flex items-center gap-2 pl-1 ml-1 border-l border-gray-200 dark:border-zinc-700">
                <span data-tour="notifications" className="inline-flex">
                  <NotificationDropdown />
                </span>
                <span data-tour="user-menu" className="inline-flex">
                  <UserMenu />
                </span>
              </div>

            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-3 md:px-6">
          <TabsList
              data-tour="tabs"
              className={`flex w-full gap-1 overflow-x-auto md:grid md:max-w-4xl md:overflow-visible ${tabsGridCols} ${
                isDark ? "bg-zinc-800 text-zinc-300" : ""
              }`}
            >
            {/* <TabsTrigger
              value="dashboard"
              className={`shrink-0 whitespace-nowrap ${isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}`}
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard Estratégico
            </TabsTrigger> */}
            <TabsTrigger
              value="kanban"
              data-tour="tab-kanban"
              className={`shrink-0 whitespace-nowrap ${isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}`}
            >
              <Trello className="w-4 h-4 mr-2" />
              Kanban Workflow
            </TabsTrigger>
            {canViewArchived && (
              <TabsTrigger
                value="arquivados"
                className={`shrink-0 whitespace-nowrap ${isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}`}
              >
                <Archive className="w-4 h-4 mr-2" />
                Arquivados
              </TabsTrigger>
            )}
            {canViewTickets && (
              <TabsTrigger
                value="tickets-dev"
                className={`shrink-0 whitespace-nowrap ${isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}`}
              >
                <Ticket className="w-4 h-4 mr-2" />
                Tickets Dev
              </TabsTrigger>
            )}
            <TabsTrigger
              value="meu-espaco"
              data-tour="tab-workspace"
              className={`relative shrink-0 whitespace-nowrap ${isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}`}
            >
              <UserCircle className="w-4 h-4 mr-2" />
              Espaço de Trabalho
              {workspaceUnread > 0 && (
                <span className="ml-2 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                  {workspaceUnread > 99 ? '99+' : workspaceUnread}
                </span>
              )}
            </TabsTrigger>
            {/* <TabsTrigger
              value="ponto"
              className={`shrink-0 whitespace-nowrap ${isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}`}
            >
              <Clock className="w-4 h-4 mr-2" />
              Controle de Ponto
            </TabsTrigger> */}
          </TabsList>
        </Tabs>
      </header>

      {/* Tour de onboarding: abre sozinho na 1ª visita e retoma do passo salvo. */}
      <DashboardTour onNavigate={setActiveTab} />

      {/* Busca global (Ctrl+K): cards por nome/nº/CPF/telefone + navegação. */}
      <GlobalSearch
        onNavigate={setActiveTab}
        canViewArchived={canViewArchived}
        canViewTickets={canViewTickets}
      />

      <main className={`flex min-h-0 flex-1 flex-col ${isWorkspace ? 'overflow-hidden' : 'overflow-y-auto'} ${isDark ? 'bg-zinc-950' : ''}`}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-h-0 flex-1">
          {/* <TabsContent value="dashboard">
            <StrategicDashboard />
          </TabsContent> */}
          <TabsContent value="kanban">
            <KanbanBoard />
          </TabsContent>
          <TabsContent value="arquivados">
            <ArchivedCards />
          </TabsContent>
          <TabsContent value="meu-espaco" className="min-h-0">
            <Workspace />
          </TabsContent>
          <TabsContent value="tickets-dev">
            <TicketsBoard />
          </TabsContent>
          <TabsContent value="ponto">
            <WorkSessionPanel isDark={isDark} role={session?.user?.role} userId={session?.user?.id} />
          </TabsContent>
        </Tabs>
      </main>

      {!isWorkspace && !kanban && (
        <footer className={`shrink-0 border-t transition-colors ${
          isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-white border-gray-200 text-gray-500'
        }`}>
          <div className="px-6 py-4 text-sm">
            © 2025 Sistema de Gestão Seguros Paraná.
          </div>
        </footer>
      )}
    </div>
  );
}
