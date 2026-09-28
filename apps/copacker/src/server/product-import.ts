import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db, type Transaction } from "@/db"
import { supplierProductGroups, supplierProducts } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { variantTitle } from "@/lib/supplier-product"
import type { SheetProduct, SheetVariant } from "./product-sheet"
import { joinCatalogs } from "./supplier-products"

type Executor = Transaction | ReturnType<typeof db>
type VariantRow = typeof supplierProducts.$inferSelect
type GroupRow = typeof supplierProductGroups.$inferSelect

async function existingFor(executor: Executor, orgId: string, products: SheetProduct[], lock = false) {
  const skus = products.flatMap((product) => product.variants.map((variant) => variant.supplierSku))
  const variants: VariantRow[] = []
  for (let start = 0; start < skus.length; start += 1000) {
    const query = executor
      .select()
      .from(supplierProducts)
      .where(
        and(
          eq(supplierProducts.supplierOrgId, orgId),
          inArray(supplierProducts.supplierSku, skus.slice(start, start + 1000))
        )
      )
      .orderBy(supplierProducts.id)
    variants.push(...(lock ? await query.for("update") : await query))
  }
  const groupIds = [...new Set(variants.map((variant) => variant.groupId))]
  const groups = groupIds.length
    ? await executor.select().from(supplierProductGroups).where(inArray(supplierProductGroups.id, groupIds))
    : []
  return { variants: new Map(variants.map((variant) => [variant.supplierSku, variant])), groups }
}

// The one existing product a file's product updates, or null for a new one. A file can't merge two products.
function targetGroup(product: SheetProduct, variants: Map<string, VariantRow>) {
  const ids = new Set(product.variants.flatMap((variant) => variants.get(variant.supplierSku)?.groupId ?? []))
  if (ids.size > 1) {
    throw new LocalizedError("rowMixedProducts", { row: product.line, handle: product.handle })
  }
  return [...ids].at(0) ?? null
}

function groupFields(product: SheetProduct) {
  return {
    title: product.title,
    category: product.category,
    productCode: product.productCode,
    url: product.url,
    description: product.description,
    optionNames: product.optionNames
  }
}

function variantFields(product: SheetProduct, variant: SheetVariant) {
  const { line: _line, onHand: _onHand, ...fields } = variant
  return { ...fields, active: product.active ? 1 : 0 }
}

function sameGroup(group: GroupRow, product: SheetProduct) {
  const fields = groupFields(product)
  return (Object.keys(fields) as Array<keyof typeof fields>).every((key) => isDeepStrictEqual(group[key], fields[key]))
}

function sameVariant(row: VariantRow, product: SheetProduct, variant: SheetVariant) {
  const fields = variantFields(product, variant)
  return (
    (Object.keys(fields) as Array<keyof typeof fields>).every((key) => isDeepStrictEqual(row[key], fields[key])) &&
    (variant.onHand === null || variant.onHand === row.onHand)
  )
}

function revisionHash(variants: Iterable<VariantRow>, groups: GroupRow[]) {
  return createHash("sha256")
    .update(
      [
        ...[...variants].map((row) => `v${row.id}:${row.revision}`),
        ...groups.map((row) => `g${row.id}:${row.revision}`)
      ]
        .toSorted()
        .join("\n")
    )
    .digest("hex")
}

// What importing a file would do, without doing it: products and variants added, changed and unchanged.
export async function previewImport(orgId: string, products: SheetProduct[]) {
  const { variants, groups } = await existingFor(db(), orgId, products)
  let createdProducts = 0
  const counts = { created: 0, updated: 0, unchanged: 0 }
  for (const product of products) {
    const groupId = targetGroup(product, variants)
    const group = groups.find((row) => row.id === groupId)
    if (!group) {
      createdProducts++
    }
    for (const variant of product.variants) {
      const row = variants.get(variant.supplierSku)
      if (!row) {
        counts.created++
      } else if (group && sameGroup(group, product) && sameVariant(row, product, variant)) {
        counts.unchanged++
      } else {
        counts.updated++
      }
    }
  }
  return {
    products: products.length,
    createdProducts,
    variants: counts,
    sample: products.slice(0, 8).map((product) => ({
      handle: product.handle,
      title: product.title,
      variants: product.variants.length,
      isNew: !targetGroup(product, variants)
    })),
    revisionHash: revisionHash(variants.values(), groups)
  }
}

// Imports a file: matching SKUs are updated, new SKUs added to their handle's product, and anything the file leaves
// out stays as it is. Refuses if the catalog changed since the preview.
export async function commitImport(tx: Transaction, orgId: string, products: SheetProduct[], expectedHash: string) {
  const { variants, groups } = await existingFor(tx, orgId, products, true)
  if (revisionHash(variants.values(), groups) !== expectedHash) {
    throw new LocalizedError("productsChangedAfterPreview")
  }
  for (const product of products) {
    let groupId = targetGroup(product, variants)
    const group = groups.find((row) => row.id === groupId)
    const isNew = !group
    if (!group) {
      const [created] = await tx
        .insert(supplierProductGroups)
        .values({ supplierOrgId: orgId, ...groupFields(product) })
        .returning({ id: supplierProductGroups.id })
      groupId = created!.id
    } else if (!sameGroup(group, product)) {
      await tx
        .update(supplierProductGroups)
        .set({ ...groupFields(product), revision: sql`${supplierProductGroups.revision} + 1`, updatedAt: new Date() })
        .where(eq(supplierProductGroups.id, group.id))
    }
    const id = groupId!
    const [{ next } = { next: 0 }] = await tx
      .select({ next: sql<number>`coalesce(max(${supplierProducts.position}) + 1, 0)::int` })
      .from(supplierProducts)
      .where(eq(supplierProducts.groupId, id))
    const created: string[] = []
    for (const [index, variant] of product.variants.entries()) {
      const row = variants.get(variant.supplierSku)
      const fields = {
        ...variantFields(product, variant),
        title: variantTitle(product.title, variant.options, product.optionNames)
      }
      if (!row) {
        const [inserted] = await tx
          .insert(supplierProducts)
          .values({ supplierOrgId: orgId, groupId: id, ...fields, onHand: variant.onHand ?? 0, position: next + index })
          .returning({ id: supplierProducts.id })
        created.push(inserted!.id)
      } else if (!(group && sameGroup(group, product) && sameVariant(row, product, variant))) {
        await tx
          .update(supplierProducts)
          .set({
            ...fields,
            onHand: variant.onHand ?? row.onHand,
            revision: sql`${supplierProducts.revision} + 1`,
            updatedAt: new Date()
          })
          .where(eq(supplierProducts.id, row.id))
      }
    }
    // Variants the file left out keep their options, so only their names follow a new title.
    if (group && (group.title !== product.title || !isDeepStrictEqual(group.optionNames, product.optionNames))) {
      const others = await tx
        .select({ id: supplierProducts.id, options: supplierProducts.options })
        .from(supplierProducts)
        .where(eq(supplierProducts.groupId, id))
      for (const other of others) {
        await tx
          .update(supplierProducts)
          .set({ title: variantTitle(product.title, other.options, product.optionNames) })
          .where(eq(supplierProducts.id, other.id))
      }
    }
    await joinCatalogs(tx, orgId, id, created, isNew)
  }
}
