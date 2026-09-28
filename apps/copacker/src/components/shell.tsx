import { cookies } from "next/headers"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar, type AppSidebarProps } from "./app-sidebar"
import { SiteHeader } from "./site-header"

export async function Shell({ children, ...sidebar }: AppSidebarProps & { children: React.ReactNode }) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    // The app header spans the top of the window, with the sidebar and the page under it.
    <SidebarProvider defaultOpen={defaultOpen} className="flex-col [--header-height:calc(--spacing(14))]">
      <SiteHeader kind={sidebar.kind} />
      <div className="flex flex-1">
        <AppSidebar {...sidebar} />
        <SidebarInset>
          {/* The sidebar's collapse button starts the page's first row, beside its breadcrumb or title; everything
              else spans the page. minWidth 0 lets a wide table scroll inside its container instead of stretching it. */}
          <div
            id="main-content"
            className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] content-start items-center gap-x-2 gap-y-6 p-4 *:col-span-full md:p-6 lg:p-8 [&>[data-sidebar=trigger]]:col-span-1 [&>[data-sidebar=trigger]+*]:col-span-1"
          >
            <SidebarTrigger className="-ml-1.5" />
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
