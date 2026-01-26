/* eslint-disable no-unused-vars */
'use client';

import React, { createContext, useContext, useState } from 'react';

export interface Notification {
  id: string;
  mentionedUserId: string;
  mentionedDisplay: string;
  authorName: string;
  cardId: string;
  cardName: string;
  createdAt: Date;
  read: boolean;
}

interface NotificationsContextData {
  notifications: Notification[];
  addNotification: (n: Notification) => void;
}

const NotificationsContext = createContext<NotificationsContextData | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  function addNotification(notification: Notification) {
    setNotifications((prev) => {
      if (prev.some(n => n.id === notification.id)) return prev;
      return [notification, ...prev];
    });
  }

  return (
    <NotificationsContext.Provider value={{ notifications, addNotification }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications deve ser usado dentro do NotificationsProvider');
  }
  return ctx;
}
