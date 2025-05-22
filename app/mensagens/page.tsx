"use client"
import { AppSidebar } from "@/app/_components/app-sidebar"
import { SiteHeader } from "@/app/_components/site-header"
import { SidebarInset, SidebarProvider } from "@/app/_components/ui/sidebar"
import { Mensagens } from "./section/mensagens"
import { useEffect, useState } from "react";

export default function Clientes() {
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
  
    if (userRole !== "ADMIN") {
      return <div></div>;
    }
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
                <Mensagens />
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
