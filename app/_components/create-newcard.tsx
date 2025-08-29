/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
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
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/_components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { getUsers } from "../_actions/get-user";
import { createProcess } from "../_actions/create-process";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "./ui/label";

interface User {
  id: string;
  name: string;
  type: string;
  status?: string;
  statusStartedAt?: string | null;
  service?: string;
  obs?: string;
}

export function CreateNewCard() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>("");
  const [dataAcidente, setDataAcidente] = useState<string>("");
  const [atendimentoVia, setAtendimentoVia] = useState<string>("");
  const [hospital, setHospital] = useState<string>("");
  const [outroHospital, setOutroHospital] = useState<string>("");
  const [lesoes, setLesoes] = useState<string>("");
  const [service, setService] = useState<string>("");

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const usersData = await getUsers("basic");
        console.log("Dados recebidos:", usersData);
        if (Array.isArray(usersData)) {
          setUsers(usersData);
        } else {
          setError("Dados de usuários inválidos.");
        }
      } catch (error) {
        setError("Erro ao carregar os usuários.");
        console.error("Erro ao carregar os dados:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const filtered = users.filter((user) =>
      user.name.toLowerCase().includes(search.toLowerCase().trim())
    );
    console.log("Usuários filtrados:", filtered);
    return filtered;
  }, [users, search]);

  const selectedUserName = users.find((u) => u.id === selectedUser)?.name;

  const handleUserSelect = (userId: string) => {
    console.log("Usuário selecionado:", userId);
    setSelectedUser(userId);
  };

  const handleCreateProcess = async () => {
    if (!selectedUser) {
      setError("Selecione um usuário.");
      return;
    }

    setIsLoading(true);
    try {
      const newProcess = await createProcess({
        userId: selectedUser,
        type,
        service,
        data_acidente: dataAcidente,
        atendimento_via: atendimentoVia,
        hospital,
        outro_hospital: outroHospital,
        lesoes,
      });
      toast.success("Processo criado com sucesso!");
      setTimeout(() => {
        window.location.reload();
      }, 500);
      setSelectedUser("");
      setType("");
      setDataAcidente("");
      setAtendimentoVia("");
      setHospital("");
      setOutroHospital("");
      setLesoes("");
    } catch (error: any) {
      setError("Erro ao criar processo: " + error.message);
      toast.error("Erro ao criar processo: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>Duplicar Card</Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[100vw] sm:max-w-lg md:max-w-xl lg:max-w-5xl h-[600px] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Duplicar Card</AlertDialogTitle>
          <AlertDialogDescription>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : error ? (
              error
            ) : (
              "Escolha um usuário e preencha os dados do acidente para criar um novo processo."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4 space-y-4">
          {/* Exibir usuário selecionado */}
          <div className="mb-2">
            <p className="text-sm font-medium">
              Usuário selecionado: {selectedUserName || "Nenhum selecionado"}
            </p>
          </div>

          {/* Input de busca */}
          <Input
            placeholder="Pesquisar usuário..."
            value={search}
            onChange={(e) => {
              console.log("Texto de busca:", e.target.value);
              setSearch(e.target.value);
            }}
            className="mb-2"
          />

          {/* Lista de usuários */}
          <div className="max-h-[200px] overflow-y-auto border rounded-md">
            {filteredUsers.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <li
                    key={user.id}
                    className={`px-4 py-2 cursor-pointer hover:bg-gray-100 ${selectedUser === user.id ? "bg-blue-100 font-semibold" : ""
                      }`}
                    onClick={() => handleUserSelect(user.id)}
                  >
                    {user.name}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-2 text-sm text-muted-foreground">
                Nenhum usuário encontrado
              </div>
            )}
          </div>

          {/* Campos do Processo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Processo</Label>
              <Select
                onValueChange={setService}
                value={service}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o tipo de processo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INSS">INSS</SelectItem>
                  <SelectItem value="Seguro de Vida">Seguro de Vida</SelectItem>
                  <SelectItem value="RCF">RCF</SelectItem>
                  <SelectItem value="DPVAT">DPVAT</SelectItem>
                  <SelectItem value="SPVAT">SPVAT</SelectItem>
                  <SelectItem value="TRABALHISTA">TRABALHISTA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                onValueChange={setType}
                value={type}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione qual é o acidente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Acidente 1">Acidente 1</SelectItem>
                  <SelectItem value="Acidente 2">Acidente 2</SelectItem>
                  <SelectItem value="Acidente 3">Acidente 3</SelectItem>
                  <SelectItem value="Acidente 4">Acidente 4</SelectItem>
                  <SelectItem value="Acidente 5">Acidente 5</SelectItem>
                  <SelectItem value="Acidente 6">Acidente 6</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data do Acidente</Label>
              <Input
                type="date"
                value={dataAcidente}
                onChange={(e) => setDataAcidente(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <Label>Atendimento Via</Label>
              <Select
                onValueChange={setAtendimentoVia}
                value={atendimentoVia}
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
                onValueChange={setHospital}
                value={hospital}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o hospital" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trabalhador">Trabalhador</SelectItem>
                  <SelectItem value="cajuru">Cajuru</SelectItem>
                  {/* Adicione mais opções conforme necessário */}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Outro Hospital</Label>
              <Input
                value={outroHospital}
                onChange={(e) => setOutroHospital(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <Label>Lesões</Label>
              <Select
                onValueChange={setLesoes}
                value={lesoes}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione as lesões" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fx_femur">FX Fêmur</SelectItem>
                  <SelectItem value="fx_tibia">FX Tíbia</SelectItem>
                  {/* Adicione mais opções conforme necessário */}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!selectedUser || !service}
            onClick={handleCreateProcess}
          >
            Criar Processo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}