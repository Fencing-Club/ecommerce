import { beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import { AccessError, LocalizedError, NotFoundError } from "../src/i18n/errors"
import type { Access } from "../src/lib/access"
import { POST as saveCatalog } from "../src/server/http/api/catalogs"
import { DELETE as deleteCatalog } from "../src/server/http/api/catalogs/$id"
import {
  catalogPageData,
  catalogsPageData,
  customerPageData,
  customersPageData,
  inventoryPageData,
  productPageData,
  productsPageData,
  restockPageData,
  salesPageData
} from "../src/server/workspace-pages"
import { orderData } from "../src/stories/fixtures/orders"
import { database, setUpTestDatabase } from "./test-db"

const context: { actor: unknown } = vi.hoisted(() => ({ actor: null }))
vi.mock("@/db", () => import("./test-db"))
vi.mock("../src/server/auth", () => ({ session: async () => context.actor }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const supplier = id(1),
  foreign = id(2),
  buyer = id(3),
  product = id(4),
  variant = id(5),
  catalog = id(6),
  customer = id(7)
const session = (access: Access, kind: "supplier" | "buyer" | "forwarder" = "supplier") => ({
  role: "member" as const,
  access,
  org: { id: kind === "buyer" ? buyer : supplier, kind, restockSalesDays: 90, restockLeadTimeDays: 30 }
})
const owner = { ...session({}), role: "owner" as const }

setUpTestDatabase({ truncate: true })
beforeEach(async () => {
  await database.insert(tables.organizations).values([
    { id: supplier, name: "Supplier", kind: "supplier", workosId: "private-workos-id" },
    { id: foreign, name: "Foreign supplier", kind: "supplier" },
    { id: buyer, name: "Buyer", kind: "buyer" }
  ])
  await database.insert(tables.supplierProductGroups).values([
    { id: product, supplierOrgId: supplier, title: "Product", productCode: "P-1" },
    { id: id(14), supplierOrgId: foreign, title: "Foreign product" }
  ])
  await database.insert(tables.supplierProducts).values([
    {
      id: variant,
      groupId: product,
      supplierOrgId: supplier,
      title: "Product",
      supplierSku: "SKU-1",
      currency: "USD",
      priceMinor: 4321,
      priceBreaks: [{ minimum: 10, priceMinor: 1234 }],
      trackInventory: true,
      onHand: 75
    },
    {
      id: id(15),
      groupId: id(14),
      supplierOrgId: foreign,
      title: "Foreign product",
      supplierSku: "OTHER",
      currency: "USD",
      priceMinor: 9876
    }
  ])
  await database.insert(tables.catalogs).values([
    { id: catalog, supplierOrgId: supplier, title: "Catalog", adjustmentBasisPoints: -1500 },
    { id: id(16), supplierOrgId: foreign, title: "Foreign catalog" }
  ])
  await database.insert(tables.catalogProducts).values({ catalogId: catalog, productId: variant, priceMinor: 4567 })
  await database.insert(tables.suppliers).values([
    {
      id: customer,
      buyerOrgId: buyer,
      supplierOrgId: supplier,
      name: "Supplier",
      catalogId: catalog,
      invitationHash: "private-invitation-hash"
    },
    { id: id(17), buyerOrgId: buyer, supplierOrgId: foreign, name: "Other supplier" }
  ])
  await database.insert(tables.orders).values({
    buyerOrgId: buyer,
    supplierId: customer,
    shopifyDomain: "private-shop.myshopify.com",
    status: "submitted",
    data: orderData({ supplierId: customer, reference: "PO-PRIVATE" })
  })
  await database.insert(tables.connections).values({
    orgId: buyer,
    provider: "shopify",
    externalId: "private-shop.myshopify.com",
    encryptedToken: "private-provider-token"
  })
})

describe("page data authorization and serialization", () => {
  it("blocks catalog mutations without price access, even with an existing edit grant", async () => {
    context.actor = session({ catalogs: "edit" })
    const headers = { origin: "http://localhost:3000", "Content-Type": "application/json" }
    const save = await saveCatalog(
      new Request("http://localhost:3000/api/catalogs", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: catalog, title: "Changed" })
      })
    )
    const remove = await deleteCatalog(
      new Request(`http://localhost:3000/api/catalogs/${catalog}`, {
        method: "DELETE",
        headers
      }),
      { params: { id: catalog } }
    )
    expect(save.status).toBe(403)
    expect(remove.status).toBe(403)
    expect((await catalogsPageData(owner)).catalogs[0]?.title).toBe("Catalog")
  })
  it.each([
    ["catalog list", () => catalogsPageData(session({ catalogs: "view" }))],
    ["catalog detail", () => catalogPageData(session({ catalogs: "view" }), catalog)],
    ["new catalog", () => catalogPageData(session({ catalogs: "edit" }), null)],
    ["catalog edit grant", () => catalogPageData(session({ catalogs: "view", prices: "view" }), null)],
    ["customers", () => customersPageData(session({}))],
    ["customer detail", () => customerPageData(session({}), customer)],
    ["products", () => productsPageData(session({}))],
    ["product detail", () => productPageData(session({}), product)],
    ["inventory", () => inventoryPageData(session({}))]
  ])("rejects direct %s access before rendering", async (_name, run) => {
    await expect(run()).rejects.toThrow(AccessError)
  })

  it("keeps catalog metadata and entries within the supplier and omits storage ownership fields", async () => {
    const list = await catalogsPageData(owner)
    expect(list.catalogs.map((row) => row.title)).toEqual(["Catalog"])
    expect(Object.keys(list.catalogs[0]!).toSorted()).toEqual([
      "adjustmentBasisPoints",
      "customers",
      "id",
      "overrides",
      "products",
      "status",
      "title"
    ])
    const page = await catalogPageData(owner, catalog)
    expect(page?.data.entries[0]?.priceMinor).toBe(4567)
    expect(page?.data.catalog).not.toHaveProperty("supplierOrgId")
    expect(page?.data.catalog).not.toHaveProperty("createdAt")
    expect(await catalogPageData(owner, id(16))).toBeNull()
    await expect(catalogPageData(owner, "invalid")).rejects.toThrow(NotFoundError)
    expect((await catalogPageData(owner, null))?.data.catalog).toBeNull()
  })

  it("omits money and all order rows when only customer access is granted", async () => {
    const s = session({ customers: "view" })
    const list = await customersPageData(s)
    const detail = await customerPageData(s, customer)
    expect(list.customers[0]?.spent).toEqual([])
    expect(detail).toMatchObject({
      customer: { spent: [] },
      orders: [],
      prices: false,
      showOrders: false,
      openCatalog: false
    })
    const serialized = JSON.stringify({ list, detail })
    for (const privateValue of ["buyerOrgId", "private-invitation-hash", "PO-PRIVATE", "private-shop.myshopify.com"]) {
      expect(serialized).not.toContain(privateValue)
    }
    expect(await customerPageData(s, id(17))).toBeNull()
    await expect(customerPageData(s, "invalid")).rejects.toThrow(NotFoundError)
  })

  it("returns authorized orders without totals and restores amounts only with price access", async () => {
    const without = await customerPageData(session({ customers: "view", orders: "view" }), customer)
    expect(without?.orders[0]).toMatchObject({ reference: "PO-PRIVATE", total: null })
    const withPrices = await customerPageData(owner, customer)
    expect(withPrices?.customer.spent.length).toBeGreaterThan(0)
    expect(withPrices?.orders[0]?.total).toBeGreaterThan(0)
    expect(withPrices?.customer.createdAt).toBeInstanceOf(Date)
    expect(withPrices?.openCatalog).toBe(true)
  })

  it("projects product lists and details, dropping both unit prices and volume pricing for a member", async () => {
    const s = session({ products: "edit" })
    const list = await productsPageData(s)
    if (list.kind !== "supplier") {
      throw new Error("Expected supplier data")
    }
    expect(list.editable).toBe(false)
    expect(list.products).toHaveLength(1)
    expect(list.products[0]?.variants[0]?.priceMinor).toBeNull()
    expect(list.products[0]).not.toHaveProperty("supplierOrgId")
    expect(list.products[0]?.variants[0]).not.toHaveProperty("priceBreaks")
    const detail = await productPageData(s, product)
    expect(detail).toMatchObject({ readOnly: true, initial: { variants: [{ priceMinor: null, priceBreaks: [] }] } })
    expect(JSON.stringify(detail)).not.toContain("4321")
    expect(JSON.stringify(detail)).not.toContain("1234")
    const allowed = await productPageData(owner, product)
    expect(allowed?.initial.variants[0]).toMatchObject({
      priceMinor: 4321,
      priceBreaks: [{ minimum: 10, priceMinor: 1234 }]
    })
    expect(allowed?.readOnly).toBe(false)
    expect(await productPageData(owner, id(14))).toBeNull()
    await expect(productPageData(owner, "invalid")).rejects.toThrow(NotFoundError)
  })

  it("returns only provider names to the buyer", async () => {
    const s = session({ products: "view" }, "buyer")
    expect(await productsPageData(s)).toEqual({ kind: "buyer", providers: ["shopify"] })
  })

  it("keeps stock scoped to the supplier", async () => {
    const page = await inventoryPageData(session({ inventory: "view" }))
    expect(page.rows.map((row) => row.supplierSku)).toEqual(["SKU-1"])
    expect(page.rows[0]?.onHand).toBe(75)
  })

  it("validates buyer page access and emits only the selected settings", () => {
    const s = session({ restock: "view", sales: "view" }, "buyer")
    expect(restockPageData(s)).toEqual({ settings: { days: 90, leadTimeDays: 30 } })
    expect(salesPageData(s)).toEqual({})
    expect(() => salesPageData(session({}, "buyer"))).toThrow(AccessError)
    expect(() => restockPageData(session({}, "buyer"))).toThrow(AccessError)
    expect(() => salesPageData(owner)).toThrow(LocalizedError)
    expect(() => restockPageData(owner)).toThrow(LocalizedError)
  })

  it("rejects incompatible workspace kinds instead of reading another kind's records", async () => {
    const other = { ...owner, org: { ...owner.org, kind: "forwarder" as const } }
    for (const run of [
      () => catalogsPageData(other),
      () => catalogPageData(other, catalog),
      () => customersPageData(other),
      () => customerPageData(other, customer),
      () => productsPageData(other),
      () => productPageData(other, product),
      () => inventoryPageData(other)
    ]) {
      await expect(run()).rejects.toThrow(LocalizedError)
    }
  })
})
