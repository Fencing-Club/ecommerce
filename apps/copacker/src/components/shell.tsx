import { ArrowUpRight, FlaskConical } from "lucide-react"
import { cookies } from "next/headers"
import Link from "next/link"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { AppSidebar, type AppSidebarProps, CurrentSection } from "./app-sidebar"
import * as styles from "./shell.css"
import { sx } from "@/styles/sprinkles.css"

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
        <header className={styles.header}>
          <SidebarTrigger className={styles.trigger} />
          <Separator orientation="vertical" className={styles.separator} />
          <CurrentSection preview={sidebar.preview} view={view} />
        </header>
        <div
          id="main-content"
          className={cn(
            styles.main,
            sx({
              display: "flex",
              width: "full",
              maxWidth: "7xl",
              flex: 1,
              flexDirection: "column",
              gap: 6,
              padding: { base: 4, md: 6, lg: 8 }
            })
          )}
        >
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
