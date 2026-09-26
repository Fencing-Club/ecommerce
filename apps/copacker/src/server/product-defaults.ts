import { prepCategories } from "@repo/aisle"
import { type CatalogVariant, piecesPerUnit } from "@repo/aisle/shopify"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { connections, productDefaults, stockSnapshots, suppliers } from "@/db/schema"
import { type CasePack, casePackSchema } from "@/lib/case-packs"
import type { Session } from "./auth"

// Buyer-owned product details. Everything else about a product comes from Shopify or Amazon and is edited there.
export type ProductDefaults = {
  description: string
  prepCategory: (typeof prepCategories)[number] | null
  casePacks: CasePack[]
  minimumOrder: number | null
  supplierId: string | null
  revision: number
}
export const noDefaults: ProductDefaults = {
  description: "",
  prepCategory: null,
  casePacks: [],
  minimumOrder: null,
  supplierId: null,
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
      await requireCurrentSupplier(tx, s.org.id, supplierId)
    }
    const value = {
      description: input.description,
      prepCategory: input.prepCategory,
      casePacks: input.casePacks,
      minimumOrder: input.minimumOrder,
      supplierId,
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
      revision: value.revision
    }
  })
}

type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0]

async function requireCurrentSupplier(tx: Transaction, orgId: string, supplierId: string) {
  const [supplier] = await tx
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), eq(suppliers.buyerOrgId, orgId), isNull(suppliers.removedAt)))
  if (!supplier) {
    throw new ProductDefaultsError("Choose one of your current suppliers", 409)
  }
}

// Sets the supplier for several products at once, such as from restock's "No supplier yet" group. Other product
// details are kept.
export async function assignProductSupplier(s: Session, raw: unknown) {
  if (s.org.kind !== "buyer") {
    throw new ProductDefaultsError("A buyer workspace is required", 403)
  }
  const input = assignSupplierInputSchema.parse(raw)
  return db().transaction(async (tx) => {
    const [account] = await tx
      .select({ domain: connections.externalId })
      .from(connections)
      .where(and(eq(connections.orgId, s.org.id), eq(connections.provider, "shopify")))
      .for("share")
    if (!account) {
      throw new ProductDefaultsError("Connect Shopify before editing products", 409)
    }
    if (input.supplierId) {
      await requireCurrentSupplier(tx, s.org.id, input.supplierId)
    }
    const productIds = [...new Set(input.productIds)]
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
