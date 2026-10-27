import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@buildkitgg/shadcn-baseui-kit"
import { PanelLeft } from "lucide-react"
import { useTranslations } from "use-intl"
import { useEdge } from "@/hooks/use-edge"
import { navigationFor, navigationGroups } from "@/lib/navigation"
import { usePermissions } from "./access"
import { AccountMenu } from "./account-menu"
import type { Workspace } from "./workspace-menu"
import { WorkspaceMenu } from "./workspace-menu"

// A page's entry: 34px, its icon muted. The open page, or the list a record belongs to, has a muted fill, a primary
// marker on its leading edge, and its label and icon in full.
const itemClass =
  "relative h-[34px] gap-2.5 rounded-md px-2.5 text-sidebar-foreground data-active:bg-muted data-active:font-semibold data-active:text-foreground [&>svg]:text-muted-foreground data-active:[&>svg]:text-foreground data-active:before:absolute data-active:before:start-0 data-active:before:top-1/2 data-active:before:h-[18px] data-active:before:w-[3px] data-active:before:-translate-y-1/2 data-active:before:rounded-[2px] data-active:before:bg-primary"

// On a computer, the button at the top of the page that collapses the sidebar to its icons and expands it again, as
// its rail and Ctrl+B do. A phone opens the sidebar from the top bar's menu button instead.
export function SidebarToggle() {
  const t = useTranslations("common.ui")
  const { toggleSidebar } = useSidebar()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleSidebar}
      aria-label={t("toggleSidebar")}
      className="-ms-1.5 text-muted-foreground"
    >
      <PanelLeft className="size-4 rtl:-scale-x-100" aria-hidden />
    </Button>
  )
}

export type AppSidebarProps = {
  pathname: string
  kind: string
  // The open workspace, and its name as the session gave it until the workspace list has it.
  active: string
  name: string
  workspaces: ReadonlyArray<Workspace>
  // The signed-in person's name; their email shows until they give one.
  userName: string | null
  email: string
}

// The workspace switcher, then the workspace kind's pages in their groups, Settings pinned at the bottom, and the
// signed-in person's account below them. On a computer the sidebar starts under the top bar and collapses to its icons;
// on a phone it's a sheet over everything.
export function AppSidebar({ pathname, kind, active, name, workspaces, userName, email }: AppSidebarProps) {
  const isActive = (item: string) => pathname.startsWith(`/${item}`)
  const { setOpenMobile } = useSidebar()
  const side = useEdge("start")
  const t = useTranslations("navigation")
  // A member sees only the pages they were given.
  const navigation = navigationFor(kind, usePermissions())

  return (
    <Sidebar side={side} collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader className="border-b p-3">
        <WorkspaceMenu active={active} fallbackName={name} workspaces={workspaces} />
      </SidebarHeader>
      <SidebarContent className="gap-0 p-3">
        {navigationGroups.map((group) => {
          const items = navigation.filter((item) => item.group === group.key)
          if (!items.length) {
            return null
          }
          return (
            <SidebarGroup key={group.key} className={group.key === "workspace" ? "mt-auto p-0" : "p-0"}>
              {/* The heading is taller than shadcn's, so once collapsed its hidden box slides over the page above it;
                  clicks pass through to that page. */}
              {group.labelKey && (
                <SidebarGroupLabel className="h-auto px-2.5 pt-4 pb-1.5 text-xs font-medium text-muted-foreground group-data-[collapsible=icon]:pointer-events-none">
                  {t(`groups.${group.labelKey}`)}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        isActive={isActive(item.view)}
                        tooltip={t(`pages.${item.labelKey}`)}
                        className={itemClass}
                        render={
                          <a
                            aria-label={t(`pages.${item.labelKey}`)}
                            href={`/${item.view}`}
                            onClick={() => setOpenMobile(false)}
                          />
                        }
                      >
                        <item.icon />
                        <span>{t(`pages.${item.labelKey}`)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
      <SidebarFooter className="border-t p-3 group-data-[collapsible=icon]:p-2">
        <AccountMenu name={userName ?? email} email={email} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
