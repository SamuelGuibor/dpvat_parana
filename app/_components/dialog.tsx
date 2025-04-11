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
import { getUser } from "@/app/_actions/get-user";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "./dropzone";

interface UserData {
  id: string;
  name: string;
  status: string;
  type: string;
  cpf: string;
  data_nasc: string;
  email: string;
  rua: string;
  bairro: string;
  numero: string;
  cep: string;
  rg: string;
  nome_mae: string;
  telefone: string;
  cidade: string;
  estado: string;
  estado_civil: string;
  profissao: string;
  nacionalidade: string;
  acidente?: {
    data_acidente: string;
    atendimento_via: string;
    hospital: string;
    outro_hospital: string;
    lesoes: string;
  };
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
  const [files, setFiles] = useState<File[]>([]);
  const handleDrop = (acceptedFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
  };

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const userData = await getUser(userId);
        setUser(userData);
        const mappedStatus = mapServerStatusToLocal(userData.status);
        setLocalStatus(mappedStatus);
      } catch (error) {
        console.error("Erro ao buscar usuário:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchUser();
  }, [userId]);

  const handleCheckboxChange = async (key: string) => {
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
        default:
          break;
      }

      const serverStatus = determineServerStatus(newStatus);
      if (serverStatus && user) {
        fetch(`/api/user-status/${user.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: serverStatus }),
        }).catch((error) => console.error("Erro ao atualizar status:", error));
      }

      return newStatus;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    const serverStatus = determineServerStatus(localStatus);
    if (serverStatus) {
      try {
        const response = await fetch(`/api/user-status/${user.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: serverStatus }),
        });
        if (!response.ok) throw new Error("Erro ao salvar status");
      } catch (error) {
        console.error("Erro ao salvar:", error);
      }
    }
  };

  if (!user) return;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-3xl sm:max-w-lg md:max-w-xl lg:max-w-3xl flex flex-col max-h-[80vh]">
        <AlertDialogHeader>
          <AlertDialogTitle>Dados do Cliente: {user.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Visualize ou altere os dados do cliente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-2 text-sm">
          <form className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome</Label>
                <Input value={user.name} readOnly />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={user.cpf} />
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <Input value={user.data_nasc} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={user.email} />
              </div>
              <div>
                <Label>Rua</Label>
                <Input value={user.rua} />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input value={user.bairro} />
              </div>
              <div>
                <Label>Número</Label>
                <Input value={user.numero} />
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={user.cep} />
              </div>
              <div>
                <Label>RG</Label>
                <Input value={user.rg} />
              </div>
              <div>
                <Label>Nome da Mãe</Label>
                <Input value={user.nome_mae} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={user.telefone} />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={user.cidade} />
              </div>
              <div>
                <Label>Estado</Label>
                <Input value={user.estado} />
              </div>
              <div>
                <Label>Estado Civil</Label>
                <Input value={user.estado_civil} />
              </div>
              <div>
                <Label>Profissão</Label>
                <Input value={user.profissao} />
              </div>
              <div>
                <Label>Nacionalidade</Label>
                <Input value={user.nacionalidade} />
              </div>
            </div>

            <div className="mt-4">
              <h2 className="text-lg font-semibold mb-2">Dados do Acidente</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data do Acidente</Label>
                  <Input value={user.acidente?.data_acidente || ""} />
                </div>
                <div>
                  <Label>Atendimento Via</Label>
                  <Input value={user.acidente?.atendimento_via || ""} />
                </div>
                <div>
                  <Label>Hospital</Label>
                  <Input value={user.acidente?.hospital || ""} />
                </div>
                <div>
                  <Label>Outro Hospital</Label>
                  <Input value={user.acidente?.outro_hospital || ""} />
                </div>
                <div className="col-span-2">
                  <Label>Lesões</Label>
                  <Input value={user.acidente?.lesoes || ""} />
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
                    <Label htmlFor="envioDocumentos" className="text-sm text-gray-700 whitespace-nowrap">
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
                    <Label htmlFor="solicitacaoDocumentos" className="text-sm text-gray-700 whitespace-nowrap">
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
                    <Label htmlFor="periciaPagamentos" className="text-sm text-gray-700 whitespace-nowrap">
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
                    <Label htmlFor="dinheiroRecebido" className="text-sm text-gray-700 whitespace-nowrap">
                      Você recebeu seu dinheiro!
                    </Label>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col h-[250px] w-full max-w-lg p-4 sm:p-6 md:p-8 mx-auto">
              <Dropzone
                onDrop={handleDrop}
                src={files}
                onError={console.error}
              >
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>
            </div>
          </form>
          {files && files.length > 0 && (
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
            <AlertDialogCancel className="bg-red-500 hover:bg-red-500/90 hover:text-white text-white w-full lg:w-[330px]">
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

// Funções auxiliares
const determineServerStatus = (status: {
  envioDocumentos: boolean;
  solicitacaoDocumentos: boolean;
  coletaDocumentos: boolean;
  analiseDocumentos: boolean;
  periciaPagamentos: boolean;
  dinheiroRecebido: boolean;
}): string | null => {
  if (status.dinheiroRecebido || status.periciaPagamentos) return "PERICIA";
  if (status.analiseDocumentos) return "ANALISE";
  if (status.coletaDocumentos) return "COLETA";
  if (status.solicitacaoDocumentos) return "SOLICITACAO";
  if (status.envioDocumentos) return "ENVIO";
  return null;
};

const mapServerStatusToLocal = (
  serverStatus: string
): {
  envioDocumentos: boolean;
  solicitacaoDocumentos: boolean;
  coletaDocumentos: boolean;
  analiseDocumentos: boolean;
  periciaPagamentos: boolean;
  dinheiroRecebido: boolean;
} => {
  const status = {
    envioDocumentos: false,
    solicitacaoDocumentos: false,
    coletaDocumentos: false,
    analiseDocumentos: false,
    periciaPagamentos: false,
    dinheiroRecebido: false,
  };

  if (!serverStatus) return status;

  switch (serverStatus.toUpperCase()) {
    case "ENVIO":
      status.envioDocumentos = true;
      break;
    case "SOLICITACAO":
      status.envioDocumentos = true;
      status.solicitacaoDocumentos = true;
      break;
    case "COLETA":
      status.envioDocumentos = true;
      status.solicitacaoDocumentos = true;
      status.coletaDocumentos = true;
      break;
    case "ANALISE":
      status.envioDocumentos = true;
      status.solicitacaoDocumentos = true;
      status.coletaDocumentos = true;
      status.analiseDocumentos = true;
      break;
    case "PERICIA":
      status.envioDocumentos = true;
      status.solicitacaoDocumentos = true;
      status.coletaDocumentos = true;
      status.analiseDocumentos = true;
      status.periciaPagamentos = true;
      break;
    default:
      break;
  }

  return status;
};

export default DialogDash;