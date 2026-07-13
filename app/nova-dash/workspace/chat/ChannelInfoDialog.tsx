/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/app/_shared/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/app/_shared/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/_shared/ui/avatar';
import { Badge } from '@/app/_shared/ui/badge';
import { Input } from '@/app/_shared/ui/input';
import { Button } from '@/app/_shared/ui/button';
import { Separator } from '@/app/_shared/ui/separator';
import { toast } from 'sonner';
import {
  Lock, Crown, Loader2, ShieldCheck, Phone, Mail, ChevronRight, CheckCircle2, Copy,
  Hash, Pencil, Check, X, Trash2, Megaphone,
} from 'lucide-react';
import { getTeamProfiles, type TeamProfile } from '@/app/_actions/users/get-team-profiles';
import { renameChannel, deleteChannel, setAnnounceOnly, type ChannelDTO } from '@/app/_actions/chat/channels';
import type { PresenceMember } from '@/app/_shared/hooks/use-presence';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase() || 'U';
}
function avatarUrl(id: string, image: string | null) {
  return image || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(id)}`;
}
type ChannelInfo = {
  id: string;
  name: string;
  memberIds: string[];
  createdById?: string | null;
  isGeneral?: boolean;
  announceOnly?: boolean;
};

interface Props {
  open: boolean;
  onClose: () => void;
  channel: ChannelInfo;
  presenceMembers: PresenceMember[];
  meId: string;
  /** Chamado após renomear/excluir/alterar config, para o pai revalidar a lista de canais. */
  onRenamed?: () => void;
  onDeleted?: () => void;
}

interface MergedMember extends TeamProfile {
  online: boolean;
  isCreator: boolean;
  isMe: boolean;
}

export function ChannelInfoDialog({ open, onClose, channel, presenceMembers, meId, onRenamed, onDeleted }: Props) {
  const [profiles, setProfiles] = useState<TeamProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MergedMember | null>(null);

  const isOwner = !channel.isGeneral && channel.createdById === meId;

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(channel.name);
  const [savingName, setSavingName] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [announceOnly, setAnnounceOnlyState] = useState(!!channel.announceOnly);
  const [savingAnnounce, setSavingAnnounce] = useState(false);

  useEffect(() => {
    if (!open) { setSelected(null); setRenaming(false); setDeleteOpen(false); return; }
    setNameDraft(channel.name);
    setAnnounceOnlyState(!!channel.announceOnly);
    let alive = true;
    setLoading(true);
    getTeamProfiles(channel.memberIds)
      .then((p) => { if (alive) setProfiles(p); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, channel.memberIds, channel.name, channel.announceOnly]);

  async function saveRename() {
    const name = nameDraft.trim();
    if (!name || savingName) return;
    setSavingName(true);
    try {
      await renameChannel({ channelId: channel.id, name });
      toast.success('Canal renomeado.');
      setRenaming(false);
      onRenamed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao renomear.');
    } finally {
      setSavingName(false);
    }
  }

  async function toggleAnnounceOnly() {
    if (savingAnnounce) return;
    const next = !announceOnly;
    setSavingAnnounce(true);
    try {
      await setAnnounceOnly({ channelId: channel.id, announceOnly: next });
      setAnnounceOnlyState(next);
      toast.success(next ? 'Modo aviso ativado: só você poderá enviar mensagens.' : 'Modo aviso desativado: todos os membros podem enviar mensagens.');
      onRenamed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao alterar a configuração.');
    } finally {
      setSavingAnnounce(false);
    }
  }

  async function confirmDeleteChannel() {
    setDeleting(true);
    try {
      await deleteChannel({ channelId: channel.id });
      toast.success('Canal excluído.');
      setDeleteOpen(false);
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setDeleting(false);
    }
  }

  const members = useMemo<MergedMember[]>(() => {
    const presenceMap = new Map(presenceMembers.map((m) => [m.id, m.online]));
    return profiles
      .map((p) => ({
        ...p,
        online: presenceMap.get(p.id) ?? false,
        isCreator: p.id === channel.createdById,
        isMe: p.id === meId,
      }))
      .sort((a, b) => {
        if (a.isCreator !== b.isCreator) return a.isCreator ? -1 : 1;
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [profiles, presenceMembers, channel.createdById, meId]);

  const creator = channel.isGeneral
  ? null
  : members.find((m) => m.isCreator);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            {renaming ? (
              <div className="flex items-center gap-2 pr-6">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false); }}
                  autoFocus
                  maxLength={60}
                  className="h-8 text-base font-semibold"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={savingName || !nameDraft.trim()} onClick={saveRename}>
                  <Check className="h-4 w-4 text-emerald-600" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={savingName} onClick={() => setRenaming(false)}>
                  <X className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
            ) : (
              <DialogTitle className="flex items-center gap-2">
                {channel.isGeneral ? (
                  <Hash className="h-4 w-4 text-blue-500" />
                ) : (
                  <Lock className="h-4 w-4 text-blue-500" />
                )}
                <span className="truncate">{channel.name}</span>
                {isOwner && (
                  <button
                    onClick={() => setRenaming(true)}
                    title="Renomear canal"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </DialogTitle>
            )}

            <DialogDescription>
              {channel.isGeneral
                ? "Canal geral da empresa. Todos os colaboradores possuem acesso."
                : "Canal restrito — apenas os membros abaixo têm acesso."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {creator && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
                  <div className="relative">
                    <Avatar className="h-10 w-10 border-2 border-white shadow dark:border-zinc-900">
                      <AvatarImage src={avatarUrl(creator.id, creator.image)} alt={creator.name} />
                      <AvatarFallback className="bg-amber-100 text-xs font-bold text-amber-700">{initials(creator.name)}</AvatarFallback>
                    </Avatar>
                    <Crown className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white p-0.5 text-amber-500 shadow dark:bg-zinc-900" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-zinc-100">{creator.name}{creator.isMe && <span className="ml-1 font-normal text-blue-500">(você)</span>}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Criador do canal</p>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  <span>Membros</span><span>{members.length}</span>
                </p>
                <div className="max-h-72 space-y-0.5 overflow-y-auto">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelected(m)}
                      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-9 w-9 border border-gray-100 dark:border-zinc-800">
                          <AvatarImage src={avatarUrl(m.id, m.image)} alt={m.name} />
                          <AvatarFallback className="bg-blue-100 text-[10px] font-bold text-blue-700">{initials(m.name)}</AvatarFallback>
                        </Avatar>
                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${m.online ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-600'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800 dark:text-zinc-100">
                          {m.name}{m.isMe && <span className="ml-1 text-[11px] font-normal text-blue-500">(você)</span>}
                        </p>
                        <p className="truncate text-[11px] text-gray-400">{m.role}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
                    </button>
                  ))}
                </div>
              </div>

              {!channel.isGeneral && isOwner && (
                <>
                  <Separator />
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                      <Megaphone className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-800 dark:text-zinc-100">Modo aviso</span>
                        <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={announceOnly}
                            disabled={savingAnnounce}
                            onChange={toggleAnnounceOnly}
                          />
                          <span className="absolute inset-0 rounded-full bg-gray-200 transition-colors peer-checked:bg-amber-500 dark:bg-zinc-700" />
                          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-gray-400">
                        Apenas você (dono do canal) pode mandar mensagens — os demais membros só leem.
                      </span>
                    </span>
                  </label>
                </>
              )}

              {!channel.isGeneral && !isOwner && channel.announceOnly && (
                <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
                  <Megaphone className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Canal em modo aviso — só {creator?.name ?? 'o dono'} pode enviar mensagens aqui.
                  </p>
                </div>
              )}

              {isOwner && (
                <>
                  <Separator />
                  <button
                    onClick={() => setDeleteOpen(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir canal
                  </button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir &quot;{channel.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga o canal e todas as mensagens permanentemente para os {members.length} membros. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDeleteChannel} disabled={deleting}>
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...</> : 'Excluir definitivamente'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberProfileDialog member={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function CopyableField({ icon: Icon, value }: { icon: React.ElementType; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
      }}
      className="flex w-full items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
      title="Clique para copiar"
    >
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-zinc-200">{value}</span>
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-gray-300" />}
    </button>
  );
}

function MemberProfileDialog({ member, onClose }: { member: MergedMember | null; onClose: () => void }) {
  return (
    <Dialog open={!!member} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {member && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">{member.name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center pb-2 pt-2 text-center">
              <div className="relative">
                <Avatar className="h-20 w-20 border-4 border-white shadow-lg dark:border-zinc-900">
                  <AvatarImage src={avatarUrl(member.id, member.image)} alt={member.name} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-bold text-white">{initials(member.name)}</AvatarFallback>
                </Avatar>
                <span className={`absolute bottom-0 right-0 h-5 w-5 rounded-full ring-4 ring-white dark:ring-zinc-900 ${member.online ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-zinc-600'}`} />
              </div>
              <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-zinc-100">{member.name}</h3>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                {member.isCreator && <Badge className="gap-1 border-amber-200 bg-amber-100 text-[10px] text-amber-700 hover:bg-amber-100"><Crown className="h-3 w-3" /> Criador</Badge>}
                <Badge variant="secondary" className="gap-1 text-[10px]"><ShieldCheck className="h-3 w-3" /> {member.role}</Badge>
                <Badge className={`gap-1 text-[10px] ${member.online ? 'border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'border-gray-200 bg-gray-100 text-gray-500 hover:bg-gray-100'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${member.online ? 'bg-emerald-500' : 'bg-gray-400'}`} /> {member.online ? 'Online' : 'Offline'}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              {member.telefone && <CopyableField icon={Phone} value={member.telefone} />}
              {member.email && <CopyableField icon={Mail} value={member.email} />}
              {!member.telefone && !member.email && (
                <p className="py-4 text-center text-xs text-gray-400">Sem contato cadastrado.</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
