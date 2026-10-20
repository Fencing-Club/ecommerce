import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { applySchema } from "./database"

const context = vi.hoisted(() => ({ database: null as unknown }))
vi.mock("@/db", () => ({ db: () => context.database }))
import { seedDemoStore } from "../scripts/demo-store"
import { disconnect, shopifyFor } from "../src/server/connections"
import { demoShopConnection, demoShopDomain } from "../src/server/demo-shopify"
import { withVariantFields } from "../src/server/product-fields"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const org = { id: randomUUID(), name: "Fixture buyer" }
beforeAll(async () => {
  context.database = database
  await applySchema(pg)
})
afterAll(async () => {
  await pg.close()
})
beforeEach(async () => {
  vi.stubEnv("DEPLOYMENT_ENV", "preview")
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("A fixture reached the real network")
    })
  )
  await pg.exec("TRUNCATE organizations CASCADE")
  await database.insert(tables.organizations).values({ ...org, kind: "buyer" })
  await seedDemoStore(org)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("isolated demo Shopify provider", () => {
  it("loads saved-order variants and bundle components without contacting Shopify", async () => {
    const api = await shopifyFor(org.id)
    const variants = await withVariantFields(
      org.id,
      demoShopDomain,
      await api.variants([
        "gid://shopify/ProductVariant/1",
        "gid://shopify/ProductVariant/3",
        "gid://shopify/ProductVariant/999"
      ])
    )
    expect(variants[0]).toMatchObject({ sku: "grip-left", supplierSku: { value: "GRIP-L" } })
    expect(variants[1]?.productVariantComponents.nodes[0]).toMatchObject({
      quantity: 3,
      productVariant: { supplierSku: { value: "GRIP-L" } }
    })
    expect(variants[2]).toBeNull()
    expect(await api.search("body cord")).toHaveLength(1)
    expect((await api.catalogPage()).nodes).toHaveLength(6)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("persists demo cost changes in minor units within the fixture workspace", async () => {
    const api = await shopifyFor(org.id)
    await Promise.all([
      api.unitCost("gid://shopify/InventoryItem/1", 1234),
      api.unitCost("gid://shopify/InventoryItem/2", 5678)
    ])
    expect((await api.variants(["gid://shopify/ProductVariant/1"]))[0]?.inventoryItem.unitCost?.amount).toBe("12.34")
    expect(
      (await api.stock()).rows.find((row) => row.inventoryItemId === "gid://shopify/InventoryItem/1")?.unitCostMinor
    ).toBe(1234)
    expect((await api.variants(["gid://shopify/ProductVariant/2"]))[0]?.inventoryItem.unitCost?.amount).toBe("56.78")
    expect(fetch).not.toHaveBeenCalled()
  })
  it("disconnects the fixture without attempting a real Shopify revocation", async () => {
    expect(await disconnect(org.id, "shopify")).toEqual({ revoked: false })
    expect(await database.select().from(tables.connections)).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })
  it("does not fake success for unsupported operations", async () => {
    await expect((await shopifyFor(org.id)).graphql("query Installed{shop{id}}")).rejects.toThrow(
      "not supported by the demo store"
    )
    expect(fetch).not.toHaveBeenCalled()
  })
  it("rejects demo credentials in production and does not intercept real merchants", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "production")
    vi.stubEnv("NODE_ENV", "production")
    expect(() => demoShopConnection(demoShopDomain, "demo")).toThrow("only available")
    expect(demoShopConnection("merchant.myshopify.com", "merchant-token")).toBe(false)
    expect(() => demoShopConnection("merchant.myshopify.com", "demo")).toThrow("only available")
  })
})
