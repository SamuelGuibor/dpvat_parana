/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { LayoutDashboard, Trello, Users, Sun, Moon, Clock, Archive, UserCircle } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_shared/ui/tabs';
import { Button } from '@/app/_shared/ui/button';
import { Badge } from '@/app/_shared/ui/badge';

import { KanbanBoard } from '@/app/nova-dash/KanbanBoard';
import { ArchivedCards } from '@/app/nova-dash/ArchivedCards';
import { StrategicDashboard } from '@/app/nova-dash/StrategicDashboard';
import { Workspace } from '@/app/nova-dash/workspace/Workspace';
import Team from '@/app/nova-dash/_components/team_dash';
import { WorkSessionPanel } from '@/app/nova-dash/_components/WorkSession';

import Link from 'next/link';
import { NotificationDropdown } from './box';
import { UserMenu } from './UserMenu';
import { TeamPresence } from './TeamPresence';
import { DarkModeToggle, useDarkMode } from '@/app/nova-dash/_components/DarkModeToggle';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useUnread } from '@/app/_shared/hooks/use-chat';
import { useWhatsAppUnread } from '@/app/_shared/hooks/use-whatsapp';
export const dynamic = "force-dynamic";

type Theme = 'light' | 'dark';

export default function Page() {
  const [activeTab, setActiveTab] = useState('kanban');
  const [open, setOpen] = useState(false);
  const { isDark: darkReaderOn } = useDarkMode();
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { unread } = useUnread();
  const chatUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  // Badge único da aba: soma não-lidas do chat interno + do WhatsApp.
  const whatsappUnread = useWhatsAppUnread();
  const workspaceUnread = chatUnread + whatsappUnread;

  // Carrega tema persistido no primeiro mount
  useEffect(() => {
    const stored = (typeof window !== 'undefined'
      ? localStorage.getItem('nova-dash-theme')
      : null) as Theme | null;
    const prefersDark = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const initial: Theme = stored ?? 'light';
    setTheme(initial);
    setMounted(true);
  }, []);

  // Aplica/remove a classe `dark` no <html> e persiste
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('nova-dash-theme', theme);
  }, [theme, mounted]);

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

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }

  const isDark = theme === 'dark';

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
  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-50 text-gray-900'}`}>
        <p className="text-sm opacity-70">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const isWorkspace = activeTab === 'meu-espaco';
  const kanban = activeTab === 'kanban';

  const ALLOWED_ARCHIVE_USERS = [
    "cmazo6j870000ia0gw5ppb486",
    "cmqp5w7hd000dl404atfj5mrd",
    "cmazuwrcj0000iav499hqf5ij",
  ];

  const canViewArchived = ALLOWED_ARCHIVE_USERS.includes(session?.user?.id ?? "");

  return (
    <div className={`flex h-screen flex-col overflow-hidden ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-50 text-gray-900'}`}>
      <header className={`shrink-0 z-50 border-b ${
        isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'
      }`}>
        <div className="px-6">
          <div className="flex items-center justify-between">
            <Link href='/' className="flex items-center">
              <Image
                src={darkReaderOn ? '/logo_text_white.png' : '/paranaseguros.png'}
                width={200}
                height={200}
                alt="Logo"
              />
            </Link>
            <div className="flex items-center gap-3">
              <DarkModeToggle />

              <TeamPresence isDark={isDark} onOpenTeam={() => setOpen(true)} />

              <Team open={open} onClose={() => setOpen(false)} />

              <div className="flex items-center gap-2 pl-1 ml-1 border-l border-gray-200 dark:border-zinc-700">
                <NotificationDropdown />
                <UserMenu />
              </div>

            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
          <TabsList
              className={`grid w-full max-w-3xl ${
                canViewArchived ? "grid-cols-3" : "grid-cols-2"
              } ${isDark ? "bg-zinc-800 text-zinc-300" : ""}`}
            >
            {/* <TabsTrigger
              value="dashboard"
              className={isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard Estratégico
            </TabsTrigger> */}
            <TabsTrigger
              value="kanban"
              className={isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}
            >
              <Trello className="w-4 h-4 mr-2" />
              Kanban Workflow
            </TabsTrigger>
            {canViewArchived && (
              <TabsTrigger
                value="arquivados"
                className={isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}
              >
                <Archive className="w-4 h-4 mr-2" />
                Arquivados
              </TabsTrigger>
            )}
            <TabsTrigger
              value="meu-espaco"
              className={`relative ${isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}`}
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
              className={isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}
            >
              <Clock className="w-4 h-4 mr-2" />
              Controle de Ponto
            </TabsTrigger> */}
          </TabsList>
        </Tabs>
      </header>

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
