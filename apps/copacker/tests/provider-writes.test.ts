import { randomUUID } from "node:crypto"
import { ListingWriteRejected } from "@repo/copacker-marketplaces/listing-writes"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  cliGrants,
  connections,
  jobs,
  memberships,
  organizations,
  providerWriteLocks,
  providerWrites
} from "../src/db/schema"
import { writeDestinations, writeIntent, type WriteDestination } from "../src/server/provider-write-model"
import { providerWrite, providerWriteJob } from "../src/server/provider-writes"
import { database, setUpTestDatabase, withTransaction } from "./test-db"
import { testSession } from "./test-session"

vi.mock("@/db", () => import("./test-db"))
const io = vi.hoisted(() => ({
  resolve: vi.fn<() => Promise<WriteDestination[]>>(),
  observe: vi.fn<(org: string, target: WriteDestination) => Promise<string | number | null>>(),
  shopify: vi.fn<() => Promise<void>>(),
  amazon: vi.fn<() => Promise<{ sku: string; status: "ACCEPTED"; submissionId: string }>>()
}))
vi.mock("../src/server/provider-write-routing", () => ({ resolveWrite: io.resolve, observeTarget: io.observe }))
vi.mock("../src/server/connections", () => ({
  shopifyFor: async () => ({ unitCost: io.shopify }),
  amazonFor: async () => ({})
}))
vi.mock("../src/server/stock", () => ({ refreshStock: async () => Promise.resolve() }))
vi.mock("@repo/copacker-marketplaces/listing-writes", async (original) => ({
  ...(await original<typeof import("@repo/copacker-marketplaces/listing-writes")>()),
  writeShopifyField: io.shopify,
  writeAmazonListing: io.amazon
}))
setUpTestDatabase({ truncate: true })
const orgId = randomUUID(),
  connectionId = randomUUID(),
  grantId = randomUUID()
const s = testSession({ orgId, kind: "buyer" })
function target(provider: "shopify" | "amazon", field: WriteDestination["field"] = "price"): WriteDestination {
  return {
    id: provider,
    provider,
    accountId: provider,
    connectionId,
    connectionRevision: 0,
    field,
    role: provider === "shopify" ? "source" : "target",
    before: 1000,
    desired: 1200,
    currency: "USD",
    unit: null,
    state: "pending",
    issue: null,
    externalId: provider,
    productId: "product",
    inventoryItemId: "item",
    locationExternalId: null,
    quantityState: null,
    listingId: null,
    listingRevision: null,
    linkRevision: null,
    productType: "PRODUCT",
    configuration: "",
    lockKey: provider,
    submissionId: null,
    attempts: 0
  }
}
const intent = () =>
  writeIntent.parse({
    mode: "direct",
    variantId: "variant",
    expectedConnectionRevision: 0,
    change: { field: "price", amountMinor: 1200, currency: "USD", expectedAmountMinor: 1000 }
  })
const call = (input: Parameters<typeof providerWrite>[3]) =>
  database.transaction((tx) => withTransaction(tx, () => providerWrite(s, grantId, "product.price.update", input)))
beforeEach(async () => {
  await database.delete(jobs)
  await database.delete(cliGrants)
  await database.insert(organizations).values({ id: orgId, name: "Buyer", kind: "buyer" })
  await database.insert(memberships).values({ orgId, userId: s.user.id, email: s.user.email, role: "owner" })
  await database
    .insert(connections)
    .values({ id: connectionId, orgId, provider: "shopify", externalId: "shop", encryptedToken: "private" })
  await database
    .insert(cliGrants)
    .values({ id: grantId, userId: s.user.id, expiresAt: new Date(Date.now() + 86400_000) })
  io.resolve.mockReset().mockImplementation(async () => [target("shopify"), target("amazon")])
  io.observe
    .mockReset()
    .mockImplementation(async (_org, target) => (target.state === "accepted" ? target.desired : target.before))
  io.shopify.mockReset().mockResolvedValue()
  io.amazon.mockReset().mockResolvedValue({ sku: "amazon", status: "ACCEPTED", submissionId: "submitted" })
})
async function run() {
  const [write] = await database.select().from(providerWrites).where(eq(providerWrites.status, "queued"))
  expect(write).toBeDefined()
  const context = { owned: eq(jobs.id, write!.jobId!), assertOwned: async () => Promise.resolve() }
  return { write: write!, context, input: { orgId, executionId: write!.id } }
}
describe("retained provider execution", () => {
  it("rejects expired previews, mismatched variants and changed destinations without queuing", async () => {
    const preview = await call({ ...intent(), mode: "preview" })
    if (!("previewId" in preview)) {
      throw new Error("Expected preview")
    }
    await expect(call({ mode: "apply", previewId: preview.previewId, variantId: "other" })).rejects.toThrow(
      "different variant"
    )
    io.resolve.mockResolvedValue([target("shopify")])
    await expect(call({ mode: "apply", previewId: preview.previewId })).rejects.toThrow("dependencies changed")
    await database
      .update(providerWrites)
      .set({ expiresAt: new Date(0) })
      .where(eq(providerWrites.id, preview.previewId))
    await expect(call({ mode: "apply", previewId: preview.previewId })).rejects.toThrow("fresh preview")
    expect(await database.select().from(jobs)).toEqual([])
    expect(await database.select().from(providerWriteLocks)).toEqual([])
  })
  it("keeps previews immutable, applies once and confirms source before channel", async () => {
    const preview = await call({ ...intent(), mode: "preview" })
    expect("previewId" in preview).toBe(true)
    if (!("previewId" in preview)) {
      throw new Error("Expected preview")
    }
    expect(await database.select().from(jobs)).toEqual([])
    await call({ mode: "apply", previewId: preview.previewId })
    await call({ mode: "apply", previewId: preview.previewId })
    expect(await database.select().from(jobs)).toHaveLength(1)
    const execution = await run()
    await providerWriteJob(execution.input, execution.context)
    expect(io.shopify).toHaveBeenCalledTimes(1)
    expect(io.amazon).toHaveBeenCalledTimes(1)
    expect(io.shopify.mock.invocationCallOrder[0]).toBeLessThan(io.amazon.mock.invocationCallOrder[0]!)
    const result = await call({ mode: "read", executionId: execution.write.id })
    expect(result).toMatchObject({ operation: { status: "succeeded" } })
    await providerWriteJob(execution.input, execution.context)
    expect(io.shopify).toHaveBeenCalledTimes(1)
    expect(await database.select().from(providerWriteLocks)).toEqual([])
  })
  it("preflights every target before effects and rejects competing executions", async () => {
    await call(intent())
    await expect(call(intent())).rejects.toThrow("previous change")
    io.observe.mockImplementation(async (_org, target) => (target.provider === "amazon" ? 999 : target.before))
    const execution = await run()
    await providerWriteJob(execution.input, execution.context)
    expect(io.shopify).not.toHaveBeenCalled()
    expect(io.amazon).not.toHaveBeenCalled()
    expect(await call({ mode: "read", executionId: execution.write.id })).toMatchObject({
      operation: { status: "failed" }
    })
  })
  it("retains uncertain locks and never repeats a possibly accepted request", async () => {
    await call(intent())
    io.shopify.mockRejectedValue(new Error("connection closed after send"))
    const execution = await run()
    await providerWriteJob(execution.input, execution.context)
    await providerWriteJob(execution.input, execution.context)
    expect(io.shopify).toHaveBeenCalledTimes(1)
    expect(io.amazon).not.toHaveBeenCalled()
    expect(await call({ mode: "read", executionId: execution.write.id })).toMatchObject({
      operation: { status: "needs_attention" }
    })
    expect(await database.select().from(providerWriteLocks)).toHaveLength(1)
    await expect(call(intent())).rejects.toThrow("previous change")
  })
  it("polls accepted offers without redispatch and reports a rejected channel as partial", async () => {
    await call(intent())
    io.observe.mockImplementation(async (_org, target) => {
      if (target.provider === "amazon") {
        return target.before
      }
      return target.state === "accepted" ? target.desired : target.before
    })
    const execution = await run()
    await expect(providerWriteJob(execution.input, execution.context)).rejects.toThrow(
      "Waiting for provider confirmation"
    )
    io.observe.mockImplementation(async (_org, target) => target.desired)
    await providerWriteJob(execution.input, execution.context)
    expect(io.amazon).toHaveBeenCalledTimes(1)
    expect(await call({ mode: "read", executionId: execution.write.id })).toMatchObject({
      operation: { status: "succeeded" }
    })
    io.observe.mockImplementation(async (_org, target) =>
      target.state === "accepted" ? target.desired : target.before
    )
    await call(intent())
    io.amazon.mockRejectedValue(new ListingWriteRejected("rejected"))
    const next = await run()
    await providerWriteJob(next.input, next.context)
    expect(await call({ mode: "read", executionId: next.write.id })).toMatchObject({
      operation: { status: "partially_succeeded" }
    })
  })
  it("fails revoked authorization before dispatch and treats an interrupted dispatch as uncertain", async () => {
    await call(intent())
    const execution = await run()
    await database.update(cliGrants).set({ revokedAt: new Date() }).where(eq(cliGrants.id, grantId))
    await providerWriteJob(execution.input, execution.context)
    expect(io.shopify).not.toHaveBeenCalled()
    expect(await call({ mode: "read", executionId: execution.write.id })).toMatchObject({
      operation: { status: "failed" }
    })
    await database.update(cliGrants).set({ revokedAt: null }).where(eq(cliGrants.id, grantId))
    await call(intent())
    const next = await run()
    const targets = writeDestinations.parse(next.write.targets)
    targets[0]!.state = "dispatching"
    await database.update(providerWrites).set({ targets }).where(eq(providerWrites.id, next.write.id))
    await providerWriteJob(next.input, next.context)
    expect(io.shopify).not.toHaveBeenCalled()
    expect(await call({ mode: "read", executionId: next.write.id })).toMatchObject({
      operation: { status: "needs_attention" }
    })
  })
})
