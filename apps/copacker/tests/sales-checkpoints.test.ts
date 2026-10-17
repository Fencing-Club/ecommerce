import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { applyMigrations } from "./migrations"
const context = vi.hoisted(() => ({
  database: null as unknown,
  read: vi.fn<() => Promise<never[]>>().mockResolvedValue([]),
  balance: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  economics: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  depletions: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
}))
vi.mock("@/db", () => ({ db: () => context.database }))
vi.mock("../src/server/connections", async (original) => ({
  ...(await original<typeof import("../src/server/connections")>()),
  connection: async () => ({ scopes: "read_orders,read_all_orders" }),
  shopifyFor: async () => ({})
}))
vi.mock("@repo/aisle/sales", async (original) => ({
  ...(await original<typeof import("@repo/aisle/sales")>()),
  collectShopifySales: context.read
}))
vi.mock("../src/server/shopify-balance", () => ({ syncShopifyBalance: context.balance }))
vi.mock("../src/server/analytics-jobs", async (original) => ({
  ...(await original<typeof import("../src/server/analytics-jobs")>()),
  queueShopifyEconomics: context.economics
}))
vi.mock("../src/server/inventory-auto-import", () => ({ syncAutomaticDepletions: context.depletions }))
import { PollAgain } from "../src/server/job-handlers"
import { salesJob } from "../src/server/sales-orders"
const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
beforeAll(async () => {
  context.database = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE")
  vi.clearAllMocks()
})
it("commits each sales period and resumes each follow-up exactly once", async () => {
  const orgId = randomUUID()
  await database.insert(tables.organizations).values({ id: orgId, name: "Checkpoint", kind: "buyer" })
  await database
    .insert(tables.salesSyncs)
    .values({ orgId, source: "shopify", externalAccountId: "fixture.myshopify.com", status: "queued", revision: 1 })
  const first = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" }
  const second = { from: "2026-09-17T00:00:00.000Z", to: first.from }
  let payload: Record<string, unknown> = {
    orgId,
    source: "shopify",
    revision: 1,
    resume: { remaining: [first, second], covered: null }
  }
  const owned = vi.fn<() => Promise<void>>().mockResolvedValue()
  for (let index = 0; index < 4; index++) {
    const error: unknown = await salesJob(payload, owned).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(PollAgain)
    if (!(error instanceof PollAgain) || !error.options.payload) {
      throw new Error("Missing checkpoint")
    }
    expect(error.options.progressed).toBe(true)
    payload = error.options.payload
    expect((await database.select().from(tables.salesSyncs))[0]?.status).toBe("running")
    expect(context.read).toHaveBeenCalledTimes(Math.min(index + 1, 2))
    expect(context.depletions).not.toHaveBeenCalled()
  }
  await salesJob(payload, owned)
  expect(context.balance).toHaveBeenCalledOnce()
  expect(context.economics).toHaveBeenCalledOnce()
  expect(context.depletions).toHaveBeenCalledOnce()
  expect((await database.select().from(tables.salesSyncs))[0]).toMatchObject({
    status: "idle",
    coveredFrom: new Date(second.from),
    coveredTo: new Date(first.to)
  })
  await salesJob(payload, owned)
  expect(context.depletions).toHaveBeenCalledOnce()
})
