'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/rules-of-hooks */

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/app/_shared/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { Badge } from '@/app/_shared/ui/badge';
import {
  ChevronDown, User as UserIcon, Settings, LogOut, ShieldCheck, Mail,
  Megaphone, BellRing, Loader2, MonitorUp,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Textarea } from '@/app/_shared/ui/textarea';
import { toast } from 'sonner';
import { ProfileDialog } from './ProfileDialog';
import { getMyProfile } from '@/app/_actions/users/update-profile';
import { createDevAlert, getActiveDevAlerts, type DevAlertDTO } from '@/app/_actions/dev-alerts';

interface Profile {
  id: string; name: string; email: string; telefone: string;
  cpf: string; role: string; image: string | null; createdAt: string;
  sector: { id: string; name: string; color: string } | null;
}

// Só o setor de desenvolvimento vê/pode usar o "Criar Alerta" (a server
// action valida de novo — isto aqui é só para esconder o item do menu).
function isDevSector(sectorName?: string | null) {
  const n = (sectorName ?? '').toLowerCase();
  return n.includes('desenvolv') || n === 'dev' || n === 'ti';
}

// Marca pop-ups já vistos neste navegador (por usuário seria overkill: o
// aviso é do tipo "dê F5", vale por sessão de tela).
const SEEN_KEY = 'dev-alerts-seen';
function getSeenIds(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; }
}
function markSeen(id: string) {
  const seen = [id, ...getSeenIds()].slice(0, 50);
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}

/**
 * Listener global dos pop-ups do dev: consulta os alertas ativos a cada 30s
 * e mostra o primeiro ainda não visto como modal. Montado junto do UserMenu,
 * então cobre toda a área logada da equipe.
 */
function DevAlertPopup() {
  const [queue, setQueue] = useState<DevAlertDTO[]>([]);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const alerts = await getActiveDevAlerts();
        if (!alive) return;
        const seen = getSeenIds();
        setQueue(alerts.filter((a) => !seen.includes(a.id)));
      } catch {}
    }
    poll();
    const interval = setInterval(poll, 30_000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const current = queue[0] ?? null;
  function dismiss() {
    if (!current) return;
    markSeen(current.id);
    setQueue((prev) => prev.slice(1));
  }

  return (
    <Dialog open={!!current} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent className="max-w-md border-2 border-amber-300 dark:border-amber-700">
        {current && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                  <Megaphone className="h-5 w-5" />
                </span>
                {current.title || 'Aviso da equipe de desenvolvimento'}
              </DialogTitle>
              <DialogDescription className="sr-only">Aviso urgente do time de desenvolvimento</DialogDescription>
            </DialogHeader>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-zinc-200">
              {current.message}
            </p>
            <DialogFooter className="flex items-center gap-2 sm:justify-between">
              <span className="text-[11px] text-gray-400">
                por {current.authorName} · {new Date(current.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <Button onClick={dismiss} className="bg-amber-500 text-white hover:bg-amber-600">
                Entendi
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Diálogo do dev para disparar um pop-up ou notificação para a equipe. */
function CreateAlertDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<'popup' | 'notification'>('popup');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) { toast.error('Escreva o conteúdo do alerta.'); return; }
    setSending(true);
    try {
      const result = await createDevAlert({ type, title, message });
      toast.success(
        type === 'popup'
          ? 'Pop-up disparado! Quem estiver online vê em até 30 segundos.'
          : `Notificação enviada para ${result.recipients ?? 0} membros da equipe.`,
      );
      setTitle(''); setMessage('');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar o alerta.');
    } finally {
      setSending(false);
    }
  }

  const typeOptions = [
    {
      key: 'popup' as const,
      icon: MonitorUp,
      label: 'Pop-up na tela',
      hint: 'Modal urgente para quem está online agora (ex.: "dê F5, saiu atualização"). Vale por 2h.',
      active: 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30',
      iconColor: 'text-amber-500',
    },
    {
      key: 'notification' as const,
      icon: BellRing,
      label: 'Notificação no sino',
      hint: 'Vai para o sino de todos os membros da equipe, como uma notificação comum.',
      active: 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30',
      iconColor: 'text-blue-500',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-amber-500" /> Criar alerta para a equipe
          </DialogTitle>
          <DialogDescription>
            Aviso do desenvolvimento para todo mundo — escolha como ele chega.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {typeOptions.map((opt) => {
            const Icon = opt.icon;
            const selected = type === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setType(opt.key)}
                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                  selected ? opt.active : 'border-gray-200 hover:border-gray-300 dark:border-zinc-700 dark:hover:border-zinc-600'
                }`}
              >
                <Icon className={`mb-1.5 h-5 w-5 ${opt.iconColor}`} />
                <p className="text-sm font-bold text-gray-800 dark:text-zinc-100">{opt.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-zinc-400">{opt.hint}</p>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dev-alert-title">Título (opcional)</Label>
            <Input
              id="dev-alert-title"
              placeholder="Ex.: Atualização no sistema"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dev-alert-message">Mensagem</Label>
            <Textarea
              id="dev-alert-message"
              placeholder="Ex.: Acabamos de subir uma atualização — aperte F5 para recarregar a página."
              value={message}
              maxLength={1000}
              rows={4}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || !message.trim()}>
            {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {type === 'popup' ? 'Disparar pop-up' : 'Enviar notificação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [alertOpen, setAlertOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getMyProfile();
        setProfile(data);

      } catch (err: any) {
        console.log('Falha ao carregar perfil do usuário:', err);
      }
    })();
  }, []);

  const name = session?.user?.name ?? 'Usuário';
  const email = session?.user?.email ?? '';
  const role = session?.user?.role ?? '';
  const image = session?.user?.image ?? null;
  return (
    <>
      <DropdownMenu >
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

        <DropdownMenuContent align="end" className="w-96 p-0 overflow-hidden">
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
              {profile?.sector && (
                <Badge
                  className="gap-1 border text-[11px]"
                  style={{
                    backgroundColor: `${profile.sector.color}22`,
                    color: profile.sector.color,
                    borderColor: `${profile.sector.color}55`,
                  }}
                ><ShieldCheck className="h-3 w-3" /> {profile.sector.name}</Badge>
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
            {isDevSector(profile?.sector?.name) && (
              <DropdownMenuItem
                onClick={() => setAlertOpen(true)}
                className="cursor-pointer py-2"
              >
                <Megaphone className="h-4 w-4 text-amber-500" />
                <span className="font-medium">Criar Alerta</span>
              </DropdownMenuItem>
            )}

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
      <CreateAlertDialog open={alertOpen} onClose={() => setAlertOpen(false)} />
      {/* Pop-ups do dev: montado aqui porque o UserMenu está presente em toda
          a área logada da equipe — qualquer um online recebe o aviso. */}
      <DevAlertPopup />
    </>
  );
}
