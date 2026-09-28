import { createSign, generateKeyPairSync, randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"

const context = vi.hoisted(() => ({ current: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.current }))
// eBay as the app sees it (destinations, signing keys) and as a seller sees it (subscriptions).
const ebay = vi.hoisted(() => ({
  app: {
    destinations: vi.fn<() => Promise<unknown[]>>(),
    createDestination: vi.fn<(...args: string[]) => Promise<string>>(),
    updateDestination: vi.fn<(...args: string[]) => Promise<void>>(),
    publicKey: vi.fn<(keyId: string) => Promise<{ algorithm: string; digest: string; key: string }>>()
  },
  seller: {
    subscriptions: vi.fn<() => Promise<unknown[]>>(),
    subscribe: vi.fn<(...args: string[]) => Promise<void>>(),
    enableSubscription: vi.fn<(id: string) => Promise<void>>()
  }
}))
vi.mock("@repo/aisle/ebay", async (original) => ({
  ...(await original<typeof import("@repo/aisle/ebay")>()),
  Ebay: class {
    destinations = ebay.app.destinations
    createDestination = ebay.app.createDestination
    updateDestination = ebay.app.updateDestination
    publicKey = ebay.app.publicKey
  }
}))
vi.mock("../src/server/connections", async (original) => ({
  ...(await original<typeof import("../src/server/connections")>()),
  ebayFor: async () => ebay.seller
}))
import { POST } from "../src/app/api/webhooks/ebay/route"
import {
  ebayEventJob,
  type EbayNotification,
  ebaySubscribeJob,
  forwardEbayNotification,
  pollEbayEvents,
  receiveEbayEvent,
  receiveEbayNotification
} from "../src/server/ebay-events"
import { PollAgain } from "../src/server/job-handlers"
import { reconcileJob } from "../src/server/reconcile"
import { applyMigrations } from "./migrations"

const pg = new PGlite(),
  database = drizzle(pg, { schema: tables })
const buyerId = randomUUID(),
  otherBuyerId = randomUUID()
const seller = "vWvOsUq8KJk"
const owned = vi.fn<() => Promise<void>>()

function orderConfirmation(userId = seller, orderId = "12-34567-89012"): EbayNotification {
  return {
    metadata: { topic: "ORDER_CONFIRMATION" },
    notification: {
      notificationId: `n-${orderId}`,
      data: {
        user: { userId, username: "fencing_club" },
        order: { orderId, orderLineItems: [{ orderLineItemId: "1", listingId: "2", quantity: 1 }] }
      }
    }
  }
}
function deletion(userId: string): EbayNotification {
  return {
    metadata: { topic: "MARKETPLACE_ACCOUNT_DELETION" },
    notification: { notificationId: `d-${userId}`, data: { username: "someone", userId, eiasToken: "abc" } }
  }
}
async function connect(orgId: string, externalId = seller) {
  await database.insert(tables.connections).values({ orgId, provider: "ebay", externalId, encryptedToken: "test-only" })
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
  vi.useRealTimers()
})
beforeEach(async () => {
  vi.resetAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  await pg.exec("TRUNCATE organizations, jobs CASCADE")
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: otherBuyerId, name: "Other buyer", kind: "buyer" }
  ])
  await connect(buyerId)
})

describe("eBay order notifications", () => {
  it("gathers a burst of orders into one sync per connected workspace, after the orders settle", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-28T12:01:00Z"), toFake: ["Date"] })
    await connect(otherBuyerId)
    expect(await receiveEbayNotification(orderConfirmation())).toBe(2)
    expect(await receiveEbayNotification(orderConfirmation(seller, "12-00000-00001"))).toBe(2)
    const jobs = await queued("ebay-event")
    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => job.payload.orgId).toSorted()).toEqual([buyerId, otherBuyerId].toSorted())
    expect(jobs[0]).toMatchObject({ payload: { userId: seller }, runAt: new Date("2026-09-28T12:08:00Z") })
  })

  it("leaves out other sellers and topics it doesn't subscribe to", async () => {
    expect(await receiveEbayNotification(orderConfirmation("someone-else"))).toBe(0)
    expect(
      await receiveEbayNotification({
        metadata: { topic: "ITEM_PRICE_REVISION" },
        notification: { notificationId: "x", data: { userId: seller } }
      })
    ).toBe(0)
    expect(
      await receiveEbayNotification({
        metadata: { topic: "ORDER_CONFIRMATION" },
        notification: { notificationId: "y" }
      })
    ).toBe(0)
    expect(await queued("ebay-event")).toEqual([])
  })

  it("starts the order sync, and waits for one already running", async () => {
    await ebayEventJob({ orgId: buyerId, userId: seller })
    const [sync] = await database.select().from(tables.salesSyncs)
    expect(sync).toMatchObject({ source: "ebay", externalAccountId: seller, status: "queued" })
    expect(await queued("sales")).toMatchObject([{ payload: { orgId: buyerId, source: "ebay", revision: 1 } }])
    await pg.exec(`UPDATE sales_syncs SET status = 'running'`)
    await pg.exec(`UPDATE jobs SET status = 'running'`)
    await expect(ebayEventJob({ orgId: buyerId, userId: seller })).rejects.toBeInstanceOf(PollAgain)
  })

  it("does nothing for a workspace that disconnected or switched accounts", async () => {
    await ebayEventJob({ orgId: buyerId, userId: "old-account" })
    await ebayEventJob({ orgId: otherBuyerId, userId: seller })
    expect(await database.select().from(tables.salesSyncs)).toEqual([])
  })
})

describe("eBay account deletion", () => {
  it("erases a closed seller's connection, orders and syncs from every workspace, and nothing else", async () => {
    await connect(otherBuyerId, "another-seller")
    const order = (orgId: string, account: string) => ({
      orgId,
      source: "ebay" as const,
      externalAccountId: account,
      orderId: `${account}-1`,
      orderedAt: new Date("2026-09-01T00:00:00Z"),
      data: {
        orderId: `${account}-1`,
        creationDate: "2026-09-01T00:00:00.000Z",
        orderFulfillmentStatus: "FULFILLED",
        lineItems: []
      }
    })
    await database.insert(tables.salesOrders).values([order(buyerId, seller), order(otherBuyerId, "another-seller")])
    await database.insert(tables.salesSyncs).values([
      { orgId: buyerId, source: "ebay", externalAccountId: seller },
      { orgId: otherBuyerId, source: "ebay", externalAccountId: "another-seller" }
    ])
    expect(await receiveEbayNotification(deletion(seller))).toBe(1)
    const left = await database.select().from(tables.connections)
    expect(left.map((row) => row.externalId)).toEqual(["another-seller"])
    expect((await database.select().from(tables.salesOrders)).map((row) => row.externalAccountId)).toEqual([
      "another-seller"
    ])
    expect((await database.select().from(tables.salesSyncs)).map((row) => row.externalAccountId)).toEqual([
      "another-seller"
    ])
  })

  it("keeps nothing about buyers, so a buyer's deletion changes nothing", async () => {
    expect(await receiveEbayNotification(deletion("a-buyer"))).toBe(0)
    expect(await database.select().from(tables.connections)).toHaveLength(1)
  })
})

describe("eBay events from EventBridge", () => {
  const envelope = (detail: unknown, source = "copacker.ebay") =>
    JSON.stringify({ version: "0", id: "e-1", "detail-type": "ORDER_CONFIRMATION", source, detail })

  it("queues the work a forwarded notification calls for", async () => {
    expect(await receiveEbayEvent(envelope(orderConfirmation()))).toBe(true)
    expect(await queued("ebay-event")).toHaveLength(1)
  })

  it("drops a message that isn't one of Copacker's eBay events", async () => {
    expect(await receiveEbayEvent("not json")).toBe(false)
    expect(await receiveEbayEvent(envelope(orderConfirmation(), "aws.partner/shopify.com"))).toBe(false)
    expect(await queued("ebay-event")).toEqual([])
  })

  it("removes each message from the queue once it's handled", async () => {
    const remove = vi.fn<(handle: string) => Promise<void>>()
    const queue = {
      receive: async () => [{ body: envelope(orderConfirmation()), handle: "h-1" }],
      remove
    }
    expect(await pollEbayEvents(queue)).toBe(1)
    expect(remove).toHaveBeenCalledWith("h-1")
  })

  it("sends a notification to the event bus when one is set, and handles it here otherwise", async () => {
    const send = vi.fn<(bus: string, notification: EbayNotification) => Promise<void>>()
    vi.stubEnv("EBAY_EVENT_BUS", "default")
    expect(await forwardEbayNotification(orderConfirmation(), send)).toBe("forwarded")
    expect(send).toHaveBeenCalledWith("default", orderConfirmation())
    expect(await queued("ebay-event")).toEqual([])
    vi.stubEnv("EBAY_EVENT_BUS", "")
    expect(await forwardEbayNotification(orderConfirmation(), send)).toBe("handled")
    expect(send).toHaveBeenCalledOnce()
    expect(await queued("ebay-event")).toHaveLength(1)
  })
})

describe("eBay notification subscriptions", () => {
  const endpoint = "https://copacker.ai/api/webhooks/ebay"
  beforeEach(() => {
    vi.stubEnv("APP_URL", "https://copacker.ai")
    vi.stubEnv("EBAY_CLIENT_ID", "Copacker-PRD")
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret")
    vi.stubEnv("EBAY_RU_NAME", "Copacker-RuName")
    vi.stubEnv("EBAY_VERIFICATION_TOKEN", "copacker_ebay-verification-token-0123456789")
  })

  it("creates the destination once and subscribes the seller to confirmed orders", async () => {
    ebay.app.destinations.mockResolvedValue([])
    ebay.app.createDestination.mockResolvedValue("dest-1")
    ebay.seller.subscriptions.mockResolvedValue([])
    await ebaySubscribeJob({ orgId: buyerId }, owned)
    expect(ebay.app.createDestination).toHaveBeenCalledWith(
      "Copacker",
      endpoint,
      "copacker_ebay-verification-token-0123456789"
    )
    expect(ebay.seller.subscribe).toHaveBeenCalledWith("ORDER_CONFIRMATION", "dest-1")
  })

  it("reuses the destination and turns a disabled subscription back on", async () => {
    ebay.app.destinations.mockResolvedValue([
      { destinationId: "dest-1", status: "ENABLED", deliveryConfig: { endpoint } }
    ])
    ebay.seller.subscriptions.mockResolvedValue([
      { subscriptionId: "sub-1", topicId: "ORDER_CONFIRMATION", status: "DISABLED", destinationId: "dest-1" }
    ])
    await ebaySubscribeJob({ orgId: buyerId }, owned)
    expect(ebay.app.createDestination).not.toHaveBeenCalled()
    expect(ebay.seller.subscribe).not.toHaveBeenCalled()
    expect(ebay.seller.enableSubscription).toHaveBeenCalledWith("sub-1")
  })

  it("turns a destination eBay marked down back on", async () => {
    ebay.app.destinations.mockResolvedValue([
      { destinationId: "dest-1", status: "MARKED_DOWN", deliveryConfig: { endpoint } }
    ])
    ebay.seller.subscriptions.mockResolvedValue([
      { subscriptionId: "sub-1", topicId: "ORDER_CONFIRMATION", status: "ENABLED" }
    ])
    await ebaySubscribeJob({ orgId: buyerId }, owned)
    expect(ebay.app.updateDestination).toHaveBeenCalledWith(
      "dest-1",
      "Copacker",
      endpoint,
      "copacker_ebay-verification-token-0123456789"
    )
  })

  it("names the topic eBay refused", async () => {
    ebay.app.destinations.mockResolvedValue([])
    ebay.app.createDestination.mockResolvedValue("dest-1")
    ebay.seller.subscriptions.mockResolvedValue([])
    ebay.seller.subscribe.mockRejectedValue(new Error("eBay request failed (403)"))
    await expect(ebaySubscribeJob({ orgId: buyerId }, owned)).rejects.toThrow(
      "eBay ORDER_CONFIRMATION subscription failed: eBay request failed (403)"
    )
  })

  it("skips subscribing where eBay can't deliver, such as local development", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000")
    await ebaySubscribeJob({ orgId: buyerId }, owned)
    expect(ebay.app.destinations).not.toHaveBeenCalled()
  })

  it("renews subscriptions in the daily reconciliation", async () => {
    await reconcileJob({ date: "2026-09-28" }, owned)
    expect(await queued("ebay-subscribe")).toMatchObject([
      { key: `ebay-subscribe:${buyerId}:2026-09-28`, payload: { orgId: buyerId } }
    ])
    expect(await queued("sales")).toMatchObject([{ payload: { orgId: buyerId, source: "ebay" } }])
  })
})

describe("eBay's webhook", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  const key = publicKey.export({ type: "spki", format: "pem" }).toString().replace(/\n/g, "")
  function post(notification: unknown, signed: "good" | "bad" | "none" = "good") {
    const body = JSON.stringify(notification)
    const signature = createSign("sha1")
      .update(signed === "bad" ? `${body} ` : body)
      .sign(privateKey, "base64")
    const header = Buffer.from(JSON.stringify({ alg: "ECDSA", kid: "key-1", signature, digest: "SHA1" })).toString(
      "base64"
    )
    return POST(
      new Request("https://copacker.ai/api/webhooks/ebay", {
        method: "POST",
        headers: { "content-type": "application/json", ...(signed === "none" ? {} : { "x-ebay-signature": header }) },
        body
      })
    )
  }
  beforeEach(() => {
    vi.stubEnv("EBAY_CLIENT_ID", "Copacker-PRD")
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret")
    vi.stubEnv("EBAY_RU_NAME", "Copacker-RuName")
    ebay.app.publicKey.mockResolvedValue({ algorithm: "ECDSA", digest: "SHA1", key })
  })

  it("acts on a notification eBay signed", async () => {
    const response = await post(orderConfirmation())
    expect(response.status).toBe(204)
    expect(ebay.app.publicKey).toHaveBeenCalledWith("key-1")
    expect(await queued("ebay-event")).toHaveLength(1)
  })

  it("refuses a notification whose signature doesn't match, or that has none", async () => {
    expect((await post(orderConfirmation(), "bad")).status).toBe(412)
    expect((await post(orderConfirmation(), "none")).status).toBe(412)
    expect(await queued("ebay-event")).toEqual([])
  })

  it("acknowledges a deletion notice it can't check yet, and asks eBay to resend anything else", async () => {
    ebay.app.publicKey.mockRejectedValue(new Error("keyset disabled"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    // A key not seen before, so the cached one isn't used.
    const unchecked = async (notification: EbayNotification) => {
      const body = JSON.stringify(notification)
      const header = Buffer.from(
        JSON.stringify({ kid: `new-${notification.notification.notificationId}`, signature: "abc" })
      ).toString("base64")
      return POST(
        new Request("https://copacker.ai/api/webhooks/ebay", {
          method: "POST",
          headers: { "x-ebay-signature": header },
          body
        })
      )
    }
    expect((await unchecked(deletion(seller))).status).toBe(204)
    expect(await database.select().from(tables.connections)).toHaveLength(1)
    expect((await unchecked(orderConfirmation())).status).toBe(503)
  })

  it("refuses a body that isn't an eBay notification", async () => {
    expect((await post({ hello: "world" })).status).toBe(400)
  })
})
