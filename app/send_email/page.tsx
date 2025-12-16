"use client";

import { AppSidebar } from "@/app/_components/app-sidebar";
import { SiteHeader } from "@/app/_components/site-header";
import { SidebarInset, SidebarProvider } from "@/app/_components/ui/sidebar";
import { Button } from "../_components/ui/button";


export default function Send_Email() {

  async function mandarEmail() {
    try {
      await fetch("/api/send_email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.log(error)
    }
  }
  
  

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset className="min-w-0">
        <SiteHeader />
        <div className="flex flex-1 flex-col w-full">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                <Button onClick={mandarEmail}>Mandar Email</Button>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}