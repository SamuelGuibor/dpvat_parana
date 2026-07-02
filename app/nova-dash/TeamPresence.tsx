'use client';

import { Button } from '@/app/_components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_components/ui/avatar';
import { Users } from 'lucide-react';
import { usePresence, type PresenceMember } from '@/app/_hooks/use-presence';

interface Props {
  isDark: boolean;
  onOpenTeam: () => void;
}

// Quantos avatares aparecem empilhados no atalho (o resto vira "+N").
const STACK_LIMIT = 5;

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p.charAt(0))
      .join('')
      .toUpperCase() || 'U'
  );
}

// Usa a foto do usuário quando existe; senão, gera um avatar "aleatório" e
// estável (sempre o mesmo para o mesmo id) via DiceBear.
function avatarUrl(m: PresenceMember) {
  return m.image || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(m.id)}`;
}

function StatusDot({ online, className = '' }: { online: boolean; className?: string }) {
  return (
    <span
      className={`rounded-full ring-2 ring-white dark:ring-zinc-900 ${
        online ? 'bg-emerald-500' : 'bg-red-500'
      } ${className}`}
    />
  );
}

/** Avatar pequeno com bolinha de status — usado no stack do atalho. */
function StackAvatar({ member }: { member: PresenceMember }) {
  return (
    <div className="relative shrink-0 transition-transform duration-200 hover:-translate-y-0.5 hover:z-20">
      <Avatar className="h-7 w-7 border-2 border-white dark:border-zinc-900 shadow-sm">
        <AvatarImage src={avatarUrl(member)} alt={member.name} />
        <AvatarFallback className="text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {initials(member.name)}
        </AvatarFallback>
      </Avatar>
      <StatusDot online={member.online} className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5" />
    </div>
  );
}

/** Linha da lista dentro do painel. */
function MemberRow({ member }: { member: PresenceMember }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
      <div className="relative shrink-0">
        <Avatar className="h-9 w-9 border border-gray-100 dark:border-zinc-800">
          <AvatarImage src={avatarUrl(member)} alt={member.name} />
          <AvatarFallback className="text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {initials(member.name)}
          </AvatarFallback>
        </Avatar>
        <StatusDot online={member.online} className="absolute -bottom-0.5 -right-0.5 h-3 w-3" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 dark:text-zinc-100 truncate">
          {member.name}
          {member.isMe && <span className="ml-1 text-[11px] font-normal text-blue-500">(você)</span>}
        </p>
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 truncate">{member.role}</p>
      </div>

      <span
        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider shrink-0 ${
          member.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-zinc-500'
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${member.online ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
        {member.online ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}

export function TeamPresence({ isDark, onOpenTeam }: Props) {
  const { members, onlineCount } = usePresence();

  const stack = members.slice(0, STACK_LIMIT); // já vem ordenado: online primeiro
  const extra = Math.max(0, members.length - STACK_LIMIT);

  return (
    <div className="group relative flex items-center gap-2">
      {/* Atalho compacto: pilha de avatares (sempre visível). */}
      {members.length > 0 && (
        <div className="hidden md:flex items-center -space-x-2 pr-0.5">
          {stack.map((m) => (
            <StackAvatar key={m.id} member={m} />
          ))}
          {extra > 0 && (
            <div className="relative z-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white dark:border-zinc-900 bg-gray-100 dark:bg-zinc-800 text-[10px] font-bold text-gray-600 dark:text-zinc-300 shadow-sm">
              +{extra}
            </div>
          )}
        </div>
      )}

      {/* Botão Equipe com contador de online. */}
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenTeam}
        className={isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-white' : ''}
      >
        <Users className="w-4 h-4 mr-2" />
        Equipe
        {onlineCount > 0 && (
          <span className="ml-2 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{onlineCount}</span>
          </span>
        )}
      </Button>

      {/* Painel completo: abre ao passar o mouse. `pt-2` mantém a área de hover
          contínua entre o gatilho e o card (sem "buraco" que fecharia o menu). */}
      <div className="absolute right-0 top-full z-50 pt-2 w-80 origin-top-right opacity-0 invisible translate-y-1 transition-all duration-200 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0">
        <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-zinc-800">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Equipe
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {onlineCount} online · {members.length} no total
            </span>
          </div>

          {/* Lista rolável — cabe todo mundo. */}
          <div className="max-h-80 overflow-y-auto p-1">
            {members.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
                Ninguém por aqui ainda…
              </p>
            ) : (
              members.map((m) => <MemberRow key={m.id} member={m} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
