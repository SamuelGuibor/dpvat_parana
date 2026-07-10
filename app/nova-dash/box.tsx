'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/app/_shared/ui/badge';
import { useNotifications } from '@/app/_shared/hooks/use-notifications';
import { Bell, Clock } from 'lucide-react';

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Renderiza a mensagem deixando em negrito apenas os nomes de pessoas
// (autor da ação e nome do card/alvo), e não o texto inteiro.
function HighlightedMessage({ message, names }: { message: string; names: string[] }) {
  const valid = names
    .map((n) => n?.trim())
    .filter((n): n is string => !!n && n.length > 1 && message.includes(n))
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .sort((a, b) => b.length - a.length); // casa o nome mais longo primeiro

  if (valid.length === 0) return <>{message}</>;

  const pattern = new RegExp(`(${valid.map(escapeRegExp).join('|')})`, 'g');
  const parts = message.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        valid.includes(part) ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
      )}
    </>
  );
}

export function NotificationDropdown() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      markAllRead();
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 transition-colors"
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-zinc-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-zinc-900 border rounded-xl shadow-lg z-50">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-sm">Notificações</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-600 hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-zinc-400 px-4 py-8 text-center">
                Nenhuma notificação
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    // Notificação de WhatsApp → abre a conversa direto no inbox.
                    if (n.contactId) {
                      setOpen(false);
                      // sessionStorage cobre o caso do inbox ainda não estar
                      // montado quando o evento dispara (troca de aba).
                      sessionStorage.setItem('wa-open-contact', n.contactId);
                      window.dispatchEvent(
                        new CustomEvent('open-whatsapp-conversation', {
                          detail: { contactId: n.contactId },
                        }),
                      );
                      return;
                    }
                    const cardId = n.processId ?? n.userId;
                    if (!cardId) return;
                    setOpen(false);
                    window.dispatchEvent(
                      new CustomEvent('open-kanban-card', {
                        detail: { id: cardId, isProcess: !!n.processId },
                      }),
                    );
                  }}
                  className={`flex gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 transition border-b last:border-b-0 cursor-pointer ${
                    !n.read ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="mt-0.5">
                    <Badge
                      variant="secondary"
                      className={`${!n.read ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-zinc-800'}`}
                    >
                      <Bell className="w-3 h-3" />
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      <HighlightedMessage message={n.message} names={[n.authorName, n.targetName]} />
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-gray-400 dark:text-zinc-500">
                      <Clock className="w-3 h-3" />
                      <span className="text-[11px]">
                        {new Date(n.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-2 shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
