"use client"

import { Box, Check, ChevronsUpDown, ClipboardList, LogOut, Settings, Truck, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { useActionMutation } from "@/lib/api"

type Workspace = { id: string; name: string }

export type AppSidebarProps = {
  name: string
  email: string
  kind: string
  active: string
  workspaces: Workspace[]
  preview?: boolean
}

const navigation = [
  { view: "orders", label: "Purchase orders", icon: ClipboardList },
  { view: "shipments", label: "Shipments", icon: Truck },
  { view: "suppliers", label: "Suppliers", icon: Users, buyerOnly: true },
  { view: "settings", label: "Settings", icon: Settings }
]

function navigationFor(kind: string) {
  return navigation.filter((item) => !item.buyerOnly || kind === "buyer")
}

function hrefFor(view: string, preview: boolean) {
  return preview ? `/preview?view=${view}` : `/${view}`
}

export function CurrentSection({ preview = false, view }: { preview?: boolean; view?: string }) {
  const pathname = usePathname()
  const current = preview
    ? navigation.find((item) => item.view === (view ?? "orders"))
    : navigation.find((item) => pathname.startsWith(`/${item.view}`))
  return <span className="truncate text-sm font-medium">{current?.label ?? "Copacker"}</span>
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
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationFor(kind).map((item) => (
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
  let subtitle = kind === "supplier" ? "Supplier workspace" : "Buyer workspace"
  if (preview) {
    subtitle = "Design preview"
  }

  async function switchTo(id: string) {
    await run({ action: "workspace.switch", data: { id } }).unwrap()
    // A full load re-renders the shared portal layout, which a client navigation keeps from the old workspace.
    window.location.assign("/orders")
  }

  const logo = (
    <>
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Box className="size-4" />
      </div>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{current}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
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
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            {logo}
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "bottom" : "right"} align="start" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {workspaces.map((workspace) => (
                <DropdownMenuItem key={workspace.id} onClick={() => void switchTo(workspace.id)}>
                  <Avatar size="sm" className="rounded-md after:rounded-md">
                    <AvatarFallback className="rounded-md text-[0.625rem]">{initials(workspace.name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{workspace.name}</span>
                  {workspace.id === active && <Check className="ml-auto" />}
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
      <Avatar className="rounded-lg after:rounded-lg">
        <AvatarFallback className="rounded-lg">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
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
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
              />
            }
          >
            {identity}
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 py-1.5 text-left text-sm font-normal text-foreground">
                {identity}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              nativeButton
              render={<button type="submit" form="sign-out" aria-label="Sign out" className="w-full" />}
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
