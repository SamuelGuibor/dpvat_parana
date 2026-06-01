'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/app/_components/ui/badge';
import { useNotifications } from '@/app/_hooks/use-notifications';
import { Bell, Clock } from 'lucide-react';

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
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white border rounded-xl shadow-lg z-50">
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
              <p className="text-sm text-gray-500 px-4 py-8 text-center">
                Nenhuma notificação
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 hover:bg-gray-50 transition border-b last:border-b-0 ${
                    !n.read ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <div className="mt-0.5">
                    <Badge
                      variant="secondary"
                      className={`${!n.read ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}
                    >
                      <Bell className="w-3 h-3" />
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      <strong>{n.authorName}</strong> mencionou você no card{' '}
                      <strong>{n.targetName}</strong>
                    </p>
                    <div className="flex items-center gap-1 mt-1 text-gray-400">
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
