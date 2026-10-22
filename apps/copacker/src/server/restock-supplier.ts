import { orderCurrencies } from "@repo/copacker-orders"
import { z } from "zod"
import { matchSupplierCatalog } from "./supplier-catalog-match"

const linkSchema = z.object({
  id: z.uuid(),
  supplierOrgId: z.uuid().nullable(),
  removedAt: z.date().nullable().optional()
})
const inputSchema = z.strictObject({
  supplierSku: z.string().trim().max(255).nullable(),
  currency: z.enum(orderCurrencies)
})

// A supplier SKU identifies a product, not a supplier. Restock may suggest a
// linked supplier only when exactly one active catalog contains that exact SKU.
export function resolveRestockSupplier(raw: unknown, rawLinks: Iterable<unknown>, rawProducts: Iterable<unknown>) {
  const input = inputSchema.parse(raw)
  if (!input.supplierSku) {
    return { status: "supplier_sku_missing" as const, supplierId: null, match: null }
  }
  const products = [...rawProducts]
  const candidates = []
  for (const rawLink of rawLinks) {
    const link = linkSchema.parse(rawLink)
    if (link.removedAt || !link.supplierOrgId) {
      continue
    }
    const match = matchSupplierCatalog(
      { supplierOrgId: link.supplierOrgId, supplierSku: input.supplierSku, currency: input.currency },
      products
    )
    if (match.product?.active) {
      candidates.push({ supplierId: link.id, match })
    }
  }
  if (candidates.length === 0) {
    return { status: "supplier_not_resolved" as const, supplierId: null, match: null }
  }
  if (candidates.length > 1) {
    return { status: "supplier_ambiguous" as const, supplierId: null, match: null }
  }
  return { status: "supplier_resolved" as const, ...candidates[0]! }
}

// A Shopify bundle has no supplier SKU of its own. Suggest one supplier only when every
// physical component's SKU matches an active product in that same linked supplier catalog.
export function resolveRestockBundleSupplier(
  raw: unknown,
  rawLinks: Iterable<unknown>,
  rawProducts: Iterable<unknown>
) {
  const input = z
    .strictObject({
      componentSupplierSkus: z.array(z.string().trim().max(255)).min(1).max(25),
      currency: inputSchema.shape.currency
    })
    .parse(raw)
  if (input.componentSupplierSkus.some((sku) => !sku)) {
    return { status: "supplier_sku_missing" as const, supplierId: null, matches: [] }
  }
  const products = [...rawProducts]
  const candidates = []
  for (const rawLink of rawLinks) {
    const link = linkSchema.parse(rawLink)
    if (link.removedAt || !link.supplierOrgId) {
      continue
    }
    const matches = input.componentSupplierSkus.map((supplierSku) =>
      matchSupplierCatalog({ supplierOrgId: link.supplierOrgId, supplierSku, currency: input.currency }, products)
    )
    if (matches.every((match) => match.product?.active)) {
      candidates.push({ supplierId: link.id, matches })
    }
  }
  if (candidates.length === 0) {
    return { status: "supplier_not_resolved" as const, supplierId: null, matches: [] }
  }
  if (candidates.length > 1) {
    return { status: "supplier_ambiguous" as const, supplierId: null, matches: [] }
  }
  return { status: "supplier_resolved" as const, ...candidates[0]! }
}
