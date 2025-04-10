"use client";

import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
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
} from "../_components/ui/alert-dialog";

const DialogDash = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [localStatus, setLocalStatus] = useState({
    envioDocumentos: false,
    solicitacaoDocumentos: false,
    coletaDocumentos: false,
    analiseDocumentos: false,
    periciaPagamentos: false,
    dinheiroRecebido: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Buscar o status inicial do servidor
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/user-status", { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status");
        const serverStatus = await response.json();
        // Garantir que serverStatus seja uma string ou null
        const mappedStatus = mapServerStatusToLocal(
          serverStatus as string | null
        );
        setLocalStatus(mappedStatus);
      } catch (error) {
        console.error(error);
        // Em caso de erro, manter o estado inicial
        setLocalStatus({
          envioDocumentos: false,
          solicitacaoDocumentos: false,
          coletaDocumentos: false,
          analiseDocumentos: false,
          periciaPagamentos: false,
          dinheiroRecebido: false,
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
  };

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

      // Atualizar o servidor
      const serverStatus = determineServerStatus(newStatus);
      if (serverStatus) {
        fetch("/api/user-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newStatus: serverStatus }),
        }).catch((error) => console.error("Erro ao atualizar status:", error));
      }

      return newStatus;
    });
  };

  if (isLoading) return <div>Carregando...</div>;

  return (
    <div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="link"
            className="w-fit px-0 text-left text-foreground"
          >
            Nome
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-3xl sm:max-w-lg md:max-w-xl lg:max-w-3xl flex flex-col max-h-[80vh]">
          <AlertDialogHeader>
            <AlertDialogTitle>Dados do Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Visualize ou altere os dados do cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-y-auto px-4 py-2 text-sm">
            <form className="flex flex-col gap-6">
              {/* ... outros campos permanecem iguais ... */}
              <div>
                <h1 className="text-lg font-semibold mb-4">Área dos status</h1>
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
                        onChange={() =>
                          handleCheckboxChange("solicitacaoDocumentos")
                        }
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
                        onChange={() =>
                          handleCheckboxChange("coletaDocumentos")
                        }
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
                        onChange={() =>
                          handleCheckboxChange("analiseDocumentos")
                        }
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
                        onChange={() =>
                          handleCheckboxChange("periciaPagamentos")
                        }
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
                        onChange={() =>
                          handleCheckboxChange("dinheiroRecebido")
                        }
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
            </form>
          </div>
          <AlertDialogFooter className="border-t pt-4">
            <div className="flex flex-col sm:flex-row gap-2 mx-auto w-full justify-center">
              <AlertDialogCancel className="bg-red-500 hover:bg-red-500/90 hover:text-white text-white w-full lg:w-[330px]">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction className="w-full lg:w-[330px] bg-black hover:bg-black/70">
                Salvar
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  serverStatus: string | null
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

  switch (serverStatus) {
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
      status.dinheiroRecebido = true;
      break;
    default:
      break;
  }

  return status;
};

export default DialogDash;
