/* eslint-disable @next/next/no-img-element */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/app/_components/ui/button";
import { Card, CardContent } from "@/app/_components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/app/_components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/app/_components/ui/carousel";
import { Checkbox } from "@/app/_components/ui/checkbox";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { GetMessages } from "@/app/_actions/get-messages";
import { CreateMessages } from "@/app/_actions/create-message";
import { CreateSubMessage } from "@/app/_actions/create-subMessage";
import { DeleteMessage } from "@/app/_actions/delete-message";
import { SendMessages } from "@/app/_actions/send-messages";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/app/_components/dropzone";
import Image from "next/image";
import { cn } from "@/app/_lib/utils";
import { useRouter } from "next/navigation";

interface Mensagem {
  id: string;
  titulo: string;
  role?: string; 
  SubMessage?: {
    id: string;
    conteudo: string;
    messageId: string;
  }[];
}

export function Mensagens() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [selecionadas, setSelecionadas] = useState<{
    mensagemId: string;
    subMensagemId: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openCreateSubmessage, setOpenCreateSubmessage] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [subMensagens, setSubMensagens] = useState<string[]>([""]);
  const [selectedRole, setSelectedRole] = useState("USER");
  const [createError, setCreateError] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const router = useRouter()

  useEffect(() => {
    async function fetchMessages() {
      try {
        setLoading(true);
        const data = await GetMessages();
        setMensagens(data);
      } catch (err: any) {
        setError("Falha ao carregar mensagens: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchMessages();
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setUploadedFiles((prev) => [...prev, ...acceptedFiles]);
  }, []);

  const createMessage = async () => {
    try {
      setCreateError(null);
      const newMessage = {
        titulo,
        role: selectedRole,
        SubMessage: subMensagens
          .filter((content) => content.trim() !== "")
          .map((conteudo) => ({ conteudo })),
      };
      const created = await CreateMessages(newMessage);
      setMensagens((prev) => [...prev, created as Mensagem]);
      setTitulo("");
      setSubMensagens([""]);
      setSelectedRole("USER");
      setUploadedFiles([]);
      setOpenCreateDialog(false);
      setShowColorPicker(false);
    } catch (err: any) {
      setCreateError("Erro ao criar mensagem: " + err.message);
    }
  };

  const createSubMessage = async () => {
    if (!selectedMessageId) {
      setCreateError("Selecione uma mensagem para adicionar a sub-mensagem.");
      return;
    }

    try {
      setCreateError(null);
      for (const conteudo of subMensagens.filter((c) => c.trim() !== "")) {
        const newSubMessage = {
          conteudo,
          messageId: selectedMessageId,
        };
        const created = await CreateSubMessage(newSubMessage);
        setMensagens((prev) =>
          prev.map((msg) =>
            msg.id === selectedMessageId
              ? {
                  ...msg,
                  SubMessage: [
                    ...(msg.SubMessage || []),
                    {
                      id: created.id,
                      conteudo: created.conteudo,
                      messageId: created.messageId,
                    },
                  ],
                }
              : msg
          )
        );
      }
      setSubMensagens([""]);
      setOpenCreateSubmessage(false);
      setSelectedMessageId(null);
    } catch (err: any) {
      setCreateError("Erro ao criar sub-mensagem: " + err.message);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await DeleteMessage({ messageId });
      setMensagens((prev) => prev.filter((msg) => msg.id !== messageId));
      setSelecionadas((prev) =>
        prev.filter((sel) => sel.mensagemId !== messageId)
      );
    } catch (err: any) {
      setError("Erro ao deletar mensagem: " + err.message);
    }
  };

  const deleteSubMessage = async (messageId: string, subMessageId: string) => {
    try {
      await DeleteMessage({ messageId, subMessageId });
      setMensagens((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                SubMessage: msg.SubMessage?.filter(
                  (sub) => sub.id !== subMessageId
                ),
              }
            : msg
        )
      );
      setSelecionadas((prev) =>
        prev.filter(
          (sel) =>
            !(sel.mensagemId === messageId && sel.subMensagemId === subMessageId)
        )
      );
    } catch (err: any) {
      setError("Erro ao deletar sub-mensagem: " + err.message);
    }
  };

  const handleAddSubMensagem = () => {
    setSubMensagens([...subMensagens, ""]);
  };

  const handleSubMensagemChange = (index: number, value: string) => {
    const updated = [...subMensagens];
    updated[index] = value;
    setSubMensagens(updated);
  };

  const toggleSelecao = (mensagemId: string, subMensagemId: string) => {
    const chave = { mensagemId, subMensagemId };
    if (
      selecionadas.some(
        (sel) =>
          sel.mensagemId === mensagemId && sel.subMensagemId === subMensagemId
      )
    ) {
      setSelecionadas(
        selecionadas.filter(
          (sel) =>
            !(
              sel.mensagemId === mensagemId &&
              sel.subMensagemId === subMensagemId
            )
        )
      );
    } else {
      setSelecionadas([...selecionadas, chave]);
    }
  };

  const enviarMensagens = async () => {
    try {
      const mensagensEnviadas = mensagens
        .map((mensagem) => ({
          ...mensagem,
          SubMessage: mensagem.SubMessage?.filter((sub) =>
            selecionadas.some(
              (sel) =>
                sel.mensagemId === mensagem.id && sel.subMensagemId === sub.id
            )
          ),
        }))
        .filter((m) => m.SubMessage && m.SubMessage.length > 0);

      for (const mensagem of mensagensEnviadas) {
        for (const subMensagem of mensagem.SubMessage || []) {
          await SendMessages({
            role: mensagem.role || "", 
            message: subMensagem.conteudo,
          });
        }
      }
      alert("Mensagens enviadas com sucesso!");
      window.location.reload();
    } catch (err: any) {
      setError("Erro ao enviar mensagens: " + err.message);
    }
  };

  const resetForm = () => {
    setTitulo("");
    setSubMensagens([""]);
    setSelectedRole("USER");
    setUploadedFiles([]);
    setShowColorPicker(false);
    setCreateError(null);
    setOpenCreateDialog(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Button
          onClick={enviarMensagens}
          disabled={selecionadas.length === 0}
          variant="default"
        >
          Enviar Selecionadas ({selecionadas.length})
        </Button>
        <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
          <DialogTrigger asChild>
            <Button variant="default">Criar Mensagem</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Nova Mensagem</DialogTitle>
            </DialogHeader>
            {createError && <div className="text-red-500">{createError}</div>}
            <div className="space-y-4">
              <div>
                <Label htmlFor="titulo">Título</Label>
                <Input
                  id="titulo"
                  placeholder="Título"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="role">Destinatário (Role)</Label>
                <select
                  id="role"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="USER">Usuário</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="GUEST">Convidado</option>
                </select>
              </div>
              {subMensagens.map((sub, index) => (
                <div key={index}>
                  <Label htmlFor={`sub-mensagem-${index}`}>
                    Sub-mensagem {index + 1}
                  </Label>
                  <Input
                    id={`sub-mensagem-${index}`}
                    placeholder={`Sub-mensagem ${index + 1}`}
                    value={sub}
                    onChange={(e) => handleSubMensagemChange(index, e.target.value)}
                  />
                </div>
              ))}
              <Button onClick={handleAddSubMensagem} variant="outline">
                Adicionar Sub-mensagem
              </Button>
              <div>
                <h1 className="flex justify-center">Adicione Imagem ou Vídeo</h1>
                <Dropzone
                  onDrop={onDrop}
                  accept={{
                    "image/jpeg": [".jpg", ".jpeg"],
                    "image/png": [".png"],
                    "video/mp4": [".mp4"],
                    "video/quicktime": [".mov"],
                  }}
                >
                  <DropzoneEmptyState />
                  <DropzoneContent />
                </Dropzone>
                <div className="flex justify-center mt-4">
                  <Carousel className="w-full max-w-xs">
                    <CarouselContent>
                      {uploadedFiles.length > 0 ? (
                        uploadedFiles.map((file, index) => (
                          <CarouselItem key={index}>
                            <div className="p-1">
                              <Card>
                                <CardContent className="flex aspect-square items-center justify-center p-6">
                                  {file.type.startsWith("image/") ? (
                                    <Image
                                      src={URL.createObjectURL(file)}
                                      alt={`Uploaded ${index}`}
                                      width={300}
                                      height={300}
                                    />
                                  ) : (
                                    <video
                                      src={URL.createObjectURL(file)}
                                      controls
                                      className="max-w-full max-h-full object-contain"
                                    />
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          </CarouselItem>
                        ))
                      ) : (
                        <CarouselItem>
                          <div className="p-1">
                            <Card>
                              <CardContent className="flex aspect-square items-center justify-center p-6">
                                <span className="text-sm text-gray-500">
                                  Nenhuma mídia carregada
                                </span>
                              </CardContent>
                            </Card>
                          </div>
                        </CarouselItem>
                      )}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={resetForm} variant="default">
                Cancelar
              </Button>
              <Button
                onClick={createMessage}
                disabled={!titulo}
                variant="default"
              >
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        {mensagens.map((mensagem) => (
          <Card
            key={mensagem.id}
            className={cn(
              "relative w-full overflow-hidden rounded-xl border bg-background p-6 transition-all duration-300 ease-in-out",
              "hover:border-primary hover:shadow-lg hover:-translate-y-1"
            )}
          >
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 pointer-events-none",
                "hover:opacity-5",
                "from-primary/20 to-background"
              )}
            />
            <CardContent className="p-0 relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-xl">
                  {mensagem.titulo} ({mensagem.role || "Sem Role"})
                </h3>
                <div className="flex items-center gap-3">
                  <Dialog
                    open={openCreateSubmessage}
                    onOpenChange={(open) => {
                      setOpenCreateSubmessage(open);
                      if (open) {
                        setSelectedMessageId(mensagem.id);
                      } else {
                        setSelectedMessageId(null);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button size="sm">Criar Sub-mensagem</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Criar Nova Sub-mensagem para {mensagem.titulo}
                        </DialogTitle>
                      </DialogHeader>
                      {createError && (
                        <div className="text-red-500">{createError}</div>
                      )}
                      <div className="space-y-4">
                        {subMensagens.map((sub, index) => (
                          <div key={index}>
                            <Label htmlFor={`sub-mensagem-create-${index}`}>
                              Sub-mensagem {index + 1}
                            </Label>
                            <Input
                              id={`sub-mensagem-create-${index}`}
                              placeholder={`Sub-mensagem ${index + 1}`}
                              value={sub}
                              onChange={(e) =>
                                handleSubMensagemChange(index, e.target.value)
                              }
                            />
                          </div>
                        ))}
                        <Button
                          onClick={handleAddSubMensagem}
                          variant="outline"
                        >
                          Adicionar Sub-mensagem
                        </Button>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={createSubMessage}
                          disabled={subMensagens.every((s) => s.trim() === "")}
                          variant="default"
                        >
                          Criar
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => deleteMessage(mensagem.id)}
                  >
                    Deletar Mensagem
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {mensagem.SubMessage?.map((subMensagem) => (
                  <div
                    key={subMensagem.id}
                    className="flex items-center justify-between p-2 rounded-md"
                  >
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        checked={selecionadas.some(
                          (sel) =>
                            sel.mensagemId === mensagem.id &&
                            sel.subMensagemId === subMensagem.id
                        )}
                        onCheckedChange={() =>
                          toggleSelecao(mensagem.id, subMensagem.id)
                        }
                      />
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {subMensagem.conteudo}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="link" className="p-0">
                            Ver mais
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>
                              {mensagem.titulo}
                            </DialogTitle>
                          </DialogHeader>
                          <p>{subMensagem.conteudo}</p>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          deleteSubMessage(mensagem.id, subMensagem.id)
                        }
                      >
                        Deletar
                      </Button>
                      
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}