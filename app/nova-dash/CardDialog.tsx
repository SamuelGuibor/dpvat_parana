/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/app/_components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/_components/ui/tabs';
import { Input } from '@/app/_components/ui/input';
import { Textarea } from '@/app/_components/ui/textarea';
import { Button } from '@/app/_components/ui/button';
import { Label } from '@/app/_components/ui/label';
import { Checkbox } from '@/app/_components/ui/checkbox';
import { Badge } from '@/app/_components/ui/badge';
import { ScrollArea } from '@/app/_components/ui/scroll-area';
import { Separator } from '@/app/_components/ui/separator';
import {
  Upload, Download, Trash2, Clock, User, Calendar,
  MessageSquare, CheckSquare, Send, AtSign, Link2,
  Mail, MessageCircle, Zap, Loader2, Edit, Trash,
  MoreHorizontal
} from 'lucide-react';
import { Dropzone, DropzoneContent, DropzoneEmptyState } from '@/app/_components/dropzone';
import { MentionsInput, Mention } from 'react-mentions';
import { toast } from 'sonner';
import type { KanbanCard, Comment, Attachment, ChecklistItem } from './KanbanBoard';
import { getPresignedUrls } from '@/app/_actions/uploadS3';
import { downloadFileFromS3 } from '@/app/_actions/downloadS3';
import { getUsers } from "@/app/_actions/get-user";
import { getProcess } from "@/app/_actions/get-process";
import { updateUser } from "@/app/_actions/update-users";
import { updateProcess } from "@/app/_actions/update-process";
import { updateProcessRole } from "@/app/_actions/statusTimerProcess";
import { updateUserRole } from "@/app/_actions/statusTimer";
import { toggleFixed } from "@/app/_actions/uploadStatusFixed";
import { updateDocumentName } from "@/app/_actions/updateNameDoc";
import { deletDoc } from "@/app/_actions/delet_document";
import { CiEdit } from "react-icons/ci";
import useSWR from 'swr'
import { createComment } from '@/app/_actions/comment-actions';
import { Avatar, AvatarFallback } from '@/app/_components/ui/avatar';
import { IoIosDocument } from "react-icons/io";

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function useComments({ userId, processId }: { userId?: string; processId?: string }) {
  const params = new URLSearchParams();
  if (userId) params.append('userId', userId);
  if (processId) params.append('processId', processId);
  const query = params.toString() ? `/api/comments?${params.toString()}` : '/api/comments';
  return useSWR(query, fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });
}

interface ExtendedKanbanCard extends KanbanCard {
  id: string;
  cpf?: string;
  data_nasc?: string;
  email?: string;
  rua?: string;
  bairro?: string;
  numero?: string;
  cep?: string;
  rg?: string;
  nome_mae?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  estado_civil?: string;
  profissao?: string;
  nacionalidade?: string;
  data_acidente?: string;
  atendimento_via?: string;
  hospital?: string;
  outro_hospital?: string;
  lesoes?: string;
  role?: string;
  service?: string;
  obs?: string;
  nome_res?: string;
  rg_res?: string;
  cpf_res?: string;
  estado_civil_res?: string;
  profissao_res?: string;
  status?: string | undefined;
  statusStartedAt?: string | null;
  attachments: { id?: string; key: string; name: string; size?: number; uploadedAt: Date }[];
}
interface CardDialogProps {
  card: ExtendedKanbanCard;
  open: boolean;
  onClose: () => void;
  onUpdate: (card: ExtendedKanbanCard) => void;
  userId: string;
  isProcess?: boolean;
}
interface FileWithBase64 {
  name: string;
  type: string;
  base64: string;
}
export const CardDialog: React.FC<CardDialogProps> = ({ card, open, onClose, onUpdate, userId, isProcess = false }) => {
  const [editedCard, setEditedCard] = useState<ExtendedKanbanCard>(card);
  const [newComment, setNewComment] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [base64Files, setBase64Files] = useState<FileWithBase64[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState({
    iniciado: false,
    aguardandoAssinatura: false,
    solicitarDocumentos: false,
    coletaDocumentos: false,
    analiseDocumentos: false,
    pericial: false,
    aguardandoPericial: false,
    pagamentoHonorario: false,
    processoEncerrado: false,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmationDoc, setConfirmationDoc] = useState(false);
  const [nameDocDelet, setNameDocDelet] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [itemDocuments, setItemDocuments] = useState<{ id?: string; key: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const { data: comments = [], mutate } = useComments({
    userId: !isProcess ? editedCard.id : undefined,
    processId: isProcess ? editedCard.id : undefined,
  });

  const users = [
    { id: "cmazuwrcj0000iav499hqf5ij", display: "Thomaz Martinez" },
    { id: "cmaztbktw0000ld04ivltlu5g", display: "Nikolas Fellipe Kosien" },
    { id: "cmb07q4i40000jr04pze42w3r", display: "Eduardo Camargo Martinez" },
    { id: "cmc0t0os30000iaigoxy03waw", display: "Andre Martinez" },
    { id: "cmc9hwnuc0000js04zpjdyfeb", display: "Kauan Fernandes" },
    { id: "cmg18v4ni0000jp04lw9fqdi1", display: "Lincoln Marcondes" },
    { id: "cmiz5zzdv0000l404208mum30", display: "Vittor Ferraz" },
    { id: "cmazo6j870000ia0gw5ppb486", display: "Samuel" },
  ];

  useEffect(() => {
    async function fetchItem() {
      try {
        setIsLoading(true);
        const fetchFunction = isProcess ? getProcess : getUsers;
        const itemData = await fetchFunction("full", userId);
        if (!itemData || Array.isArray(itemData)) {
          throw new Error(isProcess ? "Processo não encontrado ou resposta inválida." : "Usuário não encontrado ou resposta inválida.");
        }
        setEditedCard({
          ...editedCard,
          ...itemData,
          attachments: editedCard.attachments
        });
        setLocalStatus({
          iniciado: itemData.status === "INICIADO" ||
            itemData.status === "AGUARDANDO_ASSINATURA" ||
            itemData.status === "SOLICITAR_DOCUMENTOS" ||
            itemData.status === "COLETA_DOCUMENTOS" ||
            itemData.status === "ANALISE_DOCUMENTOS" ||
            itemData.status === "PERICIAL" ||
            itemData.status === "AGUARDANDO_PERICIAL" ||
            itemData.status === "PAGAMENTO_HONORARIO" ||
            itemData.status === "PROCESSO_ENCERRADO",
          aguardandoAssinatura: itemData.status === "AGUARDANDO_ASSINATURA" ||
            itemData.status === "SOLICITAR_DOCUMENTOS" ||
            itemData.status === "COLETA_DOCUMENTOS" ||
            itemData.status === "ANALISE_DOCUMENTOS" ||
            itemData.status === "PERICIAL" ||
            itemData.status === "AGUARDANDO_PERICIAL" ||
            itemData.status === "PAGAMENTO_HONORARIO" ||
            itemData.status === "PROCESSO_ENCERRADO",
          solicitarDocumentos: itemData.status === "SOLICITAR_DOCUMENTOS" ||
            itemData.status === "COLETA_DOCUMENTOS" ||
            itemData.status === "ANALISE_DOCUMENTOS" ||
            itemData.status === "PERICIAL" ||
            itemData.status === "AGUARDANDO_PERICIAL" ||
            itemData.status === "PAGAMENTO_HONORARIO" ||
            itemData.status === "PROCESSO_ENCERRADO",
          coletaDocumentos: itemData.status === "COLETA_DOCUMENTOS" ||
            itemData.status === "ANALISE_DOCUMENTOS" ||
            itemData.status === "PERICIAL" ||
            itemData.status === "AGUARDANDO_PERICIAL" ||
            itemData.status === "PAGAMENTO_HONORARIO" ||
            itemData.status === "PROCESSO_ENCERRADO",
          analiseDocumentos: itemData.status === "ANALISE_DOCUMENTOS" ||
            itemData.status === "PERICIAL" ||
            itemData.status === "AGUARDANDO_PERICIAL" ||
            itemData.status === "PAGAMENTO_HONORARIO" ||
            itemData.status === "PROCESSO_ENCERRADO",
          pericial: itemData.status === "PERICIAL" ||
            itemData.status === "AGUARDANDO_PERICIAL" ||
            itemData.status === "PAGAMENTO_HONORARIO" ||
            itemData.status === "PROCESSO_ENCERRADO",
          aguardandoPericial: itemData.status === "AGUARDANDO_PERICIAL" ||
            itemData.status === "PAGAMENTO_HONORARIO" ||
            itemData.status === "PROCESSO_ENCERRADO",
          pagamentoHonorario: itemData.status === "PAGAMENTO_HONORARIO" ||
            itemData.status === "PROCESSO_ENCERRADO",
          processoEncerrado: itemData.status === "PROCESSO_ENCERRADO",
        });
        await fetchItemDocuments();
      } catch (error) {
        console.error(`Erro ao buscar ${isProcess ? 'processo' : 'usuário'}:`, error);
        setError(`Não foi possível carregar os dados do ${isProcess ? 'processo' : 'usuário'}.`);
      } finally {
        setIsLoading(false);
      }
    }
    if (open) {
      fetchItem();
    }
  }, [open, userId, isProcess]);
  useEffect(() => {
    const cep = editedCard?.cep?.replace(/\D/g, '');
    if (!cep || cep.length !== 8) return;
    async function fetchCEP() {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (data.erro) return;
        setEditedCard(prev => ({
          ...prev,
          rua: data.logradouro || '',
          bairro: data.bairro || ''
        }));
      } catch (err) {
        console.error(err);
      }
    }
    fetchCEP();
  }, [editedCard.cep]);
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };
  const handleDrop = async (acceptedFiles: File[]) => {
    try {
      const filesWithBase64 = await Promise.all(
        acceptedFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            name: file.name,
            type: file.type,
            base64,
          };
        })
      );
      setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
      setBase64Files((prevBase64Files) => [...prevBase64Files, ...filesWithBase64]);
    } catch (err) {
      console.error('Erro ao converter arquivos para Base64:', err);
      setError('Erro ao processar os arquivos.');
    }
  };
  const uploadFilesToS3 = async () => {
    if (!userId) {
      setError('Erro: ID não fornecido.');
      toast.error('ID não fornecido.');
      setUploading(false);
      return;
    }
    if (base64Files.length === 0) {
      setError('Nenhum arquivo selecionado para upload.');
      setUploading(false);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fileInfos = base64Files.map((file) => ({
        name: file.name,
        type: file.type,
      }));
      const response = await getPresignedUrls(fileInfos, userId, isProcess);
      if (!response.success || !response.presignedUrls) {
        throw new Error(response.error || 'Erro ao obter URLs pré-assinadas');
      }
      const uploadedFiles = await Promise.all(
        response.presignedUrls.map(async ({ fileName, url, key }) => {
          const file = base64Files.find((f) => f.name === fileName);
          if (!file) return null;
          const base64Data = file.base64.split(',')[1];
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: file.type });
          const res = await fetch(url, {
            method: 'PUT',
            body: blob,
            headers: {
              'Content-Type': file.type,
              'Content-Disposition': `attachment; filename="${fileName}"`,
            },
          });
          if (!res.ok) {
            throw new Error(`Erro ao fazer upload do arquivo ${fileName}`);
          }
          return { key, name: fileName };
        })
      );
      const validUploads = uploadedFiles.filter((file) => file !== null) as { key: string; name: string }[];
      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: isProcess ? userId : userId,
          processId: isProcess ? userId : null,
          documents: validUploads,
        }),
      })
        ;
      setItemDocuments((prev) => [...prev, ...validUploads]);
      await fetchItemDocuments();
      setFiles([]);
      setBase64Files([]);
    } catch (err: any) {
      console.error('Erro no upload:', err);
      setError('Erro ao fazer upload dos arquivos.');
      toast.error('Erro ao fazer upload dos arquivos: ' + err.message);
    } finally {
      setUploading(false);
    }
  };
  const fetchItemDocuments = async () => {
    try {
      const response = await fetch(`/api/documents?userId=${userId}&isProcess=${isProcess}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar documentos');
      }
      const documents = await response.json();
      setItemDocuments(documents);
    } catch (err) {
      console.error('Erro ao buscar documentos:', err);
      setError('Erro ao carregar documentos.');
    }
  };
  const handleDownload = async (key: string, fileName: string) => {
    try {
      setError(null);
      setDownloading(key);
      const response = await downloadFileFromS3(key, fileName);
      if (!response.success || !response.presignedUrl) {
        throw new Error(response.error || 'Erro ao obter URL pré-assinada');
      }
      window.location.href = response.presignedUrl;
    } catch (err: any) {
      console.error('Erro ao baixar arquivo:', err);
      setError('Erro ao obter URL para download: ' + err.message);
      toast.error('Erro ao obter URL para download: ' + err.message);
    } finally {
      setDownloading(null);
    }
  };
  const handleDeleteClick = (attachment: any) => {
    setDeletingId(attachment.id);
    setConfirmationDoc(true);
    setNameDocDelet(attachment.name);
  };
  const deletDocument = async (id: string) => {
    try {
      await deletDoc(id);
      setEditedCard((prev) => ({ ...prev, attachments: prev.attachments.filter((att) => att.id !== id) }));
      toast.success("Deletado com Sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao deletar o arquivo. Tente novamente.");
    } finally {
      setConfirmationDoc(false);
      setDeletingId(null);
    }
  };
  const handleEditClick = (attachment: any) => {
    setEditingId(attachment.id);
    setEditedName(attachment.name);
  };
  const newNameDoc = async (id: string) => {
    try {
      setSaving(id);
      await updateDocumentName({ id, newName: editedName });
      setEditedCard((prev) => ({
        ...prev,
        attachments: prev.attachments.map((att) =>
          att.id === id ? { ...att, name: editedName } : att
        )
      }));
    } catch (error) {
      console.error("Erro ao atualizar o nome:", error);
    } finally {
      setSaving(null);
      setEditingId(null);
    }
  };
  const procuracaoAutomatica = async () => {
    if (!editedCard) return;

    const res = await fetch("/api/procuracao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editedCard.id,
        type: isProcess ? "process" : "user",
      }),
    });

    const blob = await res.blob();

    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `procuracao-${editedCard.title}.docx`

    document.body.appendChild(a);
    a.click();

    a.remove();

    window.URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!editedCard) return;
    try {
      await uploadFilesToS3();
      const onlyRoleChanged = Object.keys(editedCard).every((key) => {
        const typedKey = key as keyof ExtendedKanbanCard;
        if (typedKey === "role") {
          return editedCard[typedKey] !== card[typedKey];
        }
        return editedCard[typedKey] === card[typedKey];
      });
      let updatedItem;
      if (onlyRoleChanged && editedCard.role !== card.role) {
        const updateRoleFunction = isProcess ? updateProcessRole : updateUserRole;
        updatedItem = await updateRoleFunction({
          userId: editedCard.id,
          newRole: editedCard.role || (isProcess ? "PROCESS" : "USER"),
        });
        updatedItem = {
          ...card,
          role: updatedItem.role,
          statusStartedAt: updatedItem.statusStartedAt
            ? updatedItem.statusStartedAt.toISOString()
            : null,
        };
      } else {
        const updatedData = {
          id: editedCard.id,
          name: editedCard.title !== card.title ? editedCard.title : undefined,
          cpf: editedCard.cpf !== card.cpf ? editedCard.cpf : undefined,
          data_nasc: editedCard.data_nasc !== card.data_nasc ? editedCard.data_nasc : undefined,
          email: editedCard.email !== card.email ? editedCard.email : undefined,
          rua: editedCard.rua !== card.rua ? editedCard.rua : undefined,
          bairro: editedCard.bairro !== card.bairro ? editedCard.bairro : undefined,
          numero: editedCard.numero !== card.numero ? editedCard.numero : undefined,
          cep: editedCard.cep !== card.cep ? editedCard.cep : undefined,
          rg: editedCard.rg !== card.rg ? editedCard.rg : undefined,
          nome_mae: editedCard.nome_mae !== card.nome_mae ? editedCard.nome_mae : undefined,
          telefone: editedCard.telefone !== card.telefone ? editedCard.telefone : undefined,
          cidade: editedCard.cidade !== card.cidade ? editedCard.cidade : undefined,
          estado: editedCard.estado !== card.estado ? editedCard.estado : undefined,
          estado_civil: editedCard.estado_civil !== card.estado_civil ? editedCard.estado_civil : undefined,
          profissao: editedCard.profissao !== card.profissao ? editedCard.profissao : undefined,
          nacionalidade: editedCard.nacionalidade !== card.nacionalidade ? editedCard.nacionalidade : undefined,
          data_acidente: editedCard.data_acidente !== card.data_acidente ? editedCard.data_acidente : undefined,
          atendimento_via: editedCard.atendimento_via !== card.atendimento_via ? editedCard.atendimento_via : undefined,
          hospital: editedCard.hospital !== card.hospital ? editedCard.hospital : undefined,
          outro_hospital: editedCard.outro_hospital !== card.outro_hospital ? editedCard.outro_hospital : undefined,
          lesoes: editedCard.lesoes !== card.lesoes ? editedCard.lesoes : undefined,
          status: determineStatus() !== card.status ? determineStatus() : undefined,
          role: editedCard.role !== card.role ? editedCard.role : undefined,
          nome_res: editedCard.nome_res !== card.nome_res ? editedCard.nome_res : undefined,
          rg_res: editedCard.rg_res !== card.rg_res ? editedCard.rg_res : undefined,
          cpf_res: editedCard.cpf_res !== card.cpf_res ? editedCard.cpf_res : undefined,
          estado_civil_res: editedCard.estado_civil_res !== card.estado_civil_res ? editedCard.estado_civil_res : undefined,
          profissao_res: editedCard.profissao_res !== card.profissao_res ? editedCard.profissao_res : undefined,
          obs: editedCard.obs !== card.obs ? editedCard.obs : undefined,
          service: editedCard.service !== card.service ? editedCard.service : undefined,
        };
        if (Object.values(updatedData).some((value) => value !== undefined && value !== updatedData.id)) {
          const updateFunction = isProcess ? updateProcess : updateUser;
          updatedItem = await updateFunction(updatedData);
        } else {
          updatedItem = card;
        }

      }
      onUpdate({ ...editedCard, ...updatedItem });
      setError(null);
      toast.success("Dados salvos com sucesso!");
      // setTimeout(() => {
      //   window.location.reload();
      // }, 500);
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      setError("Não foi possível salvar as alterações: " + error.message);
      toast.error("Não foi possível salvar as alterações: " + error.message);
    }
  };
  const determineStatus = () => {
    if (localStatus.processoEncerrado) return "PROCESSO_ENCERRADO";
    if (localStatus.pagamentoHonorario) return "PAGAMENTO_HONORARIO";
    if (localStatus.aguardandoPericial) return "AGUARDANDO_PERICIAL";
    if (localStatus.pericial) return "PERICIAL";
    if (localStatus.analiseDocumentos) return "ANALISE_DOCUMENTOS";
    if (localStatus.coletaDocumentos) return "COLETA_DOCUMENTOS";
    if (localStatus.solicitarDocumentos) return "SOLICITAR_DOCUMENTOS";
    if (localStatus.aguardandoAssinatura) return "AGUARDANDO_ASSINATURA";
    if (localStatus.iniciado) return "INICIADO";
    return editedCard.status;
  };
  const handleCheckboxChange = (key: keyof typeof localStatus) => {
    setLocalStatus((prev) => {
      const newStatus = { ...prev };
      switch (key) {
        case "iniciado":
          newStatus.iniciado = !prev.iniciado;
          if (!newStatus.iniciado) {
            newStatus.aguardandoAssinatura = false;
            newStatus.solicitarDocumentos = false;
            newStatus.coletaDocumentos = false;
            newStatus.analiseDocumentos = false;
            newStatus.pericial = false;
            newStatus.aguardandoPericial = false;
            newStatus.pagamentoHonorario = false;
            newStatus.processoEncerrado = false;
          }
          break;
        case "aguardandoAssinatura":
          if (prev.iniciado) {
            newStatus.aguardandoAssinatura = !prev.aguardandoAssinatura;
            if (!newStatus.aguardandoAssinatura) {
              newStatus.solicitarDocumentos = false;
              newStatus.coletaDocumentos = false;
              newStatus.analiseDocumentos = false;
              newStatus.pericial = false;
              newStatus.aguardandoPericial = false;
              newStatus.pagamentoHonorario = false;
              newStatus.processoEncerrado = false;
            }
          }
          break;
        case "solicitarDocumentos":
          if (prev.aguardandoAssinatura) {
            newStatus.solicitarDocumentos = !prev.solicitarDocumentos;
            if (!newStatus.solicitarDocumentos) {
              newStatus.coletaDocumentos = false;
              newStatus.analiseDocumentos = false;
              newStatus.pericial = false;
              newStatus.aguardandoPericial = false;
              newStatus.pagamentoHonorario = false;
              newStatus.processoEncerrado = false;
            }
          }
          break;
        case "coletaDocumentos":
          if (prev.solicitarDocumentos) {
            newStatus.coletaDocumentos = !prev.coletaDocumentos;
            if (!newStatus.coletaDocumentos) {
              newStatus.analiseDocumentos = false;
              newStatus.pericial = false;
              newStatus.aguardandoPericial = false;
              newStatus.pagamentoHonorario = false;
              newStatus.processoEncerrado = false;
            }
          }
          break;
        case "analiseDocumentos":
          if (prev.coletaDocumentos) {
            newStatus.analiseDocumentos = !prev.analiseDocumentos;
            if (!newStatus.analiseDocumentos) {
              newStatus.pericial = false;
              newStatus.aguardandoPericial = false;
              newStatus.pagamentoHonorario = false;
              newStatus.processoEncerrado = false;
            }
          }
          break;
        case "pericial":
          if (prev.analiseDocumentos) {
            newStatus.pericial = !prev.pericial;
            if (!newStatus.pericial) {
              newStatus.aguardandoPericial = false;
              newStatus.pagamentoHonorario = false;
              newStatus.processoEncerrado = false;
            }
          }
          break;
        case "aguardandoPericial":
          if (prev.pericial) {
            newStatus.aguardandoPericial = !prev.aguardandoPericial;
            if (!newStatus.aguardandoPericial) {
              newStatus.pagamentoHonorario = false;
              newStatus.processoEncerrado = false;
            }
          }
          break;
        case "pagamentoHonorario":
          if (prev.aguardandoPericial) {
            newStatus.pagamentoHonorario = !prev.pagamentoHonorario;
            if (!newStatus.pagamentoHonorario) {
              newStatus.processoEncerrado = false;
            }
          }
          break;
        case "processoEncerrado":
          if (prev.pagamentoHonorario) {
            newStatus.processoEncerrado = !prev.processoEncerrado;
          }
          break;
      }
      return newStatus;
    });
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditedCard(prev => ({ ...prev, [name]: value }));
  };
  const handleSelectChange = (name: string, value: string) => {
    setEditedCard(prev => ({ ...prev, [name]: value }));
  };
  async function handleAddComment() {
    if (!newComment.trim()) return;

    try {
      await createComment({
        text: newComment,
        ...(isProcess
          ? { processId: editedCard.id }
          : { userId: editedCard.id }),
      });

      setNewComment('');
      mutate();
      toast.success("Comentário adicionado!");
    } catch (error) {
      console.error(error);
      toast.error("Falha ao enviar comentário.");
    }
  }

  const getColorFromId = (id: string) => {
  const colors = [
    {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      border: 'border-blue-300',
    },
    {
      bg: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-300',
    },
    {
      bg: 'bg-purple-100',
      text: 'text-purple-800',
      border: 'border-purple-300',
    },
    {
      bg: 'bg-pink-100',
      text: 'text-pink-800',
      border: 'border-pink-300',
    },
    {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      border: 'border-yellow-300',
    },
    {
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-300',
    },
    {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      border: 'border-blue-300',
    },
    {
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-300',
    },
  ];

  // Gera um número baseado no ID
  let hash = 0;

  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % colors.length;

  return colors[index];
};


  const mentionRegex = /@\[(.+?)\]\((.+?)\)/g;

  const renderCommentText = (text: string) => {
  const parts = [];
  let lastIndex = 0;

  for (const match of text.matchAll(mentionRegex)) {
    const [full, display, id] = match;
    const index = match.index ?? 0;

    const color = getColorFromId(id);

    parts.push(text.slice(lastIndex, index));

    parts.push(
      <Badge
        key={id}
        variant="secondary"
        className={`mx-1 ${color.bg} ${color.text} ${color.border}`}
      >
        @{display}
      </Badge>
    );

    lastIndex = index + full.length;
  }

  parts.push(text.slice(lastIndex));
  return parts;
};


  const mentionsStyles = {
    control: {
      backgroundColor: '#fff',
      fontSize: 14,
      fontWeight: 'normal',
    },
    '&multiLine': {
      control: {
        fontFamily: 'inherit',
        minHeight: 80,
      },
      highlighter: {
        padding: 9,
        border: '1px solid transparent',
      },
      input: {
        padding: 9,
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        outline: 'none',
      },
    },
    suggestions: {
      list: {
        backgroundColor: 'white',
        border: '1px solid rgba(0,0,0,0.15)',
        fontSize: 14,
        borderRadius: '0.5rem',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      },
      item: {
        padding: '8px 12px',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        '&focused': {
          backgroundColor: '#eff6ff',
          color: '#1d4ed8',
        },
      },
    },
  };

  const solicitarProntuario = () => {
    const nomeHospital = editedCard?.hospital || "hospital";
    const nomeCliente = editedCard?.title || "cliente";
    const cpfCliente = editedCard?.cpf || "";
    const mensagem = `
      Olá Hospital ${nomeHospital},
      Estamos entrando em contato para solicitar informações e o prontuário referente ao paciente:
      Nome: ${nomeCliente}
      CPF: ${cpfCliente}
      Necessitamos desses dados para continuidade do processo administrativo/jurídico.
      Agradecemos desde já pelo retorno.
    `;
    const assunto = `Solicitação de Prontuário - ${nomeCliente}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=&su=${encodeURIComponent(
      assunto
    )}&body=${encodeURIComponent(mensagem)}&authuser=N`;
    window.open(gmailUrl, "_blank");
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto flex flex-col" autoFocus={false}>
        <DialogHeader>
          <DialogTitle>{editedCard.title}</DialogTitle>
          <DialogDescription>
            Edição detalhada do processo
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="details" className="flex-1 overflow-y-auto flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="checklist">Progresso</TabsTrigger>
            <TabsTrigger value="files">Arquivos</TabsTrigger>
            <TabsTrigger value="comments">Comentários</TabsTrigger>
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
          </TabsList>
            <TabsContent value="details" className="space-y-4 px-1">
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Nome</Label>
                  <Input
                    id="title"
                    name="title"
                    value={editedCard.title}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input
                    id="cpf"
                    name="cpf"
                    value={editedCard.cpf || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data_nasc">Data Nascimento</Label>
                  <Input
                    id="data_nasc"
                    name="data_nasc"
                    type="date"
                    value={editedCard.data_nasc || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    value={editedCard.email || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    name="cep"
                    value={editedCard.cep || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rua">Rua</Label>
                  <Input
                    id="rua"
                    name="rua"
                    value={editedCard.rua || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input
                    id="bairro"
                    name="bairro"
                    value={editedCard.bairro || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    name="numero"
                    value={editedCard.numero || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    name="cidade"
                    value={editedCard.cidade || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rg">RG</Label>
                  <Input
                    id="rg"
                    name="rg"
                    value={editedCard.rg || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    name="telefone"
                    value={editedCard.telefone || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado">Estado</Label>
                  <select
                    id="estado"
                    value={editedCard.estado || ''}
                    onChange={(e) => handleSelectChange('estado', e.target.value)}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione o estado</option>
                    <option value="Paraná">Paraná</option>
                    <option value="Santa Catarina">Santa Catarina</option>
                    <option value="São Paulo">São Paulo</option>
                    <option value="Rio Grande do Sul">Rio Grande do Sul</option>
                    <option value="Mato Grosso">Mato Grosso</option>
                    <option value="Mato Grosso do Sul">Mato Grosso do Sul</option>
                    <option value="Rio de Janeiro">Rio de Janeiro</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estado_civil">Estado Civil</Label>
                  <select
                    id="estado_civil"
                    value={editedCard.estado_civil || ''}
                    onChange={(e) => handleSelectChange('estado_civil', e.target.value)}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione o estado civil</option>
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="União Estável">União Estável</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profissao">Profissão</Label>
                  <Input
                    id="profissao"
                    name="profissao"
                    value={editedCard.profissao || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nacionalidade">Nacionalidade</Label>
                  <select
                    id="nacionalidade"
                    value={editedCard.nacionalidade || ''}
                    onChange={(e) => handleSelectChange('nacionalidade', e.target.value)}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione a nacionalidade</option>
                    <option value="Brasileiro(a)">Brasileiro(a)</option>
                    <option value="Venezuelano(a)">Venezuelano(a)</option>
                    <option value="Colombiano(a)">Colombiano(a)</option>
                    <option value="Uruguaio(a)">Uruguaio(a)</option>
                    <option value="Argentino(a)">Argentino(a)</option>
                    <option value="Peruano(a)">Peruano(a)</option>
                    <option value="Boliviano(a)">Boliviano(a)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Etiquetas (Role)</Label>
                  <select
                    id="role"
                    value={editedCard.role || ''}
                    onChange={(e) => handleSelectChange('role', e.target.value)}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione uma etiqueta</option>
                    <option value="Filtro de Cartões">Filtro de Cartões</option>
                    <option value="Gerar Procuração Automática">Gerar Procuração Automática</option>
                    <option value="Coletar Assinatura em Cartório">Coletar Assinatura em Cartório</option>
                    <option value="Coletar Assinatura Digital">Coletar Assinatura Digital</option>
                    <option value="Agendar Coleta com Motoboy">Agendar Coleta com Motoboy</option>
                    <option value="Acompanhar Rota do Motoboy">Acompanhar Rota do Motoboy</option>
                    <option value="Fazer Protocolo no Hospital">Fazer Protocolo no Hospital</option>
                    <option value="Protocolar Pasta – Hospital Presencial">Protocolar Pasta – Hospital Presencial</option>
                    <option value="Solicitar Prontuário por E-mail">Solicitar Prontuário por E-mail</option>
                    <option value="Solicitar Prontuário Cajuru por E-mail">Solicitar Prontuário Cajuru por E-mail</option>
                    <option value="Acompanhar Cajuru – Solicitado">Acompanhar Cajuru – Solicitado</option>
                    <option value="Solicitar Prontuário – Outros Hospitais">Solicitar Prontuário – Outros Hospitais</option>
                    <option value="Acompanhar Prontuário – Outros Solicitados">Acompanhar Prontuário – Outros Solicitados</option>
                    <option value="Solicitar Prontuário – Ponta Grossa">Solicitar Prontuário – Ponta Grossa</option>
                    <option value="Aguardar Prontuário – Recebimento Online">Aguardar Prontuário – Recebimento Online</option>
                    <option value="Aguardar Prontuário PG – Recebimento Online">Aguardar Prontuário PG – Recebimento Online</option>
                    <option value="Aguardar Prontuário PG – Presencial">Aguardar Prontuário PG – Presencial</option>
                    <option value="Aguardar Retirada de Prontuário – Presencial">Aguardar Retirada de Prontuário – Presencial</option>
                    <option value="Retirar Prontuário – Pronto para Retirar">Retirar Prontuário – Pronto para Retirar</option>
                    <option value="Solicitar B.O. ao Cliente – Acidente">Solicitar B.O. ao Cliente – Acidente</option>
                    <option value="Solicitar Siate">Solicitar Siate</option>
                    <option value="Aguardar Retorno do Siate">Aguardar Retorno do Siate</option>
                    <option value="Enviar Mensagem – Previdenciário">Enviar Mensagem – Previdenciário</option>
                    <option value="Registrar Óbito – Nova Lei">Registrar Óbito – Nova Lei</option>
                    <option value="Protocolar SPVAT">Protocolar SPVAT</option>
                    <option value="Protocolar DPVAT – Caixa">Protocolar DPVAT – Caixa</option>
                    <option value="Enviar para Reanálise">Enviar para Reanálise</option>
                    <option value="Manter SPVAT em Standby">Manter SPVAT em Standby</option>
                    <option value="Aguardar Análise da Caixa">Aguardar Análise da Caixa</option>
                    <option value="Acompanhar Pendências – Protocolado">Acompanhar Pendências – Protocolado</option>
                    <option value="Protocolar Pendência de B.O.">Protocolar Pendência de B.O.</option>
                    <option value="Avisar Sobre Perícia Administrativa">Avisar Sobre Perícia Administrativa</option>
                    <option value="Aguardar Resultado da Perícia">Aguardar Resultado da Perícia</option>
                    <option value="Cobrar Honorários – Resultado Perícia">Cobrar Honorários – Resultado Perícia</option>
                    <option value="Aguardar Pagamento – Honorários Cobrados">Aguardar Pagamento – Honorários Cobrados</option>
                    <option value="Encerrar Processo – DPVAT">Encerrar Processo – DPVAT</option>
                    <option value="Descartaveis">Descartaveis</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service">Serviços</Label>
                  <select
                    id="service"
                    value={editedCard.service || ''}
                    onChange={(e) => handleSelectChange('service', e.target.value)}
                    className="w-full h-10 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione um serviço</option>
                    <option value="INSS">INSS</option>
                    <option value="Seguro de Vida">Seguro de Vida</option>
                    <option value="RCF">RCF</option>
                    <option value="DPVAT">DPVAT</option>
                    <option value="SPVAT">SPVAT</option>
                    <option value="TRABALHISTA">TRABALHISTA</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="obs">Observação</Label>
                  <Input
                    id="obs"
                    name="obs"
                    value={editedCard.obs || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="nome_mae">Nome da Mãe</Label>
                  <Input
                    id="nome_mae"
                    name="nome_mae"
                    value={editedCard.nome_mae || ''}
                    onChange={handleInputChange}
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                  />
                </div>
              </div>
              <Separator />
              <div className='py-2 rounded-xl'>
                <h1 className='font-bold'>Dados do Acidente</h1>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="data_acidente">Data do Acidente</Label>
                    <Input
                      id="data_acidente"
                      name="data_acidente"
                      type="date"
                      value={editedCard.data_acidente || ''}
                      onChange={handleInputChange}
                      className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="atendimento_via">Atendimento Via</Label>
                    <select
                      id="atendimento_via"
                      value={editedCard.atendimento_via || ''}
                      onChange={(e) => handleSelectChange('atendimento_via', e.target.value)}
                      className="w-full h-10 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Selecione o atendimento via</option>
                      <option value="Siate">SIATE</option>
                      <option value="Samu">SAMU/OUTRAS AMBULÂNCIAS</option>
                      <option value="Procura_Direta">PROCURA DIRETA</option>
                      <option value="Arteris">ARTERIS</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hospital">Hospital</Label>
                    <Input
                      id="hospital"
                      name="hospital"
                      value={editedCard.hospital || ''}
                      onChange={handleInputChange}
                      className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="outro_hospital">Outro Hospital</Label>
                    <Input
                      id="outro_hospital"
                      name="outro_hospital"
                      value={editedCard.outro_hospital || ''}
                      onChange={handleInputChange}
                      className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="lesoes">Lesões</Label>
                    <Input
                      id="lesoes"
                      name="lesoes"
                      value={editedCard.lesoes || ''}
                      onChange={handleInputChange}
                      className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 bg-gray-50"
                    />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status Atual</Label>
                  <Input id="status" value={editedCard.status} disabled />
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Criado: {editedCard.createdAt.toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>Atualizado: {editedCard.updatedAt.toLocaleDateString()}</span>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="checklist" className="space-y-4 px-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Progressão de Status</Label>
                  <Badge variant="outline">
                    {Object.values(localStatus).filter(Boolean).length}
                  </Badge>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(Object.values(localStatus).filter(Boolean).length / 9) * 100}%` }}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="iniciado"
                    checked={localStatus.iniciado}
                    onCheckedChange={() => handleCheckboxChange('iniciado')}
                  />
                  <Label htmlFor="iniciado">Processo iniciado</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="aguardandoAssinatura"
                    checked={localStatus.aguardandoAssinatura}
                    onCheckedChange={() => handleCheckboxChange("aguardandoAssinatura")}
                    disabled={!localStatus.iniciado}
                  />
                  <Label htmlFor="aguardandoAssinatura" className="text-sm text-gray-700 whitespace-nowrap">
                    Aguardando assinatura
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="solicitarDocumentos"
                    checked={localStatus.solicitarDocumentos}
                    onCheckedChange={() => handleCheckboxChange("solicitarDocumentos")}
                    disabled={!localStatus.aguardandoAssinatura}
                  />
                  <Label htmlFor="solicitarDocumentos" className="text-sm text-gray-700 whitespace-nowrap">
                    Fase de solicitação de documentos
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="coletaDocumentos"
                    checked={localStatus.coletaDocumentos}
                    onCheckedChange={() => handleCheckboxChange("coletaDocumentos")}
                    disabled={!localStatus.solicitarDocumentos}
                  />
                  <Label htmlFor="coletaDocumentos" className="text-sm text-gray-700 whitespace-nowrap">
                    Coleta de documentos
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="analiseDocumentos"
                    checked={localStatus.analiseDocumentos}
                    onCheckedChange={() => handleCheckboxChange("analiseDocumentos")}
                    disabled={!localStatus.coletaDocumentos}
                  />
                  <Label htmlFor="analiseDocumentos" className="text-sm text-gray-700 whitespace-nowrap">
                    Análise de documentos
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pericial"
                    checked={localStatus.pericial}
                    onCheckedChange={() => handleCheckboxChange("pericial")}
                    disabled={!localStatus.analiseDocumentos}
                  />
                  <Label htmlFor="pericial" className="text-sm text-gray-700 whitespace-nowrap">
                    Fase Pericial
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="aguardandoPericial"
                    checked={localStatus.aguardandoPericial}
                    onCheckedChange={() => handleCheckboxChange("aguardandoPericial")}
                    disabled={!localStatus.pericial}
                  />
                  <Label htmlFor="aguardandoPericial" className="text-sm text-gray-700 whitespace-nowrap">
                    Aguardando resultado pericial
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pagamentoHonorario"
                    checked={localStatus.pagamentoHonorario}
                    onCheckedChange={() => handleCheckboxChange("pagamentoHonorario")}
                    disabled={!localStatus.aguardandoPericial}
                  />
                  <Label htmlFor="pagamentoHonorario" className="text-sm text-gray-700 whitespace-nowrap">
                    Pagamento de honorários
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="processoEncerrado"
                    checked={localStatus.processoEncerrado}
                    onCheckedChange={() => handleCheckboxChange("processoEncerrado")}
                    disabled={!localStatus.pagamentoHonorario}
                  />
                  <Label htmlFor="processoEncerrado" className="text-sm text-gray-700 whitespace-nowrap">
                    Processo encerrado
                  </Label>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="files" className="space-y-4 px-1">
              <Dropzone onDrop={handleDrop} src={files} onError={console.error} className="w-full">
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>
              {uploading && <p className="text-sm">Enviando arquivos...</p>}
              {error && <p className="text-red-500 text-sm">{error}</p>}
              {files.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-muted">
                        <th className="p-2 border">Nome do Arquivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file, index) => (
                        <tr key={index} className="border-b">
                          <td className="p-2 border truncate max-w-[150px] sm:max-w-[200px]">{file.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Separator />
              <div className="space-y-2">
                <Label>Arquivos Anexados ({itemDocuments.length})</Label>
                {itemDocuments.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-3 font-medium">Nome do Arquivo</th>
                          <th className="text-right p-3 font-medium w-32">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {itemDocuments.map((doc: any) => (
                          <tr key={doc.id} className="hover:bg-gray-50">
                            <td className="p-3">
                              {editingId === doc.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={editedName}
                                    onChange={(e) => setEditedName(e.target.value)}
                                    className="h-8 text-sm"
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => newNameDoc(doc.id)}
                                    disabled={saving === doc.id}
                                  >
                                    {saving === doc.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      "Salvar"
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingId(null);
                                      setEditedName('');
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <span className="block truncate max-w-md">{doc.name}</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {editingId !== doc.id && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEditClick(doc)}
                                      className="h-8 w-8"
                                    >
                                      <CiEdit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDownload(doc.key, doc.name)}
                                      disabled={downloading === doc.key}
                                      className="h-8 w-8"
                                    >
                                      {downloading === doc.key ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Download className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500 hover:text-red-600"
                                      onClick={() => handleDeleteClick(doc)}
                                    >
                                      <Trash className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                    Nenhum documento encontrado
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="comments" className="space-y-6 px-10 pt-6">
              <div className="space-y-4">
                <div className="space-y-2 relative">
                  <Label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare className="w-3 h-3" />
                    Novo Comentário / Discussão
                  </Label>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-visible focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                    <MentionsInput
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Comente e use @ para mencionar membros da equipe..."
                      style={mentionsStyles}
                    >
                      <Mention
                        trigger="@"
                        data={users}
                        markup="@[__display__](__id__)"
                        displayTransform={(id, display) => `@${display}`}
                        renderSuggestion={(suggestion: any) => (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold">
                              {suggestion.display.charAt(0)}
                            </div>
                            <span className="font-semibold text-sm">{suggestion.display}</span>
                          </div>
                        )}
                        appendSpaceOnAdd={true}
                      />
                    </MentionsInput>
                    <div className="bg-gray-50 px-3 py-2 border-t flex items-center justify-between">
                      <Button onClick={handleAddComment} size="sm" className="bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-200 h-8 px-4">
                        <Send className="w-3 h-3 mr-2" />
                        Publicar
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator className="bg-gray-100" />

                <div className="space-y-6 max-h-[400px]">
                  {comments.length === 0 ? (
                    <div className="text-center py-16 opacity-40">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3" />
                      <p className="font-bold">Sem discussões</p>
                      <p className="text-sm">Seja o primeiro a comentar neste processo.</p>
                    </div>
                  ) : (
                    comments.map((comment: any) => (
                      <div key={comment.id} >
                        <div className="flex gap-4">
                          <Avatar className="w-10 h-10 border shadow-sm ">
                            <AvatarFallback className="bg-blue-50 text-blue-600 font-bold text-xs uppercase">
                              {typeof comment.author === 'string' ? comment.author.charAt(0) : 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h5 className="text-sm font-black text-gray-900 flex items-center gap-2">
                                {typeof comment.author === 'string' ? comment.author : (comment.author as any).name}
                                <Badge variant="secondary" className="text-[9px] h-4 bg-gray-100 font-bold uppercase tracking-widest border-none">MEMBRO</Badge>
                              </h5>
                              <div className="flex items-center gap-2 text-gray-400">
                                <Clock className="w-3 h-3" />
                                <span className="text-[11px] font-medium">{comment.createdAt.toLocaleString('pt-BR')}</span>
                              </div>
                            </div>
                            <div className="bg-gray-50/80 p-4 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm group-hover:bg-white transition-all">
                              <p className="text-sm text-gray-700 leading-relaxed">
                                {renderCommentText(comment.text)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="integrations" className="space-y-6 pt-6">
              <div className="grid grid-cols-1 gap-4">
                
                <div className="group bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-6 hover:shadow-xl hover:shadow-indigo-100/50 transition-all relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/20 rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-500"></div>
                  
                  <div className="flex items-center gap-4 mb-6 relative z-10">
                    <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
                      <IoIosDocument className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-lg font-black text-indigo-950">Geração de Procuração</h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-1 gap-3 relative z-10">
                    <Button 
                      onClick={procuracaoAutomatica} 
                      className="bg-indigo-800 hover:bg-indigo-950 text-white font-bold h-12 rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95"
                    >
                      <IoIosDocument className="w-4 h-4 mr-2" />
                      Gerar Procuração
                    </Button>
                  </div>
                </div>

                {/* Ações de Comunicação */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Email Marketing / Solicitação */}
                  <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-blue-400 transition-all shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <Mail className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h5 className="font-bold text-gray-900 text-sm">Gestão de Prontuários</h5>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Via Gmail / Outlook</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <p className="text-[11px] text-gray-500 leading-tight">
                          Envia uma solicitação formal de prontuário para o cliente/unidade.
                        </p>
                      </div>
                      <Button 
                        onClick={() => alert('Solicitando Prontuário por Email...')}
                        disabled
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg"
                        size="sm"
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Solicitar Prontuário
                      </Button>
                    </div>
                  </div>

                  {/* WhatsApp Contextual */}
                  <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-green-400 transition-all shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                        <MessageCircle className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h5 className="font-bold text-gray-900 text-sm">WhatsApp Inteligente</h5>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Status: {editedCard.status}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <p className="text-[11px] text-gray-500 leading-tight">
                          Envia mensagem baseada na etapa: <span className="font-bold text-green-700">{editedCard.status}</span>
                        </p>
                      </div>
                      <Button 
                        onClick={() => alert(`Enviando WhatsApp para etapa: ${editedCard.status}`)}
                        disabled
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
                        size="sm"
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Enviar Status Atual
                      </Button>
                    </div>
                  </div>
                </div>
                </div>
            </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar Alterações
          </Button>
        </div>
      </DialogContent>
      <Dialog open={confirmationDoc} onOpenChange={setConfirmationDoc}>
        <DialogContent className="w-[70%] h-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="w-[90%]">{`Você quer deletar o documento "${nameDocDelet}"?`}</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja deletar? Essa ação é irreversível.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-3">
            <DialogClose asChild>
              <Button variant="secondary" className="w-full">
                Voltar
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  if (deletingId) deletDocument(deletingId);
                }}
              >
                Confirmar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};