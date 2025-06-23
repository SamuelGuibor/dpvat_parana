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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/_components/ui/select";
import { getUsers } from "@/app/_actions/get-user";
import { updateUser } from "@/app/_actions/update-users";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "./dropzone";
import { Button } from "./ui/button";
import { getPresignedUrls } from '@/app/_actions/uploadS3';
import { downloadFileFromS3 } from '@/app/_actions/downloadS3';
import { Download, Loader2 } from 'lucide-react';
import { toast } from "sonner";
import { updateUserRole } from "../_actions/statusTimer";

interface UserData {
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
}

interface UpdateUserData {
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
  trigger: React.ReactNode;
}

const DialogDash = ({ userId, trigger }: DialogDashProps) => {
  const [user, setUser] = useState<UserData | null>(null);
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
  const [formData, setFormData] = useState<UserData | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [base64Files, setBase64Files] = useState<FileWithBase64[]>([]);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDocument, setIsDocument] = useState(true);
  const [userDocuments, setUserDocuments] = useState<{ key: string; name: string }[]>([]);

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
      setError('Erro: ID do usuário não fornecido.');
      toast.error('ID do usuário não fornecido.');
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

      const response = await getPresignedUrls(fileInfos, userId);

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
          documents: validUploads,
        }),
      });

      setUserDocuments((prev) => [...prev, ...validUploads]);
      await fetchUserDocuments();
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

  const fetchUserDocuments = async () => {
    try {
      const response = await fetch(`/api/documents?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar documentos');
      }
      const documents = await response.json();
      setUserDocuments(documents);
    } catch (err) {
      console.error('Erro ao buscar documentos:', err);
      setError('Erro ao carregar documentos do usuário.');
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
    async function fetchUser() {
      try {
        setIsLoading(true);
        const userData = await getUsers("full", userId);
        if (!userData || Array.isArray(userData)) {
          throw new Error("Usuário não encontrado ou resposta inválida.");
        }
        setUser(userData);
        setFormData(userData);
        setLocalStatus({
          iniciado: userData.status === "INICIADO" ||
            userData.status === "AGUARDANDO_ASSINATURA" ||
            userData.status === "SOLICITAR_DOCUMENTOS" ||
            userData.status === "COLETA_DOCUMENTOS" ||
            userData.status === "ANALISE_DOCUMENTOS" ||
            userData.status === "PERICIAL" ||
            userData.status === "AGUARDANDO_PERICIAL" ||
            userData.status === "PAGAMENTO_HONORARIO" ||
            userData.status === "PROCESSO_ENCERRADO",
          aguardandoAssinatura: userData.status === "AGUARDANDO_ASSINATURA" ||
            userData.status === "SOLICITAR_DOCUMENTOS" ||
            userData.status === "COLETA_DOCUMENTOS" ||
            userData.status === "ANALISE_DOCUMENTOS" ||
            userData.status === "PERICIAL" ||
            userData.status === "AGUARDANDO_PERICIAL" ||
            userData.status === "PAGAMENTO_HONORARIO" ||
            userData.status === "PROCESSO_ENCERRADO",
          solicitarDocumentos: userData.status === "SOLICITAR_DOCUMENTOS" ||
            userData.status === "COLETA_DOCUMENTOS" ||
            userData.status === "ANALISE_DOCUMENTOS" ||
            userData.status === "PERICIAL" ||
            userData.status === "AGUARDANDO_PERICIAL" ||
            userData.status === "PAGAMENTO_HONORARIO" ||
            userData.status === "PROCESSO_ENCERRADO",
          coletaDocumentos: userData.status === "COLETA_DOCUMENTOS" ||
            userData.status === "ANALISE_DOCUMENTOS" ||
            userData.status === "PERICIAL" ||
            userData.status === "AGUARDANDO_PERICIAL" ||
            userData.status === "PAGAMENTO_HONORARIO" ||
            userData.status === "PROCESSO_ENCERRADO",
          analiseDocumentos: userData.status === "ANALISE_DOCUMENTOS" ||
            userData.status === "PERICIAL" ||
            userData.status === "AGUARDANDO_PERICIAL" ||
            userData.status === "PAGAMENTO_HONORARIO" ||
            userData.status === "PROCESSO_ENCERRADO",
          pericial: userData.status === "PERICIAL" ||
            userData.status === "AGUARDANDO_PERICIAL" ||
            userData.status === "PAGAMENTO_HONORARIO" ||
            userData.status === "PROCESSO_ENCERRADO",
          aguardandoPericial: userData.status === "AGUARDANDO_PERICIAL" ||
            userData.status === "PAGAMENTO_HONORARIO" ||
            userData.status === "PROCESSO_ENCERRADO",
          pagamentoHonorario: userData.status === "PAGAMENTO_HONORARIO" ||
            userData.status === "PROCESSO_ENCERRADO",
          processoEncerrado: userData.status === "PROCESSO_ENCERRADO",
        });
        await fetchUserDocuments();
      } catch (error) {
        console.error("Erro ao buscar usuário:", error);
        setError("Não foi possível carregar os dados do usuário.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchUser();
  }, [userId]);

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
    if (!user || !formData) return;

    try {
      // Upload files to S3 first, if any
      await uploadFilesToS3();

      // Check if only the role has changed
      const onlyRoleChanged = Object.keys(formData).every((key) => {
        const typedKey = key as keyof UserData;
        if (typedKey === "role") {
          return formData[typedKey] !== user[typedKey];
        }
        return formData[typedKey] === user[typedKey];
      });

      let updatedUser;
      if (onlyRoleChanged && formData.role !== user.role) {
        // Call updateUserRole Server Action for role-only changes
        updatedUser = await updateUserRole({
          userId: formData.id,
          newRole: formData.role || "USER",
        });
        // Map the response to match the expected UserData structure
        updatedUser = {
          ...user,
          role: updatedUser.role,
          type: updatedUser.role || "USER",
          statusStartedAt: updatedUser.statusStartedAt
            ? updatedUser.statusStartedAt.toISOString()
            : null,
        };
      } else {
        // Call updateUser Server Action for other changes
        const updatedData: UpdateUserData = {
          id: formData.id,
          name: formData.name !== user.name ? formData.name : undefined,
          cpf: formData.cpf !== user.cpf ? formData.cpf : undefined,
          data_nasc: formData.data_nasc !== user.data_nasc ? formData.data_nasc : undefined,
          email: formData.email !== user.email ? formData.email : undefined,
          rua: formData.rua !== user.rua ? formData.rua : undefined,
          bairro: formData.bairro !== user.bairro ? formData.bairro : undefined,
          numero: formData.numero !== user.numero ? formData.numero : undefined,
          cep: formData.cep !== user.cep ? formData.cep : undefined,
          rg: formData.rg !== user.rg ? formData.rg : undefined,
          nome_mae: formData.nome_mae !== user.nome_mae ? formData.nome_mae : undefined,
          telefone: formData.telefone !== user.telefone ? formData.telefone : undefined,
          cidade: formData.cidade !== user.cidade ? formData.cidade : undefined,
          estado: formData.estado !== user.estado ? formData.estado : undefined,
          estado_civil: formData.estado_civil !== user.estado_civil ? formData.estado_civil : undefined,
          profissao: formData.profissao !== user.profissao ? formData.profissao : undefined,
          nacionalidade: formData.nacionalidade !== user.nacionalidade ? formData.nacionalidade : undefined,
          data_acidente: formData.data_acidente !== user.data_acidente ? formData.data_acidente : undefined,
          atendimento_via: formData.atendimento_via !== user.atendimento_via ? formData.atendimento_via : undefined,
          hospital: formData.hospital !== user.hospital ? formData.hospital : undefined,
          outro_hospital: formData.outro_hospital !== user.outro_hospital ? formData.outro_hospital : undefined,
          lesoes: formData.lesoes !== user.lesoes ? formData.lesoes : undefined,
          status: determineStatus() !== user.status ? determineStatus() : undefined,
          role: formData.role !== user.role ? formData.role : undefined,
          nome_res: formData.nome_res !== user.nome_res ? formData.nome_res : undefined,
          rg_res: formData.rg_res !== user.rg_res ? formData.rg_res : undefined,
          cpf_res: formData.cpf_res !== user.cpf_res ? formData.cpf_res : undefined,
          estado_civil_res: formData.estado_civil_res !== user.estado_civil_res ? formData.estado_civil_res : undefined,
          profissao_res: formData.profissao_res !== user.profissao_res ? formData.profissao_res : undefined,
          obs: formData.obs !== user.obs ? formData.obs : undefined,
          service: formData.service !== user.service ? formData.service : undefined,
        };

        // Only call updateUser if there are changes to save
        if (Object.values(updatedData).some((value) => value !== undefined && value !== updatedData.id)) {
          updatedUser = await updateUser(updatedData);
        } else {
          // No changes to save, return the current user
          updatedUser = user;
        }
      }

      setUser(updatedUser);
      setFormData(updatedUser);
      setError(null);
      toast.success("Dados salvos com sucesso!");
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      setError("Não foi possível salvar as alterações: " + error.message);
      toast.error("Erro ao salvar as alterações: " + error.message);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-[95vw] sm:max-w-lg md:max-w-xl lg:max-w-5xl flex flex-col max-h-[80vh] p-4 sm:p-6">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base sm:text-[20px]">
            Dados do Cliente: <span className="font-bold text-blue-600">{user?.name}</span>
          </AlertDialogTitle>
          <div className="flex flex-col sm:flex-row sm:absolute sm:right-0 sm:pr-5 gap-2 mt-2 sm:mt-0">
            {isDocument && (
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
                <Button disabled className="bg-indigo-800 hover:bg-indigo-900 w-full sm:w-auto">
                  Gerar Contrato
                </Button>
                <Button disabled className="bg-indigo-800 hover:bg-indigo-900 w-full sm:w-auto">
                  Gerar Procuração
                </Button>
              </div>
            )}
            <Button onClick={() => setIsDocument(!isDocument)} className="w-full sm:w-auto">
              {isDocument ? "Ver Documentos" : "Ver Status"}
            </Button>
          </div>
          <AlertDialogDescription className="text-sm sm:text-base">
            Visualize ou altere os dados do cliente.
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
                      <SelectItem value="parana">Paraná</SelectItem>
                      <SelectItem value="santa_catarina">Santa Catarina</SelectItem>
                      <SelectItem value="sao_paulo">São Paulo</SelectItem>
                      <SelectItem value="rio_grande_do_sul">Rio Grande do Sul</SelectItem>
                      <SelectItem value="mato_grosso">Mato Grosso</SelectItem>
                      <SelectItem value="mato_grosso_do_sul">Mato Grosso do Sul</SelectItem>
                      <SelectItem value="rio_de_janeiro">Rio de Janeiro</SelectItem>
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
                      <SelectItem value="Solteiro">Solteiro(a)</SelectItem>
                      <SelectItem value="Casado">Casado(a)</SelectItem>
                      <SelectItem value="Divorciado">Divorciado(a)</SelectItem>
                      <SelectItem value="Viuvo">Viúvo(a)</SelectItem>
                      <SelectItem value="Uniao_Estavel">União Estável</SelectItem>
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
                      <SelectItem value="Brasileiro">Brasileiro(a)</SelectItem>
                      <SelectItem value="Venezuelano">Venezuelano(a)</SelectItem>
                      <SelectItem value="Colombiano">Colombiano(a)</SelectItem>
                      <SelectItem value="Uruguaio">Uruguaio(a)</SelectItem>
                      <SelectItem value="Argentino">Argentino(a)</SelectItem>
                      <SelectItem value="Peruano">Peruano(a)</SelectItem>
                      <SelectItem value="Boliviano">Boliviano(a)</SelectItem>
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
                      <SelectItem value="Aplicar Filtro DPVAT">Aplicar Filtro DPVAT</SelectItem>
                      <SelectItem value="Gerar Procuração Automática">Gerar Procuração Automática</SelectItem>
                      <SelectItem value="Coletar Assinatura em Cartório">Coletar Assinatura em Cartório</SelectItem>
                      <SelectItem value="Coletar Assinatura Digital">Coletar Assinatura Digital</SelectItem>
                      <SelectItem value="Agendar Coleta com Motoboy">Agendar Coleta com Motoboy</SelectItem>
                      <SelectItem value="Acompanhar Rota do Motoboy">Acompanhar Rota do Motoboy</SelectItem>
                      <SelectItem value="Fazer Protocolo no Hospital">Fazer Protocolo no Hospital</SelectItem>
                      <SelectItem value="Protocolar Pasta – Hospital Presencial">Protocolar Pasta – Hospital Presencial</SelectItem>
                      <SelectItem value="Solicitar Prontuário por E-mail">Solicitar Prontuário por E-mail</SelectItem>
                      <SelectItem value="Solicitar Prontuário Cajuru por E-mail">Solicitar Prontuário Cajuru por E-mail</SelectItem>
                      <SelectItem value="Acompanhar Cajuru – Solicitado">Acompanhar Cajuru – Solicitado</SelectItem>
                      <SelectItem value="Solicitar Prontuário – Outros Hospitais">Solicitar Prontuário – Outros Hospitais</SelectItem>
                      <SelectItem value="Acompanhar Prontuário – Outros Solicitados">Acompanhar Prontuário – Outros Solicitados</SelectItem>
                      <SelectItem value="Solicitar Prontuário – Ponta Grossa">Solicitar Prontuário – Ponta Grossa</SelectItem>
                      <SelectItem value="Aguardar Prontuário – Recebimento Online">Aguardar Prontuário – Recebimento Online</SelectItem>
                      <SelectItem value="Aguardar Prontuário PG – Recebimento Online">Aguardar Prontuário PG – Recebimento Online</SelectItem>
                      <SelectItem value="Aguardar Prontuário PG – Presencial">Aguardar Prontuário PG – Presencial</SelectItem>
                      <SelectItem value="Aguardar Retirada de Prontuário – Presencial">Aguardar Retirada de Prontuário – Presencial</SelectItem>
                      <SelectItem value="Retirar Prontuário – Pronto para Retirar">Retirar Prontuário – Pronto para Retirar</SelectItem>
                      <SelectItem value="Resolver Problema com B.O.">Resolver Problema com B.O.</SelectItem>
                      <SelectItem value="Fazer B.O. – Equipe Rubi">Fazer B.O. – Equipe Rubi</SelectItem>
                      <SelectItem value="Orientar Cliente – Fazer B.O.">Orientar Cliente – Fazer B.O.</SelectItem>
                      <SelectItem value="Enviar 1ª Mensagem – B.O.">Enviar 1ª Mensagem – B.O.</SelectItem>
                      <SelectItem value="Solicitar B.O. ao Cliente – Acidente">Solicitar B.O. ao Cliente – Acidente</SelectItem>
                      <SelectItem value="Solicitar Siate">Solicitar Siate</SelectItem>
                      <SelectItem value="Aguardar Retorno do Siate">Aguardar Retorno do Siate</SelectItem>
                      <SelectItem value="Acompanhar Siate – Pronto">Acompanhar Siate – Pronto</SelectItem>
                      <SelectItem value="Enviar Mensagem – Previdenciário">Enviar Mensagem – Previdenciário</SelectItem>
                      <SelectItem value="Registrar Óbito – Nova Lei">Registrar Óbito – Nova Lei</SelectItem>
                      <SelectItem value="Protocolar SPVAT">Protocolar SPVAT</SelectItem>
                      <SelectItem value="Protocolar DPVAT – Caixa">Protocolar DPVAT – Caixa</SelectItem>
                      <SelectItem value="Enviar para Reanálise">Enviar para Reanálise</SelectItem>
                      <SelectItem value="Manter SPVAT em Standby">Manter SPVAT em Standby</SelectItem>
                      <SelectItem value="Aguardar Análise da Caixa">Aguardar Análise da Caixa</SelectItem>
                      <SelectItem value="Acompanhar Pendências – Protocolado">Acompanhar Pendências – Protocolado</SelectItem>
                      <SelectItem value="Protocolar Pendência de B.O.">Protocolar Pendência de B.O.</SelectItem>
                      <SelectItem value="Avisar Sobre Perícia Administrativa">Avisar Sobre Perícia Administrativa</SelectItem>
                      <SelectItem value="Aguardar Resultado da Perícia">Aguardar Resultado da Perícia</SelectItem>
                      <SelectItem value="Cobrar Honorários – Resultado Perícia">Cobrar Honorários – Resultado Perícia</SelectItem>
                      <SelectItem value="Aguardar Pagamento – Honorários Cobrados">Aguardar Pagamento – Honorários Cobrados</SelectItem>
                      <SelectItem value="Encerrar Processo – DPVAT">Encerrar Processo – DPVAT</SelectItem>
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
                      <SelectItem value="INSS">INSS</SelectItem>
                      <SelectItem value="Seguro de Vida">Seguro de Vida</SelectItem>
                      <SelectItem value="RCF">RCF</SelectItem>
                      <SelectItem value="DPVAT">DPVAT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Observação</Label>
                  <Input
                    name="obs"
                    value={formData?.obs || ""}
                    onChange={handleInputChange}
                    className="w-full"
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
                        <SelectItem value="Solteiro">Solteiro(a)</SelectItem>
                        <SelectItem value="Casado">Casado(a)</SelectItem>
                        <SelectItem value="Divorciado">Divorciado(a)</SelectItem>
                        <SelectItem value="Viuvo">Viúvo(a)</SelectItem>
                        <SelectItem value="Uniao_Estavel">União Estável</SelectItem>
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
                        <SelectItem value="Siate">SIATE</SelectItem>
                        <SelectItem value="Samu">SAMU/OUTRAS AMBULÂNCIAS</SelectItem>
                        <SelectItem value="Procura_Direta">PROCURA DIRETA</SelectItem>
                        <SelectItem value="Arteris">ARTERIS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Hospital</Label>
                    <Select
                      onValueChange={(value) => handleSelectChange("hospital", value)}
                      value={formData?.hospital || ""}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o hospital" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trabalhador">Trabalhador</SelectItem>
                        <SelectItem value="cajuru">Cajuru</SelectItem>
                        <SelectItem value="evangelico_mackenzie">Evangélico/Mackenzie</SelectItem>
                        <SelectItem value="angelina_caron">Angelina Caron</SelectItem>
                        <SelectItem value="h_maternidade_sao_jose_dos_pinhais">
                          H. Maternidade São José dos Pinhais
                        </SelectItem>
                        <SelectItem value="hma_araucaria">Hma Araucária</SelectItem>
                        <SelectItem value="rocio">Rocio</SelectItem>
                        <SelectItem value="onix">Onix</SelectItem>
                        <SelectItem value="marcelino_champagnat">Marcelino Champagnat</SelectItem>
                        <SelectItem value="hospital_xv">Hospital XV</SelectItem>
                        <SelectItem value="vita">Vita</SelectItem>
                        <SelectItem value="fraturas_novo_mundo">Fraturas Novo Mundo</SelectItem>
                        <SelectItem value="cwb_santa_cruz">Cwb Santa Cruz</SelectItem>
                        <SelectItem value="cwb_santa_casa">Cwb Santa Casa</SelectItem>
                        <SelectItem value="nossa_saude">Nossa Saúde</SelectItem>
                        <SelectItem value="nacoes">Nações</SelectItem>
                        <SelectItem value="litoral">Litoral</SelectItem>
                        <SelectItem value="pg_regional">Pg Regional</SelectItem>
                        <SelectItem value="upa_santana">Upa Santana</SelectItem>
                        <SelectItem value="upa_santa_paula">Upa Santa Paula</SelectItem>
                        <SelectItem value="pg_bom_jesus">Pg Bom Jesus</SelectItem>
                        <SelectItem value="pg_sao_camilo">Pg São Camilo</SelectItem>
                        <SelectItem value="pg_unimed">Pg Unimed</SelectItem>
                        <SelectItem value="pg_santa_casa">Pg Santa Casa</SelectItem>
                        <SelectItem value="pg_pronto_socorro_amadeu_puppi">
                          Pg Pronto Socorro Amadeu Puppi
                        </SelectItem>
                        <SelectItem value="idf_telemaco_borba">Idf Telemaco Borba</SelectItem>
                        <SelectItem value="regional_de_paranagua">Regional de Paranaguá</SelectItem>
                        <SelectItem value="regional_pg">Regional Pg</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Select
                      onValueChange={(value) => handleSelectChange("lesoes", value)}
                      value={formData?.lesoes || ""}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione as lesões" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fx_femur">FX Fêmur</SelectItem>
                        <SelectItem value="fx_tibia">FX Tíbia</SelectItem>
                        <SelectItem value="fx_pulso_mao_metatarso">FX Pulso/Mão/Metatarso</SelectItem>
                        <SelectItem value="fx_tornozelo">FX Tornozelo</SelectItem>
                        <SelectItem value="fx_mindilhos">FX Mindilhos</SelectItem>
                        <SelectItem value="fx_costela">FX Costela</SelectItem>
                        <SelectItem value="fx_coluna">FX Vértebra/Coluna</SelectItem>
                        <SelectItem value="fx_pelve">FX Pelve</SelectItem>
                        <SelectItem value="fx_joelho">FX Joelho</SelectItem>
                        <SelectItem value="ligamento_joelho">Lesão no Ligamento Joelho</SelectItem>
                        <SelectItem value="luxacao">Luxação</SelectItem>
                        <SelectItem value="traumatismo">Traumatismo</SelectItem>
                        <SelectItem value="fx_exposta_cirurgia">FX Exposta/Cirurgia</SelectItem>
                        <SelectItem value="fx_braco">FX Braço</SelectItem>
                        <SelectItem value="fx_perna">FX Perna</SelectItem>
                        <SelectItem value="fx_pe">FX Pé</SelectItem>
                        <SelectItem value="fx_face_maxilar_nariz">FX Face, Maxilar, Nariz</SelectItem>
                        <SelectItem value="fx_bacia">FX Bacia</SelectItem>
                        <SelectItem value="laceracao">Laceração</SelectItem>
                        <SelectItem value="pneumotorax">Pneumotórax</SelectItem>
                        <SelectItem value="amputacao">Amputação</SelectItem>
                        <SelectItem value="multiplas_fraturas">Múltiplas Fraturas</SelectItem>
                      </SelectContent>
                    </Select>
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
                  {userDocuments.length > 0 ? (
                    userDocuments.map((doc, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-2 border flex justify-between items-center">
                          <span className="truncate max-w-[150px] sm:max-w-[200px]">{doc.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(doc.key, doc.name)}
                            disabled={downloading === doc.key}
                            className="h-8 w-8"
                            aria-label={downloading === doc.key ? 'Baixando arquivo' : 'Baixar arquivo'}
                          >
                            {downloading === doc.key ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="p-2 border text-center">Nenhum documento encontrado</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
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