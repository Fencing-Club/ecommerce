"use client"

import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@/components/ui/sidebar"
import { navigationFor, navigationGroups } from "@/lib/navigation"
import { usePermissions } from "./access"
import { AccountMenu } from "./account-menu"
import { CreateMenu } from "./create-menu"

// A page's entry: 34px, its icon muted. The open page, or the list a record belongs to, has a muted fill, a primary
// marker on its leading edge, and its label and icon in full.
const itemClass =
  "relative h-[34px] gap-2.5 rounded-md px-2.5 text-sidebar-foreground data-active:bg-muted data-active:font-semibold data-active:text-foreground [&>svg]:text-muted-foreground data-active:[&>svg]:text-foreground data-active:before:absolute data-active:before:start-0 data-active:before:top-1/2 data-active:before:h-[18px] data-active:before:w-[3px] data-active:before:-translate-y-1/2 data-active:before:rounded-[2px] data-active:before:bg-primary"

// The workspace kind's pages in their groups, Settings pinned at the bottom. On a computer the sidebar starts under the
// top bar and collapses to its icons; on a phone it's a sheet over everything, which also holds Create and the account,
// since the phone's top bar has no room for them.
export function AppSidebar({ kind, userName, email }: { kind: string; userName: string | null; email: string }) {
  const pathname = usePathname()
  const isActive = (item: string) => pathname.startsWith(`/${item}`)
  const { isMobile, setOpenMobile } = useSidebar()
  const t = useTranslations("navigation")
  // A member sees only the pages they were given.
  const navigation = navigationFor(kind, usePermissions())

  return (
    <Sidebar collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarContent className="gap-0 p-3">
        {navigationGroups.map((group) => {
          const items = navigation.filter((item) => item.group === group.key)
          if (!items.length) {
            return null
          }
          return (
            <SidebarGroup key={group.key} className={group.key === "workspace" ? "mt-auto p-0" : "p-0"}>
              {group.labelKey && (
                <SidebarGroupLabel className="h-auto px-2.5 pt-4 pb-1.5 text-xs font-medium text-muted-foreground">
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
                        render={<Link href={`/${item.view}`} onClick={() => setOpenMobile(false)} />}
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
      {isMobile && (
        <SidebarFooter className="gap-2 border-t p-3">
          <CreateMenu kind={kind} />
          <AccountMenu name={userName ?? email} email={email} layout="row" />
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  )
}
