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
import { type Area, can, type Permissions } from "./access"

// Overview on its own at the top, then a buyer's store pages and purchasing from suppliers, or a supplier's sales to
// its customers and what it sells. Settings sit on their own at the bottom.
export const navigationGroups = [
  { key: "home", label: null },
  { key: "store", label: "Store" },
  { key: "purchasing", label: "Purchasing" },
  { key: "sales", label: "Sales" },
  { key: "catalog", label: "Products" },
  { key: "workspace", label: null }
] as const

const navigation = [
  { view: "overview", label: "Overview", icon: LayoutDashboard, group: "home", buyerOnly: true },
  { view: "sales", label: "Orders", icon: Receipt, group: "store", buyerOnly: true },
  { view: "products", label: "Products", icon: Box, group: "store", buyerOnly: true },
  { view: "restock", label: "Restock", icon: PackagePlus, group: "store", buyerOnly: true },
  { view: "orders", label: "Purchase orders", icon: ClipboardList, group: "purchasing", buyerOnly: true },
  { view: "shipments", label: "Shipments", icon: Truck, group: "purchasing", buyerOnly: true },
  { view: "partners", label: "Partners", icon: Users, group: "purchasing", buyerOnly: true },
  { view: "overview", label: "Overview", icon: LayoutDashboard, group: "home", supplierOnly: true },
  { view: "orders", label: "Orders", icon: ClipboardList, group: "sales", supplierOnly: true },
  { view: "shipments", label: "Shipments", icon: Truck, group: "sales", supplierOnly: true },
  { view: "customers", label: "Customers", icon: Building2, group: "sales", supplierOnly: true },
  { view: "products", label: "Products", icon: Tag, group: "catalog", supplierOnly: true },
  { view: "inventory", label: "Inventory", icon: Warehouse, group: "catalog", supplierOnly: true },
  { view: "catalogs", label: "Catalogs", icon: BookOpen, group: "catalog", supplierOnly: true },
  { view: "settings", label: "Settings", icon: Settings, group: "workspace" }
] satisfies Array<
  { view: Area | "settings"; group: (typeof navigationGroups)[number]["key"] } & Record<string, unknown>
>

// Every page a workspace's kind has, as the marketing page's pictures of the app show them. A forwarder's workspace sees
// the POs coming through it, and keeps its addresses and profile in Settings.
export function pagesFor(kind: string) {
  if (kind === "forwarder") {
    return navigation.filter((item) => (item.view === "orders" && item.buyerOnly) || item.view === "settings")
  }
  return navigation.filter(
    (item) => (!item.buyerOnly || kind === "buyer") && (!item.supplierOnly || kind === "supplier")
  )
}

// The pages someone can open: a member's own, and Settings, which is everyone's.
export function navigationFor(kind: string, permissions: Permissions) {
  return pagesFor(kind).filter((item) => item.view === "settings" || can(permissions, item.view))
}

// The pages a member can be given, as the sidebar names them: every page but Settings.
export function areasFor(kind: string) {
  return pagesFor(kind).flatMap((item) => (item.view === "settings" ? [] : [{ area: item.view, label: item.label }]))
}

// What a page is called in a workspace of this kind, such as "Orders" for a supplier's orders.
export function areaLabel(kind: string, area: Area) {
  return areasFor(kind).find((item) => item.area === area)?.label ?? area
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
