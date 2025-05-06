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
  const [isDocument, setIsDocument] = useState(true);

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

  const handleSelectChange = (name: string, value: string) => {
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
          {isDocument &&
          <div className="absolute right-[200px] flex space-x-4">
            <Button
              className="bg-indigo-800 hover:bg-indigo-900"
            >
              Gerar Contrato
            </Button>
            <Button
              className="bg-indigo-800 hover:bg-indigo-900"
            >
              Gerar Procuração
            </Button>
          </div>
          }
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
                  <Label>Role</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Role do cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem className="hover:bg-gray-200" value="1">.</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="2">.</SelectItem>
                      <SelectItem className="hover:bg-gray-200" value="3">.</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <tr className="border-b">
                    <td className="p-2 border truncate max-w-[200px]">Nome de algum arquivo</td>
                  </tr>
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