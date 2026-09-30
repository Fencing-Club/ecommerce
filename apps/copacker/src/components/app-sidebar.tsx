"use client"

import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
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

// The workspace kind's pages in their groups, Settings pinned at the bottom. The open page, or the list a record belongs
// to, has a muted fill and a primary marker on its leading edge. On a computer the sidebar starts under the top bar and
// collapses to its icons; on a phone it's a sheet over everything.
export function AppSidebar({ kind }: { kind: string }) {
  const pathname = usePathname()
  const isActive = (item: string) => pathname.startsWith(`/${item}`)
  const { setOpenMobile } = useSidebar()
  const t = useTranslations("navigation")
  // A member sees only the pages they were given.
  const navigation = navigationFor(kind, usePermissions())

  return (
    <Sidebar collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarContent className="pt-2">
        {navigationGroups.map((group) => {
          const items = navigation.filter((item) => item.group === group.key)
          if (!items.length) {
            return null
          }
          return (
            <SidebarGroup key={group.key} className={group.key === "workspace" ? "mt-auto" : undefined}>
              {group.labelKey && <SidebarGroupLabel>{t(`groups.${group.labelKey}`)}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        isActive={isActive(item.view)}
                        tooltip={t(`pages.${item.labelKey}`)}
                        className="relative h-[34px] gap-2.5 px-2.5 text-sidebar-foreground data-active:bg-muted data-active:before:absolute data-active:before:start-0 data-active:before:top-1/2 data-active:before:h-[18px] data-active:before:w-[3px] data-active:before:-translate-y-1/2 data-active:before:rounded-full data-active:before:bg-primary [&>svg]:text-muted-foreground"
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
      <SidebarRail />
    </Sidebar>
  )
}
