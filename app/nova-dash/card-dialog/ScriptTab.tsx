/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/app/_components/ui/button';
import { Textarea } from '@/app/_components/ui/textarea';
import { ScrollArea } from '@/app/_components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/_components/ui/select';
import { Upload, Send, File, X, Loader2, Download, FileText, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Array<{
    name: string;
    type: string;
    size: number;
  }>;
}

interface Template {
  filename: string;
  label: string;
}

interface StoredChat {
  messages: Array<Omit<Message, 'timestamp'> & { timestamp: string }>;
  savedAt: number;
}

const CHAT_TTL_MS = 15 * 60 * 1000;

function getChatKey(cardId: string) {
  return `roteiro_chat_${cardId}`;
}

function loadChat(cardId: string): Message[] {
  try {
    const raw = localStorage.getItem(getChatKey(cardId));
    if (!raw) return [];

    const stored: StoredChat = JSON.parse(raw);
    if (Date.now() - stored.savedAt > CHAT_TTL_MS) {
      localStorage.removeItem(getChatKey(cardId));
      return [];
    }

    return stored.messages.map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  } catch {
    return [];
  }
}

function saveChat(cardId: string, messages: Message[]) {
  if (messages.length === 0) {
    localStorage.removeItem(getChatKey(cardId));
    return;
  }

  const stored: StoredChat = {
    messages: messages.map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    })),
    savedAt: Date.now(),
  };

  localStorage.setItem(getChatKey(cardId), JSON.stringify(stored));
}

interface RoteirosTabProps {
  cardId: string;
  isProcess?: boolean;
}

export const RoteirosTab: React.FC<RoteirosTabProps> = ({ cardId, isProcess }) => {
  const [messages, setMessages] = useState<Message[]>(() => loadChat(cardId));
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [docxTemplates, setDocxTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showDocxMenu, setShowDocxMenu] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    saveChat(cardId, messages);
  }, [messages, cardId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const raw = localStorage.getItem(getChatKey(cardId));
      if (!raw) return;

      const stored: StoredChat = JSON.parse(raw);
      if (Date.now() - stored.savedAt > CHAT_TTL_MS) {
        localStorage.removeItem(getChatKey(cardId));
        setMessages([]);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [cardId]);

  useEffect(() => {
    fetch('/api/templates?categoria=roteiros')
      .then((res) => res.json())
      .then((data: Template[]) => {
        if (Array.isArray(data)) {
          setDocxTemplates(data);
          if (data.length > 0) setSelectedTemplate(data[0].filename);
        }
      })
      .catch(() => {});
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const oversized = files.filter(f => f.size > 10 * 1024 * 1024);
    const valid = files.filter(f => f.size <= 10 * 1024 * 1024);

    if (oversized.length > 0) {
      toast.error(`${oversized.length} arquivo(s) excedem 10MB e foram ignorados.`);
    }

    if (valid.length > 0) {
      setSelectedFiles(prev => [...prev, ...valid]);
      toast.success(`${valid.length} arquivo(s) selecionado(s)`);
    }
  };

  const removeFile = (name: string) => {
    setSelectedFiles(prev => prev.filter(f => f.name !== name));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFileToGoogle = async (file: File): Promise<{ name: string; fileUri: string; mimeType: string }> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload-file", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Falha ao fazer upload de "${file.name}"`);
    }

    const { fileUri, mimeType } = await res.json();
    return { name: file.name, fileUri, mimeType };
  };

  const sendMessage = async () => {
    if (!input.trim() && selectedFiles.length === 0) {
      toast.error('Digite uma mensagem ou selecione um arquivo');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim() || `[${selectedFiles.length} documento(s) anexado(s)]`,
      timestamp: new Date(),
      attachments: selectedFiles.length > 0
        ? selectedFiles.map(f => ({ name: f.name, type: f.type, size: f.size }))
        : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let prompt = input.trim();

      if (selectedFiles.length > 0 && !prompt) {
        const names = selectedFiles.map(f => f.name).join(', ');
        prompt = `Por favor, analise os documentos anexados (${names}) e forneça um resumo detalhado do conteúdo.`;
      } else if (selectedFiles.length > 0 && prompt) {
        const names = selectedFiles.map(f => f.name).join(', ');
        prompt = `${prompt}\n\n[Documentos anexados: ${names}]`;
      }

      if (selectedFiles.length > 0) {
        toast.loading('Enviando arquivos...');
      } else {
        toast.loading('Enviando para IA...');
      }

      const attachmentsData = selectedFiles.length > 0
        ? await Promise.all(selectedFiles.map(f => uploadFileToGoogle(f)))
        : undefined;

      const response = await fetch('/api/roteiro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({
              role: m.role,
              content: m.content,
            })),
            {
              role: 'user',
              content: prompt,
            },
          ],
          cardId,
          isProcess,
          attachments: attachmentsData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.error || 'Erro ao comunicar com a IA';

        if (response.status === 503 || response.status === 429) {
          toast.error(errorMsg);
          const retryMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `⏳ ${errorMsg}\n\n🔄 O servidor está tentando processar sua solicitação. Se isso persistir, recarregue a página e tente novamente.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, retryMessage]);
        } else {
          throw new Error(errorMsg);
        }
        return;
      }

      const data = await response.json();
      toast.dismiss();
      toast.success('Processado com sucesso!');

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || data.content || 'Desculpe, não consegui processar sua solicitação.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      toast.dismiss();
      toast.error('Erro ao comunicar com a IA: ' + error.message);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro ao processar sua solicitação. Verifique se a API está configurada corretamente.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const downloadDOCX = async (content: string, template: string) => {
    try {
      toast.loading('Gerando DOCX...');
      const response = await fetch('/api/roteiro/download-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          titulo: 'Roteiro Processual - Seguros Paraná',
          filename: `roteiro_${Date.now()}`,
          template,
          cardId,
          isProcess,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao gerar DOCX');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `roteiro_${Date.now()}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.dismiss();
      toast.success('DOCX baixado com sucesso!');
      setShowDocxMenu(null);
    } catch (error: any) {
      toast.dismiss();
      toast.error('Erro ao gerar DOCX: ' + error.message);
    }
  };

  return (
    <div className="flex flex-col h-[600px] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div>
          <h3 className="font-semibold text-lg">Chat de Roteiros com IA</h3>
          <p className="text-sm text-muted-foreground">
            Envie documentos para resumo e análise
          </p>
        </div>
      </div>

        <div className="h-full overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Send className="w-8 h-8 text-primary" />
              </div>
              <h4 className="font-medium text-lg mb-2">Nenhuma conversa iniciada</h4>
              <p className="text-sm text-muted-foreground max-w-sm">
                Envie uma mensagem ou anexe um documento para começar a conversar com a IA
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mb-2 pb-2 border-b border-primary-foreground/20 space-y-1">
                      {message.attachments.map(att => (
                        <div key={att.name} className="flex items-center gap-2">
                          <File className="w-4 h-4 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{att.name}</p>
                            <p className="text-xs opacity-70">{formatFileSize(att.size)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <p
                      className={`text-xs ${
                        message.role === 'user'
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {formatTime(message.timestamp)}
                    </p>
                    {message.role === 'assistant' && (
                      <div className="flex items-center gap-2">
                        {docxTemplates.length > 0 && (
                          <div className="relative">
                            <button
                              onClick={() =>
                                setShowDocxMenu(
                                  showDocxMenu === message.id ? null : message.id
                                )
                              }
                              className="text-xs hover:underline flex items-center gap-1"
                              title="Baixar como DOCX"
                            >
                              <FileText className="w-3 h-3" />
                              DOCX
                              <ChevronDown className="w-2 h-2" />
                            </button>
                            {showDocxMenu === message.id && (
                              <div className="absolute bottom-6 right-0 bg-white border rounded-lg shadow-lg p-2 z-50 min-w-[200px]">
                                <p className="text-[10px] text-gray-400 font-semibold px-2 pb-1 uppercase">
                                  Selecione o template
                                </p>
                                {docxTemplates.map((t) => (
                                  <button
                                    key={t.filename}
                                    onClick={() =>
                                      downloadDOCX(message.content, t.filename)
                                    }
                                    className="block w-full text-left text-xs px-2 py-1.5 hover:bg-gray-100 rounded truncate"
                                  >
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {/* <span className="text-sm">...</span> */}
                </div>
              </div>
            </div>
          )}
        </div>

      {/* File Preview */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-col gap-1 p-3 bg-muted rounded-lg max-h-[120px] overflow-y-auto">
          {selectedFiles.map(file => (
            <div key={file.name} className="flex items-center gap-2">
              <File className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeFile(file.name)}
                className="h-7 w-7 p-0 flex-shrink-0"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="flex gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          <Upload className="w-4 h-4" />
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Digite sua mensagem ou anexe um documento..."
          className="min-h-[60px] resize-none"
          disabled={isLoading}
        />
        <Button
          onClick={sendMessage}
          disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Pressione Enter para enviar, Shift+Enter para nova linha
      </p>
    </div>
  );
};
