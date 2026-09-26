import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { ProviderError } from "@repo/aisle/amazon"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
const amazon = vi.hoisted(() => ({
  request: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  // The seller also sells in Canada.
  salesMarketplaces: async () => ["ATVPDKIKX0DER", "A2EUQ1WTGCTBG2"],
  subscribeNotifications: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  notificationDestination: vi.fn<(...args: unknown[]) => Promise<string>>()
}))
vi.mock("../src/server/connections", async (original) => ({
  ...(await original<typeof import("../src/server/connections")>()),
  amazonFor: async () => amazon,
  amazonApp: () => amazon
}))
import {
  amazonEventJob,
  amazonNotificationTypes,
  amazonQueueArn,
  amazonSubscribeJob,
  pollAmazonNotifications,
  receiveAmazonNotification
} from "../src/server/amazon-notifications"
import { PollAgain } from "../src/server/job-handlers"
import { runNextJob } from "../src/server/queue"
import { salesDataVersion } from "../src/server/sales-orders"
import { applyMigrations } from "./migrations"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  otherBuyerId = randomUUID()
const sellerId = "A123456789"
const queueUrl = "https://sqs.us-east-1.amazonaws.com/316338643347/copacker-amazon-notifications"
const now = Date.parse("2026-09-25T12:01:00Z")
const owned = vi.fn<() => Promise<void>>()

const orderChange = (seller = sellerId) =>
  JSON.stringify({
    NotificationVersion: "1.0",
    NotificationType: "ORDER_CHANGE",
    PayloadVersion: "1.0",
    EventTime: "2026-09-25T12:00:00Z",
    Payload: {
      OrderChangeNotification: {
        SellerId: seller,
        AmazonOrderId: "111-1",
        OrderChangeType: "OrderStatusChange",
        Summary: { OrderStatus: "Shipped", OrderItems: [{ SellerSKU: "foil-2", Quantity: 1 }] }
      }
    },
    NotificationMetadata: { NotificationId: "n1" }
  })
const inventoryChange = JSON.stringify({
  NotificationType: "FBA_INVENTORY_AVAILABILITY_CHANGES",
  Payload: { FBAInventoryAvailabilityChangeNotification: { SellerId: sellerId, SKU: "foil-2" } }
})
const amazonOrder = (orderId: string, createdTime: string, quantity: number) => ({
  orderId,
  createdTime,
  salesChannel: { channelName: "AMAZON", marketplaceId: "ATVPDKIKX0DER" },
  fulfillment: { fulfillmentStatus: "SHIPPED", fulfilledBy: "AMAZON" },
  orderItems: [
    {
      orderItemId: `${orderId}-1`,
      quantityOrdered: quantity,
      product: { sellerSku: "foil-2" },
      fulfillment: { quantityFulfilled: quantity, quantityUnfulfilled: 0 }
    }
  ]
})
async function connect(orgId: string, externalId = sellerId) {
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId, encryptedToken: "test-only" })
}
const queued = (kind: string) =>
  database
    .select()
    .from(tables.jobs)
    .then((rows) => rows.filter((row) => row.kind === kind))

beforeAll(async () => {
  context.current = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
afterEach(() => {
  vi.unstubAllEnvs()
})
beforeEach(async () => {
  vi.resetAllMocks()
  await pg.exec("TRUNCATE organizations, jobs CASCADE")
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: otherBuyerId, name: "Other buyer", kind: "buyer" }
  ])
  await connect(buyerId)
})

describe("Amazon notifications from the queue", () => {
  it("gathers order changes into one update per connected workspace, and stock changes into a refresh", async () => {
    await connect(otherBuyerId)
    expect(await receiveAmazonNotification(orderChange(), now)).toBe(2)
    expect(await receiveAmazonNotification(orderChange(), now + 60000)).toBe(2)
    const jobs = await queued("amazon-event")
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({ payload: { sellerId, target: "sales" }, runAt: new Date("2026-09-25T12:08:00Z") })
    await receiveAmazonNotification(inventoryChange, now)
    expect((await queued("amazon-event")).filter((job) => job.payload.target === "stock")).toHaveLength(2)
  })

  it("drops notifications it can't use", async () => {
    expect(await receiveAmazonNotification("not json", now)).toBe(0)
    expect(await receiveAmazonNotification(JSON.stringify({ NotificationType: "ANY_OFFER_CHANGED" }), now)).toBe(0)
    expect(await receiveAmazonNotification(orderChange("B000000000"), now)).toBe(0)
    expect(await database.select().from(tables.jobs)).toEqual([])
  })

  it("removes each message only once its work is queued", async () => {
    const order: string[] = []
    const queue = {
      receive: vi.fn<() => Promise<{ body: string; handle: string }[]>>().mockResolvedValue([
        { body: orderChange(), handle: "h1" },
        { body: "not json", handle: "h2" }
      ]),
      remove: vi.fn<(handle: string) => Promise<void>>(async (handle) => {
        order.push(`${handle}:${(await queued("amazon-event")).length}`)
      })
    }
    expect(await pollAmazonNotifications(queue, () => now)).toBe(2)
    expect(order).toEqual(["h1:1", "h2:1"])
  })

  it("keeps a message whose work couldn't be queued, so it's received again", async () => {
    const queue = {
      receive: vi
        .fn<() => Promise<{ body: string; handle: string }[]>>()
        .mockResolvedValue([{ body: orderChange(), handle: "h1" }]),
      remove: vi.fn<(handle: string) => Promise<void>>()
    }
    context.current = {
      select: () => {
        throw new Error("database unavailable")
      }
    }
    await expect(pollAmazonNotifications(queue, () => now)).rejects.toThrow("database unavailable")
    context.current = database
    expect(queue.remove).not.toHaveBeenCalled()
  })
})

describe("Amazon order updates", () => {
  const coveredFrom = new Date("2025-09-25T00:00:00Z"),
    coveredTo = new Date("2026-09-25T07:00:00Z")
  async function storedSync(values: Partial<typeof tables.salesSyncs.$inferInsert> = {}) {
    await database.insert(tables.salesSyncs).values({
      orgId: buyerId,
      source: "amazon",
      externalAccountId: sellerId,
      status: "idle",
      revision: 1,
      coveredFrom,
      coveredTo,
      dataVersion: salesDataVersion,
      ...values
    })
  }

  it("saves only the orders changed since the stored end, and extends the stored period", async () => {
    await storedSync()
    await database.insert(tables.salesOrders).values({
      orgId: buyerId,
      source: "amazon",
      externalAccountId: sellerId,
      orderId: "111-1",
      orderedAt: new Date("2026-09-20T00:00:00Z"),
      data: amazonOrder("111-1", "2026-09-20T00:00:00Z", 1)
    })
    amazon.request.mockResolvedValue({
      orders: [
        amazonOrder("111-1", "2026-09-20T00:00:00Z", 3),
        amazonOrder("111-2", "2026-09-25T11:00:00Z", 2),
        // Placed before the stored year; not kept.
        amazonOrder("110-9", "2025-01-01T00:00:00Z", 1)
      ]
    })
    await amazonEventJob({ orgId: buyerId, sellerId, target: "sales" }, owned, now)
    const query = new URL(String(amazon.request.mock.calls[0]?.[1]), "https://amazon.test").searchParams
    expect(query.get("lastUpdatedAfter")).toBe("2026-09-25T06:55:00.000Z")
    expect(query.get("marketplaceIds")).toBe("ATVPDKIKX0DER,A2EUQ1WTGCTBG2")
    const stored = await database.select().from(tables.salesOrders)
    expect(
      stored
        .map((row) => [row.orderId, "orderItems" in row.data ? row.data.orderItems[0]?.quantityOrdered : null])
        .sort()
    ).toEqual([
      ["111-1", 3],
      ["111-2", 2]
    ])
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync?.coveredTo).toEqual(new Date("2026-09-25T11:58:00Z"))
  })

  it("runs a full sync when nothing current is stored, and waits for one that is running", async () => {
    await amazonEventJob({ orgId: buyerId, sellerId, target: "sales" }, owned, now)
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ status: "queued" })
    expect(amazon.request).not.toHaveBeenCalled()
    await pg.exec(`UPDATE sales_syncs SET status = 'running'`)
    await expect(amazonEventJob({ orgId: buyerId, sellerId, target: "sales" }, owned, now)).rejects.toBeInstanceOf(
      PollAgain
    )
  })

  it("reads everything again when the stored orders are old or in an older shape", async () => {
    await storedSync({ dataVersion: salesDataVersion - 1 })
    await amazonEventJob({ orgId: buyerId, sellerId, target: "sales" }, owned, now)
    expect((await database.select().from(tables.salesSyncs))[0]).toMatchObject({ status: "queued", revision: 2 })
    expect(amazon.request).not.toHaveBeenCalled()
  })

  it("comes back after Amazon's interval when order reads are throttled, instead of waiting in the worker", async () => {
    await storedSync()
    amazon.request.mockRejectedValue(new ProviderError(429, null, "Amazon request failed (429)", 5000))
    const attempt = amazonEventJob({ orgId: buyerId, sellerId, target: "sales" }, owned, now)
    await expect(attempt).rejects.toBeInstanceOf(PollAgain)
    await expect(attempt).rejects.toMatchObject({ options: { delayMs: 180000 } })
    expect(amazon.request).toHaveBeenCalledTimes(1)
    expect((await database.select().from(tables.salesSyncs))[0]?.coveredTo).toEqual(coveredTo)
  })

  it("waits for a queued full sync instead of writing beside it", async () => {
    await storedSync({ status: "queued" })
    await expect(amazonEventJob({ orgId: buyerId, sellerId, target: "sales" }, owned, now)).rejects.toBeInstanceOf(
      PollAgain
    )
  })

  it("refreshes FBA stock, and ignores a seller the workspace no longer uses", async () => {
    await amazonEventJob({ orgId: buyerId, sellerId, target: "stock" }, owned, now)
    expect(await database.select().from(tables.stockSnapshots)).toMatchObject([
      { source: "fba", scopeKey: "ATVPDKIKX0DER", status: "queued" }
    ])
    await amazonEventJob({ orgId: buyerId, sellerId: "B000000000", target: "sales" }, owned, now)
    expect(await database.select().from(tables.salesSyncs)).toEqual([])
  })
})

describe("Amazon notification subscriptions", () => {
  it("reads the queue's ARN from its URL", () => {
    expect(amazonQueueArn(queueUrl)).toBe("arn:aws:sqs:us-east-1:316338643347:copacker-amazon-notifications")
    expect(() => amazonQueueArn("https://example.com/queue")).toThrow("SQS queue URL")
  })

  it("subscribes the seller to each notification at the queue's destination", async () => {
    vi.stubEnv("AMAZON_NOTIFICATIONS_QUEUE_URL", queueUrl)
    amazon.notificationDestination.mockResolvedValue("dest")
    await amazonSubscribeJob({ orgId: buyerId }, owned)
    expect(amazon.notificationDestination).toHaveBeenCalledWith(amazonQueueArn(queueUrl), "copacker")
    expect(amazon.subscribeNotifications.mock.calls).toEqual([
      [
        "ORDER_CHANGE",
        "dest",
        {
          eventFilter: {
            eventFilterType: "ORDER_CHANGE",
            orderChangeTypes: ["OrderStatusChange", "BuyerRequestedChange"]
          }
        }
      ],
      ["FBA_INVENTORY_AVAILABILITY_CHANGES", "dest", undefined]
    ])
    await amazonSubscribeJob({ orgId: otherBuyerId }, owned)
    expect(amazon.subscribeNotifications).toHaveBeenCalledTimes(amazonNotificationTypes.length)
  })

  it("logs a job that fails, with the provider's reason", async () => {
    vi.stubEnv("AMAZON_NOTIFICATIONS_QUEUE_URL", queueUrl)
    amazon.notificationDestination.mockRejectedValue(new Error("Amazon request failed (400): InvalidInput bad ARN"))
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
    await database
      .insert(tables.jobs)
      .values({ key: "amazon-subscribe:test", kind: "amazon-subscribe", payload: { orgId: buyerId } })
    await runNextJob()
    const [job] = await queued("amazon-subscribe")
    expect(job).toMatchObject({ status: "failed", error: "Amazon request failed (400): InvalidInput bad ARN" })
    expect(JSON.parse(String(logged.mock.calls[0]?.[0]))).toMatchObject({
      event: "job_failed",
      kind: "amazon-subscribe",
      key: "amazon-subscribe:test",
      attempt: 1,
      error: { message: "Amazon request failed (400): InvalidInput bad ARN" }
    })
    logged.mockRestore()
  })

  it("says which notification type Amazon refused", async () => {
    vi.stubEnv("AMAZON_NOTIFICATIONS_QUEUE_URL", queueUrl)
    amazon.notificationDestination.mockResolvedValue("dest")
    amazon.subscribeNotifications
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("Amazon request failed (400)"))
    await expect(amazonSubscribeJob({ orgId: buyerId }, owned)).rejects.toThrow(
      "Amazon FBA_INVENTORY_AVAILABILITY_CHANGES subscription failed: Amazon request failed (400)"
    )
  })

  it("skips subscribing when no queue is configured", async () => {
    vi.stubEnv("AMAZON_NOTIFICATIONS_QUEUE_URL", "")
    await amazonSubscribeJob({ orgId: buyerId }, owned)
    expect(amazon.notificationDestination).not.toHaveBeenCalled()
  })
})

describe("job queue", () => {
  it("lets concurrent workers claim different jobs, past one that is still running", async () => {
    vi.stubEnv("AMAZON_NOTIFICATIONS_QUEUE_URL", "")
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    await database.insert(tables.jobs).values([
      // A long job another worker loop holds; its lease is fresh.
      { key: "sales:long", kind: "sales", payload: {}, status: "running", attempts: 1, leaseAt: new Date() },
      { key: "amazon-subscribe:a", kind: "amazon-subscribe", payload: { orgId: buyerId } },
      { key: "amazon-subscribe:b", kind: "amazon-subscribe", payload: { orgId: otherBuyerId } }
    ])
    expect((await Promise.all([runNextJob(), runNextJob(), runNextJob()])).sort()).toEqual([false, true, true])
    const rows = await database.select().from(tables.jobs)
    expect(rows.map((row) => [row.key, row.status, row.attempts]).sort()).toEqual([
      ["amazon-subscribe:a", "complete", 1],
      ["amazon-subscribe:b", "complete", 1],
      ["sales:long", "running", 1]
    ])
    warned.mockRestore()
  })
})
