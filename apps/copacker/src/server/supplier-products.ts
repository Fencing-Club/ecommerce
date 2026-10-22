import { orderCurrencies, priceBases } from "@repo/copacker-orders"
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm"
import { z } from "zod"
import type { Transaction } from "@/db"
import { db } from "@/db"
import { catalogProducts, catalogs, supplierProductGroups, supplierProducts } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { defaultQuantityRules, priceBreakSchema, quantityRulesSchema } from "@/lib/catalog-pricing"
import { imageTypes, variantsProblem, variantTitle } from "@/lib/supplier-product"
import { requireSupplier } from "./authorization"
import { addToCatalogs } from "./catalogs"
import { pricingText } from "./text"
import type { Session } from "./workspace-session"

const count = z.number().int().positive().max(2_147_483_647)
const variantSchema = z.object({
  id: z.uuid().optional(),
  supplierSku: z.string().trim().min(1, "errors.addSku").max(255),
  options: z.record(z.string(), z.string().trim().max(255)),
  currency: z.enum(orderCurrencies),
  priceMinor: z.number().int().nonnegative().max(2_147_483_647).nullable(),
  priceBasis: z.enum(priceBases),
  piecesPerSellablePack: count,
  sellablePacksPerCase: count.nullable(),
  trackInventory: z.boolean(),
  onHand: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  continueSelling: z.boolean(),
  priceBreaks: z.array(priceBreakSchema).max(25),
  quantityRules: quantityRulesSchema
})

export const productInputSchema = z.object({
  id: z.uuid().optional(),
  revision: z.number().int().positive().optional(),
  title: z.string().trim().min(1, "errors.addTitle").max(500),
  status: z.enum(["active", "archived"]),
  category: z.string().trim().max(255),
  productCode: z.string().trim().max(255),
  url: z.union([z.literal(""), z.url().max(2000)]),
  description: z.string().max(8000),
  optionNames: z.array(z.string().trim().min(1, "errors.nameOption").max(255)).max(4),
  images: z
    .array(z.object({ key: z.string().min(1).max(500), name: z.string().max(255), contentType: z.enum(imageTypes) }))
    .max(50),
  variants: z.array(variantSchema).min(1, "errors.addVariant").max(500)
})

// Saves a product and its variants from the product page. Variants left out are archived, so earlier POs and stock
// records keep them; adding one back by its SKU restores it.
export async function saveProduct(s: Session, raw: unknown) {
  requireSupplier(s)
  const input = productInputSchema.parse(raw)
  const problem = variantsProblem(input, await pricingText())
  if (problem) {
    throw new Error(problem)
  }
  const orgId = s.org.id
  const imagePrefix = `supplier-images/${orgId}/`
  if (input.images.some((image) => !image.key.startsWith(imagePrefix))) {
    throw new LocalizedError("uploadOwnPhotos")
  }
  return db().transaction(async (tx) => {
    const group = {
      title: input.title,
      category: input.category || null,
      productCode: input.productCode || null,
      url: input.url || null,
      description: input.description || null,
      optionNames: input.optionNames,
      images: input.images,
      updatedAt: new Date()
    }
    let id = input.id
    let revision = 1
    if (id) {
      const [updated] = await tx
        .update(supplierProductGroups)
        .set({ ...group, revision: sql`${supplierProductGroups.revision} + 1` })
        .where(
          and(
            eq(supplierProductGroups.id, id),
            eq(supplierProductGroups.supplierOrgId, orgId),
            eq(supplierProductGroups.revision, input.revision ?? 0)
          )
        )
        .returning({ revision: supplierProductGroups.revision })
      if (!updated) {
        throw new LocalizedError("productChangedRefresh")
      }
      revision = updated.revision
    } else {
      const [created] = await tx
        .insert(supplierProductGroups)
        .values({ supplierOrgId: orgId, ...group })
        .returning({ id: supplierProductGroups.id })
      id = created!.id
    }
    const existing = await tx
      .select({ id: supplierProducts.id, groupId: supplierProducts.groupId, supplierSku: supplierProducts.supplierSku })
      .from(supplierProducts)
      .where(
        and(
          eq(supplierProducts.supplierOrgId, orgId),
          inArray(
            supplierProducts.supplierSku,
            input.variants.map((variant) => variant.supplierSku)
          )
        )
      )
      .for("update")
    const created: string[] = []
    const kept: string[] = []
    for (const [position, variant] of input.variants.entries()) {
      const { id: variantId, ...fields } = variant
      const owner = existing.find((row) => row.supplierSku === variant.supplierSku)
      if (owner && owner.groupId !== id) {
        throw new LocalizedError("skuTaken", { sku: variant.supplierSku })
      }
      const targetId = variantId ?? owner?.id
      const values = {
        ...fields,
        title: variantTitle(input.title, variant.options, input.optionNames),
        position,
        active: input.status === "active" ? 1 : 0,
        updatedAt: new Date()
      }
      if (targetId) {
        const [updated] = await tx
          .update(supplierProducts)
          .set({ ...values, revision: sql`${supplierProducts.revision} + 1` })
          .where(and(eq(supplierProducts.id, targetId), eq(supplierProducts.groupId, id)))
          .returning({ id: supplierProducts.id })
        if (!updated) {
          throw new LocalizedError("variantChangedRefresh")
        }
        kept.push(targetId)
      } else {
        const [row] = await tx
          .insert(supplierProducts)
          .values({ supplierOrgId: orgId, groupId: id, ...values })
          .returning({ id: supplierProducts.id })
        created.push(row!.id)
      }
    }
    await tx
      .update(supplierProducts)
      .set({ active: 0, revision: sql`${supplierProducts.revision} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(supplierProducts.groupId, id),
          eq(supplierProducts.active, 1),
          notInArray(supplierProducts.id, [...kept, ...created])
        )
      )
    await joinCatalogs(tx, orgId, id, created, !input.id)
    return { id, revision }
  })
}

// New variants join the catalogs their product is in. A new product joins the catalogs that take new products.
export async function joinCatalogs(
  tx: Transaction,
  orgId: string,
  groupId: string,
  created: string[],
  newProduct: boolean
) {
  if (!created.length) {
    return
  }
  if (newProduct) {
    await addToCatalogs(tx, orgId, created)
    return
  }
  const holding = await tx
    .selectDistinct({ catalogId: catalogProducts.catalogId })
    .from(catalogProducts)
    .innerJoin(supplierProducts, eq(supplierProducts.id, catalogProducts.productId))
    .where(eq(supplierProducts.groupId, groupId))
  if (holding.length) {
    await tx
      .insert(catalogProducts)
      .values(holding.flatMap((row) => created.map((productId) => ({ catalogId: row.catalogId, productId }))))
      .onConflictDoNothing()
  }
}

// Archives or restores whole products.
export async function setProductsActive(s: Session, groupIds: string[], active: boolean) {
  requireSupplier(s)
  const updated = await db()
    .update(supplierProducts)
    .set({ active: active ? 1 : 0, revision: sql`${supplierProducts.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(supplierProducts.supplierOrgId, s.org.id), inArray(supplierProducts.groupId, groupIds)))
    .returning({ id: supplierProducts.id })
  return updated.length
}

// Every product with its variants, for the Products and Inventory pages.
export async function productList(orgId: string) {
  const [groups, variants, memberships] = await Promise.all([
    db()
      .select()
      .from(supplierProductGroups)
      .where(eq(supplierProductGroups.supplierOrgId, orgId))
      .orderBy(asc(supplierProductGroups.title)),
    db()
      .select()
      .from(supplierProducts)
      .where(eq(supplierProducts.supplierOrgId, orgId))
      .orderBy(asc(supplierProducts.position), asc(supplierProducts.supplierSku)),
    db()
      .selectDistinct({ groupId: supplierProducts.groupId, catalogId: catalogProducts.catalogId })
      .from(catalogProducts)
      .innerJoin(supplierProducts, eq(supplierProducts.id, catalogProducts.productId))
      .innerJoin(catalogs, eq(catalogs.id, catalogProducts.catalogId))
      .where(eq(catalogs.supplierOrgId, orgId))
  ])
  const byGroup = Map.groupBy(variants, (variant) => variant.groupId)
  return groups.flatMap((group) => {
    const own = byGroup.get(group.id) ?? []
    const active = own.filter((variant) => variant.active === 1)
    if (!own.length) {
      return []
    }
    return [
      {
        ...group,
        status: active.length ? ("active" as const) : ("archived" as const),
        // An active product shows its active variants; an archived one, those it had.
        variants: (active.length ? active : own).map((variant) => ({
          ...variant,
          priceBasis: variant.priceBasis as "piece" | "sellable_pack" | "case"
        })),
        catalogs: memberships.filter((row) => row.groupId === group.id).length
      }
    ]
  })
}

// A product and its active variants, for its page.
export async function productDetail(orgId: string, id: string) {
  const [group] = await db()
    .select()
    .from(supplierProductGroups)
    .where(and(eq(supplierProductGroups.id, id), eq(supplierProductGroups.supplierOrgId, orgId)))
  if (!group) {
    return null
  }
  const variants = await db()
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.groupId, id))
    .orderBy(asc(supplierProducts.position), asc(supplierProducts.supplierSku))
  const active = variants.filter((variant) => variant.active === 1)
  const shown = active.length ? active : variants
  const inCatalogs = shown.length
    ? await db()
        .selectDistinct({ id: catalogs.id, title: catalogs.title, status: catalogs.status })
        .from(catalogProducts)
        .innerJoin(catalogs, eq(catalogs.id, catalogProducts.catalogId))
        .where(
          inArray(
            catalogProducts.productId,
            shown.map((variant) => variant.id)
          )
        )
        .orderBy(asc(catalogs.title))
    : []
  return {
    group,
    status: active.length ? ("active" as const) : ("archived" as const),
    variants: shown.map((variant) => ({
      ...variant,
      priceBasis: variant.priceBasis as "piece" | "sellable_pack" | "case",
      quantityRules: variant.quantityRules ?? defaultQuantityRules
    })),
    catalogs: inCatalogs
  }
}
