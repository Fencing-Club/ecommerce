import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, stockSnapshots } from "@/db/schema"
import type { Session } from "./auth"
import { shopifyFor } from "./connections"
import { variantIdSchema } from "./product-barcodes"
import { describeError } from "./stock"

export class SupplierSkuError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 502
  ) {
    super(message)
  }
}

const inputSchema = z.strictObject({
  variantId: variantIdSchema,
  // Shopify keeps it as a single-line text metafield; empty clears it.
  supplierSku: z
    .string()
    .trim()
    .max(255)
    .regex(/^[^\r\n]*$/)
})

const storeScope = (orgId: string, domain: string) =>
  and(
    eq(stockSnapshots.orgId, orgId),
    eq(stockSnapshots.source, "shopify"),
    eq(stockSnapshots.externalAccountId, domain),
    eq(stockSnapshots.scopeKey, "store")
  )

// Saves a variation's supplier SKU to Shopify's custom.supplier_sku, which supplier catalogs and PO lines match on, and
// to the stored Shopify snapshot so the products page shows it before the next sync.
export async function saveSupplierSku(s: Session, raw: unknown) {
  if (s.org.kind !== "buyer") {
    throw new SupplierSkuError("A buyer workspace is required", 403)
  }
  const input = inputSchema.safeParse(raw)
  if (!input.success) {
    throw new SupplierSkuError(
      input.error.issues.some((issue) => issue.path[0] === "variantId")
        ? "Choose a product variation"
        : "Enter a supplier SKU on one line, up to 255 characters",
      400
    )
  }
  const { variantId, supplierSku } = input.data
  const [account] = await db()
    .select({ domain: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
  if (!account) {
    throw new SupplierSkuError("Connect Shopify before editing products", 409)
  }
  const [stock] = await db()
    .select({ data: stockSnapshots.data })
    .from(stockSnapshots)
    .where(storeScope(s.org.id, account.domain))
  if (stock?.data?.source !== "shopify" || !stock.data.rows.some((row) => row.variantId === variantId)) {
    throw new SupplierSkuError("This product isn't in your synced Shopify inventory. Sync Shopify and try again.", 404)
  }
  const api = await shopifyFor(s.org.id, account.domain)
  try {
    await api.supplierSku(variantId, supplierSku)
  } catch (error) {
    console.error(JSON.stringify({ event: "supplier_sku_failed", orgId: s.org.id, error: describeError(error) }))
    throw new SupplierSkuError("Shopify didn't save the supplier SKU. Try again.", 502)
  }
  const value = supplierSku || null
  // Locks in the order stock syncs do, connection then snapshot, so a sync finishing now can't interleave.
  await db().transaction(async (tx) => {
    const [current] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("update")
    if (current?.domain !== account.domain) {
      return
    }
    const [latest] = await tx
      .select({ id: stockSnapshots.id, data: stockSnapshots.data })
      .from(stockSnapshots)
      .where(storeScope(s.org.id, account.domain))
      .for("update")
    if (latest?.data?.source !== "shopify") {
      return
    }
    const rows = latest.data.rows.map((row) => (row.variantId === variantId ? { ...row, supplierSku: value } : row))
    await tx
      .update(stockSnapshots)
      .set({ data: { ...latest.data, rows } })
      .where(eq(stockSnapshots.id, latest.id))
  })
  return { supplierSku: value }
}
