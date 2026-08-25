'use client';

import { useEffect, useState } from 'react';

// Picker de emojis próprio (nenhuma lib de emoji no projeto): grid estático de
// emojis nativos por categoria + "Recentes" no localStorage. Fica aberto até
// clicar fora — dá pra inserir vários em sequência, como no app do WhatsApp.

const RECENTS_KEY = 'wa-emoji-recents';
const RECENTS_MAX = 16;

const CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Carinhas',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😊', '😇', '🥰',
      '😍', '🤩', '😘', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤗', '🤭',
      '🤫', '🤔', '🫡', '😐', '😶', '😏', '😒', '🙄', '😬', '😌', '😔', '😪',
      '😴', '😷', '🤒', '🤕', '🥵', '🥶', '😵', '🤯', '🥳', '🥺', '😢', '😭',
      '😤', '😠', '😡', '😳', '😱', '😨', '😰', '😥', '😓', '🙈', '🙉', '🙊',
    ],
  },
  {
    label: 'Gestos',
    emojis: [
      '👍', '👎', '👌', '🤌', '✌️', '🤞', '🫶', '🤟', '👈', '👉', '👆', '👇',
      '☝️', '✋', '🖐️', '👋', '🤙', '💪', '🙏', '🤝', '👏', '🙌', '👐', '🤲',
      '✍️', '🫵', '👀', '🗣️', '👤', '🧑', '👩', '👨',
    ],
  },
  {
    label: 'Corações',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝',
    ],
  },
  {
    label: 'Símbolos',
    emojis: [
      '✅', '☑️', '✔️', '❌', '❎', '⚠️', '❗', '❓', '💯', '🔥', '⭐', '🌟',
      '✨', '💫', '🎉', '🎊', '🏆', '🥇', '📌', '📍', '🔔', '💰', '💵', '💤',
      '⏰', '⏳', '📅', '📆', '🗓️', '🔒', '🔓', '🔑', '➡️', '⬅️', '⬆️', '⬇️',
      '🔴', '🟢', '🟡', '🔵', '🚫', '♻️', '0️⃣', '1️⃣', '2️⃣', '3️⃣',
    ],
  },
  {
    label: 'Trabalho',
    emojis: [
      '📞', '☎️', '📱', '💬', '💭', '📄', '📃', '📋', '📁', '📂', '🖊️', '✏️',
      '📝', '📎', '🖇️', '📑', '🗂️', '📊', '📈', '⚖️', '🏥', '🚑', '⚕️', '💊',
      '🩹', '🩺', '🚗', '🏍️', '🛵', '🚙', '🚌', '🚦', '🛣️', '🏠', '🏢', '📬',
    ],
  },
];

function EmojiGrid({ label, emojis, onPick }: { label: string; emojis: string[]; onPick: (e: string) => void }) {
  return (
    <div className="px-2 pb-1">
      <p className="px-1 pb-1 pt-2 text-[10px] font-black uppercase tracking-wide text-gray-400 dark:text-zinc-500">
        {label}
      </p>
      <div className="grid grid-cols-8 gap-0.5">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="grid h-8 w-8 place-items-center rounded-lg text-lg transition-colors hover:bg-gray-100 dark:hover:bg-zinc-700"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmojiPicker({
  onPick, onClose, align = 'left',
}: { onPick: (emoji: string) => void; onClose: () => void; align?: 'left' | 'right' }) {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
      if (Array.isArray(stored)) setRecents(stored.filter((e) => typeof e === 'string'));
    } catch { /* localStorage indisponível: sem recentes */ }
  }, []);

  const pick = (emoji: string) => {
    const next = [emoji, ...recents.filter((e) => e !== emoji)].slice(0, RECENTS_MAX);
    setRecents(next);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* idem */ }
    onPick(emoji);
  };

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        className={`absolute bottom-10 z-20 max-h-80 w-[19rem] overflow-y-auto rounded-2xl border border-gray-200 bg-white pb-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-800 ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        {recents.length > 0 && <EmojiGrid label="Recentes" emojis={recents} onPick={pick} />}
        {CATEGORIES.map((c) => (
          <EmojiGrid key={c.label} label={c.label} emojis={c.emojis} onPick={pick} />
        ))}
      </div>
    </>
  );
}
