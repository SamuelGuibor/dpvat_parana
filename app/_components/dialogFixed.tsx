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
import { getProcess } from "@/app/_actions/get-process";
import { uploadFixed } from "@/app/_actions/uploadFixed";
import { uploadProcessFixed } from "@/app/_actions/uploadProcessFixed"
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "./dropzone";
import { Button } from "./ui/button";
import { getPresignedUrls } from '@/app/_actions/uploadS3';
import { downloadFileFromS3 } from '@/app/_actions/downloadS3';
import { Download, Loader2 } from 'lucide-react';
import { toast } from "sonner";
import { updateProcessRole } from "../_actions/statusTimerProcess";
import { updateUserRole } from "../_actions/statusTimer";
import { ToggleFixedButton } from "./toggle";
import { toggleFixed } from "../_actions/uploadStatusFixed";

interface ItemData {
    id: string;
    name: string;
    type: string;
    roleFixed?: string;
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
    service?: string;
    obs?: string;
    fixed?: boolean;
}

interface UpdateItemData {
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
    roleFixed?: string;
    nome_res?: string;
    rg_res?: string;
    cpf_res?: string;
    estado_civil_res?: string;
    profissao_res?: string;
    obs?: string;
    service?: string;
    fixed?: boolean;
}

interface FileWithBase64 {
    name: string;
    type: string;
    base64: string;
}

interface DialogDashProps {
    userId: string;
    isProcess?: boolean;
    trigger: React.ReactNode;
}

interface Fixed {
    userId: string,
    fixed?: boolean
}

const DialogDashFixed = ({ userId, isProcess = false, trigger }: DialogDashProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [item, setItem] = useState<ItemData | null>(null);
    const [fixed, setFixed] = useState<Fixed | null>(null);
    const [formData, setFormData] = useState<ItemData | null>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [base64Files, setBase64Files] = useState<FileWithBase64[]>([]);
    const [uploading, setUploading] = useState(false);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isDocument, setIsDocument] = useState(true);
    const [itemDocuments, setItemDocuments] = useState<{ key: string; name: string }[]>([]);

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
            setError('Erro: ID não fornecido.');
            toast.error('ID não fornecido.');
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

            const response = await getPresignedUrls(fileInfos, userId, isProcess);

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
                    isProcess,
                    documents: validUploads,
                }),
            });

            setItemDocuments((prev) => [...prev, ...validUploads]);
            await fetchItemDocuments();
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

    useEffect(() => {
        async function fetchItem() {
            try {
                setIsLoading(true);
                const fetchFunction = isProcess ? getProcess : getUsers;
                const itemData = await fetchFunction("full", userId);
                if (!itemData || Array.isArray(itemData)) {
                    throw new Error(isProcess ? "Processo não encontrado ou resposta inválida." : "Usuário não encontrado ou resposta inválida.");
                }
                setItem(itemData);
                setFormData(itemData);
                await fetchItemDocuments();
            } catch (error) {
                console.error(`Erro ao buscar ${isProcess ? 'processo' : 'usuário'}:`, error);
                setError(`Não foi possível carregar os dados do ${isProcess ? 'processo' : 'usuário'}.`);
            } finally {
                setIsLoading(false);
            }
        }
        if (isOpen) {
            fetchItem();
        }
    }, [isOpen, userId, isProcess]);

    const fetchItemDocuments = async () => {
        try {
            const response = await fetch(`/api/documents?userId=${userId}&isProcess=${isProcess}`);
            if (!response.ok) {
                throw new Error('Erro ao buscar documentos');
            }
            const documents = await response.json();
            setItemDocuments(documents);
        } catch (err) {
            console.error('Erro ao buscar documentos:', err);
            setError('Erro ao carregar documentos.');
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => (prev ? { ...prev, [name]: value } : null));
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData((prev) => (prev ? { ...prev, [name]: value } : null));
    };

    const handleSave = async () => {
        if (!item || !formData) return;

        try {
            // Upload files to S3 first
            await uploadFilesToS3();

            // Prepare the update data, including all fields that have changed or need to be saved
            const updatedData: UpdateItemData = {
                id: formData.id,
                name: formData.name,
                cpf: formData.cpf,
                data_nasc: formData.data_nasc,
                email: formData.email,
                rua: formData.rua,
                bairro: formData.bairro,
                numero: formData.numero,
                cep: formData.cep,
                rg: formData.rg,
                nome_mae: formData.nome_mae,
                telefone: formData.telefone,
                cidade: formData.cidade,
                estado: formData.estado,
                estado_civil: formData.estado_civil,
                profissao: formData.profissao,
                nacionalidade: formData.nacionalidade,
                data_acidente: formData.data_acidente,
                atendimento_via: formData.atendimento_via,
                hospital: formData.hospital,
                outro_hospital: formData.outro_hospital,
                lesoes: formData.lesoes,
                roleFixed: formData.roleFixed,
                nome_res: formData.nome_res,
                rg_res: formData.rg_res,
                cpf_res: formData.cpf_res,
                estado_civil_res: formData.estado_civil_res,
                profissao_res: formData.profissao_res,
                obs: formData.obs,
                service: formData.service,
            };

            // Only update if at least one field has changed
            const hasChanges = Object.keys(updatedData).some((key) => {
                const typedKey = key as keyof ItemData;
                return typedKey !== "id" && formData[typedKey] !== item[typedKey];
            });

            let updatedItem;
            if (hasChanges) {
                const updateFunction = isProcess ? uploadProcessFixed : uploadFixed;
                updatedItem = await updateFunction(updatedData);
            } else {
                updatedItem = item; // No changes, return original item
            }

            setItem(updatedItem);
            setFormData(updatedItem);
            setError(null);
            toast.success("Dados salvos com sucesso!");
            setTimeout(() => {
                window.location.reload();
            }, 500);
        } catch (error: any) {
            console.error("Erro ao salvar:", error);
            setError("Não foi possível salvar as alterações: " + error.message);
            toast.error("Não foi possível salvar as alterações: " + error.message);
        }
    };

    const handleToggleFixed = async () => {
        try {
            const updated = await toggleFixed({ userId, isProcess });
            setItem(prev => prev ? { ...prev, fixed: updated.fixed } : null);
            setFormData(prev => prev ? { ...prev, fixed: updated.fixed } : null);
            setFixed(updated);
            setTimeout(() => {
                window.location.reload();
            }, 500);
        } catch (error: any) {
            console.error("Erro ao atualizar fixed:", error);
            setError("Não foi possível atualizar o status fixed: " + error.message);
            toast.error("Não foi possível atualizar o status fixed: " + error.message);
        }
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen} >
            <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
            <AlertDialogContent className="max-w-[95vw] sm:max-w-lg md:max-w-xl lg:max-w-5xl flex flex-col max-h-[80vh] p-4 sm:p-6">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-base sm:text-[20px]">
                        Dados do <span className="font-bold text-blue-600">{item?.name}</span>
                    </AlertDialogTitle>
                    <div className="flex flex-col sm:flex-row sm:absolute sm:right-0 sm:pr-5 gap-2 mt-2 sm:mt-0">

                        {(item?.fixed ?? false) && <ToggleFixedButton fixed={item?.fixed ?? false} onToggle={handleToggleFixed} />}
                        <Button onClick={() => setIsDocument(!isDocument)} className="w-full sm:w-auto">
                            {isDocument ? "Ver Documentos" : "Ver Status"}
                        </Button>
                    </div>
                    <AlertDialogDescription className="text-sm sm:text-base">
                        Visualize ou altere os dados do {isProcess ? 'processo' : 'cliente'}.
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
                                            <SelectItem className="hover:bg-slate-100" value="parana">Paraná</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="santa_catarina">Santa Catarina</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="sao_paulo">São Paulo</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="rio_grande_do_sul">Rio Grande do Sul</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="mato_grosso">Mato Grosso</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="mato_grosso_do_sul">Mato Grosso do Sul</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="rio_de_janeiro">Rio de Janeiro</SelectItem>
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
                                            <SelectItem className="hover:bg-slate-100" value="Solteiro">Solteiro(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Casado">Casado(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Divorciado">Divorciado(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Viuvo">Viúvo(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Uniao_Estavel">União Estável</SelectItem>
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
                                            <SelectItem className="hover:bg-slate-100" value="Brasileiro">Brasileiro(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Venezuelano">Venezuelano(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Colombiano">Colombiano(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Uruguaio">Uruguaio(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Argentino">Argentino(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Peruano">Peruano(a)</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Boliviano">Boliviano(a)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-1 sm:col-span-2">
                                    <Label className="text-blue-600 font-semibold">Etiquetas</Label>
                                    <Select
                                        onValueChange={(value) => handleSelectChange("roleFixed", value)}
                                        value={formData?.roleFixed || ""}
                                    >
                                        <SelectTrigger className="w-full bg-blue-100 border-2 border-blue-500">
                                            <SelectValue placeholder="Selecione um serviço" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem className="hover:bg-slate-100" value="Acompanhamento de fluxo 1">Acompanhamento de fluxo 1</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Acompanhamento de fluxo 2">Acompanhamento de fluxo 2</SelectItem>
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
                                            <SelectItem className="hover:bg-slate-100" value="INSS">INSS</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="Seguro de Vida">Seguro de Vida</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="RCF">RCF</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="DPVAT">DPVAT</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="SPVAT">SPVAT</SelectItem>
                                            <SelectItem className="hover:bg-slate-100" value="TRABALHISTA">TRABALHISTA</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>Observação</Label>
                                    <Input
                                        name="obs"
                                        value={formData?.obs || ""}
                                        onChange={handleInputChange}
                                        className="w-full bg-yellow-100"
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
                                                <SelectItem className="hover:bg-slate-100" value="Solteiro">Solteiro(a)</SelectItem>
                                                <SelectItem className="hover:bg-slate-100" value="Casado">Casado(a)</SelectItem>
                                                <SelectItem className="hover:bg-slate-100" value="Divorciado">Divorciado(a)</SelectItem>
                                                <SelectItem className="hover:bg-slate-100" value="Viuvo">Viúvo(a)</SelectItem>
                                                <SelectItem className="hover:bg-slate-100" value="Uniao_Estavel">União Estável</SelectItem>
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
                                                <SelectItem className="hover:bg-slate-100" value="Siate">SIATE</SelectItem>
                                                <SelectItem className="hover:bg-slate-100" value="Samu">SAMU/OUTRAS AMBULÂNCIAS</SelectItem>
                                                <SelectItem className="hover:bg-slate-100" value="Procura_Direta">PROCURA DIRETA</SelectItem>
                                                <SelectItem className="hover:bg-slate-100" value="Arteris">ARTERIS</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Hospital</Label>
                                        <Input
                                            name="hospital"
                                            value={formData?.hospital || ""}
                                            onChange={handleInputChange}
                                            className="w-full"
                                        />
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
                                        <Input
                                            name="lesoes"
                                            value={formData?.lesoes || ""}
                                            onChange={handleInputChange}
                                            className="w-full"
                                        />
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
                                    {itemDocuments.length > 0 ? (
                                        itemDocuments.map((doc, index) => (
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

export default DialogDashFixed;