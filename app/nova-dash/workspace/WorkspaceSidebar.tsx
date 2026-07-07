/* eslint-disable no-unused-vars */
'use client';

import { UserCircle, MessagesSquare, BarChart3, LayoutDashboard  } from 'lucide-react';

export type WorkspaceSection = 'meu-espaco' | 'chat' | 'gestao' | 'dashboard';

interface Props {
  active: WorkspaceSection;
  onChange: (section: WorkspaceSection) => void;
  isManager: boolean;
  chatUnread: number;
}

interface Item {
  key: WorkspaceSection;
  label: string;
  desc: string;
  icon: React.ElementType;
  badge?: number;
}

export function WorkspaceSidebar({ active, onChange, isManager, chatUnread }: Props) {
  const items: Item[] = [
    { key: 'meu-espaco', label: 'Meu Espaço', desc: 'Sua produtividade', icon: UserCircle },
    { key: 'chat', label: 'Chat da equipe', desc: 'Conversas e canais', icon: MessagesSquare, badge: chatUnread },
    { key: 'dashboard', label: 'Dashboard', desc: 'Leads', icon: LayoutDashboard },
    ...(isManager
      ? [{ key: 'gestao' as const, label: 'Visão do Gestor', desc: 'Métricas da equipe', icon: BarChart3 }]
      : []),
  ];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-zinc-800">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Espaço de Trabalho</p>
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {items.map(({ key, label, desc, icon: Icon, badge }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
                  isActive ? 'bg-white/20' : 'bg-gray-100 text-gray-500 group-hover:bg-white dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight">{label}</span>
                <span className={`block truncate text-[11px] leading-tight ${isActive ? 'text-white/70' : 'text-gray-400'}`}>{desc}</span>
              </span>
              {badge ? (
                <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-bold ${isActive ? 'bg-white text-blue-700' : 'bg-red-600 text-white'}`}>
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
