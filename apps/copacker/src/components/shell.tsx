import { ArrowUpRight, FlaskConical } from "lucide-react"
import { cookies } from "next/headers"
import Link from "next/link"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar, type AppSidebarProps, CurrentSection } from "./app-sidebar"

export async function Shell({
  children,
  view,
  ...sidebar
}: AppSidebarProps & { children: React.ReactNode; view?: string }) {
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar {...sidebar} view={view} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
          <CurrentSection preview={sidebar.preview} view={view} />
        </header>
        <div id="main-content" className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
          {sidebar.preview && (
            <Alert role="note">
              <FlaskConical />
              <AlertTitle>Design preview</AlertTitle>
              <AlertDescription>This page uses sample data. No accounts are connected.</AlertDescription>
              <AlertAction>
                <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
                  Get started
                  <ArrowUpRight data-icon="inline-end" />
                </Button>
              </AlertAction>
            </Alert>
          )}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
