'use client';

import { useEffect, useRef, useState } from 'react';
import { DbNotification } from '@/app/_types/notifications';
import { Badge } from '@/app/nova-dash/nova_dash/Complete Workflow Dashboard/src/app/components/ui/badge';

interface Props {
    notifications: DbNotification[];
}

const STORAGE_KEY = 'notifications_last_seen';

export function NotificationDropdown({ notifications }: Props) {
    const [open, setOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const lastSeenRef = useRef<number>(0);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        lastSeenRef.current = stored ? Number(stored) : 0;

        setUnreadCount(
            Math.max(notifications.length - lastSeenRef.current, 0)
        );
    }, [notifications]);

    function handleToggle() {
        setOpen((prev) => {
            const next = !prev;

            if (next) {
                lastSeenRef.current = notifications.length;
                localStorage.setItem(
                    STORAGE_KEY,
                    String(notifications.length)
                );
                setUnreadCount(0);
            }

            return next;
        });
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
                className="relative p-2 rounded-full hover:bg-gray-100"
            >
                🔔
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                        {unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-96 bg-white border rounded-xl shadow-lg z-50">
                    <div className="px-4 py-2 border-b font-medium text-sm">
                        Notificações
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <p className="text-sm text-gray-500 px-4 py-6 text-center">
                                Nenhuma notificação
                            </p>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className="flex gap-3 px-4 py-3 hover:bg-gray-50 transition border-b last:border-b-0"
                                >
                                    <Badge variant="secondary">🔔</Badge>

                                    <p className="text-sm leading-snug">
                                        <strong>{n.authorName}</strong> mencionou você no card{' '}
                                        <strong>{n.targetName}</strong>
                                        {n.processId && (
                                            <span className="ml-1 text-gray-500 font-bold">
                                                — ⚠️ Duplicado
                                            </span>
                                        )}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

