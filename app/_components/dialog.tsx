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
  const [files, setFiles] = useState<File[] | undefined>();

  const handleDrop = (files: File[]) => {
    console.log(files);
    setFiles(files);
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
                  <Label htmlFor="nome" className="text-blue-400">
                    Nome
                  </Label>
                  <Input id="nome" defaultValue="" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rg" className="text-blue-400">
                    RG
                  </Label>
                  <Input id="rg" defaultValue="" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cpf" className="text-blue-400">
                    CPF
                  </Label>
                  <Input id="cpf" defaultValue="123.456.789-10" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="nascimento" className="text-blue-400">
                    Data de Nascimento
                  </Label>
                  <Input id="nascimento" defaultValue="01/01/2001" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="mae" className="text-blue-400">
                    Nome da Mãe
                  </Label>
                  <Input
                    id="mae"
                    defaultValue="Nome Da Mãe da Silva"
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="telefone" className="text-blue-400">
                    Telefone
                  </Label>
                  <Input id="telefone" defaultValue="(41) 9999-9999" disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="nacionalidade" className="text-blue-400">
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
                  <Label htmlFor="estadoCivil" className="text-blue-400">
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
                  <Label htmlFor="profissao" className="text-blue-400">
                    Profissão
                  </Label>
                  <Input id="profissao" defaultValue="" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="email" className="text-blue-400">
                    Email
                  </Label>
                  <Input id="email" defaultValue="email@gmail.com" disabled />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <Label htmlFor="dataAcidente" className="text-blue-400">
                    Data do Acidente
                  </Label>
                  <Input id="dataAcidente" defaultValue="01/01/01" disabled />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="atendimento" className="text-blue-400">
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
                  <Label htmlFor="hospital" className="text-blue-400">
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
                  <Label htmlFor="outroHospital" className="text-blue-400">
                    Outro hospital
                  </Label>
                  <Input id="outroHospital" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="lesoes" className="text-blue-400">
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
                  <Label htmlFor="rua" className="text-blue-400">
                    Rua
                  </Label>
                  <Input id="rua" defaultValue="Rua das ruas" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="numero" className="text-blue-400">
                    N° da Casa
                  </Label>
                  <Input id="numero" defaultValue="" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cep" className="text-blue-400">
                    CEP
                  </Label>
                  <Input id="cep" defaultValue="12345-678" disabled />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="bairro" className="text-blue-400">
                    Bairro
                  </Label>
                  <Input
                    id="bairro"
                    defaultValue="Bairro dos bairros"
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cidade" className="text-blue-400">
                    Cidade
                  </Label>
                  <Input
                    id="cidade"
                    defaultValue="Cidade das cidades"
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="estado" className="text-blue-400">
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
                  <Label htmlFor="gastos" className="text-blue-400">
                    Gastos/Despesas
                  </Label>
                  <Input
                    id="gastos"
                    defaultValue="Adicionar gastos/despesas"
                    disabled
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="processo" className="text-blue-400">
                    N° do Processo
                  </Label>
                  <Input
                    id="processo"
                    defaultValue="Adicionar n° do processo"
                  />
                </div>
              </div>
              <div className="flex h-[250px]  w-full max-w-lg items-center justify-center p-4 sm:p-6 md:p-8 mx-auto">
                <Dropzone
                  maxSize={1024 * 1024 * 10}
                  minSize={1024}
                  maxFiles={10}
                  accept={{ "image/*": [] }}
                  onDrop={handleDrop}
                  src={files}
                  onError={console.error}
                >
                  <DropzoneEmptyState />
                  <DropzoneContent />
                </Dropzone>
              </div>
            </form>
          </div>

          <AlertDialogFooter className="border-t pt-4">
            <div className="flex flex-col sm:flex-row gap-2 mx-auto w-full justify-center">
              <AlertDialogCancel className="bg-red-500 hover:bg-red-500 hover:text-white text-white w-full lg:w-[330px]">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction className="w-full lg:w-[330px] bg-green-500/70 hover:bg-green-500">
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
