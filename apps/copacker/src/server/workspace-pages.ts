import { orderCurrencies } from "@repo/copacker-orders"
import { eq } from "drizzle-orm"
import { z } from "zod"
import type { EditorProduct } from "@/components/supplier/product-editor"
import { db } from "@/db"
import { connections } from "@/db/schema"
import { can, type Permissions } from "@/lib/access"
import { requireAccess, requireBuyer, requireSupplier } from "./authorization"
import { catalogEditor, catalogList } from "./catalogs"
import { pageId } from "./page-id"
import { restockSettings } from "./restock-report"
import { productDetail, productList } from "./supplier-products"
import { customerDetail, customerList, inventoryRows } from "./supplier-workspace"
import type { Session } from "./workspace-session"

type Workspace = Permissions & { org: Pick<Session["org"], "id" | "kind"> }

// These operations accept a session resolved by the request boundary, never a workspace id supplied by the browser.
// Return only rendering data: no session, organization settings, invitation state or unfiltered database records.
export async function catalogsPageData(s: Workspace) {
  requireSupplier(s)
  requireAccess(s, "catalogs")
  requireAccess(s, "prices")
  const rows = await catalogList(s.org.id)
  return {
    editable: can(s, "catalogs", "edit"),
    catalogs: rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      adjustmentBasisPoints: row.adjustmentBasisPoints,
      products: row.products,
      overrides: row.overrides,
      customers: row.customers
    }))
  }
}

export async function catalogPageData(s: Workspace, rawId: string | null) {
  requireSupplier(s)
  requireAccess(s, "catalogs", rawId === null ? "edit" : "view")
  requireAccess(s, "prices")
  const data = await catalogEditor(s.org.id, rawId === null ? null : pageId(rawId))
  if (!data) {
    return null
  }
  return {
    readOnly: !can(s, "catalogs", "edit"),
    data: {
      catalog: data.catalog
        ? {
            id: data.catalog.id,
            revision: data.catalog.revision,
            title: data.catalog.title,
            status: data.catalog.status,
            adjustmentBasisPoints: data.catalog.adjustmentBasisPoints,
            includeNewProducts: data.catalog.includeNewProducts
          }
        : null,
      products: data.products,
      entries: data.entries,
      customers: data.customers
    }
  }
}

function customerRow(row: Awaited<ReturnType<typeof customerList>>["customers"][number], prices: boolean) {
  return {
    id: row.id,
    name: row.name,
    catalogId: row.catalogId,
    catalog: row.catalog,
    orders: row.orders,
    open: row.open,
    spent: prices ? row.spent : [],
    lastOrderAt: row.lastOrderAt,
    createdAt: row.createdAt
  }
}

export async function customersPageData(s: Workspace) {
  requireSupplier(s)
  requireAccess(s, "customers")
  const list = await customerList(s.org.id)
  return { catalogs: list.catalogs, customers: list.customers.map((row) => customerRow(row, can(s, "prices"))) }
}

export async function customerPageData(s: Workspace, rawId: string) {
  requireSupplier(s)
  requireAccess(s, "customers")
  const detail = await customerDetail(s.org.id, pageId(rawId))
  if (!detail) {
    return null
  }
  const prices = can(s, "prices")
  const showOrders = can(s, "orders")
  return {
    customer: customerRow(detail.customer, prices),
    contact: detail.contact,
    catalogs: detail.catalogs,
    // Hiding the table is insufficient: a loader's serialized data is visible to the browser.
    orders: showOrders ? detail.orders.map((order) => ({ ...order, total: prices ? order.total : null })) : [],
    prices,
    showOrders,
    openCatalog: can(s, "catalogs") && prices
  }
}

export async function productsPageData(s: Workspace, rawSearch: unknown) {
  requireAccess(s, "products")
  if (s.org.kind === "supplier") {
    const prices = can(s, "prices")
    const rows = await productList(s.org.id)
    return {
      kind: "supplier" as const,
      editable: prices && can(s, "products", "edit"),
      products: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        category: row.category,
        productCode: row.productCode,
        images: row.images,
        catalogs: row.catalogs,
        variants: row.variants.map((variant) => ({
          supplierSku: variant.supplierSku,
          currency: variant.currency,
          priceMinor: prices ? variant.priceMinor : null,
          priceBasis: variant.priceBasis,
          trackInventory: variant.trackInventory,
          onHand: variant.onHand
        }))
      }))
    }
  }
  requireBuyer(s)
  const linked = await db()
    .select({ provider: connections.provider })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
  return {
    kind: "buyer" as const,
    providers: linked.map((row) => row.provider),
    search: typeof rawSearch === "string" ? rawSearch.trim().slice(0, 200) : ""
  }
}

export async function productPageData(s: Workspace, rawId: string) {
  requireSupplier(s)
  requireAccess(s, "products")
  const detail = await productDetail(s.org.id, pageId(rawId))
  if (!detail) {
    return null
  }
  const { group } = detail
  const prices = can(s, "prices")
  const initial: EditorProduct = {
    id: group.id,
    revision: group.revision,
    title: group.title,
    status: detail.status,
    category: group.category ?? "",
    productCode: group.productCode ?? "",
    url: group.url ?? "",
    description: group.description ?? "",
    optionNames: group.optionNames,
    images: group.images,
    variants: detail.variants.map((variant) => ({
      key: variant.id,
      id: variant.id,
      supplierSku: variant.supplierSku,
      options: variant.options,
      currency: z.enum(orderCurrencies).parse(variant.currency),
      priceMinor: prices ? variant.priceMinor : null,
      priceBasis: variant.priceBasis,
      piecesPerSellablePack: variant.piecesPerSellablePack,
      sellablePacksPerCase: variant.sellablePacksPerCase,
      trackInventory: variant.trackInventory,
      onHand: variant.onHand,
      continueSelling: variant.continueSelling,
      priceBreaks: prices ? variant.priceBreaks : [],
      quantityRules: variant.quantityRules,
      notes: variant.notes ?? ""
    }))
  }
  return { initial, catalogs: detail.catalogs, readOnly: !prices || !can(s, "products", "edit") }
}

export async function inventoryPageData(s: Workspace, rawTab: unknown) {
  requireSupplier(s)
  requireAccess(s, "inventory")
  return { rows: await inventoryRows(s.org.id), tab: typeof rawTab === "string" ? rawTab : undefined }
}

export function salesPageData(s: Workspace, rawSearch: unknown) {
  requireBuyer(s)
  requireAccess(s, "sales")
  return { search: typeof rawSearch === "string" ? rawSearch.trim().slice(0, 100) : "" }
}

export function restockPageData(
  s: Workspace & { org: Pick<Session["org"], "restockSalesDays" | "restockLeadTimeDays"> }
) {
  requireBuyer(s)
  requireAccess(s, "restock")
  return { settings: restockSettings(s.org) }
}
