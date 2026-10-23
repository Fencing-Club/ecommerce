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

function sharedData(status: string, type = "Refund") {
  return {
    transactionStatus: status,
    totalAmount: { currencyCode: "USD", currencyAmount: -6 },
    relatedIdentifiers: [
      { relatedIdentifierName: type === "Refund" ? "REFUND_ID" : "SHIPMENT_ID", relatedIdentifierValue: "shared-id" }
    ],
    marketplaceDetails: { marketplaceId: "US" },
    items: [{ totalAmount: { currencyCode: "USD", currencyAmount: -6 }, contexts: [{ sku: "SKU" }] }]
  }
}
it.each(["Shipment", "Refund"])("counts a unique shared %s identifier once across periods", async (type) => {
  const orgId = await scope()
  await database
    .insert(tables.amazonTransactions)
    .values([
      payment(orgId, "original", { type, data: sharedData("DEFERRED_RELEASED", type) }),
      payment(orgId, "released", { type, postedAt: new Date("2026-02-05"), data: sharedData("RELEASED", type) })
    ])
  expect(await counted(orgId)).toEqual(["original"])
})
it.each([
  "third-copy",
  "other-status",
  "incoming-link",
  "fees",
  "items",
  "order",
  "marketplace",
  "date",
  "total-precision",
  "empty-items",
  "empty-id",
  "second-id"
])("does not infer a release when shared evidence has %s", async (conflict) => {
  const orgId = await scope()
  const original = payment(orgId, "original", { data: sharedData("DEFERRED_RELEASED") })
  const released = payment(orgId, "released", { postedAt: new Date("2026-02-05"), data: sharedData("RELEASED") })
  if (conflict === "fees") {
    released.feesMinor = -51
  }
  if (conflict === "total-precision") {
    released.data = { ...released.data, totalAmount: { currencyCode: "USD", currencyAmount: -6.001 } }
  }
  if (conflict === "empty-items") {
    original.data = { ...original.data, items: [] }
    released.data = { ...released.data, items: [] }
  }
  if (conflict === "items") {
    released.data = { ...released.data, items: [{ different: true }] }
  }
  if (conflict === "order") {
    released.orderId = null
  }
  if (conflict === "marketplace") {
    released.data = { ...released.data, marketplaceDetails: {} }
  }
  if (conflict === "date") {
    released.postedAt = new Date("2025-01-01")
  }
  if (conflict === "empty-id") {
    original.data = {
      ...original.data,
      relatedIdentifiers: [{ relatedIdentifierName: "REFUND_ID", relatedIdentifierValue: "" }]
    }
    released.data = {
      ...released.data,
      relatedIdentifiers: [{ relatedIdentifierName: "REFUND_ID", relatedIdentifierValue: "" }]
    }
  }
  if (conflict === "second-id") {
    released.data = {
      ...released.data,
      relatedIdentifiers: [
        ...sharedData("RELEASED").relatedIdentifiers,
        { relatedIdentifierName: "REFUND_ID", relatedIdentifierValue: "second" }
      ]
    }
  }
  await database.insert(tables.amazonTransactions).values([original, released])
  if (conflict === "third-copy" || conflict === "other-status") {
    await database
      .insert(tables.amazonTransactions)
      .values(payment(orgId, "extra", { data: sharedData(conflict === "third-copy" ? "RELEASED" : "DEFERRED") }))
  }
  if (conflict === "incoming-link") {
    await database.insert(tables.amazonTransactions).values(payment(orgId, "extra", { data: forward }))
  }
  const ids = await counted(orgId)
  expect(ids).toContain("original")
  expect(ids).toContain("released")
  const { sharedReleaseOriginal } = await import("../src/server/amazon-shared-release")
  const result = await database.execute(
    sql`select ${sharedReleaseOriginal(sql.identifier("t"))} as original from amazon_transactions t where t."orgId"=${orgId} and t."transactionId"='released'`
  )
  expect(result.rows[0]?.original).toBeNull()
})
it("ignores shared identifiers belonging to other sellers and workspaces", async () => {
  const orgId = await scope(),
    other = await scope()
  await database
    .insert(tables.amazonTransactions)
    .values([
      payment(orgId, "original", { data: sharedData("DEFERRED_RELEASED") }),
      payment(orgId, "released", { data: sharedData("RELEASED") }),
      payment(other, "outside", { data: sharedData("RELEASED") }),
      payment(orgId, "outside-seller", { externalAccountId: "other", data: sharedData("RELEASED") })
    ])
  expect(await counted(orgId)).toEqual(["original"])
})

it.each([undefined, null, {}, "invalid", 7, false])(
  "keeps malformed identifier data unresolved without breaking queries: %j",
  async (value) => {
    for (const side of ["original", "released"] as const) {
      const orgId = await scope()
      const originalData = sharedData("DEFERRED_RELEASED"),
        releasedData = sharedData("RELEASED")
      const data = (base: ReturnType<typeof sharedData>, malformed: boolean) => {
        if (!malformed) {
          return base
        }
        const { relatedIdentifiers: _references, ...rest } = base
        return value === undefined ? rest : { ...rest, relatedIdentifiers: value }
      }
      await database
        .insert(tables.amazonTransactions)
        .values([
          payment(orgId, "original", { data: data(originalData, side === "original") }),
          payment(orgId, "released", { data: data(releasedData, side === "released") })
        ])
      expect(await counted(orgId)).toEqual(["original", "released"])
    }
  }
)
