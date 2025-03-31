import { AppSidebar } from "@/app/_components/app-sidebar"
import { SiteHeader } from "@/app/_components/site-header"
import { SidebarInset, SidebarProvider } from "@/app/_components/ui/sidebar"
import { Home } from "./section/chat-template"
import { SidebarProviderr } from "@/app/_components/blocks/sidebar"

export default function Chats() {
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="px-4 lg:px-6">
                <SidebarProviderr>
                  <Home />
                </SidebarProviderr>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

