'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/app/_shared/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { Badge } from '@/app/_shared/ui/badge';
import {
  ChevronDown, User as UserIcon, Settings, LogOut, ShieldCheck, Mail,
} from 'lucide-react';
import { ProfileDialog } from './ProfileDialog';

function initials(name?: string | null) {
  return (
    (name ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join('')
      .toUpperCase() || 'U'
  );
}

export function UserMenu() {
  const { data: session } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);

  const name = session?.user?.name ?? 'Usuário';
  const email = session?.user?.email ?? '';
  const role = session?.user?.role ?? '';
  const image = session?.user?.image ?? null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-1 pr-2.5 py-1 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <span className="relative">
              <Avatar className="h-8 w-8">
                {image && <AvatarImage src={image} alt={name} />}
                <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-bold dark:bg-blue-900/40 dark:text-blue-300">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              {/* Indicador de "online" */}
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-800" />
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-semibold text-gray-800 dark:text-zinc-100 max-w-[120px] truncate">
                {name}
              </span>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                Online
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72 p-0 overflow-hidden">
          {/* Cabeçalho do menu */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 px-4 py-3.5 text-white">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11 border-2 border-white/40">
                {image && <AvatarImage src={image} alt={name} />}
                <AvatarFallback className="bg-white/20 text-white text-sm font-bold">
                  {initials(name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{name}</p>
                {email && (
                  <p className="text-[11px] text-blue-100/90 flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3 shrink-0" /> {email}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Badge className="bg-emerald-400/20 text-emerald-50 border-emerald-300/30 hover:bg-emerald-400/20 gap-1 text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Conectado
              </Badge>
              {role && (
                <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/15 gap-1 text-[10px]">
                  <ShieldCheck className="h-3 w-3" /> {role}
                </Badge>
              )}
            </div>
          </div>

          <div className="p-1">
            <DropdownMenuItem
              onClick={() => setProfileOpen(true)}
              className="cursor-pointer py-2"
            >
              <UserIcon className="h-4 w-4 text-gray-500" />
              <span className="font-medium">Meu perfil</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setProfileOpen(true)}
              className="cursor-pointer py-2"
            >
              <Settings className="h-4 w-4 text-gray-500" />
              <span className="font-medium">Editar meus dados</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="cursor-pointer py-2 text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/40"
            >
              <LogOut className="h-4 w-4" />
              <span className="font-medium">Sair da conta</span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
