import { Boxes, FileText, LayoutDashboard, MoreHorizontal, Plus, Settings, Truck } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar
} from "./sidebar"

const pages = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Purchase orders", icon: FileText, badge: "4" },
  { href: "/shipments", label: "Shipments", icon: Truck },
  { href: "/inventory", label: "Inventory", icon: Boxes }
]

type Args = {
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
  side?: "left" | "right"
  loading?: boolean
  onNewOrder: () => void
  onMore: () => void
}

// For frames whose buttons the story doesn't check.
const ignore = () => undefined

// Shows the sidebar's state beside the page, as the page's content would read it.
function SidebarState() {
  const { state, open, openMobile, isMobile } = useSidebar()
  return (
    <p data-testid="sidebar-state">
      {state} {String(open)} {isMobile ? `mobile ${String(openMobile)}` : "desktop"}
    </p>
  )
}

// The app's shell in small: the sidebar with its groups and the page beside it with the toggle.
function AppFrame({ variant, collapsible = "icon", side, loading, onNewOrder, onMore }: Args) {
  return (
    <>
      <Sidebar variant={variant} collapsible={collapsible} side={side}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  H
                </span>
                <span>Harbor Goods</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarInput aria-label="Filter pages" placeholder="Filter" />
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Buying</SidebarGroupLabel>
            <SidebarGroupAction aria-label="New purchase order" onClick={onNewOrder}>
              <Plus />
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                {loading
                  ? Array.from({ length: 3 }, (_, index) => (
                      <SidebarMenuItem key={index}>
                        <SidebarMenuSkeleton showIcon />
                      </SidebarMenuItem>
                    ))
                  : pages.map((page) => (
                      <SidebarMenuItem key={page.href}>
                        <SidebarMenuButton
                          isActive={page.href === "/orders"}
                          tooltip={page.label}
                          render={<Link href={page.href} />}
                        >
                          <page.icon />
                          <span>{page.label}</span>
                        </SidebarMenuButton>
                        {page.badge && <SidebarMenuBadge>{page.badge}</SidebarMenuBadge>}
                        {page.href === "/shipments" && (
                          <SidebarMenuAction showOnHover aria-label="More shipment pages" onClick={onMore}>
                            <MoreHorizontal />
                          </SidebarMenuAction>
                        )}
                        {page.href === "/inventory" && (
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton isActive render={<Link href="/inventory/restock" />}>
                                <span>Restock</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton size="sm" href="/inventory/counts">
                                <span>Counts</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuItem>
                    ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Settings" variant="outline" size="sm">
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <span className="text-sm font-medium">Purchase orders</span>
        </header>
        <div className="p-4">
          <SidebarState />
        </div>
      </SidebarInset>
    </>
  )
}

// A sidebar whose open state the page holds.
function Controlled({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onOpenChange(next)
      }}
    >
      <AppFrame onNewOrder={ignore} onMore={ignore} />
    </SidebarProvider>
  )
}

const meta = preview.type<{ args: Args & { defaultOpen?: boolean } }>().meta({
  component: SidebarProvider,
  args: { onNewOrder: fn(), onMore: fn() },
  parameters: { layout: "fullscreen" },
  render: ({ defaultOpen, ...frame }) => (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppFrame {...frame} />
    </SidebarProvider>
  )
})

// The header's toggle button. The rail along the sidebar's edge has the same name.
const triggerOf = (canvasElement: HTMLElement) => {
  const trigger = canvasElement.querySelector("[data-slot=sidebar-trigger]")
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("No sidebar trigger")
  }
  return trigger
}

const sidebarOf = (canvasElement: HTMLElement) => {
  const sidebar = canvasElement.querySelector("[data-slot=sidebar]")
  if (!(sidebar instanceof HTMLElement)) {
    throw new Error("No sidebar")
  }
  return sidebar
}

export const Default = meta.story({
  play: async ({ canvas, canvasElement, args }) => {
    const sidebar = sidebarOf(canvasElement)
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
    await expect(canvas.getByTestId("sidebar-state")).toHaveTextContent("expanded true desktop")

    const orders = canvas.getByRole("link", { name: "Purchase orders" })
    await expect(orders).toHaveAttribute("data-active")
    await expect(orders).toHaveAttribute("href", "/orders")
    await expect(canvas.getByRole("link", { name: "Overview" })).not.toHaveAttribute("data-active")
    await expect(canvas.getByText("4")).toHaveAttribute("data-slot", "sidebar-menu-badge")
    await expect(canvas.getByRole("link", { name: "Restock" })).toHaveAttribute("data-active")
    await expect(canvas.getByRole("link", { name: "Counts" })).toHaveAttribute("data-size", "sm")
    await expect(canvas.getByText("Buying")).toHaveAttribute("data-sidebar", "group-label")

    await userEvent.click(canvas.getByRole("button", { name: "New purchase order" }))
    await expect(args.onNewOrder).toHaveBeenCalledOnce()
    await userEvent.hover(canvas.getByRole("link", { name: "Shipments" }))
    await userEvent.click(canvas.getByRole("button", { name: "More shipment pages" }))
    await expect(args.onMore).toHaveBeenCalledOnce()

    await userEvent.type(canvas.getByRole("textbox", { name: "Filter pages" }), "ship")
    await expect(canvas.getByRole("textbox", { name: "Filter pages" })).toHaveValue("ship")

    // Tooltips stay hidden while the sidebar shows its labels.
    await userEvent.hover(orders)
    const tip = await screen.findByText("Purchase orders", { selector: "[data-slot=tooltip-content]" })
    await expect(tip).not.toBeVisible()
  }
})

export const Toggle = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const sidebar = sidebarOf(canvasElement)
    const trigger = triggerOf(canvasElement)
    await expect(trigger).toHaveAccessibleName("Toggle Sidebar")

    // The trigger collapses it to icons and remembers that in a cookie.
    await userEvent.click(trigger)
    await expect(sidebar).toHaveAttribute("data-state", "collapsed")
    await expect(sidebar).toHaveAttribute("data-collapsible", "icon")
    await expect(canvas.getByTestId("sidebar-state")).toHaveTextContent("collapsed false desktop")
    await expect(document.cookie).toContain("sidebar_state=false")

    // Collapsed, each icon names its page in a tooltip.
    await userEvent.hover(canvas.getByRole("link", { name: "Shipments" }))
    const tip = await screen.findByText("Shipments", { selector: "[data-slot=tooltip-content]" })
    await expect(tip).toHaveAttribute("data-side", "inline-end")
    await userEvent.unhover(canvas.getByRole("link", { name: "Shipments" }))

    // Ctrl+B opens it again.
    await userEvent.keyboard("{Control>}b{/Control}")
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
    await expect(document.cookie).toContain("sidebar_state=true")

    // So does the rail along its edge.
    await userEvent.click(canvas.getByTitle("Toggle Sidebar"))
    await expect(canvas.getByTitle("Toggle Sidebar")).toHaveAttribute("data-slot", "sidebar-rail")
    await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  }
})

export const Collapsed = meta.story({
  args: { defaultOpen: false },
  play: async ({ canvasElement }) => {
    const sidebar = sidebarOf(canvasElement)
    await expect(sidebar).toHaveAttribute("data-state", "collapsed")
    const container = sidebar.querySelector("[data-slot=sidebar-container]")
    await expect(container?.getBoundingClientRect().width).toBe(48)
    await userEvent.click(triggerOf(canvasElement))
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
    await waitFor(() => expect(container?.getBoundingClientRect().width).toBe(256))
  }
})

// Off canvas, collapsing slides the whole sidebar away.
export const Offcanvas = meta.story({
  args: { collapsible: "offcanvas" },
  play: async ({ canvasElement }) => {
    const sidebar = sidebarOf(canvasElement)
    await userEvent.click(triggerOf(canvasElement))
    await expect(sidebar).toHaveAttribute("data-collapsible", "offcanvas")
    const gap = sidebar.querySelector("[data-slot=sidebar-gap]")
    await waitFor(() => expect(gap?.getBoundingClientRect().width).toBe(0))
  }
})

export const Variants = meta.story({
  render: () => (
    <div className="grid gap-4">
      {(["floating", "inset"] as const).map((variant) => (
        <SidebarProvider key={variant} className="min-h-0 h-64" data-testid={variant}>
          <AppFrame variant={variant} collapsible="none" onNewOrder={ignore} onMore={ignore} />
        </SidebarProvider>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    // Without collapsing, the sidebar is a plain column with no toggle state.
    for (const variant of ["floating", "inset"]) {
      const frame = canvas.getByTestId(variant)
      const sidebar = frame.querySelector("[data-slot=sidebar]")
      await expect(sidebar).not.toHaveAttribute("data-state")
      await expect(within(frame).getByRole("link", { name: "Inventory" })).toBeVisible()
    }
  }
})

export const RightSide = meta.story({
  args: { side: "right", collapsible: "offcanvas" },
  play: async ({ canvasElement }) => {
    const sidebar = sidebarOf(canvasElement)
    await expect(sidebar).toHaveAttribute("data-side", "right")
    const container = sidebar.querySelector("[data-slot=sidebar-container]")
    await expect(container?.getBoundingClientRect().right).toBe(window.innerWidth)
  }
})

export const Loading = meta.story({
  args: { loading: true },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument()
    const skeletons = canvasElement.querySelectorAll("[data-slot=sidebar-menu-skeleton]")
    await expect(skeletons).toHaveLength(3)
    await expect(skeletons[0]?.querySelector("[data-sidebar=menu-skeleton-icon]")).toBeInTheDocument()
  }
})

export const ControlledOpen = meta.story({
  args: { onOpenChange: fn() },
  render: ({ onOpenChange }) => <Controlled onOpenChange={onOpenChange ?? ignore} />,
  play: async ({ canvasElement, args }) => {
    await userEvent.click(triggerOf(canvasElement))
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false)
    await expect(sidebarOf(canvasElement)).toHaveAttribute("data-state", "collapsed")
  }
})

// Without `open`, the sidebar keeps its own state and onOpenChange only hears about it.
export const OpenChangeCallback = meta.story({
  args: { onOpenChange: fn() },
  render: ({ onOpenChange }) => (
    <SidebarProvider onOpenChange={onOpenChange}>
      <AppFrame onNewOrder={ignore} onMore={ignore} />
    </SidebarProvider>
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(triggerOf(canvasElement))
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(false)
    await expect(sidebarOf(canvasElement)).toHaveAttribute("data-state", "collapsed")
    await userEvent.click(triggerOf(canvasElement))
    await expect(args.onOpenChange).toHaveBeenLastCalledWith(true)
    await expect(sidebarOf(canvasElement)).toHaveAttribute("data-state", "expanded")
  }
})

// On a phone the sidebar opens over the page as a sheet.
export const Mobile = meta.story({
  globals: { viewport: { value: "iphone14", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByTestId("sidebar-state")).toHaveTextContent("mobile false")
    await expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument()

    await userEvent.click(triggerOf(canvasElement))
    const sheet = await screen.findByRole("dialog", { name: "Sidebar" })
    await expect(sheet).toHaveAccessibleDescription("Displays the mobile sidebar.")
    await expect(sheet).toHaveAttribute("data-mobile", "true")
    await waitFor(() => expect(within(sheet).getByRole("link", { name: "Purchase orders" })).toBeVisible())
    await expect(canvas.getByTestId("sidebar-state")).toHaveTextContent("mobile true")

    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await expect(canvas.getByTestId("sidebar-state")).toHaveTextContent("mobile false")
  }
})
