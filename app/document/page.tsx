import { AppSidebar } from "@/app/_components/app-sidebar"
import { DataTable } from "@/app/_components/data-table"
import { SiteHeader } from "@/app/_components/site-header"
import { SidebarInset, SidebarProvider } from "@/app/_components/ui/sidebar"
import CustomDocumentsSidebar from "./section/documents-sidebar"

export default function Document() {
  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 pl-4 md:gap-6 ">
              <CustomDocumentsSidebar />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
