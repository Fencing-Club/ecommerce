import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { countedAmazonTransaction } from "../src/server/amazon-counted-transaction"
import { database, setUpTestDatabase } from "./test-db"

vi.mock("@/db", () => import("./test-db"))
import { platformCharges } from "../src/server/overview-sales"
setUpTestDatabase()

async function scope() {
  const orgId = randomUUID()
  await database.insert(tables.organizations).values({ id: orgId, name: "Test", kind: "buyer" })
  return orgId
}
function payment(orgId: string, id: string, extra: Partial<typeof tables.amazonTransactions.$inferInsert> = {}) {
  return {
    orgId,
    externalAccountId: "seller",
    transactionId: id,
    orderId: "order",
    type: "Refund",
    currency: "USD",
    totalMinor: -600,
    feesMinor: -50,
    postedAt: new Date("2026-01-05"),
    data: { transactionStatus: "RELEASED" },
    ...extra
  }
}
const forward = {
  transactionStatus: "DEFERRED_RELEASED",
  relatedIdentifiers: [{ relatedIdentifierName: "RELEASE_TRANSACTION_ID", relatedIdentifierValue: "released" }]
}
const reverse = {
  transactionStatus: "RELEASED",
  relatedIdentifiers: [{ relatedIdentifierName: "DEFERRED_TRANSACTION_ID", relatedIdentifierValue: "original" }]
}
async function counted(orgId: string) {
  const result = await database.execute<{ id: string }>(sql`select t."transactionId" as id from amazon_transactions t
    where t."orgId"=${orgId} and t."externalAccountId"='seller' and ${countedAmazonTransaction(sql.identifier("t"))} order by 1`)
  return result.rows.map((row) => row.id)
}
it.each(["forward", "reverse", "both"])(
  "counts a refund once with %s links, preserving its original period",
  async (direction) => {
    const orgId = await scope()
    await database.insert(tables.amazonTransactions).values([
      payment(orgId, "original", {
        data: direction === "reverse" ? { transactionStatus: "DEFERRED_RELEASED" } : forward
      }),
      payment(orgId, "released", {
        postedAt: new Date("2026-02-05"),
        data: direction === "forward" ? { transactionStatus: "RELEASED" } : reverse
      })
    ])
    expect(await counted(orgId)).toEqual(["original"])
    const account = { provider: "amazon" as const, externalId: "seller" }
    const january = await platformCharges(orgId, [account], new Date("2026-01-01"), new Date("2026-02-01"), "USD")
    expect(january.find((row) => row.key === "amazon-refunds")?.minor).toBe(-600)
    expect(await platformCharges(orgId, [account], new Date("2026-02-01"), new Date("2026-03-01"), "USD")).toEqual([])
  }
)
it.each(["workspace", "seller"])("does not follow a link from a different %s", async (kind) => {
  const orgId = await scope(),
    other = await scope()
  await database.insert(tables.amazonTransactions).values([
    payment(kind === "workspace" ? other : orgId, "original", {
      externalAccountId: kind === "seller" ? "other" : "seller",
      data: forward
    }),
    payment(orgId, "released")
  ])
  expect(await counted(orgId)).toEqual(["released"])
})
it("keeps a standalone payment and an original whose released copy is missing", async () => {
  const orgId = await scope()
  await database
    .insert(tables.amazonTransactions)
    .values([payment(orgId, "original", { data: forward }), payment(orgId, "standalone")])
  expect(await counted(orgId)).toEqual(["original", "standalone"])
})
it.each([
  { currency: "EUR" },
  { type: "Shipment" },
  { totalMinor: -601 },
  { orderId: "different" },
  { data: { transactionStatus: "DEFERRED" } },
  { data: { transactionStatus: "RELEASED", marketplaceDetails: { marketplaceId: "OTHER" } } }
])("does not suppress a conflicting forward-linked payment: %j", (change) => {
  return (async () => {
    const orgId = await scope()
    await database
      .insert(tables.amazonTransactions)
      .values([payment(orgId, "original", { data: forward }), payment(orgId, "released", change)])
    expect(await counted(orgId)).toEqual(["original", "released"])
  })()
})
