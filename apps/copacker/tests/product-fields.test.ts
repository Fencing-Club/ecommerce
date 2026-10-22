import { randomUUID } from "node:crypto"
import type { ShopifyVariant } from "@repo/copacker-marketplaces/shopify"
import { and, eq } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

vi.mock("@/db", () => import("./test-db"))
vi.mock("../src/server/auth", async (original) => (await import("./test-session")).mockAuth(original))

import { PATCH } from "../src/server/http/api/inventory/variant-fields"
import { assignProductSupplier } from "../src/server/product-defaults"
import { copyShopifyFields, fillStockRows, withVariantFields } from "../src/server/product-fields"
import { appUrl } from "../src/server/security"
import { served } from "./served"
import { database, setUpTestDatabase } from "./test-db"
import { signedIn, testSession } from "./test-session"

const buyerId = randomUUID()
const supplierOrgId = randomUUID()
const domain = "shop.myshopify.com"
const variant = (id: number) => `gid://shopify/ProductVariant/${id}`
const product = (id: number) => `gid://shopify/Product/${id}`

function save(body: unknown) {
  return served(PATCH)(
    new Request(`${appUrl()}/api/inventory/variant-fields`, {
      method: "PATCH",
      headers: { origin: appUrl(), "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  )
}

// The stored Shopify stock rows, by variation.
async function storedRows() {
  const [stock] = await database
    .select({ data: tables.stockSnapshots.data })
    .from(tables.stockSnapshots)
    .where(and(eq(tables.stockSnapshots.orgId, buyerId), eq(tables.stockSnapshots.scopeKey, "store")))
  const rows = stock?.data?.source === "shopify" ? stock.data.rows : []
  return Object.fromEntries(rows.map((row) => [row.variantId, row]))
}

// As Shopify's metafields hold them.
const metafields = [
  {
    variantId: variant(1),
    productId: product(1),
    supplierSku: "UF-1504",
    asin: "B000000001",
    amazonStockTarget: 0,
    storeStockTarget: 12,
    caseQuantity: 160,
    supplierName: "SUZHOU BOPAC Teco CO., LTD"
  },
  {
    variantId: variant(2),
    productId: product(1),
    supplierSku: "UF-1505",
    asin: null,
    amazonStockTarget: 4,
    storeStockTarget: null,
    caseQuantity: 160,
    supplierName: "SUZHOU BOPAC Teco CO., LTD"
  },
  // Shopify Collective: a partner's product, whose Supplier isn't one of the buyer's.
  {
    variantId: variant(3),
    productId: product(3),
    supplierSku: null,
    asin: null,
    amazonStockTarget: null,
    storeStockTarget: null,
    caseQuantity: null,
    supplierName: "Badminton Corner"
  }
]

setUpTestDatabase()
beforeAll(async () => {
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: supplierOrgId, name: "Supplier", kind: "supplier" }
  ])
  await database
    .insert(tables.connections)
    .values({ orgId: buyerId, provider: "shopify", externalId: domain, encryptedToken: "token" })
  const rows = [1, 2, 3].map((id) => ({
    variantId: variant(id),
    buyerSku: `SKU-${id}`,
    productId: product(id === 3 ? 3 : 1),
    levels: []
  }))
  await database.insert(tables.stockSnapshots).values({
    orgId: buyerId,
    source: "shopify",
    externalAccountId: domain,
    scopeKey: "store",
    data: { source: "shopify", rows } as unknown as typeof tables.stockSnapshots.$inferInsert.data
  })
  // Ok Fencing is already one of the buyer's suppliers, known in Shopify by its legal name.
  await database.insert(tables.suppliers).values({
    buyerOrgId: buyerId,
    name: "Ok Fencing",
    shopifySupplierName: "SUZHOU BOPAC Teco CO., LTD"
  })
  // A supplier SKU the buyer already set in Copacker is kept.
  await database
    .insert(tables.variantFields)
    .values({ orgId: buyerId, shopifyDomain: domain, variantId: variant(2), supplierSku: "KEEP-2" })
})

beforeEach(() => {
  signedIn.actor = testSession({ orgId: buyerId, kind: "buyer" })
})

describe("copying Shopify's metafields", () => {
  it("copies them once, keeping what Copacker has and leaving out partners' suppliers", async () => {
    const shopify = { metafieldValues: vi.fn<() => Promise<typeof metafields>>().mockResolvedValue(metafields) }
    expect(await copyShopifyFields(buyerId, domain, shopify, { partnerVariants: new Set([variant(3)]) })).toBe(true)
    const fields = await database.select().from(tables.variantFields).where(eq(tables.variantFields.orgId, buyerId))
    expect(
      Object.fromEntries(fields.map((row) => [row.variantId, [row.supplierSku, row.asin, row.amazonStockTarget]]))
    ).toEqual({ [variant(1)]: ["UF-1504", "B000000001", 0], [variant(2)]: ["KEEP-2", null, 4] })
    const [okFencing] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.name, "Ok Fencing"))
    const defaults = await database
      .select()
      .from(tables.productDefaults)
      .where(eq(tables.productDefaults.orgId, buyerId))
    expect(defaults.map((row) => [row.productId, row.supplierId, row.caseQuantity])).toEqual([
      [product(1), okFencing!.id, 160]
    ])
    // No supplier was added for the partner's product.
    expect(await database.select().from(tables.suppliers)).toHaveLength(1)
    // Later syncs don't read the metafields again.
    expect(await copyShopifyFields(buyerId, domain, shopify)).toBe(false)
    expect(shopify.metafieldValues).toHaveBeenCalledTimes(1)
  })

  it("fills stock rows and Shopify variants with the details Copacker keeps", async () => {
    const rows = await fillStockRows(buyerId, domain, [
      { variantId: variant(1), productId: product(1) },
      { variantId: variant(3), productId: product(3) }
    ])
    expect(rows).toEqual([
      {
        variantId: variant(1),
        productId: product(1),
        supplierSku: "UF-1504",
        amazonStockTarget: 0,
        storeStockTarget: 12,
        caseQuantity: 160,
        supplierName: "SUZHOU BOPAC Teco CO., LTD"
      },
      {
        variantId: variant(3),
        productId: product(3),
        supplierSku: null,
        amazonStockTarget: null,
        storeStockTarget: null,
        caseQuantity: null,
        supplierName: null
      }
    ])
    const bundle: ShopifyVariant = {
      id: variant(9),
      title: "Two pack",
      sku: "BUNDLE",
      product: { id: product(9), title: "Cord bundle" },
      inventoryItem: { id: "gid://shopify/InventoryItem/9", unitCost: null },
      requiresComponents: true,
      productVariantComponents: {
        nodes: [{ quantity: 2, productVariant: { id: variant(1), sku: "SKU-1" } }],
        pageInfo: { hasNextPage: false }
      }
    }
    const [single, filled, missing] = await withVariantFields(buyerId, domain, [
      { ...bundle, id: variant(1), requiresComponents: false },
      bundle,
      null
    ])
    expect(single).toMatchObject({ supplierSku: { value: "UF-1504" }, asin: { value: "B000000001" } })
    expect(filled).toMatchObject({ supplierSku: null, asin: null })
    expect(filled?.productVariantComponents.nodes[0]?.productVariant.supplierSku).toEqual({ value: "UF-1504" })
    expect(missing).toBeNull()
  })
})

describe("editing variation details", () => {
  it("saves supplier SKU, ASIN and stock targets to Copacker and the stored stock", async () => {
    const response = await save({
      variantId: variant(1),
      supplierSku: "  AB-100 ",
      asin: "B0NEW",
      amazonStockTarget: 5,
      storeStockTarget: null
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      supplierSku: "AB-100",
      asin: "B0NEW",
      amazonStockTarget: 5,
      storeStockTarget: null
    })
    expect((await storedRows())[variant(1)]).toMatchObject({
      supplierSku: "AB-100",
      amazonStockTarget: 5,
      storeStockTarget: null
    })
    // Fields left out are kept; an empty text value clears it.
    expect((await save({ variantId: variant(1), supplierSku: "" })).status).toBe(200)
    const [saved] = await database
      .select()
      .from(tables.variantFields)
      .where(eq(tables.variantFields.variantId, variant(1)))
    expect([saved?.supplierSku, saved?.asin, saved?.amazonStockTarget]).toEqual([null, "B0NEW", 5])
  })

  // The HTTP boundary checks the origin (http-response.test.ts).
  it("rejects unknown variations, invalid values and supplier workspaces", async () => {
    const unknown = await save({ variantId: variant(99), supplierSku: "AB-1" })
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({
      error: "This product isn’t in your synced Shopify inventory. Sync Shopify and try again."
    })
    expect(await (await save({ variantId: variant(1), supplierSku: "x".repeat(256) })).json()).toEqual({
      error: "Enter a supplier SKU on one line, up to 255 characters"
    })
    expect(await (await save({ variantId: variant(1), amazonStockTarget: -1 })).json()).toEqual({
      error: "Enter a whole number of units, or leave it empty"
    })
    signedIn.actor = testSession({ orgId: supplierOrgId, kind: "supplier" })
    expect((await save({ variantId: variant(1), asin: "B0" })).status).toBe(403)
  })

  it("shows a product's new supplier in the stored stock right away", async () => {
    const [other] = await database.insert(tables.suppliers).values({ buyerOrgId: buyerId, name: "Unic" }).returning()
    await assignProductSupplier(testSession({ orgId: buyerId, kind: "buyer" }), {
      productIds: [product(1)],
      supplierId: other!.id
    })
    expect((await storedRows())[variant(2)]).toMatchObject({ supplierName: "Unic", supplierSku: "KEEP-2" })
  })
})
