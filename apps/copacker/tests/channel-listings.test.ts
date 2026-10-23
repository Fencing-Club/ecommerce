import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { channelListings, connections, jobs, organizations, stockSnapshots } from "../src/db/schema"
import { listingsJob, queueListings } from "../src/server/channel-listings"
import { jobPayloads } from "../src/server/job-payloads"
import { linkListing, readListings } from "../src/server/operation-listings"
import { scopedReadId } from "../src/server/operation-product-reads"
import { database, setUpTestDatabase, withTransaction } from "./test-db"
import { testSession } from "./test-session"

vi.mock("@/db", () => import("./test-db"))
const request = vi.hoisted(() => vi.fn<() => Promise<unknown>>())
vi.mock("../src/server/connections", () => ({ amazonFor: async () => ({ request }) }))
setUpTestDatabase({ truncate: true })
const orgId = randomUUID(),
  account = randomUUID(),
  shop = randomUUID()
const s = testSession({ orgId, kind: "buyer" })
const variantId = scopedReadId(shop, "shop.myshopify.com", "gid://shopify/ProductVariant/1")
const item = (sku: string) => ({
  sku,
  summaries: [{ marketplaceId: "ATVPDKIKX0DER", productType: "PRODUCT" }],
  offers: [{ marketplaceId: "ATVPDKIKX0DER", offerType: "B2C", price: { amount: "12.00", currencyCode: "USD" } }],
  fulfillmentAvailability: [{ fulfillmentChannelCode: "DEFAULT", quantity: 3 }]
})
beforeEach(async () => {
  request.mockReset()
  await database.delete(jobs)
  await database.insert(organizations).values({ id: orgId, name: "Buyer", kind: "buyer" })
  await database.insert(connections).values([
    { id: account, orgId, provider: "amazon", externalId: "SELLER", encryptedToken: "private" },
    { id: shop, orgId, provider: "shopify", externalId: "shop.myshopify.com", encryptedToken: "private" }
  ])
  await database.insert(stockSnapshots).values({
    orgId,
    source: "shopify",
    externalAccountId: "shop.myshopify.com",
    scopeKey: "store",
    data: {
      source: "shopify",
      shopifyDomain: "shop.myshopify.com",
      scopeKey: "store",
      startedAt: "2026-10-01T00:00:00Z",
      observedAt: "2026-10-01T00:00:00Z",
      rows: [
        {
          variantId: "gid://shopify/ProductVariant/1",
          productId: "gid://shopify/Product/1",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          buyerSku: "SKU",
          productTitle: "Product",
          supplierName: null,
          variantTitle: "Default Title",
          imageUrl: null,
          tracked: true,
          unit: "shopify_inventory_unit",
          levels: []
        }
      ]
    }
  })
})
async function queued() {
  const ids = await queueListings(orgId, account, "SELLER")
  const [job] = await database.select().from(jobs).where(eq(jobs.id, ids[0]!))
  return {
    input: jobPayloads.listings.parse(job!.payload),
    context: {
      assertOwned: async () => {
        await Promise.resolve()
      },
      owned: eq(jobs.id, job!.id)
    }
  }
}
const save = (input: Parameters<typeof linkListing>[1]) =>
  database.transaction((tx) => withTransaction(tx, () => linkListing(s, input)))
describe("current listing identities", () => {
  it("rejects conflicting observations across pages without retiring prior evidence", async () => {
    const { input, context } = await queued()
    request.mockResolvedValueOnce({ items: [item("DUPLICATE")], pagination: { nextToken: "second" } })
    await expect(listingsJob(input, context)).rejects.toThrow("Continue listing discovery")
    request.mockResolvedValueOnce({ items: [{ ...item("DUPLICATE"), offers: [] }] })
    await expect(listingsJob({ ...input, pageToken: "second", seenTokens: ["second"] }, context)).rejects.toThrow(
      "Listing identity changed during pagination"
    )
    expect((await readListings(s))[0]).toMatchObject({ active: true, price: { amountMinor: 1200 } })
  })
  it("isolates workspaces, redacts prices and refuses looping discovery", async () => {
    const { input, context } = await queued()
    request.mockResolvedValueOnce({ items: [item("SKU")] })
    await listingsJob(input, context)
    expect(await readListings(testSession({ orgId: randomUUID(), kind: "buyer" }))).toEqual([])
    const limited = testSession({ orgId, kind: "buyer", role: "member", access: { products: "view" } })
    expect((await readListings(limited))[0]).toMatchObject({ price: null, sellerSku: "SKU" })
    request.mockResolvedValueOnce({ items: [], pagination: { nextToken: "repeat" } })
    await expect(listingsJob({ ...input, seenTokens: ["repeat"] }, context)).rejects.toThrow(
      "Listing pagination did not complete"
    )
    expect((await readListings(s))[0]?.active).toBe(true)
  })
  it("discovers unmatched offers, guards links and preserves them across refreshes", async () => {
    const { input, context } = await queued()
    request.mockResolvedValue({ items: [item("UNMATCHED")] })
    await listingsJob(input, context)
    const [first] = await readListings(s)
    expect(first).toMatchObject({ sellerSku: "UNMATCHED", variantId: null, availability: 3 })
    const linked = await save({
      id: first!.id,
      expectedRevision: first!.revision,
      expectedLinkRevision: first!.linkRevision,
      variantId,
      piecesPerListing: 2,
      inventoryOwner: "manual"
    })
    expect(linked.linkRevision).toBe(1)
    await expect(save({ id: first!.id, expectedRevision: first!.revision, expectedLinkRevision: 0 })).rejects.toThrow(
      "Read the listing"
    )
    await listingsJob(input, context)
    const [refreshed] = await readListings(s)
    expect(refreshed).toMatchObject({
      id: first!.id,
      variantId,
      piecesPerListing: 2,
      inventoryOwner: "manual",
      linkRevision: 1
    })
    await expect(
      save({
        id: first!.id,
        expectedRevision: refreshed!.revision,
        expectedLinkRevision: 1,
        variantId: "foreign",
        piecesPerListing: 1
      })
    ).rejects.toThrow("Unlink the current variant")
    expect(
      (await save({ id: first!.id, expectedRevision: refreshed!.revision, expectedLinkRevision: 1 })).variantId
    ).toBeNull()
  })
  it("retires absent offers only after complete pagination and rejects replaced accounts", async () => {
    const { input, context } = await queued()
    request.mockResolvedValueOnce({ items: [item("OLD")] })
    await listingsJob(input, context)
    const next = { ...input, generation: randomUUID() }
    request.mockResolvedValueOnce({ items: [item("NEW")], pagination: { nextToken: "next" } })
    await expect(listingsJob(next, context)).rejects.toThrow("Continue listing discovery")
    expect((await readListings(s)).find((row) => row.sellerSku === "OLD")?.active).toBe(true)
    request.mockResolvedValueOnce({ items: [] })
    await listingsJob({ ...next, pageToken: "next", seenTokens: ["next"] }, context)
    expect((await readListings(s)).find((row) => row.sellerSku === "OLD")?.active).toBe(false)
    await database.update(connections).set({ externalId: "OTHER" }).where(eq(connections.id, account))
    expect(await readListings(s)).toEqual([])
    request.mockResolvedValue({ items: [item("FOREIGN")] })
    await expect(listingsJob(input, context)).rejects.toThrow("Listing account changed")
    expect((await database.select().from(channelListings)).some((row) => row.sellerSku === "FOREIGN")).toBe(false)
  })
})
