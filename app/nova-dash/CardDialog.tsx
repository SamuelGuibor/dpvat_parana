/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/app/_shared/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_shared/ui/tabs';
import { Button } from '@/app/_shared/ui/button';
import { Link, Trash2, Loader2, MessageCircle, Sparkles } from 'lucide-react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { findWhatsAppContactForCard } from '@/app/_actions/whatsapp/client-info';
import { toast } from 'sonner';

import { getUsers } from '@/app/_actions/users/get-user';
import { getProcess } from '@/app/_actions/process/get-process';
import { updateUser } from '@/app/_actions/users/update-users';
import { updateProcess } from '@/app/_actions/process/update-process';
import { deleteCard } from '@/app/_actions/cards/delete-card';
import { updateKanbanStatus } from '@/app/_actions/cards/update-kanban';

import type { ExtendedKanbanCard } from './card-dialog/types';
import { DetailsTab } from './card-dialog/DetailsTab';
import { CardTagsBar } from './card-dialog/CardTagsBar';
import { ChecklistTab } from './card-dialog/ChecklistTab';
import { FilesTab } from './card-dialog/FilesTab';
import { CommentsTab } from './card-dialog/CommentsTab';
import { IntegrationsTab } from './card-dialog/IntegrationsTab';
import { DeleteConfirmDialog } from './card-dialog/DeleteConfirmDialog';
import { ArchiveBar } from './card-dialog/ArchiveBar';
import type { ArchiveStatus } from '@/app/_actions/cards/archive-card';

import { getLabels } from "@/app/_actions/labels/get-labels";
import { canUseDocIa } from '@/app/_shared/lib/doc-ia-access';
import { DocIaDialog } from './card-dialog/doc-ia/DocIaDialog';
import { RoteirosTab } from './card-dialog/ScriptTab';
import { LogsTab } from './card-dialog/LogsTab';
import { usePermissions } from '@/app/nova-dash/_components/PermissionsProvider';

interface CardDialogProps {
  card: ExtendedKanbanCard;
  open: boolean;
  onClose: () => void;
  onUpdate: (card: ExtendedKanbanCard) => void;
  onDelete?: (id: string) => void;
  /**
   * Arquivou/desarquivou pelo card. O quadro tira (ou repõe) o card na hora —
   * sem isto o card arquivado continuaria na coluna até o próximo polling.
   */
  onArchive?: (id: string, status: ArchiveStatus | null) => void;
  isProcess?: boolean;
  ownerId?: string;
  cardId: string;
}

const EDITABLE_FIELDS = [
  'title', 'cpf', 'data_nasc', 'email', 'rua', 'bairro', 'numero', 'cep',
  'rg', 'nome_mae', 'telefone', 'telefone_secundario', 'rede_social', 'cidade', 'estado', 'estado_civil',
  'profissao', 'nacionalidade', 'data_acidente', 'atendimento_via',
  'hospital', 'outro_hospital', 'lesoes', 'status', 'role', 'obs', 'otherObs', 'service',
  'labelId', 'senha_inss', 'afastadoAte',
] as const;

export const CardDialog: React.FC<CardDialogProps> = ({
  card, open, onClose, onUpdate, onDelete, onArchive,
  isProcess = false, ownerId, cardId,
}) => {
  const [editedCard, setEditedCard] = useState<ExtendedKanbanCard>(card);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const { perms } = usePermissions();
  const [labels, setLabels] = useState<any[]>([]);

  // Gerador de Documento (IA) — botão HARDCODED (doc-ia-access.ts), fora do
  // sistema de permissões: só aparece pra quem está na allowlist.
  const { data: session } = useSession();
  const showDocIa = canUseDocIa(session?.user as { id?: string; email?: string } | undefined);
  const [docIaOpen, setDocIaOpen] = useState(false);

  // ===== Rascunho automático (recupera preenchimento em caso de fechamento
  // acidental ou travamento). O rascunho fica só no navegador (localStorage). =====
  const [pendingDraft, setPendingDraft] = useState<ExtendedKanbanCard | null>(null);
  const serverLoadedRef = useRef(false);
  const baselineRef = useRef<string>('');
  const draftKey = `dpvat-card-draft:${isProcess ? 'p' : 'u'}:${cardId}`;

  function safeStringify(c: ExtendedKanbanCard): string {
    try { return JSON.stringify(c); } catch { return ''; }
  }

  // Ao (re)abrir o card, reseta o "carregado" e verifica se há rascunho salvo
  // para oferecer recuperação.
  useEffect(() => {
    if (!open) return;
    serverLoadedRef.current = false;
    try {
      const raw = localStorage.getItem(draftKey);
      setPendingDraft(raw ? (JSON.parse(raw) as ExtendedKanbanCard) : null);
    } catch {
      setPendingDraft(null);
    }
  }, [open, draftKey]);

  useEffect(() => {
  async function loadLabels() {
    try {
      const data = await getLabels();
      setLabels(data);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar etiquetas");
    }
  }

  loadLabels();
}, []);

  // CEP autofill
  useEffect(() => {
    const cep = editedCard?.cep?.replace(/\D/g, '');
    if (!cep || cep.length !== 8) return;
    (async () => {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (data.erro) {
          toast.warning('CEP não encontrado — confira o número ou preencha o endereço manualmente.');
          return;
        }
        setEditedCard((p) => ({
          ...p,
          ...(data.logradouro ? { rua: data.logradouro } : {}),
          ...(data.bairro ? { bairro: data.bairro } : {}),
        }));
      } catch (err) {
        console.error('[CEP] Falha na consulta ViaCEP:', err);
        toast.warning('Não foi possível consultar o CEP agora — preencha o endereço manualmente.');
      }
    })();
  }, [editedCard.cep]);

  // Carrega dados completos ao abrir
  useEffect(() => {
    if (!open || !cardId) return;
    let cancelled = false;
    (async () => {
      try {
        const fetchFn = isProcess ? getProcess : getUsers;
        const data = await fetchFn('full', cardId);
        if (!data || Array.isArray(data)) {
          throw new Error(isProcess ? 'Processo não encontrado.' : 'Usuário não encontrado.');
        }
        if (cancelled) return;
        setEditedCard((prev) => {
          const merged = { ...prev, ...data, attachments: prev.attachments } as ExtendedKanbanCard;
          // Guarda o "estado salvo" para comparar e só manter rascunho quando houver mudança real.
          baselineRef.current = safeStringify(merged);
          serverLoadedRef.current = true;
          return merged;
        });
      } catch (err: any) {
        console.error(err);
        toast.error(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [open, cardId, isProcess]);

  // Grava o rascunho local (debounce) enquanto o usuário edita. Só grava quando
  // difere do que veio do servidor e enquanto não há recuperação pendente.
  useEffect(() => {
    if (!open || !serverLoadedRef.current || pendingDraft) return;
    const t = setTimeout(() => {
      const current = safeStringify(editedCard);
      try {
        if (!current || current === baselineRef.current) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, current);
      } catch { /* localStorage indisponível */ }
    }, 800);
    return () => clearTimeout(t);
  }, [editedCard, open, pendingDraft, draftKey]);

  // Persiste imediatamente o rascunho ao fechar sem salvar (fechamento acidental).
  function flushDraft() {
    if (!serverLoadedRef.current) return;
    const current = safeStringify(editedCard);
    try {
      if (current && current !== baselineRef.current) localStorage.setItem(draftKey, current);
    } catch { /* ignore */ }
  }

  // Fechamento acidental (Esc / clique fora / botão X): mantém o rascunho.
  function handleDismiss() {
    flushDraft();
    onClose();
  }

  // Cancelar explícito: descarta o rascunho local (não recupera depois).
  function handleCancel() {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    onClose();
  }

  function restoreDraft() {
    if (pendingDraft) setEditedCard(pendingDraft);
    setPendingDraft(null);
  }

  function discardDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setPendingDraft(null);
  }

  function updateField(field: string, value: string) {
    setEditedCard((p) => ({ ...p, [field]: value }));
  }

  function setStatus(status: string) {
    setEditedCard((p) => ({ ...p, status }));
  }

  async function handleSave() {
    if (savingCard) return;
    setSavingCard(true);
    try {
      const labelChanged = editedCard.labelId !== card.labelId && !!editedCard.labelId;

      if (labelChanged) {
        await updateKanbanStatus({
          id: editedCard.id,
          labelId: editedCard.labelId!,
          isProcess,
        });
      }

      const changes: any = { id: editedCard.id };
      for (const f of EDITABLE_FIELDS) {
        if (f === 'labelId' || f === 'role') continue;
        if (editedCard[f] !== card[f]) {
          changes[f === 'title' ? 'name' : f] = editedCard[f];
        }
      }

      let updatedItem: any = card;
      if (Object.keys(changes).length > 1) {
        const fn = isProcess ? updateProcess : updateUser;
        updatedItem = await fn(changes);
      }

      const newLabel = labels.find((l: any) => l.id === editedCard.labelId) ?? null;
      onUpdate({
        ...editedCard,
        ...updatedItem,
        labelId: editedCard.labelId,
        label: newLabel,
        status: newLabel?.name ?? editedCard.status,
      });
      // Salvo com sucesso: atualiza a base e descarta o rascunho local.
      baselineRef.current = safeStringify(editedCard);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      toast.success('Dados salvos com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error('Não foi possível salvar: ' + err.message);
    } finally {
      setSavingCard(false);
    }
  }

  async function handleDeleteCard() {
    try {
      await deleteCard({ id: editedCard.id, isProcess });
      toast.success('Card excluído!');
      onClose();
      onDelete?.(editedCard.id);
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + err.message);
    } finally {
      setConfirmDelete(false);
    }
  }

  const { data: waContactId } = useSWR(
    open && !isProcess ? ['wa-contact-for-card', cardId] : null,
    () => findWhatsAppContactForCard(cardId),
    { revalidateOnFocus: false },
  );

  function openWhatsAppConversation() {
    if (!waContactId) return;
    // Aba nova do navegador: sessionStorage/CustomEvent não atravessam abas,
    // então o contato vai na URL e a page.tsx lê o ?wa= no carregamento.
    window.open(`/nova-dash?wa=${encodeURIComponent(waContactId)}`, '_blank', 'noopener');
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      {/* Desktop: classes originais intactas. Só NO CELULAR (max-sm) o dialog
          vira tela cheia — centralizado ele quebrava com as abas largas. */}
      <DialogContent
        className="max-w-7xl h-[90%] overflow-y-auto flex flex-col max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4"
        autoFocus={false}
      >
        <DialogHeader>
          <DialogTitle>{editedCard.title}</DialogTitle>
          <a href="/nova-dash/instructions" className="absolute text-blue-600 hover:text-blue-500 right-12 font-semibold" target="_blank" rel="noopener noreferrer">
            Manual de Instruções <Link className="w-4 h-4 inline-block" />
          </a>
          <DialogDescription>Edição detalhada do processo</DialogDescription>
          <div className="flex flex-wrap items-center gap-2">
            {waContactId && (
              <button
                onClick={openWhatsAppConversation}
                title="Abrir a conversa deste cliente no WhatsApp (aba nova)"
                className="mt-1 flex w-fit items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Abrir conversa no WhatsApp
              </button>
            )}
            {showDocIa && (
              <button
                onClick={() => setDocIaOpen(true)}
                title="Gerar documento a partir de um modelo .docx com tags + IA"
                className="mt-1 flex w-fit items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-violet-700"
              >
                <Sparkles className="h-3.5 w-3.5" /> Gerar Documento (IA)
              </button>
            )}
          </div>
          {/* Tags do card: gerenciadas SÓ aqui; o kanban exibe (badge + "+N"). */}
          <CardTagsBar
            cardId={cardId}
            isProcess={isProcess}
            onTagsChange={(tags) => {
              // Atualiza o card no board na hora, sem esperar o polling.
              window.dispatchEvent(new CustomEvent('card-tags-changed', {
                detail: { cardId, isProcess, tags },
              }));
            }}
          />
        </DialogHeader>

        {pendingDraft && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-2.5">
            <span className="text-sm text-amber-800 dark:text-amber-300">
              Há alterações não salvas deste card (de um fechamento anterior). Deseja recuperar?
            </span>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="ghost" onClick={discardDraft}>Descartar</Button>
              <Button size="sm" onClick={restoreDraft}>Recuperar</Button>
            </div>
          </div>
        )}

        <Tabs defaultValue="details" className="flex-1 overflow-y-auto flex flex-col">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="checklist">Progresso</TabsTrigger>
            <TabsTrigger value="files">Arquivos</TabsTrigger>
            <TabsTrigger value="comments">Comentários</TabsTrigger>
            <TabsTrigger value="script">Roteiro</TabsTrigger>
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <DetailsTab editedCard={editedCard} onChange={updateField} labels={labels} cardId={cardId} isProcess={isProcess} />
          </TabsContent>
          <TabsContent value="checklist">
            <ChecklistTab status={editedCard.status ?? ''} service={editedCard.service} phone={editedCard.telefone} clientName={editedCard.title} onStatusChange={setStatus} />
          </TabsContent>
          <TabsContent value="files">
            <FilesTab cardId={cardId} isProcess={isProcess} ownerId={ownerId} />
          </TabsContent>
          <TabsContent value="comments">
            <CommentsTab cardId={cardId} isProcess={isProcess} />
          </TabsContent>
          <TabsContent value="script">
            <RoteirosTab name={editedCard.title} cardId={cardId} isProcess={isProcess} />
          </TabsContent>
          <TabsContent value="integrations">
            <IntegrationsTab editedCard={editedCard} isProcess={isProcess} />
          </TabsContent>
          <TabsContent value="logs">
            <LogsTab cardId={cardId} isProcess={isProcess} />
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-start justify-between gap-3 mt-4 pt-4 border-t">
          {perms.delete_cards ? (
            <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          ) : <span />}

          {/* Arquivar: ocupa o espaço vazio do rodapé, entre Excluir e Salvar. */}
          <ArchiveBar
            cardId={cardId}
            isProcess={isProcess}
            cardName={editedCard.title}
            current={(editedCard.archiveStatus as ArchiveStatus | null) ?? null}
            canArchive={!!perms.archive_cards}
            onChanged={(status) => {
              setEditedCard((p) => ({ ...p, archiveStatus: status }));
              onArchive?.(cardId, status);
              // Descarta o rascunho local: o card já saiu (ou voltou) do quadro.
              try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
              onClose();
            }}
          />

          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={handleCancel} disabled={savingCard}>Cancelar</Button>
            <Button onClick={handleSave} disabled={savingCard}>
              {savingCard ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {savingCard ? 'Salvando…' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </DialogContent>

      {showDocIa && docIaOpen && (
        <DocIaDialog
          open={docIaOpen}
          onClose={() => setDocIaOpen(false)}
          card={editedCard}
          cardId={cardId}
          isProcess={isProcess}
        />
      )}

      <DeleteConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir card"
        description={<>Tem certeza que deseja excluir <strong>{editedCard.title}</strong>? Essa ação é irreversível.</>}
        onConfirm={handleDeleteCard}
      />
    </Dialog>
  );
};