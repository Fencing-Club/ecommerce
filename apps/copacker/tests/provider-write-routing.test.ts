import { randomUUID } from "node:crypto"
import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import type { Shopify } from "@repo/copacker-marketplaces/shopify"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { channelListings, connections, organizations } from "../src/db/schema"
import { writeIntent } from "../src/server/provider-write-model"
import { resolveWrite } from "../src/server/provider-write-routing"
import { database, setUpTestDatabase } from "./test-db"
import { testSession } from "./test-session"

vi.mock("@/db", () => import("./test-db"))
const ids = vi.hoisted(() => ({
  org: "10000000-0000-4000-8000-000000000001",
  shop: "10000000-0000-4000-8000-000000000002",
  amazon: "10000000-0000-4000-8000-000000000003"
}))
const api = vi.hoisted(() => ({
  graphql: vi.fn<Shopify["graphql"]>(),
  stockLevelsPage: vi.fn<Shopify["stockLevelsPage"]>(),
  request: vi.fn<Amazon["request"]>()
}))
vi.mock("../src/server/connections", () => ({ shopifyFor: async () => api, amazonFor: async () => api }))
vi.mock("../src/server/operation-product-reads", async (original) => ({
  ...(await original<typeof import("../src/server/operation-product-reads")>()),
  readProducts: async () => ({
    items: [
      {
        variants: [
          {
            id: "variant",
            source: {
              connectionId: ids.shop,
              accountId: "shop.myshopify.com",
              provider: "shopify",
              externalId: "gid://shopify/ProductVariant/1"
            }
          }
        ]
      }
    ]
  })
}))
setUpTestDatabase({ truncate: true })
const s = testSession({ orgId: ids.org, kind: "buyer" })
const listingId = randomUUID()
const observed = () => ({
  shop: { myshopifyDomain: "shop.myshopify.com", currencyCode: "USD" },
  currentAppInstallation: { accessScopes: [{ handle: "write_products" }, { handle: "write_inventory" }] },
  productVariant: {
    id: "gid://shopify/ProductVariant/1",
    sku: "SKU",
    price: "10.00",
    requiresComponents: false,
    product: { id: "gid://shopify/Product/1" },
    inventoryItem: {
      id: "gid://shopify/InventoryItem/1",
      tracked: true,
      unitCost: { amount: "4.00", currencyCode: "USD" }
    }
  }
})
beforeEach(async () => {
  await database.insert(organizations).values({ id: ids.org, name: "Buyer", kind: "buyer" })
  await database.insert(connections).values([
    {
      id: ids.shop,
      orgId: ids.org,
      provider: "shopify",
      externalId: "shop.myshopify.com",
      encryptedToken: "private",
      scopes: "write_inventory,write_products"
    },
    { id: ids.amazon, orgId: ids.org, provider: "amazon", externalId: "SELLER", encryptedToken: "private" }
  ])
  await database.insert(channelListings).values({
    id: listingId,
    orgId: ids.org,
    connectionId: ids.amazon,
    accountId: "SELLER",
    marketplaceId: "ATVPDKIKX0DER",
    sellerSku: "OFFER",
    productType: "PRODUCT",
    fulfillmentMode: "fbm",
    amountMinor: 1000,
    currency: "USD",
    quantity: 4,
    variantId: "variant",
    piecesPerListing: 1,
    observedAt: new Date(),
    generation: randomUUID()
  })
  api.graphql.mockReset().mockResolvedValue(observed())
  api.request.mockReset().mockResolvedValue({
    sku: "OFFER",
    summaries: [{ marketplaceId: "ATVPDKIKX0DER", productType: "PRODUCT" }],
    offers: [{ marketplaceId: "ATVPDKIKX0DER", offerType: "B2C", price: { currencyCode: "USD", amount: "10.00" } }],
    fulfillmentAvailability: [{ fulfillmentChannelCode: "DEFAULT", quantity: 4 }]
  })
  api.stockLevelsPage.mockReset().mockResolvedValue({
    nodes: [
      {
        id: "level",
        location: {
          id: "gid://shopify/Location/1",
          name: "Warehouse",
          isFulfillmentService: false,
          fulfillmentService: null
        },
        quantities: [{ name: "available", quantity: 4 }]
      }
    ],
    pageInfo: { hasNextPage: false, endCursor: null }
  })
})
const preview = (change: unknown) => writeIntent.parse({ mode: "preview", variantId: "variant", change })
describe("provider field routing", () => {
  it("omits links from replaced accounts and identifies retired links that need unlinking", async () => {
    const change = { field: "price", amountMinor: 1200, currency: "USD" }
    await database.update(channelListings).set({ active: false }).where(eq(channelListings.id, listingId))
    await expect(resolveWrite(s, preview(change))).rejects.toThrow(listingId)
    await database.update(connections).set({ externalId: "REPLACED" }).where(eq(connections.id, ids.amazon))
    expect((await resolveWrite(s, preview(change))).map((target) => target.provider)).toEqual(["shopify"])
    expect(api.request).not.toHaveBeenCalled()
  })
  it("pins Shopify-only SKU ownership and actual scopes", async () => {
    const input = preview({ field: "sku", sku: "NEW" })
    const targets = await resolveWrite(s, input)
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ provider: "shopify", before: "SKU", desired: "NEW" })
    expect(input).toMatchObject({ expectedConnectionRevision: 0, change: { expectedSku: "SKU" } })
    api.graphql.mockResolvedValue({ ...observed(), currentAppInstallation: { accessScopes: [] } })
    await expect(resolveWrite(s, preview({ field: "sku", sku: "NEW" }))).rejects.toThrow("write_inventory")
  })
  it("includes all linked price targets and requires an explicit pack price", async () => {
    const change = { field: "price", amountMinor: 1200, currency: "USD" }
    expect((await resolveWrite(s, preview(change))).map((target) => target.desired)).toEqual([1200, 1200])
    await database.update(channelListings).set({ piecesPerListing: 6 }).where(eq(channelListings.id, listingId))
    await expect(resolveWrite(s, preview(change))).rejects.toThrow("explicit price")
    const targets = await resolveWrite(
      s,
      preview({ ...change, targetPrices: [{ listingId, amountMinor: 6500, currency: "USD" }] })
    )
    expect(targets.map((target) => target.desired)).toEqual([1200, 6500])
  })
  it("routes one merchant balance and rejects app-owned or excluded locations", async () => {
    const locationId = [ids.shop, "shop.myshopify.com", "gid://shopify/Location/1"].map(encodeURIComponent).join(":")
    const change = { field: "inventory", locationId, quantityState: "available", quantity: 10 }
    const targets = await resolveWrite(s, preview(change))
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({
      before: 4,
      desired: 10,
      quantityState: "available",
      locationExternalId: "gid://shopify/Location/1"
    })
    api.stockLevelsPage.mockResolvedValue({
      nodes: [
        {
          id: "level",
          location: {
            id: "gid://shopify/Location/1",
            name: "Warehouse",
            isFulfillmentService: true,
            fulfillmentService: null
          },
          quantities: [{ name: "available", quantity: 4 }]
        }
      ],
      pageInfo: { hasNextPage: false, endCursor: null }
    })
    await expect(resolveWrite(s, preview(change))).rejects.toThrow("another source")
    await database.update(connections).set({ inventoryLocations: [] }).where(eq(connections.id, ids.shop))
    await expect(resolveWrite(s, preview(change))).rejects.toThrow("excluded")
  })
  it("uses manually owned FBM offer availability and rejects physical stock semantics", async () => {
    const change = { field: "inventory", locationId: `listing:${listingId}`, quantityState: "available", quantity: 10 }
    await expect(resolveWrite(s, preview(change))).rejects.toThrow("manually managed")
    await database.update(channelListings).set({ inventoryOwner: "manual" }).where(eq(channelListings.id, listingId))
    const targets = await resolveWrite(s, preview(change))
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({
      provider: "amazon",
      role: "source",
      before: 4,
      desired: 10,
      unit: "amazon_sellable_unit"
    })
    await expect(resolveWrite(s, preview({ ...change, quantityState: "on_hand" }))).rejects.toThrow("not physical")
  })
})
