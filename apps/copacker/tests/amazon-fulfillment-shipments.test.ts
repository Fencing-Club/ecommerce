import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { Amazon } from "@repo/copacker-marketplaces/amazon"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { applySchema } from "./database"
const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import {
  amazonFulfillmentShipmentsStatus,
  syncAmazonFulfillmentShipments
} from "../src/server/amazon-fulfillment-shipments"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID(),
  otherId = randomUUID()
const now = new Date("2026-10-16T12:00:00Z")
const header =
  "amazon-order-id\tshipment-id\tshipment-item-id\tamazon-order-item-id\tshipment-date\tsku\tquantity-shipped\tfulfillment-center-id\tfulfillment-channel\tsales-channel"
const row = "ORDER1\tSHIP1\tSI1\tITEM1\t2026-10-02T00:00:00Z\tSKU1\t1\tFC1\tAFN\tAmazon.com"
const report = vi.fn<Amazon["report"]>()
const owned = vi.fn<() => Promise<void>>()
const input = { orgId, externalAccountId: "SELLER1", revision: 1, amazon: { report } }
beforeAll(async () => {
  context.database = database
  await applySchema(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  vi.resetAllMocks()
  await pg.exec("TRUNCATE organizations CASCADE")
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "SELLER1", encryptedToken: "test" })
  await database
    .insert(tables.salesSyncs)
    .values({ orgId, source: "amazon", externalAccountId: "SELLER1", revision: 1, status: "running" })
  report.mockImplementation(async (request) =>
    request.dataStartTime.startsWith("2026-10") ? `${header}\n${row}` : header
  )
})

it("budgets requests across runs and persists shipment evidence without stock postings", async () => {
  await syncAmazonFulfillmentShipments(input, owned, now)
  expect(report).toHaveBeenCalledTimes(10)
  expect(await database.select().from(tables.amazonFulfillmentShipments)).toHaveLength(1)
  expect(await database.select().from(tables.amazonShipmentRequests)).toHaveLength(10)
  expect(await database.select().from(tables.inventoryBasisRecords)).toHaveLength(0)
  report.mockClear()
  await syncAmazonFulfillmentShipments(input, owned, now)
  expect(report).not.toHaveBeenCalled()
  expect(
    (await amazonFulfillmentShipmentsStatus(orgId, "SELLER1", now)).windows.filter(
      (row) => row.status === "not_imported"
    )
  ).toHaveLength(3)
  const later = new Date(Math.max(now.getTime(), Date.now()) + 9 * 3600000)
  await syncAmazonFulfillmentShipments(input, owned, later)
  expect(report.mock.calls.length).toBeLessThanOrEqual(10)
  expect(await database.select().from(tables.amazonFulfillmentShipments)).toHaveLength(1)
})
it("keeps prior evidence when a refresh is cancelled or malformed", async () => {
  await syncAmazonFulfillmentShipments(input, owned, now)
  await database.delete(tables.amazonShipmentRequests)
  await database.update(tables.amazonShipmentReports).set({ checkedAt: new Date("2020-01-01") })
  report.mockResolvedValue(null)
  await syncAmazonFulfillmentShipments(input, owned, now)
  expect(await database.select().from(tables.amazonFulfillmentShipments)).toHaveLength(1)
  const status = await amazonFulfillmentShipmentsStatus(orgId, "SELLER1", now)
  expect(status.windows[0]).toMatchObject({ status: "unavailable", complete: false })
})
it("cannot publish after the connected seller changes", async () => {
  report.mockImplementationOnce(async () => {
    await database
      .update(tables.connections)
      .set({ externalId: "replacement" })
      .where(eq(tables.connections.orgId, orgId))
    return `${header}\n${row}`
  })
  await expect(syncAmazonFulfillmentShipments(input, owned, now)).rejects.toThrow("superseded")
  expect(await database.select().from(tables.amazonFulfillmentShipments)).toHaveLength(0)
})

it("moves a corrected shipment identity across months without duplication", async () => {
  await database.insert(tables.amazonFulfillmentShipments).values({
    orgId,
    externalAccountId: "SELLER1",
    marketplaceId: "ATVPDKIKX0DER",
    shipmentId: "SHIP1",
    shipmentItemId: "SI1",
    orderId: "ORDER1",
    orderItemId: "ITEM1",
    shippedAt: new Date("2026-09-30T23:00:00Z"),
    sku: "SKU1",
    quantity: 1
  })
  await database.insert(tables.amazonShipmentReports).values({
    orgId,
    externalAccountId: "SELLER1",
    marketplaceId: "ATVPDKIKX0DER",
    from: new Date("2026-09-01"),
    requestedTo: new Date("2026-10-01"),
    coveredTo: new Date("2026-10-01"),
    status: "imported",
    rowCount: 1,
    checkedAt: now
  })
  await syncAmazonFulfillmentShipments(input, owned, now)
  const rows = await database.select().from(tables.amazonFulfillmentShipments)
  expect(rows).toHaveLength(1)
  expect(rows[0]?.shippedAt).toEqual(new Date("2026-10-02"))
  expect((await amazonFulfillmentShipmentsStatus(orgId, "SELLER1", now)).windows[1]).toMatchObject({
    complete: false,
    errorCode: "shipment_date_changed"
  })
})
