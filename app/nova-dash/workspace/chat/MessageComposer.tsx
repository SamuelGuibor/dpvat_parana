/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from 'react';
import { MentionsInput, Mention } from 'react-mentions';
import { Send, Paperclip, X, FileText, Image as ImageIcon, Film, Mic } from 'lucide-react';
import { Button } from '@/app/_shared/ui/button';
import { mentionsStyles } from '../../card-dialog/constants';
import { renderMentionSuggestion } from './mention-suggestion';
import { toast } from 'sonner';

type MentionableUser = { id: string; display: string };

interface Props {
  members: MentionableUser[];
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string, file?: File | null) => Promise<void> | void;
  onTyping?: () => void;
}

// Intervalo mínimo entre dois avisos de "digitando…" (evita floodar o relay).
const TYPING_THROTTLE_MS = 2_500;
const MAX_ATTACH_BYTES = 25 * 1024 * 1024; // 25MB

function fileIcon(type: string) {
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('video/')) return Film;
  if (type.startsWith('audio/')) return Mic;
  return FileText;
}

export function MessageComposer({ members, disabled, placeholder, onSend, onTyping }: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // Prévia inline quando o anexo é imagem (inclusive imagem colada com Ctrl+V).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const lastTypingRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleChange(v: string) {
    setValue(v);
    if (onTyping && v.trim()) {
      const now = Date.now();
      if (now - lastTypingRef.current > TYPING_THROTTLE_MS) {
        lastTypingRef.current = now;
        onTyping();
      }
    }
  }

  function pickFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_ATTACH_BYTES) {
      toast.error('Arquivo excede o limite de 25MB.');
      return;
    }
    setFile(f);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
    });
  }

  function clearFile() {
    setFile(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (fileRef.current) fileRef.current.value = '';
  }

  // Ctrl+V com imagem na área de transferência (print, imagem copiada, arquivo
  // copiado do Explorer) → vira anexo, igual ao clipe.
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue;
      const f = item.getAsFile();
      if (!f) continue;
      e.preventDefault();
      // Print/imagem colada chega como "image.png" genérico → dá um nome único.
      const generic = !f.name || /^image\.\w+$/i.test(f.name);
      const ext = (f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const named = generic ? new File([f], `imagem-colada-${stamp}.${ext}`, { type: f.type }) : f;
      pickFile(named);
      return;
    }
  }

  async function submit() {
    const text = value.trim();
    if ((!text && !file) || sending) return;
    setSending(true);
    try {
      await onSend(text, file);
      setValue('');
      clearFile();
    } catch (err) {
      // O texto continua no composer — só avisamos que não foi.
      console.error('[CHAT] Falha ao enviar mensagem:', err);
      toast.error('A mensagem não foi enviada. Verifique a conexão e tente de novo.');
    } finally {
      setSending(false);
    }
  }

  const FileIco = file ? fileIcon(file.type) : Paperclip;

  return (
    <div
      onPaste={handlePaste}
      className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-visible focus-within:ring-2 focus-within:ring-blue-500 transition-all"
    >
      {/* Prévia do anexo escolhido */}
      {file && (
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-zinc-800 px-3 py-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={file.name} className="h-12 w-12 shrink-0 rounded-lg border border-gray-200 object-cover dark:border-zinc-700" />
          ) : (
            <FileIco className="h-4 w-4 shrink-0 text-blue-500" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-gray-600 dark:text-zinc-300">{file.name}</span>
          <span className="shrink-0 text-[10px] text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
          <button type="button" onClick={clearFile}
            className="grid h-5 w-5 place-items-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <MentionsInput
        value={value}
        onChange={(e: any) => handleChange(e.target.value)}
        onKeyDown={(e: any) => {
          // Enter envia; Shift+Enter quebra linha.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder ?? 'Escreva uma mensagem... Use @ para mencionar. **negrito** *itálico*'}
        style={mentionsStyles}
        // O composer fica no rodapé: abrir pra baixo cortava a lista — agora abre pra cima.
        forceSuggestionsAboveCursor
      >
        <Mention
          trigger="@"
          data={members}
          markup="@[__display__](__id__)"
          displayTransform={(_id: string, display: string) => `@${display}`}
          renderSuggestion={renderMentionSuggestion}
          appendSpaceOnAdd
        />
      </MentionsInput>

      <div className="bg-gray-50 dark:bg-zinc-950 px-3 py-2 border-t flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Anexar foto, vídeo, áudio ou arquivo"
            className="grid h-8 w-8 place-items-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-zinc-800"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <p className="text-[10px] text-gray-400">Enter envia · Shift+Enter nova linha · Ctrl+V cola imagem</p>
        </div>
        <Button onClick={submit} disabled={disabled || sending || (!value.trim() && !file)} size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 px-4">
          <Send className="w-3 h-3 mr-2" /> {sending ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}
