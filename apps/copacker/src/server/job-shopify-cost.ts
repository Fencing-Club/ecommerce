import { and, eq } from "drizzle-orm"
import { db } from "../db/index"
import { orders, orderRevisions } from "../db/schema"
import { shopifyFor } from "./connections"
import type { JobInput } from "./job-payloads"
import type { JobContext } from "./job-runtime"
import { saveSupplierSkus } from "./product-fields"

// Worker job: after the buyer approves a supplier's invoice, keeps its supplier SKUs in Copacker and, when asked, its
// unit costs in Shopify. A purchase order revised again since skips it.
export async function shopifyCostJob(input: JobInput<"shopify">, { assertOwned }: Pick<JobContext, "assertOwned">) {
  await assertOwned()
  const [record] = await db()
    .select()
    .from(orderRevisions)
    .where(and(eq(orderRevisions.orderId, input.orderId), eq(orderRevisions.revision, input.revision)))
  if (!record) {
    throw new Error("Approved purchase order revision is unavailable")
  }
  const [currentOrder] = await db().select().from(orders).where(eq(orders.id, input.orderId))
  if (!currentOrder || currentOrder.buyerOrgId !== input.orgId) {
    throw new Error("Purchase order account mismatch")
  }
  if (currentOrder.revision !== input.revision) {
    return
  }
  const api = await shopifyFor(input.orgId, currentOrder.shopifyDomain)
  const catalog = await api.variants(record.data.items.map((i) => i.variantId))
  for (const change of input.changes) {
    const item = record.data.items.find((i) => i.id === change.itemId)!
    const product = catalog.find((p) => p?.id === item.variantId)
    if (!product || product.sku !== item.buyerSku) {
      throw new Error("Shopify product identity has changed")
    }
    if (input.updateCost && product.inventoryItem.unitCost?.currencyCode !== record.data.currency) {
      throw new Error("Shopify unit cost currency differs from the purchase order. No currency conversion is applied")
    }
  }
  // Supplier SKUs are kept in Copacker; unit costs in Shopify.
  await assertOwned()
  await saveSupplierSkus(
    input.orgId,
    currentOrder.shopifyDomain,
    input.changes.map((change) => ({
      variantId: record.data.items.find((i) => i.id === change.itemId)!.variantId,
      supplierSku: change.supplierSku
    }))
  )
  if (input.updateCost) {
    for (const change of input.changes) {
      const item = record.data.items.find((i) => i.id === change.itemId)!
      await assertOwned()
      await api.unitCost(item.inventoryItemId, change.unitPrice * item.piecesPerSet)
    }
  }
}
