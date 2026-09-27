import { prepCategories } from "@repo/aisle"
import { type CatalogVariant, piecesPerUnit } from "@repo/aisle/shopify"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, productDefaults, stockSnapshots, suppliers } from "@/db/schema"
import { type CasePack, casePackSchema } from "@/lib/case-packs"
import { type ProductLabel, productLabels } from "@/lib/product-label"
import type { Session } from "./auth"
import { shopifyFor } from "./connections"

// Buyer-owned product details. Everything else about a product comes from Shopify or Amazon and is edited there.
export type ProductDefaults = {
  description: string
  prepCategory: (typeof prepCategories)[number] | null
  casePacks: CasePack[]
  minimumOrder: number | null
  supplierId: string | null
  // Uploaded barcode, or else Amazon's FNSKU label ("standard") unless the product needs its own ("uploaded").
  productLabel: ProductLabel
  revision: number
}
export const noDefaults: ProductDefaults = {
  description: "",
  prepCategory: null,
  casePacks: [],
  minimumOrder: null,
  supplierId: null,
  productLabel: "standard",
  revision: 0
}

export const productDefaultsInputSchema = z.strictObject({
  productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/),
  description: z.string().trim().max(2000),
  prepCategory: z.enum(prepCategories).nullable(),
  casePacks: z.array(casePackSchema).max(10),
  minimumOrder: z.number().int().min(1).max(1000000).nullable(),
  // Left out keeps the saved supplier.
  supplierId: z.uuid().nullable().optional(),
  productLabel: z.enum(productLabels),
  expectedRevision: z.number().int().nonnegative()
})

export const assignSupplierInputSchema = z.strictObject({
  productIds: z
    .array(z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/))
    .min(1)
    .max(500),
  supplierId: z.uuid().nullable()
})

export class ProductDefaultsError extends Error {
  constructor(
    message: string,
    public readonly status: 403 | 404 | 409
  ) {
    super(message)
  }
}

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
        minimumOrder: row.minimumOrder,
        supplierId: row.supplierId,
        productLabel: row.productLabel,
        revision: row.revision
      }
    ])
  )
}

export async function saveProductDefaults(s: Session, raw: unknown) {
  if (s.org.kind !== "buyer") {
    throw new ProductDefaultsError("A buyer workspace is required", 403)
  }
  const input = productDefaultsInputSchema.parse(raw)
  const shopify = input.supplierId ? await shopifyWriter(s.org.id) : null
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("share")
    if (!account) {
      throw new ProductDefaultsError("Connect Shopify before editing products", 409)
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
      throw new ProductDefaultsError("This product isn't in your synced Shopify inventory", 404)
    }
    const scope = and(
      eq(productDefaults.orgId, s.org.id),
      eq(productDefaults.shopifyDomain, account.domain),
      eq(productDefaults.productId, input.productId)
    )
    const [previous] = await tx.select().from(productDefaults).where(scope).for("update")
    if ((previous?.revision ?? 0) !== input.expectedRevision) {
      throw new ProductDefaultsError("Someone else changed this product. Reload and try again", 409)
    }
    const supplierId = input.supplierId === undefined ? (previous?.supplierId ?? null) : input.supplierId
    if (supplierId && supplierId !== previous?.supplierId) {
      const supplier = await requireCurrentSupplier(tx, s.org.id, supplierId)
      await writeShopifySupplier(shopify, account.domain, [input.productId], supplier)
    }
    const value = {
      description: input.description,
      prepCategory: input.prepCategory,
      casePacks: input.casePacks,
      minimumOrder: input.minimumOrder,
      supplierId,
      productLabel: input.productLabel,
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
      minimumOrder: value.minimumOrder,
      supplierId: value.supplierId,
      productLabel: value.productLabel,
      revision: value.revision
    }
  })
}

type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0]

async function requireCurrentSupplier(tx: Transaction, orgId: string, supplierId: string) {
  const [supplier] = await tx
    .select({ id: suppliers.id, name: suppliers.name, shopifySupplierName: suppliers.shopifySupplierName })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
  if (!supplier) {
    throw new ProductDefaultsError("Choose one of your current suppliers", 409)
  }
  return supplier
}

type ShopifyWriter = { domain: string; client: Awaited<ReturnType<typeof shopifyFor>> }

// Loaded before a transaction that locks the Shopify connection: renewing the token locks that row for update, so
// loading it inside the transaction would wait on the transaction's own lock forever.
async function shopifyWriter(orgId: string): Promise<ShopifyWriter | null> {
  const [account] = await db()
    .select({ domain: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, orgId), eq(connections.provider, "shopify")))
  return account ? { domain: account.domain, client: await shopifyFor(orgId, account.domain) } : null
}

// Shopify's product Supplier field is where suppliers are kept, so choosing one in Copacker writes it there, using
// the supplier's name as Shopify knows it.
async function writeShopifySupplier(
  shopify: ShopifyWriter | null,
  domain: string,
  productIds: string[],
  supplier: { name: string; shopifySupplierName: string | null }
) {
  if (!supplier.shopifySupplierName?.trim()) {
    throw new ProductDefaultsError(
      `Add ${supplier.name}'s name as it appears in Shopify's Supplier field, on the Suppliers page, first`,
      409
    )
  }
  if (shopify?.domain !== domain) {
    throw new ProductDefaultsError("Shopify was reconnected while saving. Try again", 409)
  }
  for (const productId of productIds) {
    await shopify.client.productSupplier(productId, supplier.shopifySupplierName.trim())
  }
}

// Sets the supplier for several products at once, such as from restock's "No supplier yet" group. Other product
// details are kept.
export async function assignProductSupplier(s: Session, raw: unknown) {
  if (s.org.kind !== "buyer") {
    throw new ProductDefaultsError("A buyer workspace is required", 403)
  }
  const input = assignSupplierInputSchema.parse(raw)
  const shopify = input.supplierId ? await shopifyWriter(s.org.id) : null
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("share")
    if (!account) {
      throw new ProductDefaultsError("Connect Shopify before editing products", 409)
    }
    const productIds = [...new Set(input.productIds)]
    if (input.supplierId) {
      const supplier = await requireCurrentSupplier(tx, s.org.id, input.supplierId)
      await writeShopifySupplier(shopify, account.domain, productIds, supplier)
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
    throw new ProductDefaultsError("A buyer workspace is required", 403)
  }
  const input = assignProductLabelInputSchema.parse(raw)
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("share")
    if (!account) {
      throw new ProductDefaultsError("Connect Shopify before editing products", 409)
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

// What a new PO line for a Shopify variant starts with: pieces per unit from Shopify, description and preparation from
// the product's saved defaults.
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
    return { piecesPerSet, description: defaults?.description ?? "", prepCategory: defaults?.prepCategory ?? null }
  }
}
