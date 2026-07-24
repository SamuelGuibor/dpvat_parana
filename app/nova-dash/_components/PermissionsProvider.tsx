"use client";

// Contexto de permissões do CRM: busca o mapa resolvido do servidor UMA vez
// ao montar o dashboard e disponibiliza via usePermissions() para qualquer
// componente (tabs, dropdown do card, painel de automações, equipe...).
//
// A UI usa isso só para ESCONDER o que o usuário não pode fazer — a validação
// de verdade acontece nas server actions (requirePermission).

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getMyPermissions } from "@/app/_actions/team/permissions";
import type { PermissionMap } from "@/app/_shared/lib/permissions";

const NO_PERMISSIONS: PermissionMap = {
  view_archived: false,
  archive_cards: false,
  delete_cards: false,
  view_tickets: false,
  manage_automations: false,
  create_columns: false,
  edit_columns: false,
  delete_columns: false,
  manager_dashboard: false,
  review_ai: false,
  manage_team: false,
};

interface PermissionsState {
  /** true enquanto o fetch inicial não terminou. */
  loading: boolean;
  role: string | null;
  perms: PermissionMap;
}

const PermissionsContext = createContext<PermissionsState>({
  loading: true,
  role: null,
  perms: NO_PERMISSIONS,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PermissionsState>({
    loading: true,
    role: null,
    perms: NO_PERMISSIONS,
  });

  useEffect(() => {
    let alive = true;
    getMyPermissions()
      .then((res) => {
        if (!alive) return;
        if (res) setState({ loading: false, role: res.role, perms: res.permissions });
        else setState({ loading: false, role: null, perms: NO_PERMISSIONS });
      })
      .catch((err) => {
        console.error("[PERMISSIONS] Falha ao carregar permissões:", err);
        if (alive) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, []);

  return <PermissionsContext.Provider value={state}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsState {
  return useContext(PermissionsContext);
}
