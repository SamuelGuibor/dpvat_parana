/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

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
import { useState } from "react";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "./dropzone";

const DialogDash = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState({
    envioDocumentos: false,
    solicitacaoDocumentos: false,
    coletaDocumentos: false,
    analiseDocumentos: false,
    periciaPagamentos: false,
    dinheiroRecebido: false,
  });

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
  };

  const handleCheckboxChange = (key: string) => {
    setStatus((prev) => {
      const newStatus = { ...prev };

      switch (key) {
        case 'envioDocumentos':
          newStatus.envioDocumentos = !prev.envioDocumentos;
          if (!newStatus.envioDocumentos) {
            newStatus.solicitacaoDocumentos = false;
            newStatus.coletaDocumentos = false;
            newStatus.analiseDocumentos = false;
            newStatus.periciaPagamentos = false;
            newStatus.dinheiroRecebido = false;
          }
          break;
        case 'solicitacaoDocumentos':
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
        case 'coletaDocumentos':
          if (prev.solicitacaoDocumentos) {
            newStatus.coletaDocumentos = !prev.coletaDocumentos;
            if (!newStatus.coletaDocumentos) {
              newStatus.analiseDocumentos = false;
              newStatus.periciaPagamentos = false;
              newStatus.dinheiroRecebido = false;
            }
          }
          break;
        case 'analiseDocumentos':
          if (prev.coletaDocumentos) {
            newStatus.analiseDocumentos = !prev.analiseDocumentos;
            if (!newStatus.analiseDocumentos) {
              newStatus.periciaPagamentos = false;
              newStatus.dinheiroRecebido = false;
            }
          }
          break;
        case 'periciaPagamentos':
          if (prev.analiseDocumentos) {
            newStatus.periciaPagamentos = !prev.periciaPagamentos;
            if (!newStatus.periciaPagamentos) {
              newStatus.dinheiroRecebido = false;
            }
          }
          break;
        case 'dinheiroRecebido':
          if (prev.periciaPagamentos) {
            newStatus.dinheiroRecebido = !prev.dinheiroRecebido;
          }
          break;
        default:
          break;
      }
      return newStatus;
    });
  };

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
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="nome" className="text-black">
                    Nome
                  </Label>
                  <Input id="nome" defaultValue="" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rg" className="text-black">
                    RG
                  </Label>
                  <Input id="rg" defaultValue="" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cpf" className="text-black">
                    CPF
                  </Label>
                  <Input id="cpf" defaultValue="123.456.789-10" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="nascimento" className="text-black">
                    Data de Nascimento
                  </Label>
                  <Input id="nascimento" defaultValue="01/01/2001" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="mae" className="text-black">
                    Nome da Mãe
                  </Label>
                  <Input
                    id="mae"
                    defaultValue="Nome Da Mãe da Silva"
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="telefone" className="text-black">
                    Telefone
                  </Label>
                  <Input id="telefone" defaultValue="(41) 9999-9999" disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="nacionalidade" className="text-black">
                    Nacionalidade
                  </Label>
                  <Select defaultValue="">
                    <SelectTrigger id="nacionalidade">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="br">Brasileiro (a)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="estadoCivil" className="text-black">
                    Estado Civil
                  </Label>
                  <Select defaultValue="">
                    <SelectTrigger id="estadoCivil">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Solteiro">Solteiro (a)</SelectItem>
                      <SelectItem value="Casado">Casado (a)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="profissao" className="text-black">
                    Profissão
                  </Label>
                  <Input id="profissao" defaultValue="" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="email" className="text-black">
                    Email
                  </Label>
                  <Input id="email" defaultValue="email@gmail.com" disabled />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <Label htmlFor="dataAcidente" className="text-black">
                    Data do Acidente
                  </Label>
                  <Input id="dataAcidente" defaultValue="01/01/01" disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="atendimento" className="text-black">
                    Atendimento Via
                  </Label>
                  <Select defaultValue="">
                    <SelectTrigger id="atendimento">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="siate">Siate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="hospital" className="text-black">
                    Hospital
                  </Label>
                  <Select defaultValue="">
                    <SelectTrigger id="hospital">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hospital">Hospital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <Label htmlFor="outroHospital" className="text-black">
                    Outro hospital
                  </Label>
                  <Input id="outroHospital" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="lesoes" className="text-black">
                  Lesões
                </Label>
                <Select defaultValue="">
                  <SelectTrigger id="lesoes">
                    <SelectValue placeholder="Selecione a Lesão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lesao1">Eddie Lake</SelectItem>
                    <SelectItem value="lesao2">Jamik Tashpulatov</SelectItem>
                    <SelectItem value="lesao3">Emily Whalen</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rua" className="text-black">
                    Rua
                  </Label>
                  <Input id="rua" defaultValue="Rua das ruas" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="numero" className="text-black">
                    N° da Casa
                  </Label>
                  <Input id="numero" defaultValue="" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cep" className="text-black">
                    CEP
                  </Label>
                  <Input id="cep" defaultValue="12345-678" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="bairro" className="text-black">
                    Bairro
                  </Label>
                  <Input
                    id="bairro"
                    defaultValue="Bairro dos bairros"
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cidade" className="text-black">
                    Cidade
                  </Label>
                  <Input
                    id="cidade"
                    defaultValue="Cidade das cidades"
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="estado" className="text-black">
                    Estado
                  </Label>
                  <Select defaultValue="Paraná">
                    <SelectTrigger id="estado">
                      <SelectValue placeholder="Selecione o Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pr">Paraná</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="gastos" className="text-black">
                    Gastos/Despesas
                  </Label>
                  <Input
                    id="gastos"
                    defaultValue="Adicionar gastos/despesas"
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="processo" className="text-black">
                    N° do Processo
                  </Label>
                  <Input
                    id="processo"
                    defaultValue="Adicionar n° do processo"
                  />
                </div>
              </div>

              <div>
                <h1 className="text-lg font-semibold mb-4">Área dos status</h1>
                <div className="flex justify-center">
                  <div className="grid grid-cols-2 gap-6 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <Input
                        type="checkbox"
                        id="envioDocumentos"
                        checked={status.envioDocumentos}
                        onChange={() => handleCheckboxChange('envioDocumentos')}
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
                        checked={status.solicitacaoDocumentos}
                        onChange={() => handleCheckboxChange('solicitacaoDocumentos')}
                        disabled={!status.envioDocumentos}
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
                        checked={status.coletaDocumentos}
                        onChange={() => handleCheckboxChange('coletaDocumentos')}
                        disabled={!status.solicitacaoDocumentos}
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
                        checked={status.analiseDocumentos}
                        onChange={() => handleCheckboxChange('analiseDocumentos')}
                        disabled={!status.coletaDocumentos}
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
                        checked={status.periciaPagamentos}
                        onChange={() => handleCheckboxChange('periciaPagamentos')}
                        disabled={!status.analiseDocumentos}
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
                        checked={status.dinheiroRecebido}
                        onChange={() => handleCheckboxChange('dinheiroRecebido')}
                        disabled={!status.periciaPagamentos}
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

export default DialogDash;