import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/auth"
import { applyMigrations } from "./migrations"
const context = vi.hoisted(() => ({ database: null as unknown, actor: null as Session | null }))
vi.mock("@/db", () => ({ db: () => context.database }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => {
    if (!context.actor) {
      throw new ApiSessionError(401)
    }
    return context.actor
  }
}))
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))
import { GET as allocationsRoute } from "../src/app/api/analytics/amazon/allocations/route"
import { DELETE, GET as mappingRoute } from "../src/app/api/analytics/amazon/product-mappings/[id]/route"
import { POST, GET as mappingsRoute } from "../src/app/api/analytics/amazon/product-mappings/route"
import { amazonAllocations } from "../src/server/amazon-allocation-data"
import { saveAmazonProductMapping, productMappingInput } from "../src/server/amazon-product-mappings"
import { amazonReconciliation } from "../src/server/amazon-reconciliation-data"
import { ApiSessionError } from "../src/server/auth"
import { appUrl } from "../src/server/security"
const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const orgId = randomUUID(),
  otherId = randomUUID()
function actor(id: string, kind: "buyer" | "supplier"): Session {
  return {
    user: { id: `user-${id}`, email: "owner@example.com", emailVerified: true, name: "Olive Owner" },
    org: {
      id,
      kind,
      name: kind,
      workosId: null,
      timeZone: null,
      excludedShopifyTags: ["Amazon"],
      restockSalesDays: null,
      restockLeadTimeDays: null,
      createdAt: new Date()
    },
    role: "owner",
    access: {},
    workspaces: []
  }
}

const input = {
  externalAccountId: "SELLER1",
  sku: "SKU1",
  asin: "A1",
  fnsku: null,
  shopifyDomain: "store",
  variantId: "v1",
  validFrom: "2026-01-01T00:00:00Z",
  validTo: "2027-01-01T00:00:00Z",
  evidence: "Imported invoice and catalog record"
}
const request = (body: unknown, method: "POST" | "DELETE" = "POST", origin = appUrl()) =>
  new Request(`${appUrl()}/api/analytics/amazon/product-mappings`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": randomUUID() },
    body: JSON.stringify(body)
  })
beforeAll(async () => {
  context.database = database
  await applyMigrations(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE")
  await database.insert(tables.organizations).values([
    { id: orgId, kind: "buyer", name: "Buyer" },
    { id: otherId, kind: "buyer", name: "Other" }
  ])
  await database
    .insert(tables.connections)
    .values({ orgId, provider: "amazon", externalId: "SELLER1", encryptedToken: "test" })
  await database.insert(tables.variantFields).values([
    { orgId, shopifyDomain: "store", variantId: "v1" },
    { orgId, shopifyDomain: "store", variantId: "v2" },
    { orgId: otherId, shopifyDomain: "secret", variantId: "secret" }
  ])
  context.actor = actor(orgId, "buyer")
})
describe("historical identity writes and allocation read", () => {
  it("preserves audit history on correction, rejects overlaps, and permits adjacent dated identities", async () => {
    expect((await POST(request(input))).status).toBe(201)
    const [saved] = await database.select().from(tables.amazonProductMappings)
    expect(saved).toMatchObject({ createdBy: `user-${orgId}`, sku: "SKU1", evidence: input.evidence })
    expect((await POST(request({ ...input, variantId: "v2" }))).status).toBe(409)
    expect(
      (await POST(request({ ...input, validFrom: "2027-01-01T00:00:00Z", validTo: "2028-01-01T00:00:00Z" }))).status
    ).toBe(201)
    expect(
      (await POST(request({ ...input, variantId: "v2", supersedes: saved!.id, evidence: "Corrected invoice mapping" })))
        .status
    ).toBe(201)
    const rows = await database.select().from(tables.amazonProductMappings)
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.id === saved!.id)?.retiredBy).toBe(`user-${orgId}`)
    expect(rows.find((row) => row.supersedes === saved!.id)?.variantId).toBe("v2")
    expect((await POST(request({ ...input, supersedes: saved!.id }))).status).toBe(409)
    expect((await mappingsRoute(new Request(`${appUrl()}/api/analytics/amazon/product-mappings`))).status).toBe(200)
  })
  it("serializes overlapping writes and leaves exactly one active mapping", async () => {
    const results = await Promise.all([
      saveAmazonProductMapping(orgId, "user", productMappingInput.parse(input)),
      saveAmazonProductMapping(orgId, "user", productMappingInput.parse({ ...input, variantId: "v2" }))
    ])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(await database.select().from(tables.amazonProductMappings)).toHaveLength(1)
  })
  it("rejects foreign targets, invalid periods, forbidden origins and insufficient permissions", async () => {
    expect((await POST(request({ ...input, shopifyDomain: "secret", variantId: "secret" }))).status).toBe(422)
    expect((await POST(request({ ...input, validTo: input.validFrom }))).status).toBe(400)
    expect((await POST(request(input, "POST", "https://evil.test"))).status).toBe(403)
    context.actor = { ...actor(orgId, "buyer"), role: "member", access: { products: "view", prices: "view" } }
    expect((await POST(request(input))).status).toBe(403)
    context.actor = { ...actor(orgId, "buyer"), role: "member", access: { products: "edit" } }
    expect((await POST(request(input))).status).toBe(403)
    context.actor = actor(orgId, "supplier")
    expect((await POST(request(input))).status).toBe(403)
    expect(await database.select().from(tables.amazonProductMappings)).toEqual([])
  })
  it("retires mistaken mappings without deleting audit evidence and scopes retirement to the workspace", async () => {
    await POST(request(input))
    const [saved] = await database.select().from(tables.amazonProductMappings)
    context.actor = actor(otherId, "buyer")
    expect((await DELETE(request(null, "DELETE"), { params: Promise.resolve({ id: saved!.id }) })).status).toBe(404)
    context.actor = actor(orgId, "buyer")
    expect((await DELETE(request(null, "DELETE"), { params: Promise.resolve({ id: saved!.id }) })).status).toBe(204)
    expect((await DELETE(request(null, "DELETE"), { params: Promise.resolve({ id: saved!.id }) })).status).toBe(204)
    expect(await database.select().from(tables.amazonProductMappings)).toHaveLength(1)
  })
  it("rejects a replaced seller account and conflicts on FNSKU as well as SKU", async () => {
    expect((await POST(request({ ...input, externalAccountId: "OLD" }))).status).toBe(409)
    expect((await POST(request({ ...input, fnsku: "FN1" }))).status).toBe(201)
    expect((await POST(request({ ...input, sku: "SKU2", fnsku: "FN1" }))).status).toBe(409)
  })
  it("pages posting dates in UTC and exposes missing coverage and disconnected state", async () => {
    await database.insert(tables.amazonTransactions).values(
      Array.from({ length: 101 }, (_, index) => ({
        orgId,
        externalAccountId: "SELLER1",
        transactionId: `T${index}`,
        postedAt: new Date("2026-10-01T00:00:00Z"),
        type: "Transfer",
        currency: "USD",
        totalMinor: 0,
        feesMinor: 0,
        data: {}
      }))
    )
    const range = { from: "2026-10-01", to: "2026-11-01", page: 0 }
    const first = await amazonAllocations(orgId, range)
    const next = await amazonAllocations(orgId, { ...range, page: 1, snapshot: first.snapshot })
    expect(first.postings).toHaveLength(100)
    expect(first.hasMore).toBe(true)
    expect(next.postings).toHaveLength(1)
    expect(next.hasMore).toBe(false)
    expect(first.postings.some((row) => row.transactionId === next.postings[0]?.transactionId)).toBe(false)
    expect(first.coverage).toBeNull()
    expect(
      (
        await allocationsRoute(
          new Request(`${appUrl()}/api/analytics/amazon/allocations?from=2026-11-01&to=2026-10-01`)
        )
      ).status
    ).toBe(400)
    await database.delete(tables.connections)
    expect(await amazonAllocations(orgId, range)).toMatchObject({ connected: false, postings: [], hasMore: false })
  })
  it("returns historical matches and allocations without adding imported source amounts", async () => {
    await POST(request(input))
    const money = (currencyAmount: string) => ({ currencyCode: "USD", currencyAmount })
    const breakdowns = [
      { breakdownType: "Sales", breakdownAmount: money("10") },
      { breakdownType: "Commission", breakdownAmount: money("-2") }
    ]
    const transaction = {
      orgId,
      externalAccountId: "SELLER1",
      transactionId: "T1",
      orderId: "O1",
      postedAt: new Date("2026-10-01"),
      type: "Shipment",
      currency: "USD",
      totalMinor: 800,
      feesMinor: 200,
      data: {
        transactionStatus: "RELEASED",
        marketplaceDetails: { marketplaceId: "ATVPDKIKX0DER" },
        totalAmount: money("8"),
        breakdowns,
        items: [
          {
            totalAmount: money("8"),
            breakdowns,
            contexts: [{ contextType: "ProductContext", sku: "SKU1", asin: "A1" }]
          }
        ]
      }
    }
    await database
      .insert(tables.amazonTransactions)
      .values([transaction, { ...transaction, orgId: otherId, transactionId: "SECRET" }])
    await database.insert(tables.amazonReturns).values({
      orgId,
      externalAccountId: "SELLER1",
      marketplaceId: "ATVPDKIKX0DER",
      returnedAt: new Date("2026-10-02"),
      orderId: "O1",
      sku: "SKU1",
      asin: "A1",
      quantity: 1
    })
    const range = { from: "2026-10-01", to: "2026-11-01", page: 0 }
    const evidence = await amazonReconciliation(orgId, { ...range, source: "returns" })
    expect(evidence.rows[0]?.historicalProduct).toMatchObject({
      status: "confirmed",
      candidates: [{ variantId: "v1" }]
    })
    const result = await amazonAllocations(orgId, range)
    expect(result.postings).toHaveLength(1)
    expect(result.postings[0]).toMatchObject({ allocatedNet: "8", allocatedFees: "-2", unallocatedNet: "0" })
    expect(result.coverage).toBeNull()
    const response = await allocationsRoute(
      new Request(`${appUrl()}/api/analytics/amazon/allocations?from=2026-10-01&to=2026-11-01`)
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    context.actor = { ...actor(orgId, "buyer"), role: "member", access: { sales: "view" } }
    expect(
      (
        await allocationsRoute(
          new Request(`${appUrl()}/api/analytics/amazon/allocations?from=2026-10-01&to=2026-11-01`)
        )
      ).status
    ).toBe(403)
  })
})

describe("analytics HTTP contract", () => {
  it("provides resource locations and safely replays a creation without duplicating history", async () => {
    const original = request(input)
    const response = await POST(original.clone())
    expect(response.status).toBe(201)
    const location = response.headers.get("location")!
    const id = location.split("/").at(-1)!
    const resource = { params: Promise.resolve({ id }) }
    expect((await mappingRoute(new Request(`${appUrl()}${location}`), resource)).status).toBe(200)
    expect((await POST(original.clone())).status).toBe(200)
    expect(await database.select().from(tables.amazonProductMappings)).toHaveLength(1)
    const changed = request({ ...input, evidence: "Different request" })
    changed.headers.set("Idempotency-Key", original.headers.get("Idempotency-Key")!)
    expect((await POST(changed)).status).toBe(409)
    context.actor = actor(otherId, "buyer")
    expect((await mappingRoute(new Request(`${appUrl()}${location}`), resource)).status).toBe(404)
  })
  it("returns problem details for invalid JSON, content types, missing retry keys, and authentication", async () => {
    const malformed = request(input)
    const broken = new Request(malformed.url, { method: "POST", headers: malformed.headers, body: "{" })
    expect((await POST(broken)).status).toBe(400)
    const wrongType = request(input)
    wrongType.headers.set("Content-Type", "text/plain")
    expect((await POST(wrongType)).status).toBe(415)
    const missing = request(input)
    missing.headers.delete("Idempotency-Key")
    expect((await POST(missing)).status).toBe(400)
    context.actor = null
    const response = await mappingsRoute(new Request(`${appUrl()}/api/analytics/amazon/product-mappings`))
    expect(response.status).toBe(401)
    expect(response.headers.get("content-type")).toBe("application/problem+json")
    expect(await response.json()).toMatchObject({ status: 401, code: "session_required" })
  })
  it("bounds mapping history and rejects changed or missing pagination snapshots", async () => {
    await database.insert(tables.amazonProductMappings).values(
      Array.from({ length: 101 }, (_, index) => ({
        ...input,
        orgId,
        marketplaceId: "ATVPDKIKX0DER",
        sku: `SKU${index}`,
        createdBy: "user",
        validFrom: new Date(input.validFrom),
        validTo: new Date(input.validTo)
      }))
    )
    const url = `${appUrl()}/api/analytics/amazon/product-mappings`
    const first = await (await mappingsRoute(new Request(url))).json()
    expect(first.mappings).toHaveLength(100)
    expect(first.hasMore).toBe(true)
    expect((await mappingsRoute(new Request(`${url}?page=1`))).status).toBe(400)
    const nextUrl = `${url}?page=1&snapshot=${first.snapshot}`
    const next = await (await mappingsRoute(new Request(nextUrl))).json()
    expect(next.mappings).toHaveLength(1)
    await DELETE(request(null, "DELETE"), { params: Promise.resolve({ id: first.mappings[0].id }) })
    const stale = await mappingsRoute(new Request(nextUrl))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: "snapshot_changed" })
    const allocation = await amazonAllocations(orgId, { from: "2026-10-01", to: "2026-11-01", page: 0 })
    expect((await mappingsRoute(new Request(`${url}?page=1&snapshot=${allocation.snapshot}`))).status).toBe(409)
  })
})

it("replays corrections after retirement and never changes their audit history", async () => {
  const original = await (await POST(request(input))).json()
  const correction = request({ ...input, supersedes: original.mapping.id, variantId: "v2" })
  const created = await (await POST(correction.clone())).json()
  expect((await POST(correction.clone())).status).toBe(200)
  const resource = { params: Promise.resolve({ id: created.mapping.id }) }
  await DELETE(request(null, "DELETE"), resource)
  const before = await (await mappingRoute(request(null), resource)).json()
  expect((await POST(correction.clone())).status).toBe(200)
  await DELETE(request(null, "DELETE"), resource)
  const after = await (await mappingRoute(request(null), resource)).json()
  expect(after).toEqual(before)
  expect((await POST(request({ ...input, supersedes: original.mapping.id }))).status).toBe(409)
})
it("detects financial changes even when the source row count is unchanged", async () => {
  const range = { from: "2026-10-01", to: "2026-11-01", page: 0 }
  await database.insert(tables.amazonTransactions).values({
    orgId,
    externalAccountId: "SELLER1",
    transactionId: "T1",
    postedAt: new Date("2026-10-01"),
    type: "Transfer",
    currency: "USD",
    totalMinor: 0,
    feesMinor: 0,
    data: {}
  })
  const first = await amazonAllocations(orgId, range)
  await database.update(tables.amazonTransactions).set({ totalMinor: 10 })
  const response = await allocationsRoute(
    new Request(
      `${appUrl()}/api/analytics/amazon/allocations?from=${range.from}&to=${range.to}&page=1&snapshot=${first.snapshot}`
    )
  )
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: "snapshot_changed" })
})
