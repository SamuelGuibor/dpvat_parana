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
import { getUsers } from "@/app/_actions/get-user";
import { updateUser } from "@/app/_actions/update-users";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "./dropzone";

interface UserData {
  id: string;
  name: string;
  status?: string;
  type: string;
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

interface DialogDashProps {
  userId: string;
  trigger: React.ReactNode;
}

const DialogDash = ({ userId, trigger }: DialogDashProps) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [localStatus, setLocalStatus] = useState({
    envioDocumentos: false,
    solicitacaoDocumentos: false,
    coletaDocumentos: false,
    analiseDocumentos: false,
    periciaPagamentos: false,
    dinheiroRecebido: false,
  });
  const [formData, setFormData] = useState<UserData | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
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
          envioDocumentos:
            userData.status === "ENVIO" ||
            userData.status === "SOLICITACAO" ||
            userData.status === "COLETA" ||
            userData.status === "ANALISE" ||
            userData.status === "PERICIA",
          solicitacaoDocumentos:
            userData.status === "SOLICITACAO" ||
            userData.status === "COLETA" ||
            userData.status === "ANALISE" ||
            userData.status === "PERICIA",
          coletaDocumentos:
            userData.status === "COLETA" ||
            userData.status === "ANALISE" ||
            userData.status === "PERICIA",
          analiseDocumentos:
            userData.status === "ANALISE" || userData.status === "PERICIA",
          periciaPagamentos: userData.status === "PERICIA",
          dinheiroRecebido: userData.status === "PERICIA",
        });
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

  const determineStatus = () => {
    if (localStatus.dinheiroRecebido || localStatus.periciaPagamentos) return "PERICIA";
    if (localStatus.analiseDocumentos) return "ANALISE";
    if (localStatus.coletaDocumentos) return "COLETA";
    if (localStatus.solicitacaoDocumentos) return "SOLICITACAO";
    if (localStatus.envioDocumentos) return "ENVIO";
    return undefined;
  };

  const handleCheckboxChange = (key: keyof typeof localStatus) => {
    setLocalStatus((prev) => {
      const newStatus = { ...prev };

      switch (key) {
        case "envioDocumentos":
          newStatus.envioDocumentos = !prev.envioDocumentos;
          if (!newStatus.envioDocumentos) {
            newStatus.solicitacaoDocumentos = false;
            newStatus.coletaDocumentos = false;
            newStatus.analiseDocumentos = false;
            newStatus.periciaPagamentos = false;
            newStatus.dinheiroRecebido = false;
          }
          break;
        case "solicitacaoDocumentos":
          if (prev.envioDocumentos) {
            newStatus.solicitacaoDocumentos = !prev.solicitacaoDocumentos;
            if (!newStatus.solicitacaoDocumentos) {
              newStatus.coletaDocumentos = false;
              newStatus.analiseDocumentos = false;
              newStatus.periciaPagamentos = false;
              newStatus.dinheiroRecebido = false;
            }
          }
          break;
        case "coletaDocumentos":
          if (prev.solicitacaoDocumentos) {
            newStatus.coletaDocumentos = !prev.coletaDocumentos;
            if (!newStatus.coletaDocumentos) {
              newStatus.analiseDocumentos = false;
              newStatus.periciaPagamentos = false;
              newStatus.dinheiroRecebido = false;
            }
          }
          break;
        case "analiseDocumentos":
          if (prev.coletaDocumentos) {
            newStatus.analiseDocumentos = !prev.analiseDocumentos;
            if (!newStatus.analiseDocumentos) {
              newStatus.periciaPagamentos = false;
              newStatus.dinheiroRecebido = false;
            }
          }
          break;
        case "periciaPagamentos":
          if (prev.analiseDocumentos) {
            newStatus.periciaPagamentos = !prev.periciaPagamentos;
            if (!newStatus.periciaPagamentos) {
              newStatus.dinheiroRecebido = false;
            }
          }
          break;
        case "dinheiroRecebido":
          if (prev.periciaPagamentos) {
            newStatus.dinheiroRecebido = !prev.dinheiroRecebido;
          }
          break;
      }

      return newStatus;
    });
  };

  const handleSave = async () => {
    if (!user || !formData) return;

    try {
      const updatedData = {
        ...formData,
        status: determineStatus(),
      };

      const updatedUser = await updateUser(updatedData);
      setUser(updatedUser);
      setFormData(updatedUser);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      setError("Não foi possível salvar as alterações.");
    }
  };


  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-3xl sm:max-w-lg md:max-w-xl lg:max-w-3xl flex flex-col max-h-[80vh]">
        <AlertDialogHeader>
          <AlertDialogTitle>Dados do Cliente: {user?.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Visualize ou altere os dados do cliente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-2 text-sm">
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
                <Input
                  name="estado"
                  value={formData?.estado || ""}
                  onChange={handleInputChange}
                />
              </div>
              <div>
                <Label>Estado Civil</Label>
                <Input
                  name="estado_civil"
                  value={formData?.estado_civil || ""}
                  onChange={handleInputChange}
                />
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
                <Input
                  name="nacionalidade"
                  value={formData?.nacionalidade || ""}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="mt-4">
              <h2 className="text-lg font-semibold mb-2">Dados do Acidente</h2>
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
                  <Input
                    name="atendimento_via"
                    value={formData?.atendimento_via || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <Label>Hospital</Label>
                  <Input
                    name="hospital"
                    value={formData?.hospital || ""}
                    onChange={handleInputChange}
                  />
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
                  <Input
                    name="lesoes"
                    value={formData?.lesoes || ""}
                    onChange={handleInputChange}
                  />
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
                      id="envioDocumentos"
                      checked={localStatus.envioDocumentos}
                      onChange={() => handleCheckboxChange("envioDocumentos")}
                      className="w-4 h-4"
                    />
                    <Label
                      htmlFor="envioDocumentos"
                      className="text-sm text-gray-700 whitespace-nowrap"
                    >
                      Envio de documentos e assinaturas
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="checkbox"
                      id="solicitacaoDocumentos"
                      checked={localStatus.solicitacaoDocumentos}
                      onChange={() => handleCheckboxChange("solicitacaoDocumentos")}
                      disabled={!localStatus.envioDocumentos}
                      className="w-4 h-4"
                    />
                    <Label
                      htmlFor="solicitacaoDocumentos"
                      className="text-sm text-gray-700 whitespace-nowrap"
                    >
                      Solicitação de documentos
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="checkbox"
                      id="coletaDocumentos"
                      checked={localStatus.coletaDocumentos}
                      onChange={() => handleCheckboxChange("coletaDocumentos")}
                      disabled={!localStatus.solicitacaoDocumentos}
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
                      Análise de documentos pela seguradora
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="checkbox"
                      id="periciaPagamentos"
                      checked={localStatus.periciaPagamentos}
                      onChange={() => handleCheckboxChange("periciaPagamentos")}
                      disabled={!localStatus.analiseDocumentos}
                      className="w-4 h-4"
                    />
                    <Label
                      htmlFor="periciaPagamentos"
                      className="text-sm text-gray-700 whitespace-nowrap"
                    >
                      Perícia médica e pagamentos
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="checkbox"
                      id="dinheiroRecebido"
                      checked={localStatus.dinheiroRecebido}
                      onChange={() => handleCheckboxChange("dinheiroRecebido")}
                      disabled={!localStatus.periciaPagamentos}
                      className="w-4 h-4"
                    />
                    <Label
                      htmlFor="dinheiroRecebido"
                      className="text-sm text-gray-700 whitespace-nowrap"
                    >
                      Você recebeu seu dinheiro!
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col h-[250px] w-full max-w-lg p-4 sm:p-6 md:p-8 mx-auto">
              <Dropzone onDrop={handleDrop} src={files} onError={console.error}>
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>
            </div>
          </form>

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