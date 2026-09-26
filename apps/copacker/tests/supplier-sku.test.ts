import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/auth"

const context = vi.hoisted(() => ({ current: null as unknown, actor: null as Session | null }))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))
const shopify = vi.hoisted(() => ({
  supplierSku: vi.fn<(variantId: string, value: string) => Promise<void>>()
}))
vi.mock("../src/server/connections", async (original) => ({
  ...(await original<typeof import("../src/server/connections")>()),
  shopifyFor: async () => shopify
}))

import { PATCH } from "../src/app/api/inventory/supplier-sku/route"
import { appUrl } from "../src/server/security"
import { applyMigrations } from "./migrations"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const buyerId = randomUUID()
const supplierOrgId = randomUUID()
const domain = "shop.myshopify.com"
const variantA = "gid://shopify/ProductVariant/1"
const variantB = "gid://shopify/ProductVariant/2"
const unknownVariant = "gid://shopify/ProductVariant/99"

function actor(id: string, kind: "buyer" | "supplier"): Session {
  return {
    user: { id: `user-${id}`, email: "owner@example.com", emailVerified: true },
    org: { id, kind, name: kind, workosId: null, timeZone: null, createdAt: new Date() },
    role: "owner",
    workspaces: []
  }
}

function save(body: unknown, origin = appUrl()) {
  return PATCH(
    new Request(`${appUrl()}/api/inventory/supplier-sku`, {
      method: "PATCH",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  )
}

// The stored snapshot's supplier SKU for each variation.
async function snapshotSkus() {
  const [stock] = await database
    .select({ data: tables.stockSnapshots.data })
    .from(tables.stockSnapshots)
    .where(and(eq(tables.stockSnapshots.orgId, buyerId), eq(tables.stockSnapshots.scopeKey, "store")))
  const rows = stock?.data?.source === "shopify" ? stock.data.rows : []
  return Object.fromEntries(rows.map((row) => [row.variantId, row.supplierSku]))
}

beforeAll(async () => {
  await applyMigrations(pg)
  context.current = database
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: supplierOrgId, name: "Supplier", kind: "supplier" }
  ])
  await database
    .insert(tables.connections)
    .values({ orgId: buyerId, provider: "shopify", externalId: domain, encryptedToken: "token" })
  const rows = [
    { variantId: variantA, buyerSku: "CORD-1", supplierSku: null },
    { variantId: variantB, buyerSku: "GLOVE-6", supplierSku: "OLD-6" }
  ].map((row) => ({ ...row, productId: "gid://shopify/Product/1", levels: [] }))
  await database.insert(tables.stockSnapshots).values({
    orgId: buyerId,
    source: "shopify",
    externalAccountId: domain,
    scopeKey: "store",
    data: { source: "shopify", rows } as unknown as typeof tables.stockSnapshots.$inferInsert.data
  })
})

beforeEach(() => {
  context.actor = actor(buyerId, "buyer")
  shopify.supplierSku.mockClear()
})

afterAll(async () => {
  await pg.close()
})

describe("supplier SKUs", () => {
  it("saves a trimmed supplier SKU to Shopify and the stored snapshot", async () => {
    const response = await save({ variantId: variantA, supplierSku: "  AB-100 " })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ supplierSku: "AB-100" })
    expect(shopify.supplierSku).toHaveBeenCalledWith(variantA, "AB-100")
    expect(await snapshotSkus()).toEqual({ [variantA]: "AB-100", [variantB]: "OLD-6" })
  })

  it("clears the supplier SKU with an empty value", async () => {
    const response = await save({ variantId: variantB, supplierSku: "" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ supplierSku: null })
    expect(shopify.supplierSku).toHaveBeenCalledWith(variantB, "")
    expect((await snapshotSkus())[variantB]).toBeNull()
  })

  it("rejects unknown variations, supplier workspaces, bad origins and long SKUs without writing to Shopify", async () => {
    const unknown = await save({ variantId: unknownVariant, supplierSku: "AB-1" })
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({
      error: "This product isn't in your synced Shopify inventory. Sync Shopify and try again."
    })
    expect((await save({ variantId: variantA, supplierSku: "x".repeat(256) })).status).toBe(400)
    expect((await save({ variantId: variantA, supplierSku: "AB-1" }, "https://evil.example")).status).toBe(403)
    context.actor = actor(supplierOrgId, "supplier")
    expect((await save({ variantId: variantA, supplierSku: "AB-1" })).status).toBe(403)
    expect(shopify.supplierSku).not.toHaveBeenCalled()
  })

  it("reports a Shopify failure and leaves the snapshot unchanged", async () => {
    shopify.supplierSku.mockRejectedValueOnce(new Error("Shopify rejected supplier SKU update"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = await save({ variantId: variantA, supplierSku: "NEW-1" })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "Shopify didn't save the supplier SKU. Try again." })
    expect((await snapshotSkus())[variantA]).toBe("AB-100")
  })
})
