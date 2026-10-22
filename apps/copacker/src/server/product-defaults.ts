import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"
import { piecesPerUnit } from "@repo/copacker-marketplaces/shopify"
import type { AmazonNetwork } from "@repo/copacker-shipments"
import { amazonNetworks, prepCategories } from "@repo/copacker-shipments"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, productDefaults, stockSnapshots, suppliers } from "@/db/schema"
import type { CasePack } from "@/lib/case-packs"
import { casePackSchema } from "@/lib/case-packs"
import type { ProductLabel } from "@/lib/product-label"
import { productLabels } from "@/lib/product-label"
import { StatusError } from "./errors"
import { refreshStoredStockFields } from "./product-fields"
import type { Session } from "./workspace-session"

// Buyer-owned product details. Everything else about a product comes from Shopify or Amazon and is edited there.
export type ProductDefaults = {
  description: string
  prepCategory: (typeof prepCategories)[number] | null
  casePacks: CasePack[]
  // Units per case, for restock's rounding when no case pack is set.
  caseQuantity: number | null
  minimumOrder: number | null
  supplierId: string | null
  // Uploaded barcode, or else Amazon's FNSKU label ("standard") unless the product needs its own ("uploaded").
  productLabel: ProductLabel
  // Polybags get a suffocation warning label; new PO lines for the product start with it.
  suffocationWarning: boolean
  // The Amazon network new PO lines to Amazon for the product go to.
  amazonNetwork: AmazonNetwork
  revision: number
}
export const noDefaults: ProductDefaults = {
  description: "",
  prepCategory: null,
  casePacks: [],
  caseQuantity: null,
  minimumOrder: null,
  supplierId: null,
  productLabel: "standard",
  suffocationWarning: false,
  amazonNetwork: "fba",
  revision: 0
}

export const productDefaultsInputSchema = z.strictObject({
  productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/),
  description: z.string().trim().max(2000),
  prepCategory: z.enum(prepCategories).nullable(),
  casePacks: z.array(casePackSchema).max(10),
  // Left out keeps the saved case quantity.
  caseQuantity: z.number().int().min(1).max(100000).nullable().optional(),
  minimumOrder: z.number().int().min(1).max(1000000).nullable(),
  // Left out keeps the saved supplier.
  supplierId: z.uuid().nullable().optional(),
  productLabel: z.enum(productLabels),
  // Left out keeps the saved setting.
  suffocationWarning: z.boolean().optional(),
  // Left out keeps the saved network.
  amazonNetwork: z.enum(amazonNetworks).optional(),
  expectedRevision: z.number().int().nonnegative()
})

export const assignSupplierInputSchema = z.strictObject({
  productIds: z
    .array(z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/))
    .min(1)
    .max(500),
  supplierId: z.uuid().nullable()
})

export class ProductDefaultsError extends StatusError {}

export async function readProductDefaults(orgId: string, shopifyDomain: string) {
  const rows = await db()
    .select()
    .from(productDefaults)
    .where(and(eq(productDefaults.orgId, orgId), eq(productDefaults.shopifyDomain, shopifyDomain)))
  return new Map<string, ProductDefaults>(
    rows.map((row) => [
      row.productId,
      {
        description: row.description,
        prepCategory: row.prepCategory,
        casePacks: row.casePacks,
        caseQuantity: row.caseQuantity,
        minimumOrder: row.minimumOrder,
        supplierId: row.supplierId,
        productLabel: row.productLabel,
        suffocationWarning: row.suffocationWarning,
        amazonNetwork: row.amazonNetwork,
        revision: row.revision
      }
    ])
  )
}

export async function saveProductDefaults(s: Session, raw: unknown) {
  if (s.org.kind !== "buyer") {
    throw new ProductDefaultsError("buyerWorkspaceRequired", 403)
  }
  const input = productDefaultsInputSchema.parse(raw)
  let domain = ""
  const saved = await db().transaction(async (tx) => {
    const [account] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("share")
    if (!account) {
      throw new ProductDefaultsError("connectShopifyBeforeEditing", 409)
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
    const known = stock?.data?.source === "shopify" && stock.data.rows.some((row) => row.productId === input.productId)
    if (!known) {
      throw new ProductDefaultsError("productNotSynced", 404)
    }
    domain = account.domain
    const scope = and(
      eq(productDefaults.orgId, s.org.id),
      eq(productDefaults.shopifyDomain, account.domain),
      eq(productDefaults.productId, input.productId)
    )
    const [previous] = await tx.select().from(productDefaults).where(scope).for("update")
    if ((previous?.revision ?? 0) !== input.expectedRevision) {
      throw new ProductDefaultsError("productChangedReload", 409)
    }
    const supplierId = input.supplierId === undefined ? (previous?.supplierId ?? null) : input.supplierId
    if (supplierId && supplierId !== previous?.supplierId) {
      await requireCurrentSupplier(tx, s.org.id, supplierId)
    }
    const value = {
      description: input.description,
      prepCategory: input.prepCategory,
      casePacks: input.casePacks,
      caseQuantity: input.caseQuantity === undefined ? (previous?.caseQuantity ?? null) : input.caseQuantity,
      minimumOrder: input.minimumOrder,
      supplierId,
      productLabel: input.productLabel,
      suffocationWarning: input.suffocationWarning ?? previous?.suffocationWarning ?? false,
      amazonNetwork: input.amazonNetwork ?? previous?.amazonNetwork ?? "fba",
      revision: input.expectedRevision + 1,
      updatedAt: new Date()
    }
    await tx
      .insert(productDefaults)
      .values({ orgId: s.org.id, shopifyDomain: account.domain, productId: input.productId, ...value })
      .onConflictDoUpdate({
        target: [productDefaults.orgId, productDefaults.shopifyDomain, productDefaults.productId],
        set: value
      })
    return {
      description: value.description,
      prepCategory: value.prepCategory,
      casePacks: value.casePacks,
      caseQuantity: value.caseQuantity,
      minimumOrder: value.minimumOrder,
      supplierId: value.supplierId,
      productLabel: value.productLabel,
      suffocationWarning: value.suffocationWarning,
      amazonNetwork: value.amazonNetwork,
      revision: value.revision
    }
  })
  // Stored stock carries the product's supplier and case quantity for restock.
  await refreshStoredStockFields(s.org.id, domain)
  return saved
}

type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0]

async function requireCurrentSupplier(tx: Transaction, orgId: string, supplierId: string) {
  const [supplier] = await tx
    .select({ id: suppliers.id, name: suppliers.name, shopifySupplierName: suppliers.shopifySupplierName })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
  if (!supplier) {
    throw new ProductDefaultsError("chooseCurrentSupplier", 409)
  }
  return supplier
}

// Sets the supplier for several products at once, such as from restock's "No supplier yet" group. Other product
// details are kept.
export async function assignProductSupplier(s: Session, raw: unknown) {
  if (s.org.kind !== "buyer") {
    throw new ProductDefaultsError("buyerWorkspaceRequired", 403)
  }
  const input = assignSupplierInputSchema.parse(raw)
  let domain = ""
  const result = await db().transaction(async (tx) => {
    const [account] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("share")
    if (!account) {
      throw new ProductDefaultsError("connectShopifyBeforeEditing", 409)
    }
    domain = account.domain
    const productIds = [...new Set(input.productIds)]
    if (input.supplierId) {
      await requireCurrentSupplier(tx, s.org.id, input.supplierId)
    }
    await tx
      .insert(productDefaults)
      .values(
        productIds.map((productId) => ({
          orgId: s.org.id,
          shopifyDomain: account.domain,
          productId,
          supplierId: input.supplierId
        }))
      )
      .onConflictDoUpdate({
        target: [productDefaults.orgId, productDefaults.shopifyDomain, productDefaults.productId],
        set: {
          supplierId: input.supplierId,
          revision: sql`${productDefaults.revision} + 1`,
          updatedAt: new Date()
        }
      })
    return { updated: productIds.length }
  })
  await refreshStoredStockFields(s.org.id, domain)
  return result
}

export const assignProductLabelInputSchema = z.strictObject({
  productIds: z
    .array(z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/))
    .min(1)
    .max(500),
  productLabel: z.enum(productLabels)
})

// Sets the label type for several products at once, such as marking uniforms as needing uploaded labels. Other
// product details are kept.
export async function assignProductLabel(s: Session, raw: unknown) {
  if (s.org.kind !== "buyer") {
    throw new ProductDefaultsError("buyerWorkspaceRequired", 403)
  }
  const input = assignProductLabelInputSchema.parse(raw)
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("share")
    if (!account) {
      throw new ProductDefaultsError("connectShopifyBeforeEditing", 409)
    }
    const productIds = [...new Set(input.productIds)]
    await tx
      .insert(productDefaults)
      .values(
        productIds.map((productId) => ({
          orgId: s.org.id,
          shopifyDomain: account.domain,
          productId,
          productLabel: input.productLabel
        }))
      )
      .onConflictDoUpdate({
        target: [productDefaults.orgId, productDefaults.shopifyDomain, productDefaults.productId],
        set: {
          productLabel: input.productLabel,
          revision: sql`${productDefaults.revision} + 1`,
          updatedAt: new Date()
        }
      })
    return { updated: productIds.length }
  })
}

// What a new PO line for a Shopify variant starts with: pieces per unit from Shopify, description, preparation and the
// suffocation warning from the product's saved defaults.
export async function lineDefaultsFor(orgId: string) {
  const [account] = await db()
    .select({ domain: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "shopify")))
  const saved = account ? await readProductDefaults(orgId, account.domain) : new Map<string, ProductDefaults>()
  return (variant: CatalogVariant) => {
    let piecesPerSet = 1
    try {
      piecesPerSet = piecesPerUnit(variant)
    } catch {
      // A bundle whose components Shopify didn't return starts at 1; saving the PO asks to check it in Shopify.
    }
    const defaults = saved.get(variant.product.id)
    return {
      piecesPerSet,
      description: defaults?.description ?? "",
      prepCategory: defaults?.prepCategory ?? null,
      suffocationWarning: defaults?.suffocationWarning ?? false,
      amazonNetwork: defaults?.amazonNetwork ?? "fba",
      skuLabel: defaults?.productLabel !== "none"
    }
  }
}
