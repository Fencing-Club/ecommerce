"use client"

import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Palette, Plus, Sun } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
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
} from "@/components/ui/sidebar"
import { announceWorkspace } from "@/components/workspace-watch"
import { useActionMutation } from "@/lib/api"
import { navigationFor, navigationGroups } from "@/lib/navigation"
import { usePermissions } from "./access"
import * as styles from "./app-sidebar.css"
import { sx } from "@/styles/sprinkles.css"

type Workspace = { id: string; name: string }

export type AppSidebarProps = {
  // The workspace's name, shown until the workspace list has it.
  name: string
  // The signed-in person's name; their email shows until they give one.
  userName: string | null
  email: string
  kind: string
  active: string
  workspaces: Workspace[]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function AppSidebar({ name, userName, email, kind, active, workspaces }: AppSidebarProps) {
  const pathname = usePathname()
  const isActive = (item: string) => pathname.startsWith(`/${item}`)
  const { setOpenMobile } = useSidebar()
  const t = useTranslations("navigation")
  // A member sees only the pages they were given.
  const navigation = navigationFor(kind, usePermissions())

  return (
    // On a computer the sidebar starts under the app header; on a phone it's a sheet over everything.
    <Sidebar collapsible="icon" className="top-(--header-height) h-[calc(100svh-var(--header-height))]!">
      <SidebarHeader>
        <WorkspaceSwitcher kind={kind} active={active} workspaces={workspaces} fallbackName={name} />
      </SidebarHeader>
      <SidebarContent>
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
      <SidebarFooter>
        <UserMenu name={userName ?? email} email={email} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function WorkspaceSwitcher({
  kind,
  active,
  workspaces,
  fallbackName
}: {
  kind: string
  active: string
  workspaces: Workspace[]
  fallbackName: string
}) {
  const t = useTranslations("navigation.sidebar")
  const [run] = useActionMutation()
  const { isMobile } = useSidebar()
  const current = workspaces.find((workspace) => workspace.id === active)?.name ?? fallbackName
  const subtitles = { supplier: t("supplierWorkspace"), forwarder: t("forwarderWorkspace") }
  const subtitle = kind === "supplier" || kind === "forwarder" ? subtitles[kind] : t("buyerWorkspace")

  async function switchTo(id: string) {
    await run({ action: "workspace.switch", data: { id } }).unwrap()
    announceWorkspace(id)
    // A full load re-renders the shared portal layout, which a client navigation keeps from the old workspace.
    window.location.assign("/")
  }

  // Copacker's own logo is in the app header, so the workspace shows its initials.
  const label = (
    <>
      <Avatar className="rounded-md after:rounded-md">
        <AvatarFallback className="rounded-md text-xs font-medium text-foreground">{initials(current)}</AvatarFallback>
      </Avatar>
      <div className={sx({ display: "grid", flex: 1, textAlign: "start", text: "sm", lineHeight: "tight" })}>
        <span
          className={sx({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "medium" })}
        >
          {current}
        </span>
        <span
          className={sx({
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            text: "xs",
            color: "muted"
          })}
        >
          {subtitle}
        </span>
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className={styles.menuTrigger} />}>
            {label}
            <ChevronsUpDown className={styles.trailingIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className={styles.menuContent}
            side={isMobile ? "bottom" : "inline-end"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("workspaces")}</DropdownMenuLabel>
              {workspaces.map((workspace) => (
                <DropdownMenuItem key={workspace.id} onClick={() => void switchTo(workspace.id)}>
                  <Avatar size="sm" className={styles.workspaceAvatar}>
                    <AvatarFallback className={styles.workspaceFallback}>{initials(workspace.name)}</AvatarFallback>
                  </Avatar>
                  <span className={sx({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                    {workspace.name}
                  </span>
                  {workspace.id === active && <Check className={styles.trailingIcon} />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/* Another company, or another role for this one, such as a buyer that also supplies. */}
            <DropdownMenuItem render={<Link href="/workspaces/new" />}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-background">
                <Plus className="size-3.5" />
              </span>
              {t("newWorkspace")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function UserMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations("navigation.sidebar")
  const { isMobile } = useSidebar()
  const identity = (
    <>
      <Avatar className={styles.userAvatar}>
        <AvatarFallback className={styles.userFallback}>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className={sx({ display: "grid", flex: 1, textAlign: "start", text: "sm", lineHeight: "tight" })}>
        <span
          className={sx({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: "medium" })}
        >
          {name}
        </span>
        <span
          className={sx({
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            text: "xs",
            color: "muted"
          })}
        >
          {email}
        </span>
      </div>
    </>
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <form id="sign-out" action="/logout" method="post" hidden />
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className={styles.menuTrigger} />}>
            {identity}
            <ChevronsUpDown className={styles.trailingIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className={styles.menuContent}
            side={isMobile ? "bottom" : "inline-end"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className={styles.identityLabel}>{identity}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <ThemeMenu />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              nativeButton
              render={
                <button type="submit" form="sign-out" aria-label={t("signOut")} className={sx({ width: "full" })} />
              }
            >
              <LogOut className="rtl:-scale-x-100" />
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

// Each labelled by its key under the "navigation" messages' `sidebar.themes`.
const themeOptions = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor }
] as const

// Light, dark, or the computer's setting. A light or dark choice is remembered in this browser.
function ThemeMenu() {
  const t = useTranslations("navigation.sidebar")
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette />
        {t("theme")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            const option = themeOptions.find((candidate) => candidate.value === value)
            if (option) {
              setTheme(option.value)
            }
          }}
        >
          {themeOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon />
              {t(`themes.${option.value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
