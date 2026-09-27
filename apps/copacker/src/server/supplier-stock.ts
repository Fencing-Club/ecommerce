import type { OrderInput, OrderItem, Packing } from "@repo/aisle"
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm"
import type { Transaction } from "@/db"
import { orders, shipments, supplierProducts, suppliers } from "@/db/schema"

type Line = Pick<OrderItem, "id" | "supplierSku" | "pieces" | "piecesPerSet" | "components">

// The pieces of each supplier SKU that PO lines need, by default their ordered pieces. A bundle needs its components:
// each of its units takes each component's quantity.
function supplierSkuPieces(items: Line[], pieces: (item: Line) => number = (item) => item.pieces) {
  const totals = new Map<string, number>()
  const add = (sku: string | null | undefined, count: number) => {
    const key = sku?.trim()
    if (key && count > 0) {
      totals.set(key, (totals.get(key) ?? 0) + count)
    }
  }
  for (const item of items) {
    if (item.components?.length) {
      const units = pieces(item) / item.piecesPerSet
      for (const component of item.components) {
        add(component.supplierSku, units * component.quantity)
      }
    } else {
      add(item.supplierSku, pieces(item))
    }
  }
  return totals
}

// The pieces of each item a shipment's cartons hold.
function packedPieces(packing: Packing) {
  const totals: Record<string, number> = {}
  for (const carton of packing.cartons) {
    for (const content of carton.items) {
      totals[content.itemId] = (totals[content.itemId] ?? 0) + content.pieces
    }
  }
  return totals
}

// A supplier's products that count stock, by supplier SKU, locked so stock can't change while a PO is checked or an
// invoice takes from it.
async function trackedProducts(tx: Transaction, supplierOrgId: string, skus: string[]) {
  if (!skus.length) {
    return new Map<string, typeof supplierProducts.$inferSelect>()
  }
  const rows = await tx
    .select()
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierOrgId, supplierOrgId),
        inArray(supplierProducts.supplierSku, skus),
        eq(supplierProducts.trackInventory, true)
      )
    )
    .orderBy(supplierProducts.id)
    .for("update")
  return new Map(rows.map((row) => [row.supplierSku, row]))
}

// Pieces of each supplier SKU that the supplier's sent POs, from every buyer, have ordered and not yet taken from stock.
// A PO's shipments take stock as their invoices are accepted, so only what they haven't taken is still owed.
async function openDemand(
  tx: Transaction,
  supplierOrgId: string,
  products: Map<string, { id: string }>,
  exceptOrderId?: string
) {
  const demand = new Map<string, number>()
  if (!products.size) {
    return demand
  }
  const open = await tx
    .select({ id: orders.id, data: orders.data })
    .from(orders)
    .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
    .where(
      and(
        eq(suppliers.supplierOrgId, supplierOrgId),
        eq(orders.status, "submitted"),
        exceptOrderId ? ne(orders.id, exceptOrderId) : sql`true`
      )
    )
  if (!open.length) {
    return demand
  }
  const taken = await tx
    .select({ orderId: shipments.orderId, stockTaken: shipments.stockTaken })
    .from(shipments)
    .where(
      and(
        inArray(
          shipments.orderId,
          open.map((order) => order.id)
        ),
        isNotNull(shipments.stockTaken)
      )
    )
  for (const order of open) {
    const took: Record<string, number> = {}
    for (const row of taken.filter((shipment) => shipment.orderId === order.id)) {
      for (const [productId, pieces] of Object.entries(row.stockTaken ?? {})) {
        took[productId] = (took[productId] ?? 0) + pieces
      }
    }
    for (const [sku, pieces] of supplierSkuPieces(order.data.items)) {
      const product = products.get(sku)
      if (product) {
        demand.set(sku, (demand.get(sku) ?? 0) + Math.max(0, pieces - (took[product.id] ?? 0)))
      }
    }
  }
  return demand
}

// What a supplier's POs can still order of each tracked product, by supplier SKU: stock on hand less what open POs
// owe. A product that continues selling when out of stock, or doesn't count stock, has no limit and isn't listed.
export async function availableStock(tx: Transaction, supplierOrgId: string, skus: string[], exceptOrderId?: string) {
  const products = await trackedProducts(tx, supplierOrgId, [...new Set(skus)])
  const demand = await openDemand(tx, supplierOrgId, products, exceptOrderId)
  const available = new Map<string, number>()
  for (const [sku, product] of products) {
    if (!product.continueSelling) {
      available.set(sku, Math.max(0, product.onHand - (demand.get(sku) ?? 0)))
    }
  }
  return available
}

// Refuses a PO that orders more of a supplier's tracked products than it has available.
export async function checkSupplierStock(
  tx: Transaction,
  supplierOrgId: string | null,
  data: OrderInput,
  orderId?: string
) {
  if (!supplierOrgId) {
    return
  }
  const needed = supplierSkuPieces(data.items)
  const available = await availableStock(tx, supplierOrgId, [...needed.keys()], orderId)
  const short = [...needed].flatMap(([sku, pieces]) => {
    const left = available.get(sku)
    return left !== undefined && pieces > left ? [`${sku}: ${left} available, ${pieces} ordered`] : []
  })
  if (short.length) {
    throw new Error(`The supplier doesn't have enough stock. ${short.join(". ")}`)
  }
}

// Takes a shipment's packed pieces from the supplier's stock once its commercial invoice is accepted, and records them
// on the shipment so a correction can put them back. Stock may go below zero when the invoice ships more than the
// supplier counted.
export async function takeSupplierStock(
  tx: Transaction,
  shipmentId: string,
  supplierOrgId: string | null,
  data: OrderInput,
  packing: Packing
) {
  if (!supplierOrgId) {
    return
  }
  const packed = packedPieces(packing)
  const pieces = supplierSkuPieces(
    data.items.filter((item) => packed[item.id]),
    (item) => packed[item.id] ?? 0
  )
  const products = await trackedProducts(tx, supplierOrgId, [...pieces.keys()])
  const taken: Record<string, number> = {}
  for (const [sku, product] of products) {
    const count = pieces.get(sku) ?? 0
    taken[product.id] = count
    await tx
      .update(supplierProducts)
      .set({
        onHand: sql`${supplierProducts.onHand} - ${count}`,
        revision: sql`${supplierProducts.revision} + 1`,
        updatedAt: new Date()
      })
      .where(eq(supplierProducts.id, product.id))
  }
  await tx
    .update(shipments)
    .set({ stockTaken: Object.keys(taken).length ? taken : null })
    .where(eq(shipments.id, shipmentId))
}

// Puts back the stock a shipment took, when it goes back for correction.
export async function returnSupplierStock(
  tx: Transaction,
  shipment: { id: string; stockTaken: Record<string, number> | null }
) {
  const entries = Object.entries(shipment.stockTaken ?? {})
  if (!entries.length) {
    return
  }
  for (const [productId, pieces] of entries.toSorted(([a], [b]) => a.localeCompare(b))) {
    await tx
      .update(supplierProducts)
      .set({
        onHand: sql`${supplierProducts.onHand} + ${pieces}`,
        revision: sql`${supplierProducts.revision} + 1`,
        updatedAt: new Date()
      })
      .where(eq(supplierProducts.id, productId))
  }
  await tx.update(shipments).set({ stockTaken: null }).where(eq(shipments.id, shipment.id))
}
