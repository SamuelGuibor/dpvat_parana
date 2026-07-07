/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/app/_shared/ui/dialog';
import { Button } from '@/app/_shared/ui/button';
import { Input } from '@/app/_shared/ui/input';
import { Label } from '@/app/_shared/ui/label';
import { Separator } from '@/app/_shared/ui/separator';
import { Badge } from '@/app/_shared/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import {
  User as UserIcon, Mail, Phone, IdCard, Lock, Loader2, ShieldCheck,
  Eye, EyeOff, CalendarDays, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { getMyProfile, updateMyProfile } from '@/app/_actions/users/update-profile';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Profile {
  id: string;
  name: string;
  email: string;
  telefone: string;
  cpf: string;
  role: string;
  image: string | null;
  createdAt: string;
}

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

export function ProfileDialog({ open, onClose }: Props) {
  const { update: updateSession } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');

  const [showPwd, setShowPwd] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealPwd, setRevealPwd] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reseta a seção de senha ao reabrir.
    setShowPwd(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');

    (async () => {
      setLoading(true);
      try {
        const data = await getMyProfile();
        setProfile(data);
        setName(data.name);
        setEmail(data.email);
        setTelefone(data.telefone);
      } catch (err: any) {
        toast.error(err?.message ?? 'Erro ao carregar perfil.');
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  async function handleSave() {
    if (showPwd && newPassword && newPassword !== confirmPassword) {
      toast.error('A confirmação da nova senha não confere.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMyProfile({
        name,
        email,
        telefone,
        ...(showPwd && newPassword
          ? { currentPassword, newPassword }
          : {}),
      });

      // Atualiza a sessão para o header refletir o novo nome/email na hora.
      await updateSession({ name: updated.name, email: updated.email });

      toast.success('Perfil atualizado com sucesso!');
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        {/* Cabeçalho com faixa colorida */}
        <div className="relative bg-gradient-to-br from-blue-600 to-indigo-600 px-6 pt-6 pb-14">
          <DialogHeader className="text-left">
            <DialogTitle className="text-white text-base font-semibold">Meu Perfil</DialogTitle>
            <DialogDescription className="text-blue-100/90">
              Visualize e edite os seus dados pessoais.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Avatar sobreposto */}
        <div className="px-6 -mt-12">
          <div className="flex items-end gap-4">
            <Avatar className="h-20 w-20 border-4 border-white dark:border-zinc-900 shadow-lg">
              {profile?.image && <AvatarImage src={profile.image} alt={profile.name} />}
              <AvatarFallback className="bg-blue-100 text-blue-700 text-xl font-bold">
                {initials(name || profile?.name || 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="pb-1 min-w-0">
              <p className="font-bold text-gray-900 dark:text-zinc-100 truncate">{name || profile?.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 gap-1 text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
                </Badge>
                {profile?.role && (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <ShieldCheck className="h-3 w-3" /> {profile.role}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pt-5 pb-2 space-y-4 max-h-[52vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <>
              {/* Nome */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                  <UserIcon className="h-3.5 w-3.5" /> Nome
                </Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> E-mail
                </Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
              </div>

              {/* Telefone + CPF */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> Telefone
                  </Label>
                  <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                    <IdCard className="h-3.5 w-3.5" /> CPF
                  </Label>
                  <Input value={profile?.cpf ?? ''} disabled className="bg-gray-50 dark:bg-zinc-800 cursor-not-allowed" />
                </div>
              </div>

              {memberSince && (
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" /> Membro desde {memberSince}
                </p>
              )}

              <Separator />

              {/* Seção de senha */}
              {!showPwd ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPwd(true)}
                  className="w-full justify-center text-gray-600"
                >
                  <Lock className="h-3.5 w-3.5 mr-2" /> Alterar senha
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-dashed p-3 bg-gray-50/60 dark:bg-zinc-900/40">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> Alterar senha
                    </Label>
                    <button
                      type="button"
                      onClick={() => setRevealPwd((v) => !v)}
                      className="text-gray-400 hover:text-gray-600"
                      title={revealPwd ? 'Ocultar' : 'Mostrar'}
                    >
                      {revealPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Input
                    type={revealPwd ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Senha atual"
                    autoComplete="current-password"
                  />
                  <Input
                    type={revealPwd ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nova senha"
                    autoComplete="new-password"
                  />
                  <Input
                    type={revealPwd ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmar nova senha"
                    autoComplete="new-password"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-gray-50/50 dark:bg-zinc-900/50">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
