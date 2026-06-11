/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/app/_components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { Button } from '@/app/_components/ui/button';
import { Link, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { getUsers } from '@/app/_actions/get-user';
import { getProcess } from '@/app/_actions/get-process';
import { updateUser } from '@/app/_actions/update-users';
import { updateProcess } from '@/app/_actions/update-process';
import { deleteCard } from '@/app/_actions/delete-card';
import { updateKanbanStatus } from '@/app/_actions/update-kanban';

import type { ExtendedKanbanCard } from './card-dialog/types';
import { DetailsTab } from './card-dialog/DetailsTab';
import { ChecklistTab } from './card-dialog/ChecklistTab';
import { FilesTab } from './card-dialog/FilesTab';
import { CommentsTab } from './card-dialog/CommentsTab';
import { IntegrationsTab } from './card-dialog/IntegrationsTab';
import { DeleteConfirmDialog } from './card-dialog/DeleteConfirmDialog';

import { getLabels } from "@/app/_actions/get-labels";
import { RoteirosTab } from './card-dialog/ScriptTab';

interface CardDialogProps {
  card: ExtendedKanbanCard;
  open: boolean;
  onClose: () => void;
  onUpdate: (card: ExtendedKanbanCard) => void;
  onDelete?: (id: string) => void;
  isProcess?: boolean;
  ownerId?: string;
  cardId: string;
}

const EDITABLE_FIELDS = [
  'title', 'cpf', 'data_nasc', 'email', 'rua', 'bairro', 'numero', 'cep',
  'rg', 'nome_mae', 'telefone', 'cidade', 'estado', 'estado_civil',
  'profissao', 'nacionalidade', 'data_acidente', 'atendimento_via',
  'hospital', 'outro_hospital', 'lesoes', 'status', 'role', 'obs', 'service',
  'labelId',
] as const;

export const CardDialog: React.FC<CardDialogProps> = ({
  card, open, onClose, onUpdate, onDelete,
  isProcess = false, ownerId, cardId,
}) => {
  const [editedCard, setEditedCard] = useState<ExtendedKanbanCard>(card);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [labels, setLabels] = useState<any[]>([]);

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
        if (data.erro) return;
        setEditedCard((p) => ({
          ...p,
          ...(data.logradouro ? { rua: data.logradouro } : {}),
          ...(data.bairro ? { bairro: data.bairro } : {}),
        }));
      } catch (err) { console.error(err); }
    })();
  }, [editedCard.cep]);

  // Carrega dados completos ao abrir
  useEffect(() => {
    if (!open || !cardId) return;
    (async () => {
      try {
        const fetchFn = isProcess ? getProcess : getUsers;
        const data = await fetchFn('full', cardId);
        if (!data || Array.isArray(data)) {
          throw new Error(isProcess ? 'Processo não encontrado.' : 'Usuário não encontrado.');
        }
        setEditedCard((prev) => ({ ...prev, ...data, attachments: prev.attachments }));
      } catch (err: any) {
        console.error(err);
        toast.error(err.message);
      }
    })();
  }, [open, cardId, isProcess]);

  function updateField(field: string, value: string) {
    setEditedCard((p) => ({ ...p, [field]: value }));
  }

  function setStatus(status: string) {
    setEditedCard((p) => ({ ...p, status }));
  }

  async function handleSave() {
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
      toast.success('Dados salvos com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error('Não foi possível salvar: ' + err.message);
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90%] overflow-y-auto flex flex-col" autoFocus={false}>
        <DialogHeader>
          <DialogTitle>{editedCard.title}</DialogTitle>
          <a href="/nova-dash/instructions" className="absolute text-blue-600 hover:text-blue-500 right-12 font-semibold" target="_blank" rel="noopener noreferrer">
            Manual de Instruções <Link className="w-4 h-4 inline-block" />
          </a>
          <DialogDescription>Edição detalhada do processo</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex-1 overflow-y-auto flex flex-col">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="checklist">Progresso</TabsTrigger>
            <TabsTrigger value="files">Arquivos</TabsTrigger>
            <TabsTrigger value="comments">Comentários</TabsTrigger>
            <TabsTrigger value="script">Roteiro</TabsTrigger>
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <DetailsTab editedCard={editedCard} onChange={updateField} labels={labels} cardId={cardId} isProcess={isProcess} />
          </TabsContent>
          <TabsContent value="checklist">
            <ChecklistTab status={editedCard.status ?? ''} service={editedCard.service} onStatusChange={setStatus} />
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
        </Tabs>

        <div className="flex justify-between items-center gap-2 mt-4 pt-4 border-t">
          <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar Alterações</Button>
          </div>
        </div>
      </DialogContent>

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