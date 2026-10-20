import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { OrderInput } from "@repo/aisle"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/workspace-session"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
import { searchIndex } from "../src/server/search"
import { applyMigrations } from "./migrations"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  otherBuyerId = randomUUID(),
  supplierOrgId = randomUUID(),
  forwarderOrgId = randomUUID(),
  supplierId = randomUUID(),
  otherSupplierId = randomUUID(),
  forwarderId = randomUUID()
const domain = "fencing-club.myshopify.com"

const actor = (id: string, kind: "buyer" | "supplier" | "forwarder") =>
  ({ user: { id: `user-${id}` }, org: { id, kind }, role: "owner" }) as unknown as Session

async function order(
  reference: string,
  status: "draft" | "submitted",
  via?: OrderInput["via"],
  [buyerOrgId, link] = [buyerId, supplierId]
) {
  const items: OrderInput["items"] = []
  const destination: OrderInput["destination"] = "warehouse"
  const data = { reference, supplierId: link, currency: "USD", destination, items, via } as OrderInput
  const [row] = await database
    .insert(tables.orders)
    .values({ buyerOrgId, supplierId: link, shopifyDomain: domain, status, data })
    .returning()
  return row!
}

beforeAll(async () => {
  context.current = database
  await applyMigrations(pg)
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Fencing Club", kind: "buyer" },
    { id: otherBuyerId, name: "Other buyer", kind: "buyer" },
    { id: supplierOrgId, name: "Ok Fencing", kind: "supplier" },
    { id: forwarderOrgId, name: "Yiwu Logistics", kind: "forwarder" }
  ])
  await database.insert(tables.suppliers).values([
    {
      id: supplierId,
      buyerOrgId: buyerId,
      supplierOrgId,
      name: "Ok Fencing",
      email: "ok@example.com",
      shopifySupplierName: "SUZHOU BOPAC Teco CO., LTD"
    },
    // The other buyer's own supplier, which hasn't joined.
    { id: otherSupplierId, buyerOrgId: otherBuyerId, name: "Leon Paul" }
  ])
  await database
    .insert(tables.forwarders)
    .values({ id: forwarderId, buyerOrgId: buyerId, forwarderOrgId, name: "Yiwu Logistics" })
  await database
    .insert(tables.connections)
    .values({ orgId: buyerId, provider: "shopify", externalId: domain, encryptedToken: "token" })
  const level = (locationKind: string) => ({ locationId: "loc", locationName: "Store", locationKind, available: 1 })
  const rows = [
    {
      productId: "p1",
      variantId: "v1",
      productTitle: "Epee body cord",
      variantTitle: "Default Title",
      buyerSku: "CORD-E"
    },
    { productId: "p2", variantId: "v2", productTitle: "Glove", variantTitle: "6 / Left", buyerSku: "GLOVE-6L" },
    { productId: "p2", variantId: "v3", productTitle: "Glove", variantTitle: "7 / Left", buyerSku: "GLOVE-7L" },
    // Stocked and shipped by a Shopify Collective partner, which the Products page leaves out.
    { productId: "p3", variantId: "v4", productTitle: "Partner mask", buyerSku: "MASK", kind: "shopify_collective" }
  ].map(({ kind = "merchant", ...row }) => ({ ...row, imageUrl: null, levels: [level(kind)] }))
  await database.insert(tables.stockSnapshots).values({
    orgId: buyerId,
    source: "shopify",
    externalAccountId: domain,
    scopeKey: "store",
    data: { source: "shopify", rows } as unknown as typeof tables.stockSnapshots.$inferInsert.data
  })
})

afterAll(async () => {
  await pg.close()
})

describe("search index", () => {
  it("finds the workspace's own POs and shipments, newest first, with their Amazon IDs", async () => {
    await order("PO-1", "draft")
    const sent = await order("PO-2", "submitted", { forwarderId, addressId: randomUUID() })
    await order("PO-X", "submitted", undefined, [otherBuyerId, otherSupplierId])
    // One at a time, so the first is older.
    const [first] = await database
      .insert(tables.shipments)
      .values({ orderId: sent.id, orderRevision: 1, status: "shipped", amazonShipmentId: "FBA15ABC" })
      .returning()
    const [second] = await database
      .insert(tables.shipments)
      .values({ orderId: sent.id, orderRevision: 1, amazonOrderId: "STAR-9", forwarderReference: "1Z999" })
      .returning()

    const buyer = await searchIndex(actor(buyerId, "buyer"))
    expect(buyer.orders.map((row) => [row.reference, row.supplier, row.status, row.amazonIds.toSorted()])).toEqual([
      ["PO-2", "Ok Fencing", "submitted", ["FBA15ABC", "STAR-9"]],
      ["PO-1", "Ok Fencing", "draft", []]
    ])
    // A supplier doesn't see drafts, and a forwarder sees only the POs routed through it.
    expect((await searchIndex(actor(supplierOrgId, "supplier"))).orders.map((row) => row.id)).toEqual([sent.id])
    expect((await searchIndex(actor(forwarderOrgId, "forwarder"))).orders.map((row) => row.id)).toEqual([sent.id])
    expect((await searchIndex(actor(otherBuyerId, "buyer"))).orders.map((row) => row.reference)).toEqual(["PO-X"])
    // A shipment is named as its page names it, by its Amazon shipment ID or its place among its PO's shipments.
    expect(buyer.shipments).toEqual([
      {
        id: second!.id,
        title: "Shipment 2",
        reference: "PO-2",
        status: "packing",
        keywords: ["Shipment 2", "PO-2", "STAR-9", "1Z999"]
      },
      { id: first!.id, title: "FBA15ABC", reference: "PO-2", status: "shipped", keywords: ["FBA15ABC", "PO-2"] }
    ])
    // A forwarder can't open shipment pages.
    expect((await searchIndex(actor(supplierOrgId, "supplier"))).shipments).toHaveLength(2)
    expect((await searchIndex(actor(forwarderOrgId, "forwarder"))).shipments).toEqual([])
    expect((await searchIndex(actor(otherBuyerId, "buyer"))).shipments).toEqual([])
  })

  it("lists a buyer's products and partners as their pages do, and none for other workspaces", async () => {
    expect((await searchIndex(actor(buyerId, "buyer"))).products).toEqual([
      { id: "p1", title: "Epee body cord", imageUrl: null, keywords: ["CORD-E"] },
      { id: "p2", title: "Glove", imageUrl: null, keywords: ["6 / Left", "GLOVE-6L", "7 / Left", "GLOVE-7L"] }
    ])
    expect((await searchIndex(actor(supplierOrgId, "supplier"))).products).toEqual([])
    expect((await searchIndex(actor(otherBuyerId, "buyer"))).products).toEqual([])
    // A supplier is found by its legal name in Shopify too.
    expect((await searchIndex(actor(buyerId, "buyer"))).partners).toEqual([
      { id: supplierId, name: "Ok Fencing", type: "supplier", keywords: ["SUZHOU BOPAC Teco CO., LTD"] },
      { id: forwarderId, name: "Yiwu Logistics", type: "forwarder", keywords: [] }
    ])
    expect((await searchIndex(actor(otherBuyerId, "buyer"))).partners.map((partner) => partner.name)).toEqual([
      "Leon Paul"
    ])
    expect((await searchIndex(actor(supplierOrgId, "supplier"))).partners).toEqual([])
  })
})
