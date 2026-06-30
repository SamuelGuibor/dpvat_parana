/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/app/_components/ui/button';
import { Textarea } from '@/app/_components/ui/textarea';
import { ScrollArea } from '@/app/_components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/_components/ui/select';
import { Upload, Send, File, X, Loader2, Download, FileText, ChevronDown, Wrench, Plus, Copy, Pencil, Trash2, Check, BookOpen, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getRoteiroUploadUrls } from '@/app/_actions/uploadS3';

type LoadingPhase =
  | null
  | 'uploading'
  | 'sending'
  | 'reading'
  | 'thinking'
  | 'streaming';

const PHASE_LABELS: Record<Exclude<LoadingPhase, null>, string> = {
  uploading: 'Enviando arquivos para analise...',
  sending: 'Preparando requisicao...',
  reading: 'Lendo documentos anexados...',
  thinking: 'Analisando informacoes e gerando resposta...',
  streaming: 'Recebendo resposta...',
};

function ThinkingIndicator({ phase }: { phase: Exclude<LoadingPhase, null> }) {
  const allPhases: Exclude<LoadingPhase, null>[] = ['uploading', 'sending', 'reading', 'thinking', 'streaming'];
  const currentIdx = allPhases.indexOf(phase);

  return (
    <div className="flex justify-start">
      <div className="bg-muted rounded-lg p-4 max-w-[80%] min-w-[320px]">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
          </div>
          <span className="text-sm font-medium text-foreground">Processando</span>
        </div>

        <div className="space-y-2">
          {allPhases.map((p, idx) => {
            if (idx > currentIdx) return null;

            const isCurrent = idx === currentIdx;
            const isDone = idx < currentIdx;

            return (
              <div key={p} className="flex items-start gap-2.5">
                {isDone ? (
                  <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin mt-0.5 shrink-0" />
                )}
                <span
                  className={`text-xs leading-relaxed ${
                    isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {PHASE_LABELS[p]}
                </span>
              </div>
            );
          })}
        </div>

        {/* Animated shimmer bar */}
        <div className="mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full w-1/3 rounded-full bg-primary/30"
            style={{
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
        </div>
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    </div>
  );
}

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

interface SavedPrompt {
  id: string;
  title: string;
  content: string;
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
  name: string
  cardId: string;
  isProcess?: boolean;
}

export const RoteirosTab: React.FC<RoteirosTabProps> = ({ name, cardId, isProcess }) => {
  const [messages, setMessages] = useState<Message[]>(() => loadChat(cardId));
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(null);
  const isLoading = loadingPhase !== null;
  const [docxTemplates, setDocxTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showDocxMenu, setShowDocxMenu] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Prompt library state
  const [showPromptLib, setShowPromptLib] = useState(false);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Load prompts from API on mount
  useEffect(() => {
    fetch('/api/prompts')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setSavedPrompts(data); })
      .catch(() => {});
  }, []);

  async function addPrompt() {
    if (!newPromptTitle.trim() || !newPromptContent.trim()) {
      toast.error('Preencha titulo e conteudo');
      return;
    }
    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newPromptTitle.trim(), content: newPromptContent.trim() }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setSavedPrompts((prev) => [...prev, created]);
      setNewPromptTitle('');
      setNewPromptContent('');
      setShowAddForm(false);
      toast.success('Prompt salvo!');
    } catch {
      toast.error('Erro ao salvar prompt');
    }
  }

  async function deletePrompt(id: string) {
    try {
      const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
      toast.success('Prompt excluido');
    } catch {
      toast.error('Erro ao excluir prompt');
    }
  }

  function startEditPrompt(p: SavedPrompt) {
    setEditingPromptId(p.id);
    setNewPromptTitle(p.title);
    setNewPromptContent(p.content);
  }

  async function saveEditPrompt() {
    if (!editingPromptId) return;
    try {
      const res = await fetch(`/api/prompts/${editingPromptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newPromptTitle.trim(), content: newPromptContent.trim() }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setSavedPrompts((prev) => prev.map((p) => (p.id === editingPromptId ? updated : p)));
      setEditingPromptId(null);
      setNewPromptTitle('');
      setNewPromptContent('');
      toast.success('Prompt atualizado!');
    } catch {
      toast.error('Erro ao atualizar prompt');
    }
  }

  function applyPrompt(content: string) {
    setInput(content);
    setShowPromptLib(false);
    toast.success('Prompt colado no campo de texto');
  }

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

  // Envia os arquivos DIRETO para o S3 (presigned PUT) e devolve as chaves.
  // Isso contorna o limite de 4.5 MB de body das serverless functions da
  // Vercel: o /api/roteiro recebe só as chaves, baixa os arquivos do S3 e
  // os repassa ao converter.
  const uploadFilesToS3 = async (
    files: File[],
  ): Promise<{ key: string; name: string; type: string }[]> => {
    const fileInfos = files.map((f) => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
    }));

    const response = await getRoteiroUploadUrls(fileInfos, cardId);
    if (!response.success || !response.presignedUrls) {
      throw new Error(response.error || 'Erro ao obter URLs de upload');
    }

    const uploaded = await Promise.all(
      response.presignedUrls.map(async ({ fileName, url, key }) => {
        const file = files.find((f) => f.name === fileName);
        if (!file) return null;
        const res = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!res.ok) throw new Error(`Erro ao enviar ${fileName} para o S3`);
        return { key, name: fileName, type: file.type || 'application/octet-stream' };
      }),
    );

    return uploaded.filter(Boolean) as { key: string; name: string; type: string }[];
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

    try {
      let prompt = input.trim();

      if (selectedFiles.length > 0 && !prompt) {
        const names = selectedFiles.map(f => f.name).join(', ');
        prompt = `Por favor, analise os documentos anexados (${names}) e forneça um resumo detalhado do conteúdo.`;
      } else if (selectedFiles.length > 0 && prompt) {
        const names = selectedFiles.map(f => f.name).join(', ');
        prompt = `${prompt}\n\n[Documentos anexados: ${names}]`;
      }

      let s3Keys: { key: string; name: string; type: string }[] | undefined;

      if (selectedFiles.length > 0) {
        setLoadingPhase('uploading');
        s3Keys = await uploadFilesToS3(selectedFiles);
      }

      setLoadingPhase('sending');

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
          s3Keys,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = 'Erro ao comunicar com a IA';
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.error || errorMsg;
        } catch { /* ignore */ }

        if (response.status === 503 || response.status === 429) {
          toast.error(errorMsg);
          const retryMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `${errorMsg}\n\nO servidor esta tentando processar sua solicitacao. Se isso persistir, recarregue a pagina e tente novamente.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, retryMessage]);
        } else {
          throw new Error(errorMsg);
        }
        return;
      }

      setLoadingPhase('reading');

      const assistantId = (Date.now() + 1).toString();

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let receivedFirstChunk = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true }).replace(/​/g, "");
        if (!chunk) continue;

        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          setLoadingPhase('thinking');

          // Small delay to show "thinking" before switching to streaming
          await new Promise((r) => setTimeout(r, 600));

          setLoadingPhase('streaming');
          setMessages((prev) => [
            ...prev,
            { id: assistantId, role: 'assistant', content: '', timestamp: new Date() },
          ]);
        }

        fullText += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
        );
      }

      if (!receivedFirstChunk) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: 'assistant',
            content: 'Desculpe, nao consegui processar sua solicitacao.',
            timestamp: new Date(),
          },
        ]);
      }

      toast.success('Processado com sucesso!');
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
      setLoadingPhase(null);
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
      toast.loading('Gerando PDF...');
      const response = await fetch('/api/roteiro/download-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          titulo: 'Roteiro Processual - Seguros Paraná',
          filename: `roteiro_${name}`,
          template,
          cardId,
          isProcess,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro ao gerar PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `roteiro_${name}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.dismiss();
      toast.success('PDF baixado com sucesso!');
      setShowDocxMenu(null);
    } catch (error: any) {
      toast.dismiss();
      toast.error('Erro ao gerar PDF: ' + error.message);
    }
  };

  return (
    <div className="flex h-[600px] gap-0">
      {/* Prompt Library Panel */}
      {showPromptLib && (
        <div className="w-[340px] border-r flex flex-col bg-gray-50 dark:bg-zinc-950/50 shrink-0">
          <div className="flex items-center justify-between p-3 border-b bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h4 className="font-semibold text-sm">Prompts Salvos</h4>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  setShowAddForm(true);
                  setEditingPromptId(null);
                  setNewPromptTitle('');
                  setNewPromptContent('');
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowPromptLib(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {/* Add / Edit Form */}
            {(showAddForm || editingPromptId) && (
              <div className="bg-white dark:bg-zinc-900 border rounded-lg p-3 space-y-2">
                <input
                  type="text"
                  value={newPromptTitle}
                  onChange={(e) => setNewPromptTitle(e.target.value)}
                  placeholder="Título do prompt..."
                  className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <textarea
                  value={newPromptContent}
                  onChange={(e) => setNewPromptContent(e.target.value)}
                  placeholder="Conteúdo do prompt..."
                  rows={6}
                  className="w-full text-xs border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingPromptId(null);
                      setNewPromptTitle('');
                      setNewPromptContent('');
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={editingPromptId ? saveEditPrompt : addPrompt}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    {editingPromptId ? 'Atualizar' : 'Salvar'}
                  </Button>
                </div>
              </div>
            )}

            {/* Prompt List */}
            {savedPrompts.length === 0 && !showAddForm && (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs">Nenhum prompt salvo</p>
                <p className="text-xs mt-1">Clique em + para adicionar</p>
              </div>
            )}

            {savedPrompts.map((p) => (
              <div key={p.id} className="bg-white dark:bg-zinc-900 border rounded-lg p-3 group hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <h5 className="text-sm font-medium truncate flex-1">{p.title}</h5>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => applyPrompt(p.content)}
                      className="p-1 rounded hover:bg-blue-50 text-blue-600"
                      title="Usar prompt"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => startEditPrompt(p)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-400"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deletePrompt(p.id)}
                      className="p-1 rounded hover:bg-red-50 text-red-500"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{p.content}</p>
                <button
                  onClick={() => applyPrompt(p.content)}
                  className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Usar este prompt
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col space-y-4 min-w-0 p-0">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Chat de Roteiros com IA</h3>
            <p className="text-sm text-muted-foreground">
              Envie documentos para resumo e análise
            </p>
          </div>
          <Button
            variant={showPromptLib ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowPromptLib(!showPromptLib)}
            className="flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Prompts
            {savedPrompts.length > 0 && (
              <span className="bg-primary-foreground text-primary text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                {savedPrompts.length}
              </span>
            )}
          </Button>
        </div>

        <div ref={scrollRef} className="h-full overflow-y-auto space-y-4">
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
                              <div className="absolute bottom-6 right-0 bg-white dark:bg-zinc-900 border rounded-lg shadow-lg p-2 z-50 min-w-[200px]">
                                <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-semibold px-2 pb-1 uppercase">
                                  Selecione o template
                                </p>
                                {docxTemplates.map((t) => (
                                  <button
                                    key={t.filename}
                                    onClick={() =>
                                      downloadDOCX(message.content, t.filename)
                                    }
                                    className="block w-full text-left text-xs px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded truncate"
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
          {loadingPhase && loadingPhase !== 'streaming' && (
            <ThinkingIndicator phase={loadingPhase} />
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
          className="min-h-[120px] resize-none"
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
    </div>
  );
};
