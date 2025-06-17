/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */

"use client";

import { AppSidebar } from "@/app/_components/app-sidebar";
import { DataTable } from "@/app/_components/data-table";
import { SiteHeader } from "@/app/_components/site-header";
import { SidebarInset, SidebarProvider } from "@/app/_components/ui/sidebar";
import { useState, useEffect } from "react";
import { getUsers } from "@/app/_actions/get-user";
import { KanbanExample } from "../_components/kanban/demo";

interface UserTableData {
  id: string;
  name: string;
  status?: string;
  type: string;
  statusStartedAt?: string | null;
}

export default function Page() {
  const [data, setData] = useState<UserTableData[]>([]);
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/user-status", { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status");
        const { status, role } = await response.json();
        setServerStatus(status);
        setUserRole(role);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/api/user-status", { method: "GET" });
        if (!response.ok) throw new Error("Erro ao buscar status");
        const { status, role } = await response.json();
        setServerStatus(status);
        setUserRole(role);
      } catch (error) {
        console.error(error);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const users = await getUsers("basic");
        console.log("Dados retornados por getUsers:", users);
        if (Array.isArray(users)) {
          const transformedData = users.map((user) => ({
            ...user,
            status: user.status || "Sem status",
          }));
          setData(transformedData);
        } else {
          console.error("Esperava uma lista de usuários, mas recebeu:", users);
          setData([]);
        }
      } catch (error) {
        console.error("Erro ao carregar os dados:", error);
        setData([]);
      }
    }
    fetchData();
  }, [userRole]);

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col w-full">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6"></div>
              <KanbanExample />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}