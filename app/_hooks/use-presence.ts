'use client';

import { useCallback, useEffect, useState } from 'react';

export interface PresenceMember {
  id: string;
  name: string;
  image: string | null;
  role: string;
  online: boolean;
  isMe: boolean;
  lastSeenAt: string | null;
}

const HEARTBEAT_MS = 30_000;

/**
 * Presença em tempo (quase) real via heartbeat.
 *
 * A cada 30s (e ao focar a aba) faz POST em /api/presence, que marca o usuário
 * como visto agora e devolve a lista de membros com o status online/offline.
 */
export function usePresence() {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  const beat = useCallback(async () => {
    try {
      const res = await fetch('/api/presence', { method: 'POST', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.members)) setMembers(data.members);
    } catch {
      /* silencioso: presença nunca deve quebrar a UI */
    }
  }, []);

  useEffect(() => {
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);

    const onWake = () => {
      if (document.visibilityState === 'visible') beat();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [beat]);

  const onlineCount = members.filter((m) => m.online).length;

  return { members, onlineCount, refresh: beat };
}
