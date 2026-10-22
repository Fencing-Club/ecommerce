import { variantIdSchema } from "@repo/copacker-marketplaces/shopify"
import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"
import type { Shopify } from "@repo/copacker-marketplaces/shopify"
import type { ShopifyVariant } from "@repo/copacker-marketplaces/shopify"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import {
  connections,
  organizations,
  inventoryLocationGroups,
  variantStockTargetSets,
  productDefaults,
  shopifyFieldImports,
  stockSnapshots,
  suppliers,
  variantFields
} from "@/db/schema"
import type { ErrorKey } from "@/i18n/errors"
import { requireBuyer } from "./authorization"
import { StatusError } from "./errors"
import { stockTargetFields, writeStockTargetFields } from "./stock-target-fields"
import { preserveImportedStockTargets } from "./stock-targets"
import { syncShopifySuppliers } from "./suppliers"
import type { Session } from "./workspace-session"

// Details Copacker keeps for each Shopify variation, and for each product (case quantity, and the supplier chosen on
// the product). They were Shopify metafields; each store's are copied here once (copyShopifyFields), and from then on
// they're edited only in Copacker.

type StockRow = {
  variantId: string
  productId?: string
  supplierSku?: string | null
  amazonStockTarget?: number | null
  storeStockTarget?: number | null
  caseQuantity?: number | null
  supplierName?: string | null
}

// The database, or a transaction reading within its own locks.
type Executor = Pick<ReturnType<typeof db>, "select">

export async function readVariantFields(
  orgId: string,
  domain: string,
  variantIds?: string[],
  executor: Executor = db()
) {
  if (variantIds && !variantIds.length) {
    return new Map<string, typeof variantFields.$inferSelect>()
  }
  const rows = await executor
    .select()
    .from(variantFields)
    .where(
      and(
        eq(variantFields.orgId, orgId),
        eq(variantFields.shopifyDomain, domain),
        variantIds ? inArray(variantFields.variantId, variantIds) : undefined
      )
    )
  const [sets, groups] = await Promise.all([
    executor
      .select()
      .from(variantStockTargetSets)
      .where(
        and(
          eq(variantStockTargetSets.orgId, orgId),
          eq(variantStockTargetSets.shopifyDomain, domain),
          variantIds ? inArray(variantStockTargetSets.variantId, variantIds) : undefined
        )
      ),
    executor.select().from(inventoryLocationGroups).where(eq(inventoryLocationGroups.orgId, orgId))
  ])
  const result = new Map(rows.map((row) => [row.variantId, row]))
  for (const set of sets) {
    result.set(set.variantId, {
      orgId,
      shopifyDomain: domain,
      variantId: set.variantId,
      supplierSku: null,
      asin: null,
      updatedAt: set.updatedAt,
      ...result.get(set.variantId),
      ...stockTargetFields(set, groups)
    })
  }
  return result
}

// Adds each variant's supplier SKU and ASIN, and its bundle components' supplier SKUs, to variants read from Shopify.
export async function withVariantFields(
  orgId: string,
  domain: string,
  variants: readonly (ShopifyVariant | null)[]
): Promise<(CatalogVariant | null)[]> {
  const ids = variants.flatMap((variant) =>
    variant
      ? [variant.id, ...variant.productVariantComponents.nodes.map((component) => component.productVariant.id)]
      : []
  )
  const fields = await readVariantFields(orgId, domain, [...new Set(ids)])
  const value = (text: string | null | undefined) => (text ? { value: text } : null)
  return variants.map((variant) =>
    variant
      ? {
          ...variant,
          supplierSku: value(fields.get(variant.id)?.supplierSku),
          asin: value(fields.get(variant.id)?.asin),
          productVariantComponents: {
            ...variant.productVariantComponents,
            nodes: variant.productVariantComponents.nodes.map((component) => ({
              ...component,
              productVariant: {
                ...component.productVariant,
                supplierSku: value(fields.get(component.productVariant.id)?.supplierSku)
              }
            }))
          }
        }
      : null
  )
}

// Each product's case quantity and supplier, by the supplier's name as Shopify's Supplier field held it (which restock
// matches suppliers on).
async function readProductFields(orgId: string, domain: string, executor: Executor = db()) {
  const rows = await executor
    .select({
      productId: productDefaults.productId,
      caseQuantity: productDefaults.caseQuantity,
      supplierName: sql<string | null>`coalesce(nullif(trim(${suppliers.shopifySupplierName}), ''), ${suppliers.name})`
    })
    .from(productDefaults)
    .leftJoin(suppliers, eq(suppliers.id, productDefaults.supplierId))
    .where(and(eq(productDefaults.orgId, orgId), eq(productDefaults.shopifyDomain, domain)))
  return new Map(rows.map((row) => [row.productId, row]))
}

// Fills Shopify stock rows with the details Copacker keeps, so everything reading the stored stock sees them.
export async function fillStockRows<Row extends StockRow>(
  orgId: string,
  domain: string,
  rows: Row[],
  executor: Executor = db()
) {
  const variants = await readVariantFields(orgId, domain, undefined, executor)
  const products = await readProductFields(orgId, domain, executor)
  return rows.map((row) => {
    const variant = variants.get(row.variantId)
    const product = row.productId ? products.get(row.productId) : undefined
    return {
      ...row,
      supplierSku: variant?.supplierSku ?? null,
      amazonStockTarget: variant?.amazonStockTarget ?? null,
      storeStockTarget: variant?.storeStockTarget ?? null,
      caseQuantity: product?.caseQuantity ?? null,
      supplierName: product?.supplierName ?? null
    }
  })
}

// Applies Copacker's details to the stored Shopify stock after an edit, so pages show it before the next sync. Locks in
// the order stock syncs do, connection then snapshot, so a sync finishing now can't interleave.
export async function refreshStoredStockFields(orgId: string, domain: string) {
  await db().transaction(async (tx) => {
    const [current] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.provider, "shopify")))
      .for("update")
    if (current?.domain !== domain) {
      return
    }
    const [latest] = await tx
      .select({ id: stockSnapshots.id, data: stockSnapshots.data })
      .from(stockSnapshots)
      .where(
        and(
          eq(stockSnapshots.orgId, orgId),
          eq(stockSnapshots.source, "shopify"),
          eq(stockSnapshots.externalAccountId, domain),
          eq(stockSnapshots.scopeKey, "store")
        )
      )
      .for("update")
    if (latest?.data?.source !== "shopify") {
      return
    }
    const rows = await fillStockRows(orgId, domain, latest.data.rows, tx)
    await tx
      .update(stockSnapshots)
      .set({ data: { ...latest.data, rows } })
      .where(eq(stockSnapshots.id, latest.id))
  })
}

// Imports a newly connected store's existing metafields once. Copacker owns subsequent edits and keeps any values
// already entered here. Supplier names are matched to the buyer's suppliers and assigned to their products.
export async function copyShopifyFields(
  orgId: string,
  domain: string,
  shopify: Pick<Shopify, "metafieldValues">,
  options: { assertActive?: () => Promise<void>; partnerVariants?: ReadonlySet<string> } = {}
) {
  const [done] = await db()
    .select()
    .from(shopifyFieldImports)
    .where(and(eq(shopifyFieldImports.orgId, orgId), eq(shopifyFieldImports.shopifyDomain, domain)))
  if (done) {
    return false
  }
  const values = (await shopify.metafieldValues(options.assertActive)).map((value) =>
    options.partnerVariants?.has(value.variantId) ? { ...value, supplierName: null } : value
  )
  await syncShopifySuppliers(
    orgId,
    values.map((value) => value.supplierName)
  )
  const known = await db()
    .select({ id: suppliers.id, name: suppliers.name, shopifyName: suppliers.shopifySupplierName })
    .from(suppliers)
    .where(and(eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
  const key = (name: string) => name.trim().toLowerCase()
  const supplierIds = new Map<string, string>()
  for (const supplier of known) {
    for (const name of [supplier.name, supplier.shopifyName]) {
      if (name?.trim() && !supplierIds.has(key(name))) {
        supplierIds.set(key(name), supplier.id)
      }
    }
  }
  const variantRows = values
    .filter(
      (value) =>
        value.supplierSku !== null ||
        value.asin !== null ||
        value.amazonStockTarget !== null ||
        value.storeStockTarget !== null
    )
    .map((value) => ({
      orgId,
      shopifyDomain: domain,
      variantId: value.variantId,
      supplierSku: value.supplierSku,
      asin: value.asin,
      amazonStockTarget: value.amazonStockTarget,
      storeStockTarget: value.storeStockTarget
    }))
  const products = new Map<string, { caseQuantity: number | null; supplierId: string | null }>()
  for (const value of values) {
    const supplierId = value.supplierName ? (supplierIds.get(key(value.supplierName)) ?? null) : null
    const product = products.get(value.productId)
    products.set(value.productId, {
      caseQuantity: product?.caseQuantity ?? value.caseQuantity,
      supplierId: product?.supplierId ?? supplierId
    })
  }
  const productRows = [...products]
    .filter(([, product]) => product.caseQuantity !== null || product.supplierId !== null)
    .map(([productId, product]) => ({ orgId, shopifyDomain: domain, productId, ...product }))
  const keep = (table: string, column: string) => sql.raw(`coalesce("${table}"."${column}", excluded."${column}")`)
  await db().transaction(async (tx) => {
    await preserveImportedStockTargets(orgId, domain, values, tx)
    for (let start = 0; start < variantRows.length; start += 500) {
      await tx
        .insert(variantFields)
        .values(variantRows.slice(start, start + 500))
        .onConflictDoUpdate({
          target: [variantFields.orgId, variantFields.shopifyDomain, variantFields.variantId],
          set: {
            supplierSku: keep("variant_fields", "supplierSku"),
            asin: keep("variant_fields", "asin"),
            amazonStockTarget: keep("variant_fields", "amazonStockTarget"),
            storeStockTarget: keep("variant_fields", "storeStockTarget")
          }
        })
    }
    for (let start = 0; start < productRows.length; start += 500) {
      await tx
        .insert(productDefaults)
        .values(productRows.slice(start, start + 500))
        .onConflictDoUpdate({
          target: [productDefaults.orgId, productDefaults.shopifyDomain, productDefaults.productId],
          set: {
            caseQuantity: keep("product_defaults", "caseQuantity"),
            supplierId: keep("product_defaults", "supplierId")
          }
        })
    }
    await tx.insert(shopifyFieldImports).values({ orgId, shopifyDomain: domain }).onConflictDoNothing()
  })
  return true
}

// Sets supplier SKUs from elsewhere in Copacker, such as the ones a supplier gives on a PO.
export async function saveSupplierSkus(
  orgId: string,
  domain: string,
  skus: readonly { variantId: string; supplierSku: string }[]
) {
  for (const { variantId, supplierSku } of skus) {
    const value = supplierSku.trim() || null
    await db()
      .insert(variantFields)
      .values({ orgId, shopifyDomain: domain, variantId, supplierSku: value })
      .onConflictDoUpdate({
        target: [variantFields.orgId, variantFields.shopifyDomain, variantFields.variantId],
        set: { supplierSku: value }
      })
  }
  await refreshStoredStockFields(orgId, domain)
}

const text = z
  .string()
  .trim()
  .max(255)
  .regex(/^[^\r\n]*$/)
const target = z.number().int().min(0).max(1000000).nullable()
const inputSchema = z.strictObject({
  variantId: variantIdSchema,
  // Empty clears a text value. Fields left out are kept.
  supplierSku: text.optional(),
  asin: text.optional(),
  amazonStockTarget: target.optional(),
  storeStockTarget: target.optional()
})

// Saves a variation's supplier SKU, ASIN or stock targets.
export async function saveVariantFields(s: Session, raw: unknown) {
  requireBuyer(s)
  const input = inputSchema.safeParse(raw)
  if (!input.success) {
    const field = input.error.issues[0]?.path[0]
    const messages: Record<string, ErrorKey> = {
      variantId: "chooseVariation",
      supplierSku: "enterSupplierSku",
      asin: "enterAsin",
      amazonStockTarget: "enterWholeUnits",
      storeStockTarget: "enterWholeUnits"
    }
    throw new StatusError(messages[String(field)] ?? "checkValues", 400)
  }
  const { variantId, ...fields } = input.data
  const { domain, saved } = await db().transaction(async (tx) => {
    await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, s.org.id)).for("update")
    await tx
      .select({ id: connections.id })
      .from(connections)
      .where(eq(connections.orgId, s.org.id))
      .orderBy(connections.id)
      .for("update")
    const [account] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("update")
    if (!account) {
      throw new StatusError("connectShopifyBeforeEditing", 409)
    }
    const [stock] = await tx
      .select({ data: stockSnapshots.data })
      .from(stockSnapshots)
      .where(
        and(
          eq(stockSnapshots.orgId, s.org.id),
          eq(stockSnapshots.source, "shopify"),
          eq(stockSnapshots.externalAccountId, account.domain),
          eq(stockSnapshots.scopeKey, "store")
        )
      )
    if (stock?.data?.source !== "shopify" || !stock.data.rows.some((row) => row.variantId === variantId)) {
      throw new StatusError("productNotSyncedSync", 404)
    }
    const previous = (await readVariantFields(s.org.id, account.domain, [variantId], tx)).get(variantId)
    await writeStockTargetFields(
      s.org.id,
      account.domain,
      variantId,
      fields,
      {
        amazonStockTarget: previous?.amazonStockTarget ?? null,
        storeStockTarget: previous?.storeStockTarget ?? null
      },
      tx
    )
    const values = {
      ...(fields.supplierSku !== undefined && { supplierSku: fields.supplierSku || null }),
      ...(fields.asin !== undefined && { asin: fields.asin || null }),
      ...(fields.amazonStockTarget !== undefined && { amazonStockTarget: fields.amazonStockTarget }),
      ...(fields.storeStockTarget !== undefined && { storeStockTarget: fields.storeStockTarget })
    }
    await tx
      .insert(variantFields)
      .values({ orgId: s.org.id, shopifyDomain: account.domain, variantId, ...values })
      .onConflictDoUpdate({
        target: [variantFields.orgId, variantFields.shopifyDomain, variantFields.variantId],
        set: values
      })
      .returning()
    return {
      domain: account.domain,
      saved: (await readVariantFields(s.org.id, account.domain, [variantId], tx)).get(variantId)
    }
  })
  await refreshStoredStockFields(s.org.id, domain)
  return {
    supplierSku: saved?.supplierSku ?? null,
    asin: saved?.asin ?? null,
    amazonStockTarget: saved?.amazonStockTarget ?? null,
    storeStockTarget: saved?.storeStockTarget ?? null
  }
}
