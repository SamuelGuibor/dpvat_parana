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
} from "@/app/_shared/ui/alert-dialog";
import { Button } from '@/app/_shared/ui/button';
import { Input } from "@/app/_shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/_shared/ui/select";
import { useEffect, useMemo, useState } from "react";
import { getUsers } from "@/app/_actions/users/get-user";
import { createProcess } from "@/app/_actions/process/create-process";
import {
  Loader2, Copy, Search, Check, User as UserIcon, Stethoscope,
  CalendarDays, Ambulance, Building2, Bandage, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/app/_shared/ui/label";
import { HospitalCombobox } from "@/app/nova-dash/card-dialog/HospitalCombobox";

interface User {
  id: string;
  name: string;
  role?: string;

  status?: string;
  statusStartedAt?: string | null;

  service?: string;
  obs?: string;

  labelId?: string | null;

  label?: {
    id: string;
    name: string;
    color: string;
    timeLimitDays?: number | null;
  } | null;
}



export function CreateNewCard() {
  const [open, setOpen] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
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

  // Carrega os usuários somente ao abrir o diálogo (evita buscar todo o banco
  // no carregamento do board, que era um custo grande e desnecessário).
  useEffect(() => {
    if (!open || loadedOnce) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const usersData = await getUsers("basic");
        if (cancelled) return;
        if (Array.isArray(usersData)) {
          setUsers(usersData);
          setLoadedOnce(true);
        } else {
          setError("Dados de usuários inválidos.");
        }
      } catch (error) {
        if (!cancelled) setError("Erro ao carregar os usuários.");
        console.error("Erro ao carregar os dados:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, loadedOnce]);

  const filteredUsers = useMemo(() => {
    // Não exibe usuários administradores como opção de cliente.
    const base = users.filter((user) => !user.role?.startsWith("ADMIN"));
    if (!search.trim()) return base;
    return base.filter((user) =>
      user.name.toLowerCase().includes(search.toLowerCase().trim())
    );
  }, [users, search]);

  const selectedUserData = users.find((u) => u.id === selectedUser);

  const selectedUserName = selectedUserData?.name;

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
      await createProcess({
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
      setService("");
    } catch (error: any) {
      setError("Erro ao criar processo: " + error.message);
      toast.error("Erro ao criar processo: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fieldLabel = "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-1.5";
  const triggerClasses = "w-full h-11 rounded-xl border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/50";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button className="h-12 rounded-2xl text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/40">
          <Copy className="w-4 h-4 mr-2" />
          Duplicar Card
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[100vw] sm:max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl p-0 gap-0 border-none">
        {/* Cabeçalho com destaque */}
        <AlertDialogHeader className="space-y-0 p-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-left">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
              <Copy className="w-5 h-5 text-white" />
            </div>
            <div>
              <AlertDialogTitle className="text-white text-lg font-black leading-tight">Duplicar Card</AlertDialogTitle>
              <AlertDialogDescription className="text-blue-100 text-xs">
                {error
                  ? <span className="text-red-100">{error}</span>
                  : "Escolha um cliente e preencha os dados do acidente para gerar um novo processo."}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(90vh-190px)]">
          {/* Seleção de cliente */}
          <div className="space-y-2">
            <span className={fieldLabel}><UserIcon className="w-3.5 h-3.5" /> Cliente</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500" />
              <Input
                placeholder="Pesquisar cliente pelo nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 rounded-xl border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950/50"
              />
            </div>

            <div className="max-h-[190px] overflow-y-auto rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400 dark:text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando clientes...
                </div>
              ) : filteredUsers.length > 0 ? (
                <ul className="p-1.5 space-y-1">
                  {filteredUsers.map((user) => {
                    const active = selectedUser === user.id;
                    return (
                      <li
                        key={user.id}
                        onClick={() => handleUserSelect(user.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${active
                            ? "bg-blue-50 dark:bg-blue-950/40 ring-1 ring-blue-200 dark:ring-blue-900"
                            : "hover:bg-gray-50 dark:hover:bg-zinc-800"
                          }`}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400"
                          }`}>
                          <UserIcon className="w-4 h-4" />
                        </div>
                        <span className={`flex-1 text-sm truncate ${active ? "font-bold text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-zinc-200"}`}>
                          {user.name}
                        </span>
                        {active && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-zinc-500">
                  Nenhum cliente encontrado
                </div>
              )}
            </div>
          </div>

          {/* Campos do Processo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className={fieldLabel}><Briefcase className="w-3.5 h-3.5" /> Tipo de Processo</span>
              <Select onValueChange={setService} value={service}>
                <SelectTrigger className={triggerClasses}>
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
              <span className={fieldLabel}><Stethoscope className="w-3.5 h-3.5" /> Tipo</span>
              <Select onValueChange={setType} value={type}>
                <SelectTrigger className={triggerClasses}>
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
              <span className={fieldLabel}><CalendarDays className="w-3.5 h-3.5" /> Data do Acidente</span>
              <Input
                type="date"
                value={dataAcidente}
                onChange={(e) => setDataAcidente(e.target.value)}
                className={triggerClasses}
              />
            </div>
            <div>
              <span className={fieldLabel}><Building2 className="w-3.5 h-3.5" /> Hospital</span>
              <HospitalCombobox
                id="hospital"
                label=""
                value={hospital}
                onChange={(_field, value) => setHospital(value)}
              />
            </div>
            <div>
              <span className={fieldLabel}><Building2 className="w-3.5 h-3.5" /> Outro Hospital</span>
              <Input
                value={outroHospital}
                onChange={(e) => setOutroHospital(e.target.value)}
                placeholder="Se não estiver na lista"
                className={triggerClasses}
              />
            </div>
            <div>
              <span className={fieldLabel}><Bandage className="w-3.5 h-3.5" /> Lesões</span>
              <Input
                value={lesoes}
                onChange={(e) => setLesoes(e.target.value)}
                placeholder="Descreva as lesões"
                className={triggerClasses}
              />
            </div>
          </div>
        </div>

        <AlertDialogFooter className="flex-row gap-3 p-6 pt-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950/40">
          <div className="mr-auto hidden sm:flex items-center gap-2 text-xs text-gray-500 dark:text-zinc-400">
            <UserIcon className="w-3.5 h-3.5" />
            {selectedUserName
              ? <span className="font-semibold text-gray-700 dark:text-zinc-200 truncate max-w-[220px]">{selectedUserName}</span>
              : <span>Nenhum cliente selecionado</span>}
          </div>
          <AlertDialogCancel className="rounded-xl h-11 mt-0">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!selectedUser || !service || isLoading}
            onClick={handleCreateProcess}
            className="rounded-xl h-11 bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            Criar Processo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}