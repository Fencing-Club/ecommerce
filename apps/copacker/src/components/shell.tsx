import { useMounted } from "@mantine/hooks"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import type { AppSidebarProps } from "./app-sidebar"
import { AppSidebar, SidebarToggle } from "./app-sidebar"
import { TopBar } from "./top-bar"

// The sidebar is 240px wide, and 56px as a rail of icons.
const sidebarWidths = { "--sidebar-width": "15rem", "--sidebar-width-icon": "3.5rem" } as React.CSSProperties

export function Shell({
  children,
  defaultOpen,
  navigate,
  ...shell
}: AppSidebarProps & { children: React.ReactNode; defaultOpen: boolean; navigate: (href: string) => void }) {
  const hydrated = useMounted()
  return (
    // The top bar spans the window, with the sidebar and the page under it.
    <SidebarProvider
      defaultOpen={defaultOpen}
      data-portal-hydrated={hydrated || undefined}
      style={sidebarWidths}
      className="flex-col [--header-height:calc(--spacing(14))]"
    >
      <TopBar kind={shell.kind} navigate={navigate} />
      <div className="flex flex-1">
        <AppSidebar {...shell} />
        <SidebarInset>
          {/* A row above the page for the sidebar's toggle, its icon in line with the page's start. */}
          <div className="flex h-12 shrink-0 items-center px-8 max-md:hidden">
            <SidebarToggle />
          </div>
          {/* The page, up to 1280px and aligned to its start, 24px between its blocks (16px on a phone). minWidth 0 lets
              a wide table scroll inside its container instead of stretching it. */}
          <div
            id="main-content"
            className="flex w-full max-w-[80rem] min-w-0 flex-1 flex-col gap-4 px-4 pt-4 pb-7 md:gap-6 md:px-8 md:pt-2 md:pb-12"
          >
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
