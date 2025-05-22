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
    toast.success('Sucesso ao salvar o arquivo.');

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
      await uploadFilesToS3();

      const updatedData = {
        ...formData,
        status: determineStatus(),
      };

      const updatedUser = await updateUser(updatedData);
      setUser(updatedUser);
      setFormData(updatedUser);
      setError(null);
      toast.success('Dados salvos com sucesso!');
    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      setError("Não foi possível salvar as alterações: " + error.message);
      toast.error("Erro ao salvar as alterações: " + error.message);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-3xl sm:max-w-lg md:max-w-xl lg:max-w-4xl flex flex-col max-h-[80vh]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[20px]">
            Dados do Cliente: <span className="font-bold text-blue-600">{user?.name}</span>
          </AlertDialogTitle>
          <div className="absolute right-0 pr-5">
            <Button onClick={() => setIsDocument(!isDocument)}>
              {isDocument ? "Ver Documentos" : "Ver Status"}
            </Button>
          </div>
          {isDocument && (
            <div className="absolute right-[200px] flex space-x-4">
              <Button disabled className="bg-indigo-800 hover:bg-indigo-900">Gerar Contrato</Button>
              <Button disabled className="bg-indigo-800 hover:bg-indigo-900">Gerar Procuração</Button>
            </div>
          )}
          <AlertDialogDescription>Visualize ou altere os dados do cliente.</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-2 text-sm">
          {isDocument ? (
            <form className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    name="name"
                    value={formData?.name || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input
                    name="cpf"
                    value={formData?.cpf || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input
                    name="data_nasc"
                    type="date"
                    value={formData?.data_nasc || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    name="email"
                    value={formData?.email || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Rua</Label>
                  <Input
                    name="rua"
                    value={formData?.rua || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input
                    name="bairro"
                    value={formData?.bairro || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input
                    name="numero"
                    value={formData?.numero || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input
                    name="cep"
                    value={formData?.cep || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>RG</Label>
                  <Input
                    name="rg"
                    value={formData?.rg || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Nome da Mãe</Label>
                  <Input
                    name="nome_mae"
                    value={formData?.nome_mae || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    name="telefone"
                    value={formData?.telefone || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input
                    name="cidade"
                    value={formData?.cidade || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("estado", value)}
                    value={formData?.estado || ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-gray-200" value="parana">Paraná</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="santa_catarina">Santa Catarina</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="sao_paulo">São Paulo</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="rio_grande_do_sul">Rio Grande do Sul</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="mato_grosso">Mato Grosso</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="mato_grosso_do_sul">Mato Grosso do Sul</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="rio_de_janeiro">Rio de Janeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estado Civil</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("estado_civil", value)}
                    value={formData?.estado_civil || ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o estado civil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-gray-200" value="Solteiro">Solteiro(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Casado">Casado(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Divorciado">Divorciado(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Viuvo">Viúvo(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Uniao_Estavel">União Estável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Profissão</Label>
                  <Input
                    name="profissao"
                    value={formData?.profissao || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Nacionalidade</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("nacionalidade", value)}
                    value={formData?.nacionalidade || ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a nacionalidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-gray-200" value="Brasileiro">Brasileiro(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Venezuelano">Venezuelano(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Colombiano">Colombiano(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Uruguaio">Uruguaio(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Argentino">Argentino(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Peruano">Peruano(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Boliviano">Boliviano(a)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Serviços</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("role", value)}
                    value={formData?.role || ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-gray-200" value="Aplicar Filtro DPVAT">Aplicar Filtro DPVAT</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Gerar Procuração Automática">Gerar Procuração Automática</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Coletar Assinatura em Cartório">Coletar Assinatura em Cartório</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Coletar Assinatura Digital">Coletar Assinatura Digital</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Agendar Coleta com Motoboy">Agendar Coleta com Motoboy</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Acompanhar Rota do Motoboy">Acompanhar Rota do Motoboy</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Fazer Protocolo no Hospital">Fazer Protocolo no Hospital</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Protocolar Pasta – Hospital Presencial">Protocolar Pasta – Hospital Presencial</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Solicitar Prontuário por E-mail">Solicitar Prontuário por E-mail</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Solicitar Prontuário Cajuru por E-mail">Solicitar Prontuário Cajuru por E-mail</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Acompanhar Cajuru – Solicitado">Acompanhar Cajuru – Solicitado</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Solicitar Prontuário – Outros Hospitais">Solicitar Prontuário – Outros Hospitais</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Acompanhar Prontuário – Outros Solicitados">Acompanhar Prontuário – Outros Solicitados</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Solicitar Prontuário – Ponta Grossa">Solicitar Prontuário – Ponta Grossa</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Aguardar Prontuário – Recebimento Online">Aguardar Prontuário – Recebimento Online</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Aguardar Prontuário PG – Recebimento Online">Aguardar Prontuário PG – Recebimento Online</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Aguardar Prontuário PG – Presencial">Aguardar Prontuário PG – Presencial</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Aguardar Retirada de Prontuário – Presencial">Aguardar Retirada de Prontuário – Presencial</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Retirar Prontuário – Pronto para Retirar">Retirar Prontuário – Pronto para Retirar</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Resolver Problema com B.O.">Resolver Problema com B.O.</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Fazer B.O. – Equipe Rubi">Fazer B.O. – Equipe Rubi</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Orientar Cliente – Fazer B.O.">Orientar Cliente – Fazer B.O.</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Enviar 1ª Mensagem – B.O.">Enviar 1ª Mensagem – B.O.</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Solicitar B.O. ao Cliente – Acidente">Solicitar B.O. ao Cliente – Acidente</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Solicitar Siate">Solicitar Siate</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Aguardar Retorno do Siate">Aguardar Retorno do Siate</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Acompanhar Siate – Pronto">Acompanhar Siate – Pronto</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Enviar Mensagem – Previdenciário">Enviar Mensagem – Previdenciário</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Registrar Óbito – Nova Lei">Registrar Óbito – Nova Lei</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Protocolar SPVAT">Protocolar SPVAT</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Protocolar DPVAT – Caixa">Protocolar DPVAT – Caixa</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Enviar para Reanálise">Enviar para Reanálise</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Manter SPVAT em Standby">Manter SPVAT em Standby</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Aguardar Análise da Caixa">Aguardar Análise da Caixa</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Acompanhar Pendências – Protocolado">Acompanhar Pendências – Protocolado</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Protocolar Pendência de B.O.">Protocolar Pendência de B.O.</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Avisar Sobre Perícia Administrativa">Avisar Sobre Perícia Administrativa</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Aguardar Resultado da Perícia">Aguardar Resultado da Perícia</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Cobrar Honorários – Resultado Perícia">Cobrar Honorários – Resultado Perícia</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Aguardar Pagamento – Honorários Cobrados">Aguardar Pagamento – Honorários Cobrados</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Encerrar Processo – DPVAT">Encerrar Processo – DPVAT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-lg font-semibold mb-2 text-blue-600">É menor de idade? Preencha os dados:</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome</Label>
                    <Input
                      name="nome_res"
                      value={formData?.nome_res || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <Label>RG</Label>
                    <Input
                      name="rg_res"
                      value={formData?.rg_res || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <Label>CPF</Label>
                    <Input
                      name="cpf_res"
                      value={formData?.cpf_res || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <Label>Profissão</Label>
                    <Input
                      name="profissao_res"
                      value={formData?.profissao_res || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                <div className="relative top-2">
                  <Label>Estado Civil</Label>
                  <Select
                    onValueChange={(value) => handleSelectChange("estado_civil_res", value)}
                    value={formData?.estado_civil_res || ""}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o estado civil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-gray-200" value="Solteiro">Solteiro(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Casado">Casado(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Divorciado">Divorciado(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Viuvo">Viúvo(a)</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="Uniao_Estavel">União Estável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-lg font-semibold mb-2 text-blue-600">Dados do Acidente</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data do Acidente</Label>
                    <Input
                      name="data_acidente"
                      type="date"
                      value={formData?.data_acidente || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <Label>Atendimento Via</Label>
                    <Select
                      onValueChange={(value) => handleSelectChange("atendimento_via", value)}
                      value={formData?.atendimento_via || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o atendimento via" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className="hover:bg-gray-200" value="Siate">SIATE</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="Samu">SAMU/OUTRAS AMBULÂNCIAS</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="Procura_Direta">PROCURA DIRETA</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="Arteris">ARTERIS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Hospital</Label>
                    <Select
                      onValueChange={(value) => handleSelectChange("hospital", value)}
                      value={formData?.hospital || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o hospital" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className="hover:bg-gray-200" value="trabalhador">Trabalhador</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="cajuru">Cajuru</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="evangelico_mackenzie">Evangélico/Mackenzie</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="angelina_caron">Angelina Caron</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="h_maternidade_sao_jose_dos_pinhais">
                          H. Maternidade São José dos Pinhais
                        </SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="hma_araucaria">Hma Araucária</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="rocio">Rocio</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="onix">Onix</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="marcelino_champagnat">Marcelino Champagnat</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="hospital_xv">Hospital XV</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="vita">Vita</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fraturas_novo_mundo">Fraturas Novo Mundo</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="cwb_santa_cruz">Cwb Santa Cruz</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="cwb_santa_casa">Cwb Santa Casa</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="nossa_saude">Nossa Saúde</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="nacoes">Nações</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="litoral">Litoral</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="pg_regional">Pg Regional</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="upa_santana">Upa Santana</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="upa_santa_paula">Upa Santa Paula</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="pg_bom_jesus">Pg Bom Jesus</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="pg_sao_camilo">Pg São Camilo</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="pg_unimed">Pg Unimed</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="pg_santa_casa">Pg Santa Casa</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="pg_pronto_socorro_amadeu_puppi">
                          Pg Pronto Socorro Amadeu Puppi
                        </SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="idf_telemaco_borba">Idf Telemaco Borba</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="regional_de_paranagua">Regional de Paranaguá</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="regional_pg">Regional Pg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Outro Hospital</Label>
                    <Input
                      name="outro_hospital"
                      value={formData?.outro_hospital || ""}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Lesões</Label>
                    <Select
                      onValueChange={(value) => handleSelectChange("lesoes", value)}
                      value={formData?.lesoes || ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione as lesões" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className="hover:bg-gray-200" value="fx_femur">FX Fêmur</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_tibia">FX Tíbia</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_pulso_mao_metatarso">FX Pulso/Mão/Metatarso</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_tornozelo">FX Tornozelo</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_mindilhos">FX Mindilhos</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_costela">FX Costela</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_coluna">FX Vértebra/Coluna</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_pelve">FX Pelve</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_joelho">FX Joelho</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="ligamento_joelho">Lesão no Ligamento Joelho</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="luxacao">Luxação</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="traumatismo">Traumatismo</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_exposta_cirurgia">FX Exposta/Cirurgia</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_braco">FX Braço</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_perna">FX Perna</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_pe">FX Pé</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_face_maxilar_nariz">FX Face, Maxilar, Nariz</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="fx_bacia">FX Bacia</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="laceracao">Laceração</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="pneumotorax">Pneumotórax</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="amputacao">Amputação</SelectItem>
                        <SelectItem className="hover:bg-gray-200" value="multiplas_fraturas">Múltiplas Fraturas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h1 className="text-lg font-semibold mb-4">Área dos Status</h1>
                <div className="flex justify-center">
                  <div className="grid grid-cols-2 gap-6 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="iniciado"
                        checked={localStatus.iniciado}
                        onChange={() => handleCheckboxChange("iniciado")}
                        className="w-4 h-4"
                      />
                      <Label
                        htmlFor="iniciado"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
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
                      <Label
                        htmlFor="aguardandoAssinatura"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
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
                      <Label
                        htmlFor="solicitarDocumentos"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
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
                      <Label
                        htmlFor="coletaDocumentos"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
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
                      <Label
                        htmlFor="analiseDocumentos"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
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
                      <Label
                        htmlFor="pericial"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
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
                      <Label
                        htmlFor="aguardandoPericial"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
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
                      <Label
                        htmlFor="pagamentoHonorario"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
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
                      <Label
                        htmlFor="processoEncerrado"
                        className="text-sm text-gray-700 whitespace-nowrap"
                      >
                        Processo encerrado
                      </Label>
                    </div>
                  </div>
                </div>
              </div>

              <Dropzone onDrop={handleDrop} src={files} onError={console.error}>
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>

              {uploading && <p>Enviando arquivos...</p>}
              {error && <p className="text-red-500">{error}</p>}

              {files.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-muted">
                        <th className="p-2 border">Nome do Arquivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file, index) => (
                        <tr key={index} className="border-b">
                          <td className="p-2 border truncate max-w-[200px]">{file.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </form>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
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
                          <span className="truncate max-w-[200px]">{doc.name}</span>
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
            <AlertDialogCancel className="bg-red-500 hover:bg-red-500/90 text-white w-full lg:w-[330px]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSave}
              className="w-full lg:w-[330px] bg-black hover:bg-black/70"
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