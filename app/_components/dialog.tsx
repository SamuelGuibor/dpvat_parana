/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/_components/ui/alert-dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/_components/ui/select";
import { getUsers } from "@/app/_actions/get-user";
import { getProcess } from "@/app/_actions/get-process";
import { updateUser } from "@/app/_actions/update-users";
import { updateProcess } from "@/app/_actions/update-process"; // Assumed to exist
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "./dropzone";
import { Button } from "./ui/button";
import { getPresignedUrls } from '@/app/_actions/uploadS3';
import { downloadFileFromS3 } from '@/app/_actions/downloadS3';
import { Download, Loader2, Trash } from 'lucide-react';
import { toast } from "sonner";
import { updateProcessRole } from "../_actions/statusTimerProcess"; // Assumed to exist
import { updateUserRole } from "../_actions/statusTimer";
import { ToggleFixedButton } from "./toggle";
import { toggleFixed } from "../_actions/uploadStatusFixed";
import { updateDocumentName } from "../_actions/updateNameDoc";
import { CiEdit } from "react-icons/ci";
import { deletDoc } from "../_actions/delet_document";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import doc from "pdfkit";

interface ItemData {
  id: string;
  name: string;
  status?: string;
  type: string;
  role?: string;
  nome_res?: string;
  rg_res?: string;
  cpf_res?: string;
  estado_civil_res?: string;
  statusStartedAt?: string | null;
  profissao_res?: string;
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
  service?: string;
  obs?: string;
  fixed?: boolean;
}

interface UpdateItemData {
  id: string;
  name?: string;
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
  status?: string;
  role?: string;
  nome_res?: string;
  rg_res?: string;
  cpf_res?: string;
  estado_civil_res?: string;
  profissao_res?: string;
  obs?: string;
  service?: string;
}

interface FileWithBase64 {
  name: string;
  type: string;
  base64: string;
}

interface DialogDashProps {
  userId: string;
  isProcess?: boolean;
  trigger: React.ReactNode;
}

interface Fixed {
  userId: string,
  fixed?: boolean
}

const DialogDash = ({ userId, isProcess = false, trigger }: DialogDashProps) => {
  const [isOpen, setIsOpen] = useState(false); // State to track if dialog is open
  const [item, setItem] = useState<ItemData | null>(null);
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
  const [formData, setFormData] = useState<ItemData | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [base64Files, setBase64Files] = useState<FileWithBase64[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDocument, setIsDocument] = useState(true);
  const [itemDocuments, setItemDocuments] = useState<{ id?: string; key: string; name: string }[]>([]);
  const [fixed, setFixed] = useState<Fixed | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmationDoc, setConfirmation] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [nameDocDelet, setNameDocDelet] = useState<string | null>(null);

  const handleDeleteClick = (doc: any) => {
    setDeletingId(doc.id);
    setConfirmation(true);
    setNameDocDelet(doc.name)
  };

  const deletDocument = async (id: string) => {
    try {
      await deletDoc(id);
      setItemDocuments((prevDocuments) =>
        prevDocuments.filter((doc) => doc.id !== id)
      );
      toast.success("Deletado com Sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao deletar o arquivo. Tente novamente.");
    } finally {
      setConfirmation(false);
      setDeletingId(null);
    }
  };

  const handleEditClick = (doc: any) => {
    console.log(doc.id)
    console.log(doc.name)
    setEditingId(doc.id);
    setEditedName(doc.name);
  };


  const newNameDoc = async (id: string) => {
    try {
      setSaving(id);
      await updateDocumentName({ id, newName: editedName });

      // Optimistically update the local state to reflect the new name immediately
      setItemDocuments((prevDocuments) =>
        prevDocuments.map((doc) =>
          doc.id === id ? { ...doc, name: editedName } : doc
        )
      );
    } catch (error) {
      console.error("Erro ao atualizar o nome:", error);
      // Optional: Revert the optimistic update on error if needed, or show a toast
    } finally {
      setSaving(null);
      setEditingId(null); // Always exit edit mode
    }
  };

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
          userId,
          isProcess,
          documents: validUploads,
        }),
      });

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

  const sendToZapier = async () => {
    try {
      if (!formData) {
        return false;
      }

      const payload = {
        name: formData.name,
        cpf: formData.cpf,
        rg: formData.rg,
        data_nasc: formData.data_nasc,
        nome_mae: formData.nome_mae,
        telefone: formData.telefone,
        email: formData.email,
        estado_civil: formData.estado_civil,
        profissao: formData.profissao,
        data_acidente: formData.data_acidente,
        atendimento_via: formData.atendimento_via,
        hospital: formData.hospital,
        outro_hospital: formData.outro_hospital,
        lesoes: formData.lesoes,
        rua: formData.rua,
        numero: formData.numero,
        cep: formData.cep,
        bairro: formData.bairro,
        cidade: formData.cidade,
        nacionalidade: formData.nacionalidade,
        estado: formData.estado,
        isProcess,
      };

      await fetch("/api/zapier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("Erro ao enviar para Zapier:", err);
      setError("Erro ao enviar dados para Zapier.");
      toast.error("Erro ao enviar dados para Zapier.");
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

  useEffect(() => {
    async function fetchItem() {
      try {
        setIsLoading(true);
        const fetchFunction = isProcess ? getProcess : getUsers;
        const itemData = await fetchFunction("full", userId);
        if (!itemData || Array.isArray(itemData)) {
          throw new Error(isProcess ? "Processo não encontrado ou resposta inválida." : "Usuário não encontrado ou resposta inválida.");
        }
        setItem(itemData);
        setFormData(itemData);
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
    if (isOpen) {
      fetchItem();
    }
  }, [isOpen, userId, isProcess]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => (prev ? { ...prev, [name]: value } : null));
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
    return undefined;
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

  const handleSave = async () => {
    if (!item || !formData) return;

    try {
      // Upload files to S3 first, if any
      await uploadFilesToS3();

      // Check if only the role has changed
      const onlyRoleChanged = Object.keys(formData).every((key) => {
        const typedKey = key as keyof ItemData;
        if (typedKey === "role") {
          return formData[typedKey] !== item[typedKey];
        }
        return formData[typedKey] === item[typedKey];
      });

      let updatedItem;
      if (onlyRoleChanged && formData.role !== item.role) {
        const updateRoleFunction = isProcess ? updateProcessRole : updateUserRole;
        updatedItem = await updateRoleFunction({
          userId: formData.id,
          newRole: formData.role || (isProcess ? "PROCESS" : "USER"),
        });
        updatedItem = {
          ...item,
          role: updatedItem.role,
          type: updatedItem.role || (isProcess ? "PROCESS" : "USER"),
          statusStartedAt: updatedItem.statusStartedAt
            ? updatedItem.statusStartedAt.toISOString()
            : null,
        };
      } else {
        // Call update function for other changes
        const updatedData: UpdateItemData = {
          id: formData.id,
          name: formData.name !== item.name ? formData.name : undefined,
          cpf: formData.cpf !== item.cpf ? formData.cpf : undefined,
          data_nasc: formData.data_nasc !== item.data_nasc ? formData.data_nasc : undefined,
          email: formData.email !== item.email ? formData.email : undefined,
          rua: formData.rua !== item.rua ? formData.rua : undefined,
          bairro: formData.bairro !== item.bairro ? formData.bairro : undefined,
          numero: formData.numero !== item.numero ? formData.numero : undefined,
          cep: formData.cep !== item.cep ? formData.cep : undefined,
          rg: formData.rg !== item.rg ? formData.rg : undefined,
          nome_mae: formData.nome_mae !== item.nome_mae ? formData.nome_mae : undefined,
          telefone: formData.telefone !== item.telefone ? formData.telefone : undefined,
          cidade: formData.cidade !== item.cidade ? formData.cidade : undefined,
          estado: formData.estado !== item.estado ? formData.estado : undefined,
          estado_civil: formData.estado_civil !== item.estado_civil ? formData.estado_civil : undefined,
          profissao: formData.profissao !== item.profissao ? formData.profissao : undefined,
          nacionalidade: formData.nacionalidade !== item.nacionalidade ? formData.nacionalidade : undefined,
          data_acidente: formData.data_acidente !== item.data_acidente ? formData.data_acidente : undefined,
          atendimento_via: formData.atendimento_via !== item.atendimento_via ? formData.atendimento_via : undefined,
          hospital: formData.hospital !== item.hospital ? formData.hospital : undefined,
          outro_hospital: formData.outro_hospital !== item.outro_hospital ? formData.outro_hospital : undefined,
          lesoes: formData.lesoes !== item.lesoes ? formData.lesoes : undefined,
          status: determineStatus() !== item.status ? determineStatus() : undefined,
          role: formData.role !== item.role ? formData.role : undefined,
          nome_res: formData.nome_res !== item.nome_res ? formData.nome_res : undefined,
          rg_res: formData.rg_res !== item.rg_res ? formData.rg_res : undefined,
          cpf_res: formData.cpf_res !== item.cpf_res ? formData.cpf_res : undefined,
          estado_civil_res: formData.estado_civil_res !== item.estado_civil_res ? formData.estado_civil_res : undefined,
          profissao_res: formData.profissao_res !== item.profissao_res ? formData.profissao_res : undefined,
          obs: formData.obs !== item.obs ? formData.obs : undefined,
          service: formData.service !== item.service ? formData.service : undefined,
        };

        // Only call update if there are changes to save
        if (Object.values(updatedData).some((value) => value !== undefined && value !== updatedData.id)) {
          const updateFunction = isProcess ? updateProcess : updateUser;
          updatedItem = await updateFunction(updatedData);
        } else {
          // No changes to save, return the current item
          updatedItem = item;
        }
      }

      setItem(updatedItem);
      setFormData(updatedItem);
      setError(null);
      toast.success("Dados salvos com sucesso!");
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      setError("Não foi possível salvar as alterações: " + error.message);
      toast.error("Não foi possível salvar as alterações: " + error.message);
    }
  };

  const handleToggleFixed = async () => {
    try {
      const updated = await toggleFixed({ userId, isProcess });
      setItem(prev => prev ? { ...prev, fixed: updated.fixed } : null);
      setFormData(prev => prev ? { ...prev, fixed: updated.fixed } : null);
      setFixed(updated);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error: any) {
      console.error("Erro ao atualizar fixed:", error);
      setError("Não foi possível atualizar o status fixed: " + error.message);
      toast.error("Não foi possível atualizar o status fixed: " + error.message);
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen} >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-[95vw] sm:max-w-lg md:max-w-xl lg:max-w-5xl flex flex-col max-h-[80vh] p-4 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base sm:text-[20px]">
            Dados do {isProcess ? 'Processo' : 'Cliente'}: <span className="font-bold text-blue-600">{item?.name}</span>
          </AlertDialogTitle>
          <div className="flex flex-col sm:flex-row sm:absolute sm:right-0 sm:pr-5 gap-2 mt-2 sm:mt-0">
            {!(item?.fixed ?? false) && <ToggleFixedButton fixed={item?.fixed ?? false} onToggle={handleToggleFixed} />}
            {isDocument && (
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <Button disabled className="bg-indigo-800 hover:bg-indigo-900 w-full sm:w-auto">
                  Gerar Contrato
                </Button>
                <Button onClick={sendToZapier} className="bg-indigo-800 hover:bg-indigo-900 w-full sm:w-auto">
                  Gerar Procuração
                </Button>
              </div>
            )}
            <Button onClick={() => setIsDocument(!isDocument)} className="w-full sm:w-auto">
              {isDocument ? "Ver Documentos" : "Ver Status"}
            </Button>
          </div>
          <AlertDialogDescription className="text-sm sm:text-base">
            Visualize ou altere os dados do {isProcess ? 'processo' : 'cliente'}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 text-sm">
          {isDocument ? (
            <form className="flex flex-col gap-4 sm:gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    name="name"
                    value={formData?.name || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input
                    name="cpf"
                    value={formData?.cpf || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input
                    name="data_nasc"
                    type="date"
                    value={formData?.data_nasc || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    name="email"
                    value={formData?.email || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Rua</Label>
                  <Input
                    name="rua"
                    value={formData?.rua || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input
                    name="bairro"
                    value={formData?.bairro || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input
                    name="numero"
                    value={formData?.numero || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input
                    name="cep"
                    value={formData?.cep || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>RG</Label>
                  <Input
                    name="rg"
                    value={formData?.rg || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Nome da Mãe</Label>
                  <Input
                    name="nome_mae"
                    value={formData?.nome_mae || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    name="telefone"
                    value={formData?.telefone || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input
                    name="cidade"
                    value={formData?.cidade || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("estado", value)}
                    value={formData?.estado || ""}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-slate-100" value="parana">Paraná</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="santa_catarina">Santa Catarina</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="sao_paulo">São Paulo</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="rio_grande_do_sul">Rio Grande do Sul</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="mato_grosso">Mato Grosso</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="mato_grosso_do_sul">Mato Grosso do Sul</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="rio_de_janeiro">Rio de Janeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estado Civil</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("estado_civil", value)}
                    value={formData?.estado_civil || ""}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o estado civil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-slate-100" value="Solteiro">Solteiro(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Casado">Casado(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Divorciado">Divorciado(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Viuvo">Viúvo(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Uniao_Estavel">União Estável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Profissão</Label>
                  <Input
                    name="profissao"
                    value={formData?.profissao || ""}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
                <div>
                  <Label>Nacionalidade</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("nacionalidade", value)}
                    value={formData?.nacionalidade || ""}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a nacionalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-slate-100" value="Brasileiro">Brasileiro(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Venezuelano">Venezuelano(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Colombiano">Colombiano(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Uruguaio">Uruguaio(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Argentino">Argentino(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Peruano">Peruano(a)</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Boliviano">Boliviano(a)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <Label className="text-blue-600 font-semibold">Etiquetas</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("role", value)}
                    value={formData?.role || ""}
                  >
                    <SelectTrigger className="w-full bg-blue-100 border-2 border-blue-500">
                      <SelectValue placeholder="Selecione um serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-slate-100" value="Filtro de Cartões">Filtro de Cartões</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Gerar Procuração Automática">Gerar Procuração Automática</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Coletar Assinatura em Cartório">Coletar Assinatura em Cartório</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Coletar Assinatura Digital">Coletar Assinatura Digital</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Agendar Coleta com Motoboy">Agendar Coleta com Motoboy</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Acompanhar Rota do Motoboy">Acompanhar Rota do Motoboy</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Fazer Protocolo no Hospital">Fazer Protocolo no Hospital</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Protocolar Pasta – Hospital Presencial">Protocolar Pasta – Hospital Presencial</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Solicitar Prontuário por E-mail">Solicitar Prontuário por E-mail</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Solicitar Prontuário Cajuru por E-mail">Solicitar Prontuário Cajuru por E-mail</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Acompanhar Cajuru – Solicitado">Acompanhar Cajuru – Solicitado</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Solicitar Prontuário – Outros Hospitais">Solicitar Prontuário – Outros Hospitais</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Acompanhar Prontuário – Outros Solicitados">Acompanhar Prontuário – Outros Solicitados</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Solicitar Prontuário – Ponta Grossa">Solicitar Prontuário – Ponta Grossa</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Aguardar Prontuário – Recebimento Online">Aguardar Prontuário – Recebimento Online</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Aguardar Prontuário PG – Recebimento Online">Aguardar Prontuário PG – Recebimento Online</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Aguardar Prontuário PG – Presencial">Aguardar Prontuário PG – Presencial</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Aguardar Retirada de Prontuário – Presencial">Aguardar Retirada de Prontuário – Presencial</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Retirar Prontuário – Pronto para Retirar">Retirar Prontuário – Pronto para Retirar</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Solicitar B.O. ao Cliente – Acidente">Solicitar B.O. ao Cliente – Acidente</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Solicitar Siate">Solicitar Siate</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Aguardar Retorno do Siate">Aguardar Retorno do Siate</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Enviar Mensagem – Previdenciário">Enviar Mensagem – Previdenciário</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Registrar Óbito – Nova Lei">Registrar Óbito – Nova Lei</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Protocolar SPVAT">Protocolar SPVAT</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Protocolar DPVAT – Caixa">Protocolar DPVAT – Caixa</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Enviar para Reanálise">Enviar para Reanálise</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Manter SPVAT em Standby">Manter SPVAT em Standby</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Aguardar Análise da Caixa">Aguardar Análise da Caixa</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Acompanhar Pendências – Protocolado">Acompanhar Pendências – Protocolado</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Protocolar Pendência de B.O.">Protocolar Pendência de B.O.</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Avisar Sobre Perícia Administrativa">Avisar Sobre Perícia Administrativa</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Aguardar Resultado da Perícia">Aguardar Resultado da Perícia</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Cobrar Honorários – Resultado Perícia">Cobrar Honorários – Resultado Perícia</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Aguardar Pagamento – Honorários Cobrados">Aguardar Pagamento – Honorários Cobrados</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Encerrar Processo – DPVAT">Encerrar Processo – DPVAT</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Descartaveis">Descartaveis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <Label className="text-blue-600 font-semibold">Serviços</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("service", value)}
                    value={formData?.service || ""}
                  >
                    <SelectTrigger className="w-full bg-blue-100 border-2 border-blue-500">
                      <SelectValue placeholder="Selecione um serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-slate-100" value="INSS">INSS</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="Seguro de Vida">Seguro de Vida</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="RCF">RCF</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="DPVAT">DPVAT</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="SPVAT">SPVAT</SelectItem>
                      <SelectItem className="hover:bg-slate-100" value="TRABALHISTA">TRABALHISTA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Observação</Label>
                  <Input
                    name="obs"
                    value={formData?.obs || ""}
                    onChange={handleInputChange}
                    className="w-full bg-yellow-100"
                  />
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-base sm:text-lg font-semibold mb-2 text-blue-600">É menor de idade? Preencha os dados:</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Nome</Label>
                    <Input
                      name="nome_res"
                      value={formData?.nome_res || ""}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label>RG</Label>
                    <Input
                      name="rg_res"
                      value={formData?.rg_res || ""}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input
                      name="cpf_res"
                      value={formData?.cpf_res || ""}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label>Profissão</Label>
                    <Input
                      name="profissao_res"
                      value={formData?.profissao_res || ""}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Estado Civil</Label>
                    <Select
                      onValueChange={(value) => handleSelectChange("estado_civil_res", value)}
                      value={formData?.estado_civil_res || ""}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o estado civil" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className="hover:bg-slate-100" value="Solteiro">Solteiro(a)</SelectItem>
                        <SelectItem className="hover:bg-slate-100" value="Casado">Casado(a)</SelectItem>
                        <SelectItem className="hover:bg-slate-100" value="Divorciado">Divorciado(a)</SelectItem>
                        <SelectItem className="hover:bg-slate-100" value="Viuvo">Viúvo(a)</SelectItem>
                        <SelectItem className="hover:bg-slate-100" value="Uniao_Estavel">União Estável</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-base sm:text-lg font-semibold mb-2 text-blue-600">Dados do Acidente</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Data do Acidente</Label>
                    <Input
                      name="data_acidente"
                      type="date"
                      value={formData?.data_acidente || ""}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label>Atendimento Via</Label>
                    <Select
                      onValueChange={(value) => handleSelectChange("atendimento_via", value)}
                      value={formData?.atendimento_via || ""}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o atendimento via" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className="hover:bg-slate-100" value="Siate">SIATE</SelectItem>
                        <SelectItem className="hover:bg-slate-100" value="Samu">SAMU/OUTRAS AMBULÂNCIAS</SelectItem>
                        <SelectItem className="hover:bg-slate-100" value="Procura_Direta">PROCURA DIRETA</SelectItem>
                        <SelectItem className="hover:bg-slate-100" value="Arteris">ARTERIS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Hospital</Label>
                    <Input
                      name="hospital"
                      value={formData?.hospital || ""}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <Label>Outro Hospital</Label>
                    <Input
                      name="outro_hospital"
                      value={formData?.outro_hospital || ""}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <Label>Lesões</Label>
                    <Input
                      name="lesoes"
                      value={formData?.lesoes || ""}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <h1 className="text-base sm:text-lg font-semibold mb-4">Área dos Status</h1>
                <div className="flex justify-center">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="iniciado"
                        checked={localStatus.iniciado}
                        onChange={() => handleCheckboxChange("iniciado")}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="iniciado" className="text-sm text-gray-700 whitespace-nowrap">
                        Processo iniciado
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="aguardandoAssinatura"
                        checked={localStatus.aguardandoAssinatura}
                        onChange={() => handleCheckboxChange("aguardandoAssinatura")}
                        disabled={!localStatus.iniciado}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="aguardandoAssinatura" className="text-sm text-gray-700 whitespace-nowrap">
                        Aguardando assinatura
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="solicitarDocumentos"
                        checked={localStatus.solicitarDocumentos}
                        onChange={() => handleCheckboxChange("solicitarDocumentos")}
                        disabled={!localStatus.aguardandoAssinatura}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="solicitarDocumentos" className="text-sm text-gray-700 whitespace-nowrap">
                        Fase de solicitação de documentos
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="coletaDocumentos"
                        checked={localStatus.coletaDocumentos}
                        onChange={() => handleCheckboxChange("coletaDocumentos")}
                        disabled={!localStatus.solicitarDocumentos}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="coletaDocumentos" className="text-sm text-gray-700 whitespace-nowrap">
                        Coleta de documentos
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="analiseDocumentos"
                        checked={localStatus.analiseDocumentos}
                        onChange={() => handleCheckboxChange("analiseDocumentos")}
                        disabled={!localStatus.coletaDocumentos}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="analiseDocumentos" className="text-sm text-gray-700 whitespace-nowrap">
                        Análise de documentos
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="pericial"
                        checked={localStatus.pericial}
                        onChange={() => handleCheckboxChange("pericial")}
                        disabled={!localStatus.analiseDocumentos}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="pericial" className="text-sm text-gray-700 whitespace-nowrap">
                        Fase Pericial
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="aguardandoPericial"
                        checked={localStatus.aguardandoPericial}
                        onChange={() => handleCheckboxChange("aguardandoPericial")}
                        disabled={!localStatus.pericial}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="aguardandoPericial" className="text-sm text-gray-700 whitespace-nowrap">
                        Aguardando resultado pericial
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="pagamentoHonorario"
                        checked={localStatus.pagamentoHonorario}
                        onChange={() => handleCheckboxChange("pagamentoHonorario")}
                        disabled={!localStatus.aguardandoPericial}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="pagamentoHonorario" className="text-sm text-gray-700 whitespace-nowrap">
                        Pagamento de honorários
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="processoEncerrado"
                        checked={localStatus.processoEncerrado}
                        onChange={() => handleCheckboxChange("processoEncerrado")}
                        disabled={!localStatus.pagamentoHonorario}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="processoEncerrado" className="text-sm text-gray-700 whitespace-nowrap">
                        Processo encerrado
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
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
            </form>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 border">Nome do Arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {itemDocuments.length > 0 ? (
                    itemDocuments.map((doc: any, index: number) => (
                      <tr key={index} className="border-b">
                        <td className="p-2 border flex justify-between items-center gap-2">
                          {editingId === doc.id ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                className="border px-2 py-1 text-sm w-full rounded"
                                autoFocus
                              />
                              <Button
                                onClick={() => newNameDoc(doc.id)}
                                disabled={saving === doc.id}
                                className="h-8"
                              >
                                {saving === doc.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Salvar"
                                )}
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className="truncate max-w-[150px] sm:max-w-[400px]">
                                {doc.name}
                              </span>
                              <div className="flex items-center gap-1">
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
                                  aria-label={
                                    downloading === doc.key
                                      ? "Baixando arquivo"
                                      : "Baixar arquivo"
                                  }
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
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={2}
                        className="p-2 border text-center text-gray-500"
                      >
                        Nenhum documento encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          )}
          <Dialog open={confirmationDoc} onOpenChange={setConfirmation}>
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
        </div>
        <AlertDialogFooter className="border-t pt-4">
          <div className="flex flex-col sm:flex-row gap-2 mx-auto w-full justify-center">
            <AlertDialogCancel className="bg-red-600 hover:bg-red-700 text-white w-full">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSave}
              className="w-full bg-black hover:bg-gray-800"
            >
              Salvar
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

  );
};

export default DialogDash;