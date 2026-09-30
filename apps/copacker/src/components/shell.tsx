import { cookies } from "next/headers"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { TopBar, type TopBarProps } from "./top-bar"

// The sidebar is 240px wide, and 56px as a rail of icons.
const sidebarWidths = { "--sidebar-width": "15rem", "--sidebar-width-icon": "3.5rem" } as React.CSSProperties

export async function Shell({ children, ...bar }: TopBarProps & { children: React.ReactNode }) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    // The top bar spans the window, with the sidebar and the page under it.
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={sidebarWidths}
      className="flex-col [--header-height:calc(--spacing(14))]"
    >
      <TopBar {...bar} />
      <div className="flex flex-1">
        <AppSidebar kind={bar.kind} />
        <SidebarInset>
          {/* The page, up to 1280px and aligned to its start. minWidth 0 lets a wide table scroll inside its container
              instead of stretching it. */}
          <div id="main-content" className="flex w-full max-w-[80rem] min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
