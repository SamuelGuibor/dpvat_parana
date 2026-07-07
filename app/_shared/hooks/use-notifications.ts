"use client";

import { useEffect, useState, useCallback } from "react";
import { DbNotification } from "@/app/_shared/types/notifications";

export function useNotifications() {
  const [notifications, setNotifications] = useState<DbNotification[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notification", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setNotifications(data);
      }
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    await fetch("/api/notification", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: "all" }),
    });

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllRead };
}
