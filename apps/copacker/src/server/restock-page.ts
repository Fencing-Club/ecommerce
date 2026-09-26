import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, orders, supplierProducts, suppliers } from "@/db/schema"
import type { Session } from "./auth"
import { inventoryContext } from "./inventory-context"
import { inventoryLocations } from "./inventory-products"
import { readProductDefaults } from "./product-defaults"
import { restockPlan, type RestockSupplier } from "./restock-plan"
import { dayRange } from "./restock-report"
import { resolveRestockSupplier } from "./restock-supplier"
import { restockDemand } from "./sales-orders"

const days = z.number().int().min(dayRange.min).max(dayRange.max)
export const restockInputSchema = z.strictObject({
  days,
  leadTimeDays: days,
  channel: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("amazon") }),
    z.strictObject({ kind: z.literal("shopify"), locationId: z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/) })
  ]),
  // Every supplier, one supplier's products, or products never ordered from a supplier.
  supplier: z.union([z.literal("all"), z.literal("none"), z.uuid()]).default("all")
})

export class RestockInputError extends Error {}

// The channels a buyer can restock: Amazon once its stock has synced, and each Shopify location it counts.
export async function restockChannels(orgId: string) {
  const context = await inventoryContext(orgId)
  const channels: { key: string; label: string; channel: z.infer<typeof restockInputSchema>["channel"] }[] = []
  if (context.fbaRows || context.awdRows) {
    channels.push({ key: "amazon", label: "Amazon", channel: { kind: "amazon" } })
  }
  for (const location of inventoryLocations(context.rows, context.classifications)) {
    if (location.classification === "merchant") {
      channels.push({
        key: `shopify:${location.id}`,
        label: location.name,
        channel: { kind: "shopify", locationId: location.id }
      })
    }
  }
  return channels
}

// The buyer's suppliers with their lead times, and each variation's supplier: the one it was last ordered from, else
// the one linked supplier whose active catalog holds its Shopify supplier SKU.
async function supplierLookup(orgId: string, catalog: { variantId: string; supplierSku?: string | null }[]) {
  const [links, history] = await Promise.all([
    db()
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
      .orderBy(suppliers.name),
    db()
      .select({ supplierId: orders.supplierId, data: orders.data })
      .from(orders)
      .where(eq(orders.buyerOrgId, orgId))
      .orderBy(desc(orders.createdAt))
  ])
  const list: RestockSupplier[] = links.map((link) => ({
    id: link.id,
    name: link.name,
    leadTimeDays: link.leadTimeDays,
    amazonLeadTimeDays: link.amazonLeadTimeDays
  }))
  const byId = new Map(list.map((supplier) => [supplier.id, supplier]))
  const byVariant = new Map<string, RestockSupplier>()
  for (const order of history) {
    const supplier = byId.get(order.supplierId)
    if (!supplier) {
      continue
    }
    for (const item of order.data.items) {
      if (!byVariant.has(item.variantId)) {
        byVariant.set(item.variantId, supplier)
      }
    }
  }
  const supplierOrgIds = links.flatMap((link) => (link.supplierOrgId ? [link.supplierOrgId] : []))
  const products = supplierOrgIds.length
    ? (await db().select().from(supplierProducts).where(inArray(supplierProducts.supplierOrgId, supplierOrgIds))).map(
        (product) => ({ ...product, active: product.active === 1 })
      )
    : []
  for (const row of catalog) {
    if (byVariant.has(row.variantId) || !row.supplierSku) {
      continue
    }
    const resolved = resolveRestockSupplier({ supplierSku: row.supplierSku, currency: "USD" }, links, products)
    const supplier = resolved.supplierId ? byId.get(resolved.supplierId) : undefined
    if (supplier) {
      byVariant.set(row.variantId, supplier)
    }
  }
  return { list, supplierFor: (variantId: string) => byVariant.get(variantId) ?? null }
}

// Restock suggestions for one channel from stored orders, current stock and open POs.
export async function restockReport(s: Session, raw: unknown) {
  const input = restockInputSchema.parse(raw)
  const context = await inventoryContext(s.org.id)
  const { channel } = input
  if (
    channel.kind === "shopify" &&
    !inventoryLocations(context.rows, context.classifications).some(
      (location) => location.id === channel.locationId && location.classification === "merchant"
    )
  ) {
    throw new RestockInputError("Choose a location included in inventory")
  }
  if (channel.kind === "amazon" && !context.fbaRows && !context.awdRows) {
    throw new RestockInputError("Sync Amazon on the Inventory page before restocking Amazon")
  }
  const connected = await db()
    .select({ provider: connections.provider })
    .from(connections)
    .where(eq(connections.orgId, s.org.id))
  const [demand, lookup, productDefaults] = await Promise.all([
    restockDemand(
      s.org.id,
      connected.map((row) => row.provider),
      input.days
    ),
    supplierLookup(s.org.id, context.rows),
    context.domain ? readProductDefaults(s.org.id, context.domain) : new Map()
  ])
  const lines = restockPlan({
    channel,
    catalog: context.rows,
    classifications: context.classifications,
    onOrder: context.onOrder,
    shopifySales: demand.shopifySales,
    amazonSales: demand.amazonSales,
    fbaRows: context.fbaRows,
    awdRows: context.awdRows,
    salesDays: input.days,
    leadTimeDays: input.leadTimeDays,
    productDefaults,
    supplierFor: lookup.supplierFor
  }).filter((line) => {
    if (input.supplier === "all") {
      return true
    }
    return input.supplier === "none" ? line.supplier === null : line.supplier?.id === input.supplier
  })
  const salesSource = channel.kind === "amazon" ? "amazon" : "shopify"
  return {
    days: input.days,
    leadTimeDays: input.leadTimeDays,
    channel,
    suppliers: lookup.list,
    sources: demand.sources.filter((source) => source.source === salesSource),
    lines
  }
}
