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

// A buyer's store pages, then purchasing from suppliers. A supplier's sales to its customers, then what it sells.
// Settings sit on their own at the bottom.
export const navigationGroups = [
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
  { view: "partners", label: "Partners", icon: Users, group: "purchasing", buyerOnly: true },
  { view: "overview", label: "Overview", icon: LayoutDashboard, group: "home", supplierOnly: true },
  { view: "orders", label: "Orders", icon: ClipboardList, group: "sales", supplierOnly: true },
  { view: "shipments", label: "Shipments", icon: Truck, group: "sales", supplierOnly: true },
  { view: "customers", label: "Customers", icon: Building2, group: "sales", supplierOnly: true },
  { view: "products", label: "Products", icon: Tag, group: "catalog", supplierOnly: true },
  { view: "inventory", label: "Inventory", icon: Warehouse, group: "catalog", supplierOnly: true },
  { view: "catalogs", label: "Catalogs", icon: BookOpen, group: "catalog", supplierOnly: true },
  { view: "settings", label: "Settings", icon: Settings, group: "workspace" }
] satisfies Array<{ view: string; group: (typeof navigationGroups)[number]["key"] } & Record<string, unknown>>

// The pages a workspace's kind sees. A forwarder's workspace sees the POs coming through it, and keeps its addresses and
// profile in Settings.
export function navigationFor(kind: string) {
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
