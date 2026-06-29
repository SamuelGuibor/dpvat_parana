/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { LayoutDashboard, Trello, Users, Sun, Moon, Clock } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { Button } from '@/app/_components/ui/button';
import { Badge } from '@/app/_components/ui/badge';

import { KanbanBoard } from '@/app/nova-dash/KanbanBoard';
import { StrategicDashboard } from '@/app/nova-dash/StrategicDashboard';
import Team from '../_components/team_dash';
import { WorkSessionPanel } from '../_components/WorkSession';

import Link from 'next/link';
import { NotificationDropdown } from './box';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
export const dynamic = "force-dynamic";

type Theme = 'light' | 'dark';

export default function Page() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

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
    window.addEventListener('open-kanban-card', handleOpenCard);
    return () => window.removeEventListener('open-kanban-card', handleOpenCard);
  }, []);

  // Só redireciona quando o next-auth confirma que NÃO há sessão. Durante o
  // estado "loading" (carga inicial e revalidações ao focar a janela) o
  // `session` fica temporariamente indefinido — tratar isso como deslogado é o
  // que causava o "pisca" de login (tela some e volta).
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
          <p className="text-sm opacity-70">Carregando sessão...</p>
        </div>
      </div>
    );
  }

  // Sessão resolvida: bloqueia apenas quem está logado mas não é ADMIN.
  // (Quem não tem sessão já foi redirecionado pelo efeito acima.)
  if (status === 'unauthenticated') return null;
  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-50 text-gray-900'}`}>
        <p className="text-sm opacity-70">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-50 text-gray-900'}`}>
      <header className={`sticky top-0 z-50 border-b ${
        isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'
      }`}>
        <div className="px-6">
          <div className="flex items-center justify-between">
            <Link href='/' className="flex items-center">
              <Image
                src="/paranaseguros.png"
                width={200}
                height={200}
                alt="Logo"
                className={isDark ? 'invert brightness-90 contrast-125' : ''}
              />
            </Link>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={isDark
                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-800"
                  : "bg-green-50 text-green-700 border-green-200"}
              >
                🟢 Sistema Online
              </Badge>

              {/* Toggle de tema */}
              {/* <button
                onClick={toggleTheme}
                aria-label={isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
                title={isDark ? 'Modo claro' : 'Modo escuro'}
                className={`relative h-9 w-16 rounded-full border transition-colors ${
                  isDark ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-100 border-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 flex h-7 w-7 items-center justify-center rounded-full shadow transition-all duration-300 ${
                    isDark
                      ? 'left-8 bg-indigo-500 text-white'
                      : 'left-1 bg-white text-amber-500'
                  }`}
                >
                  {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </span>
              </button> */}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                className={isDark
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-white'
                  : ''}
              >
                <Users className="w-4 h-4 mr-2" />
                Equipe
              </Button>

              <Team open={open} onClose={() => setOpen(false)} />
              <NotificationDropdown />
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
          <TabsList className={`grid w-full max-w-xl grid-cols-3 ${
            isDark ? 'bg-zinc-800 text-zinc-300' : ''
          }`}>
            <TabsTrigger
              value="dashboard"
              className={isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}
            >
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard Estratégico
            </TabsTrigger>
            <TabsTrigger
              value="kanban"
              className={isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}
            >
              <Trello className="w-4 h-4 mr-2" />
              Kanban Workflow
            </TabsTrigger>
            <TabsTrigger
              value="ponto"
              className={isDark ? 'data-[state=active]:bg-zinc-700 data-[state=active]:text-white' : ''}
            >
              <Clock className="w-4 h-4 mr-2" />
              Controle de Ponto
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <main className={isDark ? 'bg-zinc-950' : ''}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="dashboard">
            <StrategicDashboard />
          </TabsContent>
          <TabsContent value="kanban">
            <KanbanBoard />
          </TabsContent>
          <TabsContent value="ponto">
            <WorkSessionPanel isDark={isDark} role={session?.user?.role} userId={session?.user?.id} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className={`border-t mt-12 transition-colors ${
        isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-white border-gray-200 text-gray-500'
      }`}>
        <div className="px-6 py-4 text-sm">
          © 2025 Sistema de Gestão Seguros Paraná.
        </div>
      </footer>
    </div>
  );
}
