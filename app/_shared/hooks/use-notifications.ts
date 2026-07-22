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

  const clearAll = useCallback(async () => {
    await fetch("/api/notification", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: "all" }),
    });

    setNotifications([]);
  }, []);

  useEffect(() => {
    loadNotifications();
    // Aba em background não consulta; ao voltar o foco, atualiza na hora.
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadNotifications();
    }, 60_000);
    const onWake = () => {
      if (document.visibilityState === "visible") loadNotifications();
    };
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllRead, clearAll };
}
