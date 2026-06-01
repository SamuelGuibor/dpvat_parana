"use client";

import { useEffect, useState, useCallback } from "react";
import { DbNotification } from "@/app/_types/notifications";
import { useSSE } from "./use-sse";

export function useNotifications() {
  const [notifications, setNotifications] = useState<DbNotification[]>([]);

  const loadInitial = useCallback(async () => {
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
    loadInitial();
  }, [loadInitial]);

  useSSE((payload) => {
    if (payload.type === "notification") {
      setNotifications((prev) => [payload.data as DbNotification, ...prev]);
    }
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllRead };
}
