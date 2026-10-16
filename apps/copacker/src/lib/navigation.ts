import {
  BookOpen,
  Box,
  Building2,
  ClipboardList,
  LayoutDashboard,
  PackagePlus,
  Receipt,
  Settings,
  Tag,
  Truck,
  Users,
  Warehouse
} from "lucide-react"
import type messages from "../../messages/en/navigation.json"
import type { Area } from "./access"
import type { Permissions } from "./access"
import { can } from "./access"

// A page's name and a group's heading are keys under the "navigation" messages' `pages` and `groups`, which the sidebar
// and search translate.
type PageKey = keyof typeof messages.pages
type GroupKey = keyof typeof messages.groups

// Overview on its own at the top, then a buyer's store pages and purchasing from suppliers, a supplier's sales to its
// customers and what it sells, or a forwarder's freight. Settings sit on their own at the bottom.
export const navigationGroups = [
  { key: "home", labelKey: null },
  { key: "store", labelKey: "store" },
  { key: "purchasing", labelKey: "purchasing" },
  { key: "sales", labelKey: "sales" },
  { key: "catalog", labelKey: "catalog" },
  { key: "freight", labelKey: "freight" },
  { key: "workspace", labelKey: null }
] as const satisfies ReadonlyArray<{ key: string; labelKey: GroupKey | null }>

// A buyer's store orders are Sales, so "Orders" only ever means a supplier's orders from its customers.
const navigation = [
  { view: "overview", labelKey: "overview", icon: LayoutDashboard, group: "home", buyerOnly: true },
  { view: "sales", labelKey: "sales", icon: Receipt, group: "store", buyerOnly: true },
  { view: "products", labelKey: "products", icon: Box, group: "store", buyerOnly: true },
  { view: "restock", labelKey: "restock", icon: PackagePlus, group: "store", buyerOnly: true },
  { view: "orders", labelKey: "purchaseOrders", icon: ClipboardList, group: "purchasing", buyerOnly: true },
  { view: "shipments", labelKey: "shipments", icon: Truck, group: "purchasing", buyerOnly: true },
  { view: "partners", labelKey: "partners", icon: Users, group: "purchasing", buyerOnly: true },
  { view: "overview", labelKey: "overview", icon: LayoutDashboard, group: "home", supplierOnly: true },
  { view: "orders", labelKey: "orders", icon: ClipboardList, group: "sales", supplierOnly: true },
  { view: "shipments", labelKey: "shipments", icon: Truck, group: "sales", supplierOnly: true },
  { view: "customers", labelKey: "customers", icon: Building2, group: "sales", supplierOnly: true },
  { view: "products", labelKey: "products", icon: Tag, group: "catalog", supplierOnly: true },
  { view: "inventory", labelKey: "inventory", icon: Warehouse, group: "catalog", supplierOnly: true },
  { view: "catalogs", labelKey: "catalogs", icon: BookOpen, group: "catalog", supplierOnly: true },
  { view: "orders", labelKey: "purchaseOrders", icon: ClipboardList, group: "freight", forwarderOnly: true },
  { view: "settings", labelKey: "settings", icon: Settings, group: "workspace" }
] satisfies Array<
  { view: Area | "settings"; labelKey: PageKey; group: (typeof navigationGroups)[number]["key"] } & Record<
    string,
    unknown
  >
>

// Every page a workspace's kind has, as the marketing page's pictures of the app show them. A forwarder's workspace sees
// the POs coming through it, and keeps its addresses and profile in Settings.
export function pagesFor(kind: string) {
  return navigation.filter(
    (item) =>
      (!("buyerOnly" in item) || kind === "buyer") &&
      (!("supplierOnly" in item) || kind === "supplier") &&
      (!("forwarderOnly" in item) || kind === "forwarder")
  )
}

// The pages someone can open: a member's own, and Settings, which is everyone's.
export function navigationFor(kind: string, permissions: Permissions) {
  return pagesFor(kind).filter((item) => item.view === "settings" || can(permissions, item.view))
}

// The pages a member can be given, as the sidebar names them: every page but Settings.
export function areasFor(kind: string) {
  return pagesFor(kind).flatMap((item) =>
    item.view === "settings" ? [] : [{ area: item.view, labelKey: item.labelKey }]
  )
}

// What a page is called in a workspace of this kind, such as "Orders" for a supplier's orders, as its key under the
// "navigation" messages' `pages`.
export function areaLabelKey(kind: string, area: Area) {
  return areasFor(kind).find((item) => item.area === area)?.labelKey
}

// Where someone lands in a workspace: a buyer's Overview, or anyone else's orders, and otherwise their first page.
const homes: Record<string, Area> = { buyer: "overview", supplier: "orders", forwarder: "orders" }
export function homeFor(kind: string, permissions: Permissions) {
  const home = homes[kind]
  if (home && can(permissions, home)) {
    return `/${home}`
  }
  return `/${navigationFor(kind, permissions)[0]?.view ?? "settings"}`
}
