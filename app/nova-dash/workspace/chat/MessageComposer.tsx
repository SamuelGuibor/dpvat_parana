/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from 'react';
import { MentionsInput, Mention } from 'react-mentions';
import { Send } from 'lucide-react';
import { Button } from '@/app/_shared/ui/button';
import { mentionsStyles } from '../../card-dialog/constants';
import { renderMentionSuggestion } from './mention-suggestion';

type MentionableUser = { id: string; display: string };

interface Props {
  members: MentionableUser[];
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => Promise<void> | void;
  onTyping?: () => void;
}

// Intervalo mínimo entre dois avisos de "digitando…" (evita floodar o relay).
const TYPING_THROTTLE_MS = 2_500;

export function MessageComposer({ members, disabled, placeholder, onSend, onTyping }: Props) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const lastTypingRef = useRef(0);

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

  async function submit() {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setValue('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-visible focus-within:ring-2 focus-within:ring-blue-500 transition-all">
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
        <p className="text-[10px] text-gray-400">Enter envia · Shift+Enter nova linha</p>
        <Button onClick={submit} disabled={disabled || sending || !value.trim()} size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 px-4">
          <Send className="w-3 h-3 mr-2" /> {sending ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    </div>
  );
}
