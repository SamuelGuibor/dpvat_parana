"use client";

import { Separator } from "@/app/_components/ui/separator";
import { SidebarTrigger } from "@/app/_components/ui/sidebar";
import { usePathname } from "next/navigation"; // Importar usePathname

export function SiteHeader() {
  const pathname = usePathname();

  const pageTitles: { [key: string]: string } = {
    "/dashboard": "Dashboard",
    "/team": "Equipe",
    "/document": "Documentos",
    "/stats": "Status",
    "/chats": "Chats",
    "/mensagens": "Mensagens Automaticas",
    "/create": "Criar Conta",
    "/contact-leads": "Contato INSS",
    "/send_email": "Enviar Gmail"
  };

  const pageTitle = pageTitles[pathname] || "Dashboard";

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{pageTitle}</h1>
      </div>
    </header>
  );
}