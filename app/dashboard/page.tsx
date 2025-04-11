"use client";

import { AppSidebar } from "@/app/_components/app-sidebar";
import { DataTable } from "@/app/_components/data-table";
import { SiteHeader } from "@/app/_components/site-header";
import { SidebarInset, SidebarProvider } from "@/app/_components/ui/sidebar";
import { useState, useEffect } from "react";
import { getUserTable } from "@/app/_actions/get-user-table"; 

interface UserTableData {
  id: string;
  name: string;
  status: string;
  type: string;
}

export default function Page() {
  const [data, setData] = useState<UserTableData[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const users = await getUserTable();
        console.log("Dados retornados por getUserTable:", users); // Adicione isso
        setData(users);
      } catch (error) {
        console.error("Erro ao carregar os dados:", error);
        setData([]); 
      }
    }
    fetchData();
  }, []);

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
              </div>
              <DataTable data={data} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}