"use client"

import {
  Box,
  Check,
  ChevronsUpDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  PackagePlus,
  Palette,
  Receipt,
  Settings,
  Ship,
  Sun,
  Truck,
  Users,
  BookOpen,
  Building2,
  Tag,
  Warehouse
} from "lucide-react"
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
import * as styles from "./app-sidebar.css"
import { sx } from "@/styles/sprinkles.css"

type Workspace = { id: string; name: string }

export type AppSidebarProps = {
  name: string
  email: string
  kind: string
  active: string
  workspaces: Workspace[]
  preview?: boolean
}

// A buyer's store pages, then purchasing from suppliers. A supplier's sales to its customers, then what it
// sells. Settings sit on their own at the bottom.
const groups = [
  { key: "home", label: null },
  { key: "store", label: "Store" },
  { key: "purchasing", label: "Purchasing" },
  { key: "sales", label: "Sales" },
  { key: "catalog", label: "Products" },
  { key: "workspace", label: null }
] as const

const navigation = [
  { view: "overview", label: "Overview", icon: LayoutDashboard, group: "store", buyerOnly: true },
  { view: "sales", label: "Orders", icon: Receipt, group: "store", buyerOnly: true },
  { view: "products", label: "Products", icon: Box, group: "store", buyerOnly: true },
  { view: "restock", label: "Restock", icon: PackagePlus, group: "store", buyerOnly: true },
  { view: "orders", label: "Purchase orders", icon: ClipboardList, group: "purchasing", buyerOnly: true },
  { view: "shipments", label: "Shipments", icon: Truck, group: "purchasing", buyerOnly: true },
  { view: "suppliers", label: "Suppliers", icon: Users, group: "purchasing", buyerOnly: true },
  { view: "forwarders", label: "Forwarders", icon: Ship, group: "purchasing", buyerOnly: true },
  { view: "overview", label: "Overview", icon: LayoutDashboard, group: "home", supplierOnly: true },
  { view: "orders", label: "Orders", icon: ClipboardList, group: "sales", supplierOnly: true },
  { view: "shipments", label: "Shipments", icon: Truck, group: "sales", supplierOnly: true },
  { view: "customers", label: "Customers", icon: Building2, group: "sales", supplierOnly: true },
  { view: "products", label: "Products", icon: Tag, group: "catalog", supplierOnly: true },
  { view: "inventory", label: "Inventory", icon: Warehouse, group: "catalog", supplierOnly: true },
  { view: "catalogs", label: "Catalogs", icon: BookOpen, group: "catalog", supplierOnly: true },
  { view: "settings", label: "Settings", icon: Settings, group: "workspace" }
] satisfies Array<{ view: string; group: (typeof groups)[number]["key"] } & Record<string, unknown>>

// A forwarder's workspace sees the POs coming through it, and keeps its addresses and profile in Settings.
function navigationFor(kind: string) {
  if (kind === "forwarder") {
    return [
      { view: "orders", label: "Purchase orders", icon: ClipboardList, group: "purchasing" as const },
      ...navigation.filter((item) => item.view === "settings")
    ]
  }
  return navigation.filter(
    (item) => (!item.buyerOnly || kind === "buyer") && (!item.supplierOnly || kind === "supplier")
  )
}

function hrefFor(view: string, preview: boolean) {
  return preview ? `/preview?view=${view}` : `/${view}`
}

export function CurrentSection({ preview = false, view, kind }: { preview?: boolean; view?: string; kind: string }) {
  const pathname = usePathname()
  const items = navigationFor(kind)
  const current = preview
    ? items.find((item) => item.view === (view ?? "orders"))
    : items.find((item) => pathname.startsWith(`/${item.view}`))
  return (
    <span
      className={sx({
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        text: "sm",
        fontWeight: "medium"
      })}
    >
      {current?.label ?? "Copacker"}
    </span>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function AppSidebar({
  name,
  email,
  kind,
  active,
  workspaces,
  preview = false,
  view
}: AppSidebarProps & { view?: string }) {
  const pathname = usePathname()
  const isActive = (item: string) => (preview ? (view ?? "orders") === item : pathname.startsWith(`/${item}`))
  const { setOpenMobile } = useSidebar()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher kind={kind} active={active} workspaces={workspaces} fallbackName={name} preview={preview} />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => {
          const items = navigationFor(kind).filter((item) => item.group === group.key)
          if (!items.length) {
            return null
          }
          return (
            <SidebarGroup key={group.key} className={group.key === "workspace" ? "mt-auto" : undefined}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        isActive={isActive(item.view)}
                        tooltip={item.label}
                        render={<Link href={hrefFor(item.view, preview)} onClick={() => setOpenMobile(false)} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
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
        <UserMenu name={name} email={email} preview={preview} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function WorkspaceSwitcher({
  kind,
  active,
  workspaces,
  fallbackName,
  preview
}: {
  kind: string
  active: string
  workspaces: Workspace[]
  fallbackName: string
  preview: boolean
}) {
  const [run] = useActionMutation()
  const { isMobile } = useSidebar()
  const current = workspaces.find((workspace) => workspace.id === active)?.name ?? fallbackName
  let subtitle = { supplier: "Supplier workspace", forwarder: "Forwarder workspace" }[kind] ?? "Buyer workspace"
  if (preview) {
    subtitle = "Design preview"
  }

  async function switchTo(id: string) {
    await run({ action: "workspace.switch", data: { id } }).unwrap()
    announceWorkspace(id)
    // A full load re-renders the shared portal layout, which a client navigation keeps from the old workspace.
    window.location.assign("/")
  }

  const logo = (
    <>
      <div className={styles.logo}>
        <Box className={sx({ size: 4 })} />
      </div>
      <div className={sx({ display: "grid", flex: 1, textAlign: "left", text: "sm", lineHeight: "tight" })}>
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

  if (preview) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" render={<div />}>
            {logo}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className={styles.menuTrigger} />}>
            {logo}
            <ChevronsUpDown className={styles.trailingIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className={styles.menuContent}
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
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
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function UserMenu({ name, email, preview }: { name: string; email: string; preview: boolean }) {
  const { isMobile } = useSidebar()
  const identity = (
    <>
      <Avatar className={styles.userAvatar}>
        <AvatarFallback className={styles.userFallback}>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className={sx({ display: "grid", flex: 1, textAlign: "left", text: "sm", lineHeight: "tight" })}>
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

  if (preview) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" render={<div />}>
            {identity}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

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
            side={isMobile ? "bottom" : "right"}
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
              render={<button type="submit" form="sign-out" aria-label="Sign out" className={sx({ width: "full" })} />}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
] as const

// Light, dark, or the computer's setting. A light or dark choice is remembered in this browser.
function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette />
        Theme
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
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
