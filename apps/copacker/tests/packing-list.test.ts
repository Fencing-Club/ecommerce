import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/workspace-session"

const context = vi.hoisted(() => ({ current: null as unknown, actor: null as Session | null }))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))

import {
  defaultDocumentSettings,
  groupShippingCartons,
  type ShippingDocumentData
} from "../src/documents/shipping-model"
import { ShippingPdf } from "../src/documents/shipping-pdf"
import { cartonGroupLabel } from "../src/lib/carton-groups"
import { httpResponse } from "../src/server/http-response"
import { GET } from "../src/server/http/api/shipments/$id/packing-list"
import { towelOrder, towelPacking } from "../src/stories/fixtures/packing"
import { applySchema } from "./database"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const buyerId = randomUUID()
const supplierOrgId = randomUUID()
const strangerOrgId = randomUUID()
const supplierId = randomUUID()
const awd = {
  service: "agl",
  handoff: "forwarder",
  collection: "pickup",
  carrierLabels: "none",
  instructions: ""
} as const

function actor(id: string, kind: "buyer" | "supplier", access: Session["access"] = {}): Session {
  return {
    user: { id: `user-${id}`, email: "owner@example.com", emailVerified: true, name: "Olive Owner" },
    org: {
      id,
      kind,
      name: kind,
      workosId: null,
      timeZone: null,
      excludedShopifyTags: [],
      restockSalesDays: null,
      restockLeadTimeDays: null,
      createdAt: new Date()
    },
    role: Object.keys(access).length ? "member" : "owner",
    access,
    workspaces: []
  }
}
// Someone at the supplier who packs shipments but can't open purchase orders.
const packer = () => actor(supplierOrgId, "supplier", { shipments: "edit" })

// PO38's first shipment, as the 06 boards show it; the tea towels have no supplier SKU of their own.
async function shipment(values: Partial<typeof tables.shipments.$inferInsert> = {}) {
  const data = {
    ...towelOrder,
    supplierId,
    items: towelOrder.items.map((item) => (item.buyerSku === "CT-3100" ? { ...item, supplierSku: "" } : item))
  }
  const [order] = await database
    .insert(tables.orders)
    .values({ buyerOrgId: buyerId, supplierId, shopifyDomain: "shop.myshopify.com", status: "submitted", data })
    .returning()
  const [first] = await database
    .insert(tables.shipments)
    .values({
      orderId: order!.id,
      orderRevision: 1,
      revision: 3,
      status: "packed",
      amazonNetwork: "awd_us",
      packing: towelPacking(),
      snapshot: data,
      transport: awd,
      createdAt: new Date("2026-10-18T00:00:00Z"),
      ...values
    })
    .returning()
  // A later shipment of the same PO, so the first stays Shipment 1.
  await database
    .insert(tables.shipments)
    .values({ orderId: order!.id, orderRevision: 1, createdAt: new Date("2026-10-19T00:00:00Z") })
  return first!
}

const download = (id: string) =>
  httpResponse(() =>
    GET(new Request(`http://localhost/api/shipments/${id}/packing-list`), {
      params: { id }
    })
  )

beforeAll(async () => {
  await applySchema(pg)
  context.current = database
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Harbor Goods", kind: "buyer" },
    { id: supplierOrgId, name: "Northwind Textiles", kind: "supplier" },
    { id: strangerOrgId, name: "Elsewhere Supply", kind: "supplier" }
  ])
  await database.insert(tables.suppliers).values({
    id: supplierId,
    buyerOrgId: buyerId,
    supplierOrgId,
    name: "Northwind Textiles",
    email: "orders@northwind.example.com"
  })
})

beforeEach(() => {
  context.actor = packer()
})

afterAll(async () => {
  await pg.close()
})

describe("packing list", () => {
  it("gives whoever packs a packed shipment its packing list, before Amazon's labels exist", async () => {
    const packed = await shipment()
    const response = await download(packed.id)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    const { data } = (await response.json()) as { data: ShippingDocumentData }
    expect(data).toMatchObject({
      company: "Harbor Goods",
      order: "PO38",
      revision: 3,
      shipment: "Shipment 1",
      recipient: { name: "Northwind Textiles" },
      destination: { name: "Amazon AWD US", address: [] },
      network: "awd",
      transport: { service: "agl", collection: "pickup", carrierLabels: false },
      instructions: ""
    })
    // A line without a supplier SKU is listed by the buyer's, as the packing page shows it.
    expect(data.products.map((product) => product.supplierSku)).toEqual(["NT-WB-2210", "NT-WB-2214", "CT-3100"])
    expect(data.cartons).toHaveLength(18)
    expect(data.cartons.every((carton) => !carton.amazonLabel && !carton.carrierLabel)).toBe(true)
    expect(data.cartons.at(-1)).toMatchObject({ id: "C2", contents: [{ packs: 30 }] })
    // The carton groups it prints: each group's cartons, product and packs. The tea towels come in packs of 2.
    const [natural, sage, teaTowel] = towelOrder.items
    expect(
      groupShippingCartons(data.cartons).map((group) => ({
        cartons: cartonGroupLabel(group),
        contents: group[0]!.contents
      }))
    ).toEqual([
      { cartons: "A1–A10", contents: [{ productId: natural!.id, packs: 24 }] },
      { cartons: "B1–B6", contents: [{ productId: sage!.id, packs: 30 }] },
      { cartons: "C1–C2", contents: [{ productId: teaTowel!.id, packs: 30 }] }
    ])

    // The browser prints it as it comes, without label assignments.
    expect(() =>
      ShippingPdf({ data, kind: "packing", settings: defaultDocumentSettings, packingRecord: true })
    ).not.toThrow()
  })

  it("names the shipment by its Amazon ID once it has one, for the buyer too", async () => {
    const ready = await shipment({ status: "ready", amazonShipmentId: "STAR-4XM29CQ" })
    context.actor = actor(buyerId, "buyer")
    const response = await download(ready.id)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { shipment: "STAR-4XM29CQ", company: "Harbor Goods" }
    })
  })

  it("has no packing list until packing is finished, or once it's reopened", async () => {
    for (const status of ["packing", "correction", "cancelled"] as const) {
      const unfinished = await shipment({ status })
      const response = await download(unfinished.id)
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: "The packing list is available once packing is finished" })
    }
    const draft = await shipment({ packing: null, packingDraft: towelPacking(), status: "packed" })
    expect((await download(draft.id)).status).toBe(409)
  })

  it("keeps to who can open the shipment's labels", async () => {
    const packed = await shipment()
    // Without Shipments access.
    context.actor = actor(supplierOrgId, "supplier", { orders: "view" })
    expect((await download(packed.id)).status).toBe(403)
    // Another supplier can't open the purchase order.
    context.actor = actor(strangerOrgId, "supplier")
    expect((await download(packed.id)).status).toBe(404)
    // An unknown shipment, and a malformed link.
    context.actor = packer()
    expect((await download(randomUUID())).status).toBe(404)
    expect((await download("abc")).status).toBe(404)
  })
})
