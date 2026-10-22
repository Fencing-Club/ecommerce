import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import {
  catalogProducts,
  catalogs,
  organizations,
  supplierProductGroups,
  supplierProducts,
  suppliers
} from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { catalogPricing, priceBreakSchema, pricingProblem, quantityRulesSchema } from "@/lib/catalog-pricing"
import { variantLabel } from "@/lib/supplier-product"
import { requireSupplier } from "./authorization"
import { requestInput } from "./errors"
import { pricingText } from "./text"
import type { Session } from "./workspace-session"

type Executor = Transaction | ReturnType<typeof db>

// A supplier's customers: the buyers that added it as a supplier and still work with it, by the buyer's own name.
export async function supplierCustomers(orgId: string, executor: Executor = db()) {
  return executor
    .select({
      id: suppliers.id,
      name: organizations.name,
      buyerOrgId: suppliers.buyerOrgId,
      catalogId: suppliers.catalogId,
      createdAt: suppliers.createdAt
    })
    .from(suppliers)
    .innerJoin(organizations, eq(organizations.id, suppliers.buyerOrgId))
    .where(and(eq(suppliers.supplierOrgId, orgId), isNull(suppliers.removedAt)))
    .orderBy(asc(organizations.name))
}

// Each catalog with its active products, how many of them it prices differently, and the customers it's assigned to.
export async function catalogList(orgId: string) {
  const [rows, counts, customers] = await Promise.all([
    db().select().from(catalogs).where(eq(catalogs.supplierOrgId, orgId)).orderBy(asc(catalogs.title)),
    db()
      .select({
        catalogId: catalogProducts.catalogId,
        products: sql<number>`count(distinct ${supplierProducts.groupId})::int`,
        overrides: sql<number>`(count(*) filter (where ${catalogProducts.priceMinor} is not null or ${catalogProducts.priceBreaks} is not null or ${catalogProducts.quantityRules} is not null))::int`
      })
      .from(catalogProducts)
      .innerJoin(supplierProducts, eq(supplierProducts.id, catalogProducts.productId))
      .where(and(eq(supplierProducts.supplierOrgId, orgId), eq(supplierProducts.active, true)))
      .groupBy(catalogProducts.catalogId),
    supplierCustomers(orgId)
  ])
  return rows.map((row) => {
    const count = counts.find((candidate) => candidate.catalogId === row.id)
    return {
      ...row,
      products: count?.products ?? 0,
      overrides: count?.overrides ?? 0,
      customers: customers.filter((customer) => customer.catalogId === row.id).map((customer) => customer.name)
    }
  })
}

// What the catalog form needs: the catalog, every active product, the catalog's entries, and the customers to assign.
export async function catalogEditor(orgId: string, id: string | null) {
  const [products, customers, others] = await Promise.all([
    db()
      .select({
        id: supplierProducts.id,
        groupId: supplierProducts.groupId,
        options: supplierProducts.options,
        supplierSku: supplierProducts.supplierSku,
        currency: supplierProducts.currency,
        priceMinor: supplierProducts.priceMinor,
        priceBasis: supplierProducts.priceBasis,
        priceBreaks: supplierProducts.priceBreaks,
        quantityRules: supplierProducts.quantityRules,
        group: {
          id: supplierProductGroups.id,
          title: supplierProductGroups.title,
          optionNames: supplierProductGroups.optionNames,
          images: supplierProductGroups.images
        }
      })
      .from(supplierProducts)
      .innerJoin(supplierProductGroups, eq(supplierProductGroups.id, supplierProducts.groupId))
      .where(and(eq(supplierProducts.supplierOrgId, orgId), eq(supplierProducts.active, true)))
      .orderBy(asc(supplierProductGroups.title), asc(supplierProducts.position), asc(supplierProducts.supplierSku)),
    supplierCustomers(orgId),
    db()
      .select({ id: catalogs.id, title: catalogs.title })
      .from(catalogs)
      .where(and(eq(catalogs.supplierOrgId, orgId), id ? ne(catalogs.id, id) : sql`true`))
  ])
  // `.at` rather than destructuring, so the type says a new catalog has none.
  const catalog = id
    ? (
        await db()
          .select({
            id: catalogs.id,
            revision: catalogs.revision,
            title: catalogs.title,
            status: catalogs.status,
            adjustmentBasisPoints: catalogs.adjustmentBasisPoints,
            includeNewProducts: catalogs.includeNewProducts
          })
          .from(catalogs)
          .where(and(eq(catalogs.id, id), eq(catalogs.supplierOrgId, orgId)))
      ).at(0)
    : undefined
  if (id && !catalog) {
    return null
  }
  const entries = catalog ? await db().select().from(catalogProducts).where(eq(catalogProducts.catalogId, id!)) : []
  return {
    catalog: catalog ?? null,
    // Products with their active variants, in title order.
    products: [...Map.groupBy(products, (row) => row.group.id).values()].map((rows) => {
      const { group } = rows[0]!
      return {
        id: group.id,
        title: group.title,
        image: group.images.at(0) ?? null,
        variants: rows.map(({ group: _group, groupId: _groupId, options, ...variant }) => ({
          ...variant,
          label: variantLabel(options, group.optionNames)
        }))
      }
    }),
    entries: entries.map(({ catalogId: _catalog, ...entry }) => entry),
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      assigned: !!id && customer.catalogId === id,
      // Another catalog the customer has now, which saving this one would replace.
      otherCatalog: others.find((other) => other.id === customer.catalogId)?.title ?? null
    }))
  }
}
export type CatalogEditorData = NonNullable<Awaited<ReturnType<typeof catalogEditor>>>

const money = z.number().int().nonnegative().max(2_147_483_647)
export const catalogInputSchema = z.object({
  id: z.uuid().optional(),
  revision: z.number().int().positive().optional(),
  title: z.string().trim().min(1, "errors.addTitle").max(255),
  status: z.enum(["active", "draft", "archived"]),
  // Up to 100% off, or up to ten times the price.
  adjustmentBasisPoints: z.number().int().min(-10_000).max(100_000),
  includeNewProducts: z.boolean(),
  customerIds: z.array(z.uuid()).max(5000),
  products: z
    .array(
      z.object({
        productId: z.uuid(),
        priceMinor: money.nullable(),
        priceBreaks: z.array(priceBreakSchema).max(25).nullable(),
        quantityRules: quantityRulesSchema.nullable()
      })
    )
    .max(50_000)
})

// Saves a catalog whole: its settings, the active products it includes with what it sets for each, and its customers.
// Products archived since keep their place in it. A customer moves here from any catalog it had.
export async function saveCatalog(s: Session, raw: unknown) {
  requireSupplier(s)
  const input = requestInput(catalogInputSchema, raw)
  const pricingT = await pricingText()
  const productIds = input.products.map((entry) => entry.productId)
  if (new Set(productIds).size !== productIds.length) {
    throw new LocalizedError("productInCatalogTwice")
  }
  return db().transaction(async (tx) => {
    const [clash] = await tx
      .select({ id: catalogs.id })
      .from(catalogs)
      .where(
        and(
          eq(catalogs.supplierOrgId, s.org.id),
          eq(catalogs.title, input.title),
          input.id ? ne(catalogs.id, input.id) : sql`true`
        )
      )
    if (clash) {
      throw new LocalizedError("catalogTitleTaken")
    }
    const products = await tx
      .select()
      .from(supplierProducts)
      .where(and(eq(supplierProducts.supplierOrgId, s.org.id), eq(supplierProducts.active, true)))
    for (const entry of input.products) {
      const product = products.find((candidate) => candidate.id === entry.productId)
      if (!product) {
        throw new LocalizedError("catalogProductRemoved")
      }
      if (entry.priceMinor === null && entry.priceBreaks === null && entry.quantityRules === null) {
        continue
      }
      const pricing = catalogPricing(product, input.adjustmentBasisPoints, entry)
      const problem = pricingProblem(pricing.priceMinor, pricing.priceBreaks, pricing.quantityRules, pricingT)
      if (problem) {
        throw new LocalizedError("productProblem", { product: product.title, problem })
      }
    }
    const settings = {
      title: input.title,
      status: input.status,
      adjustmentBasisPoints: input.adjustmentBasisPoints,
      includeNewProducts: input.includeNewProducts
    }
    const saved = await writeSettings(tx, s, input, settings)
    const id = saved.id
    if (products.length) {
      await tx.delete(catalogProducts).where(
        and(
          eq(catalogProducts.catalogId, id),
          inArray(
            catalogProducts.productId,
            products.map((product) => product.id)
          )
        )
      )
    }
    for (let start = 0; start < input.products.length; start += 1000) {
      await tx
        .insert(catalogProducts)
        .values(input.products.slice(start, start + 1000).map((entry) => ({ catalogId: id, ...entry })))
    }
    const customerIds = [...new Set(input.customerIds)]
    const customers = customerIds.length
      ? await tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(
            and(eq(suppliers.supplierOrgId, s.org.id), isNull(suppliers.removedAt), inArray(suppliers.id, customerIds))
          )
      : []
    if (customers.length !== customerIds.length) {
      throw new LocalizedError("customerNotLinkedRefresh")
    }
    await tx
      .update(suppliers)
      .set({ catalogId: null })
      .where(and(eq(suppliers.supplierOrgId, s.org.id), eq(suppliers.catalogId, id)))
    if (customerIds.length) {
      await tx.update(suppliers).set({ catalogId: id }).where(inArray(suppliers.id, customerIds))
    }
    return saved
  })
}

async function writeSettings(
  tx: Transaction,
  s: Session,
  input: z.infer<typeof catalogInputSchema>,
  settings: Omit<typeof catalogs.$inferInsert, "supplierOrgId">
) {
  if (!input.id) {
    const [created] = await tx
      .insert(catalogs)
      .values({ supplierOrgId: s.org.id, ...settings })
      .returning({ id: catalogs.id, revision: catalogs.revision })
    return created!
  }
  if (!input.revision) {
    throw new LocalizedError("catalogRevisionRequired")
  }
  const [updated] = await tx
    .update(catalogs)
    .set({ ...settings, revision: input.revision + 1 })
    .where(and(eq(catalogs.id, input.id), eq(catalogs.supplierOrgId, s.org.id), eq(catalogs.revision, input.revision)))
    .returning({ id: catalogs.id, revision: catalogs.revision })
  if (!updated) {
    throw new LocalizedError("catalogChanged")
  }
  return updated
}

// Deletes a catalog. Its customers go back to ordering every active product at its own price.
export async function deleteCatalog(s: Session, id: string) {
  requireSupplier(s)
  const [deleted] = await db()
    .delete(catalogs)
    .where(and(eq(catalogs.id, id), eq(catalogs.supplierOrgId, s.org.id)))
    .returning({ id: catalogs.id })
  if (!deleted) {
    throw new LocalizedError("catalogAlreadyDeleted")
  }
}

// Gives a customer one of the supplier's catalogs, or none.
export async function assignCatalog(s: Session, customerId: string, catalogId: string | null) {
  requireSupplier(s)
  if (catalogId) {
    const [catalog] = await db()
      .select({ id: catalogs.id })
      .from(catalogs)
      .where(and(eq(catalogs.id, catalogId), eq(catalogs.supplierOrgId, s.org.id)))
    if (!catalog) {
      throw new LocalizedError("chooseYourCatalog")
    }
  }
  const [updated] = await db()
    .update(suppliers)
    .set({ catalogId })
    .where(and(eq(suppliers.id, customerId), eq(suppliers.supplierOrgId, s.org.id), isNull(suppliers.removedAt)))
    .returning({ id: suppliers.id })
  if (!updated) {
    throw new LocalizedError("customerNotLinked")
  }
}

// New products join every catalog set to include them.
export async function addToCatalogs(tx: Transaction, supplierOrgId: string, productIds: string[]) {
  if (!productIds.length) {
    return
  }
  const open = await tx
    .select({ id: catalogs.id })
    .from(catalogs)
    .where(and(eq(catalogs.supplierOrgId, supplierOrgId), eq(catalogs.includeNewProducts, true)))
  const rows = open.flatMap((catalog) => productIds.map((productId) => ({ catalogId: catalog.id, productId })))
  if (rows.length) {
    await tx.insert(catalogProducts).values(rows).onConflictDoNothing()
  }
}

// The supplier's products with these SKUs as a customer sees them: at their own prices without an active catalog, or
// only those in its catalog, at the catalog's prices.
export async function customerProducts(
  executor: Executor,
  link: { supplierOrgId: string | null; catalogId: string | null },
  skus: string[]
) {
  if (!link.supplierOrgId || !skus.length) {
    return []
  }
  const products = await executor
    .select()
    .from(supplierProducts)
    .where(and(eq(supplierProducts.supplierOrgId, link.supplierOrgId), inArray(supplierProducts.supplierSku, skus)))
  const [catalog] = link.catalogId
    ? await executor
        .select()
        .from(catalogs)
        .where(and(eq(catalogs.id, link.catalogId), eq(catalogs.status, "active")))
    : []
  if (!catalog || !products.length) {
    return products
  }
  const entries = await executor
    .select()
    .from(catalogProducts)
    .where(
      and(
        eq(catalogProducts.catalogId, catalog.id),
        inArray(
          catalogProducts.productId,
          products.map((product) => product.id)
        )
      )
    )
  return products.flatMap((product) => {
    const entry = entries.find((candidate) => candidate.productId === product.id)
    return entry ? [{ ...product, ...catalogPricing(product, catalog.adjustmentBasisPoints, entry) }] : []
  })
}
