import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/auth"
import { type SheetRow, sheetColumns, sheetCsv } from "../src/server/product-sheet"

const context = vi.hoisted(() => ({ current: null as unknown, actor: null as Session | null }))
const storage = vi.hoisted(() => ({ putFile: vi.fn<() => Promise<void>>(async () => undefined) }))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))
vi.mock("../src/server/storage", () => ({ putFile: storage.putFile }))
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))

import { POST as saveCatalogRoute } from "../src/app/api/catalogs/route"
import { POST as assignCatalogRoute } from "../src/app/api/customers/[id]/catalog/route"
import { GET as exportCatalog } from "../src/app/api/supplier-catalog/export/route"
import { POST as importCatalog } from "../src/app/api/supplier-catalog/import/route"
import { POST as matchCatalog } from "../src/app/api/supplier-catalog/match/route"
import { POST as saveProduct } from "../src/app/api/supplier-catalog/products/route"
import { POST as saveStock } from "../src/app/api/supplier-catalog/stock/route"
import { GET as downloadTemplate } from "../src/app/api/supplier-catalog/template/route"
import { appUrl } from "../src/server/security"
import { applyMigrations } from "./migrations"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const buyerId = randomUUID()
const supplierA = randomUUID()
const supplierB = randomUUID()
const linkA = randomUUID()
const linkB = randomUUID()

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

const post = (url: string, body: unknown) =>
  new Request(`${appUrl()}${url}`, {
    method: "POST",
    headers: { origin: appUrl(), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

// A product with one variant, as the product page or an import makes it.
async function insertProduct(
  supplierOrgId: string,
  fields: Partial<typeof tables.supplierProducts.$inferInsert> & { supplierSku: string }
) {
  const title = fields.title ?? "Foil cord"
  const [group] = await database.insert(tables.supplierProductGroups).values({ supplierOrgId, title }).returning()
  const [variant] = await database
    .insert(tables.supplierProducts)
    .values({ currency: "USD", ...fields, title, supplierOrgId, groupId: group!.id })
    .returning()
  return variant!
}

// A template row with only the given cells filled in.
function row(cells: Partial<SheetRow>): SheetRow {
  return { ...Object.fromEntries(sheetColumns.map((column) => [column.key, ""])), ...cells } as SheetRow
}
const cord = row({
  handle: "foil-cord",
  title: "Foil cord",
  sku: "SAME",
  currency: "USD",
  price: "1.90",
  packsPerCase: "160"
})

function upload(csv: string, mode: "preview" | "commit", preview?: { revisionHash: string; fileHash: string }) {
  const form = new FormData()
  form.set("file", new File([csv], "products.csv", { type: "text/csv" }))
  form.set("mode", mode)
  if (preview) {
    form.set("revisionHash", preview.revisionHash)
    form.set("fileHash", preview.fileHash)
  }
  return importCatalog(
    new Request(`${appUrl()}/api/supplier-catalog/import`, {
      method: "POST",
      headers: { origin: appUrl() },
      body: form
    })
  )
}

async function importFile(csv: string) {
  const preview = await (await upload(csv, "preview")).json()
  return (await upload(csv, "commit", preview)).json()
}

function match(link: string, sku: string) {
  return matchCatalog(post("/api/supplier-catalog/match", { supplierId: link, currency: "USD", supplierSkus: [sku] }))
}

function productPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Foil cord",
    status: "active",
    category: "",
    productCode: "",
    url: "",
    description: "",
    optionNames: [],
    images: [],
    variants: [
      {
        supplierSku: "SAME",
        options: {},
        currency: "USD",
        priceMinor: 190,
        priceBasis: "piece",
        piecesPerSellablePack: 1,
        sellablePacksPerCase: 160,
        trackInventory: false,
        onHand: 0,
        continueSelling: false,
        priceBreaks: [],
        quantityRules: { increment: 1, minimum: 1, maximum: null }
      }
    ],
    ...overrides
  }
}

beforeAll(async () => {
  context.current = database
  await applyMigrations(pg)
})
afterAll(async () => pg.close())
beforeEach(async () => {
  await pg.exec("TRUNCATE organizations CASCADE")
  storage.putFile.mockClear()
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: supplierA, name: "Supplier A", kind: "supplier" },
    { id: supplierB, name: "Supplier B", kind: "supplier" }
  ])
  await database.insert(tables.suppliers).values([
    { id: linkA, buyerOrgId: buyerId, supplierOrgId: supplierA, name: "Supplier A", email: "owner@example.com" },
    { id: linkB, buyerOrgId: buyerId, supplierOrgId: supplierB, name: "Supplier B", email: "owner@example.com" }
  ])
  context.actor = actor(supplierA, "supplier")
})

describe("product template", () => {
  it("serves the blank template as CSV and as an Excel workbook", async () => {
    const csv = await downloadTemplate(new Request(`${appUrl()}/api/supplier-catalog/template?format=csv`))
    expect(csv.headers.get("Content-Disposition")).toBe('attachment; filename="product-template.csv"')
    // The byte order mark tells Excel the file is UTF-8; text() would drop it.
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await csv.arrayBuffer())).toBe(sheetCsv([]))
    const xlsx = await downloadTemplate(new Request(`${appUrl()}/api/supplier-catalog/template`))
    expect(xlsx.headers.get("Content-Type")).toContain("spreadsheetml")
    // An .xlsx file is a zip archive.
    expect(new TextDecoder().decode((await xlsx.arrayBuffer()).slice(0, 2))).toBe("PK")
  })

  it("keeps identical SKUs isolated per supplier and buyer lookups scoped to the chosen supplier", async () => {
    expect(await importFile(sheetCsv([cord]))).toEqual({ imported: true })
    context.actor = actor(supplierB, "supplier")
    expect(await importFile(sheetCsv([{ ...cord, price: "2.50" }]))).toEqual({ imported: true })
    context.actor = actor(buyerId, "buyer")
    expect((await (await match(linkA, "SAME")).json())[0]).toMatchObject({ status: "matched", unitPriceMinor: 190 })
    expect((await (await match(linkB, "SAME")).json())[0]).toMatchObject({ status: "matched", unitPriceMinor: 250 })
    expect((await (await match(linkA, "same")).json())[0]).toMatchObject({ status: "not_in_supplier_catalog" })
  })

  it("imports a product's variants under one handle, and a repeated file only once", async () => {
    const rows = [
      row({ handle: "blade", title: "Blade", option1Name: "Size", option1Value: "5", sku: "B5", price: "40" }),
      row({ handle: "blade", title: "Blade", option1Name: "Size", option1Value: "2", sku: "B2", price: "38" })
    ]
    const csv = sheetCsv(rows)
    const preview = await (await upload(csv, "preview")).json()
    expect(preview).toMatchObject({
      products: 1,
      createdProducts: 1,
      variants: { created: 2, updated: 0, unchanged: 0 }
    })
    expect(await (await upload(csv, "commit", preview)).json()).toEqual({ imported: true })
    expect(await (await upload(csv, "commit", preview)).json()).toEqual({ imported: false })
    expect(await database.select().from(tables.supplierProductGroups)).toHaveLength(1)
    const variants = await database.select().from(tables.supplierProducts)
    expect(variants.map((variant) => variant.title).toSorted()).toEqual(["Blade (2)", "Blade (5)"])
  })

  it("rejects a stale preview without changing products", async () => {
    context.actor = actor(buyerId, "buyer")
    expect((await upload(sheetCsv([cord]), "preview")).status).toBe(403)
    context.actor = actor(supplierA, "supplier")
    const stale = await (await upload(sheetCsv([cord]), "preview")).json()
    await insertProduct(supplierA, { supplierSku: "SAME", title: "Manual edit", priceMinor: 100 })
    expect((await upload(sheetCsv([cord]), "commit", stale)).status).toBe(400)
    const [variant] = await database.select().from(tables.supplierProducts)
    expect(variant).toMatchObject({ title: "Manual edit", priceMinor: 100, revision: 1 })
  })

  it("exports every product and reimports only what changed", async () => {
    const first = await insertProduct(supplierA, {
      supplierSku: "A,1",
      title: 'Foil "special" cord',
      priceMinor: 190,
      notes: "Line one\nLine two",
      priceBreaks: [{ minimum: 50, priceMinor: 170 }]
    })
    const second = await insertProduct(supplierA, { supplierSku: "B", title: "Epee cord", priceMinor: null })
    await insertProduct(supplierB, { supplierSku: "OTHER", title: "Other tenant" })
    const response = await exportCatalog(new Request(`${appUrl()}/api/supplier-catalog/export?format=csv`))
    const exported = await response.text()
    expect(exported).toContain('"Foil ""special"" cord"')
    expect(exported).toContain("50=1.70")
    expect(exported).not.toContain("OTHER")
    const edited = exported.replace(",1.90,", ",2.25,")
    const preview = await (await upload(edited, "preview")).json()
    expect(preview).toMatchObject({ variants: { created: 0, updated: 1, unchanged: 1 } })
    await upload(edited, "commit", preview)
    const rows = await database.select().from(tables.supplierProducts)
    expect(rows.find((variant) => variant.id === first.id)).toMatchObject({
      priceMinor: 225,
      revision: 2,
      notes: "Line one\nLine two",
      priceBreaks: [{ minimum: 50, priceMinor: 170 }]
    })
    expect(rows.find((variant) => variant.id === second.id)).toMatchObject({ priceMinor: null, revision: 1 })
  })

  it("names the row of a bad cell and keeps an on hand count left blank", async () => {
    const bad = await upload(sheetCsv([{ ...cord, priceBreaks: "50=2.00" }]), "preview")
    expect((await bad.json()).error).toBe("Row 2: Each break’s price must be lower than the one before")
    await insertProduct(supplierA, {
      supplierSku: "SAME",
      priceMinor: 190,
      sellablePacksPerCase: 160,
      trackInventory: true,
      onHand: 30
    })
    await importFile(sheetCsv([{ ...cord, trackInventory: "yes", continueSelling: "yes" }]))
    expect((await database.select().from(tables.supplierProducts))[0]).toMatchObject({
      onHand: 30,
      continueSelling: true
    })
  })
})

describe("products", () => {
  it("saves a product with variants, keeps edits tenant-scoped and rejects stale revisions", async () => {
    const created = await (await saveProduct(post("/api/supplier-catalog/products", productPayload()))).json()
    expect(created).toEqual({ id: expect.any(String), revision: 1 })
    context.actor = actor(supplierB, "supplier")
    expect(
      (await saveProduct(post("/api/supplier-catalog/products", productPayload({ id: created.id, revision: 1 }))))
        .status
    ).toBe(409)
    context.actor = actor(supplierA, "supplier")
    const archived = productPayload({ id: created.id, revision: 1, status: "archived" })
    expect((await saveProduct(post("/api/supplier-catalog/products", archived))).status).toBe(200)
    expect((await saveProduct(post("/api/supplier-catalog/products", archived))).status).toBe(409)
    context.actor = actor(buyerId, "buyer")
    expect((await (await match(linkA, "SAME")).json())[0]).toMatchObject({ status: "archived_supplier_product" })
  })

  it("refuses variants that repeat options or break volume pricing", async () => {
    const variant = productPayload().variants[0]!
    const twice = productPayload({ variants: [variant, { ...variant, supplierSku: "OTHER" }] })
    expect((await (await saveProduct(post("/api/supplier-catalog/products", twice))).json()).error).toBe(
      "Add an option to tell the variants apart"
    )
    const pricey = productPayload({ variants: [{ ...variant, priceBreaks: [{ minimum: 10, priceMinor: 200 }] }] })
    expect((await (await saveProduct(post("/api/supplier-catalog/products", pricey))).json()).error).toBe(
      "SAME: Each break’s price must be lower than the one before"
    )
  })

  it("saves changed on hand counts together and tells buyers what's available", async () => {
    const product = await insertProduct(supplierA, { supplierSku: "SAME", priceMinor: 190 })
    const other = await insertProduct(supplierA, { supplierSku: "OTHER", trackInventory: true, onHand: 5 })
    const stock = (onHand: number) =>
      saveStock(post("/api/supplier-catalog/stock", { counts: [{ id: product.id, onHand }] }))
    // An untracked product is made to order, so it has no count to set, and one bad count saves none.
    expect((await stock(12)).status).toBe(404)
    const both = {
      counts: [
        { id: other.id, onHand: 9 },
        { id: product.id, onHand: 12 }
      ]
    }
    expect((await saveStock(post("/api/supplier-catalog/stock", both))).status).toBe(404)
    expect(
      (await database.select().from(tables.supplierProducts).where(eq(tables.supplierProducts.id, other.id)))[0]
    ).toMatchObject({ onHand: 5 })
    await database
      .update(tables.supplierProducts)
      .set({ trackInventory: true })
      .where(eq(tables.supplierProducts.id, product.id))
    context.actor = actor(supplierB, "supplier")
    expect((await stock(12)).status).toBe(404)
    context.actor = actor(supplierA, "supplier")
    expect(await (await saveStock(post("/api/supplier-catalog/stock", both))).json()).toEqual({ saved: 2 })
    expect(
      (await database.select().from(tables.supplierProducts).where(eq(tables.supplierProducts.id, other.id)))[0]
    ).toMatchObject({ onHand: 9 })
    context.actor = actor(buyerId, "buyer")
    expect((await stock(12)).status).toBe(403)
    expect((await (await match(linkA, "SAME")).json())[0]).toMatchObject({ status: "matched", available: 12 })
  })
})

describe("catalogs", () => {
  async function saveCatalog(body: Record<string, unknown>) {
    return (await saveCatalogRoute(post("/api/catalogs", body))).json()
  }

  it("prices a customer's products from its active catalog", async () => {
    const cordVariant = await insertProduct(supplierA, {
      supplierSku: "SAME",
      priceMinor: 200,
      priceBreaks: [{ minimum: 100, priceMinor: 180 }]
    })
    const fixed = await insertProduct(supplierA, { supplierSku: "FIXED", title: "Mask", priceMinor: 5000 })
    await insertProduct(supplierA, { supplierSku: "LEFT", title: "Glove", priceMinor: 900 })
    const saved = await saveCatalog({
      title: "Wholesale",
      status: "active",
      adjustmentBasisPoints: -1000,
      includeNewProducts: false,
      customerIds: [linkA],
      products: [
        {
          productId: cordVariant.id,
          priceMinor: null,
          priceBreaks: null,
          quantityRules: { increment: 10, minimum: 20, maximum: null }
        },
        { productId: fixed.id, priceMinor: 4000, priceBreaks: null, quantityRules: null }
      ]
    })
    expect(saved).toEqual({ id: expect.any(String), revision: 1 })
    context.actor = actor(buyerId, "buyer")
    // 10% off, with the product's volume pricing adjusted too, and the catalog's own quantity rules.
    expect((await (await match(linkA, "SAME")).json())[0]).toMatchObject({
      status: "matched",
      unitPriceMinor: 180,
      tiers: [
        { minimumPieces: 1, unitPriceMinor: 180 },
        { minimumPieces: 100, unitPriceMinor: 162 }
      ],
      rules: { increment: 10, minimum: 20, maximum: null }
    })
    expect((await (await match(linkA, "FIXED")).json())[0]).toMatchObject({
      unitPriceMinor: 4000,
      tiers: [{ unitPriceMinor: 4000 }]
    })
    expect((await (await match(linkA, "LEFT")).json())[0]).toMatchObject({ status: "not_in_supplier_catalog" })

    // A draft catalog doesn't apply, and a customer without one sees every product at its own price.
    context.actor = actor(supplierA, "supplier")
    await saveCatalog({
      id: saved.id,
      revision: 1,
      title: "Wholesale",
      status: "draft",
      adjustmentBasisPoints: -1000,
      includeNewProducts: false,
      customerIds: [linkA],
      products: []
    })
    context.actor = actor(buyerId, "buyer")
    expect((await (await match(linkA, "LEFT")).json())[0]).toMatchObject({ status: "matched", unitPriceMinor: 900 })
  })

  it("adds new products to catalogs that take them, and keeps customers to the supplier's own", async () => {
    const saved = await saveCatalog({
      title: "Everything",
      status: "active",
      adjustmentBasisPoints: 0,
      includeNewProducts: true,
      customerIds: [],
      products: []
    })
    await saveProduct(post("/api/supplier-catalog/products", productPayload()))
    expect(await database.select().from(tables.catalogProducts)).toHaveLength(1)
    const assign = (customerId: string) =>
      assignCatalogRoute(post(`/api/customers/${customerId}/catalog`, { catalogId: saved.id }), {
        params: Promise.resolve({ id: customerId })
      })
    expect((await assign(linkB)).status).toBe(400)
    expect((await assign(linkA)).status).toBe(200)
    const [link] = await database.select().from(tables.suppliers).where(eq(tables.suppliers.id, linkA))
    expect(link!.catalogId).toBe(saved.id)
  })

  it("rejects a fixed price whose volume pricing doesn't go down", async () => {
    const variant = await insertProduct(supplierA, { supplierSku: "SAME", priceMinor: 200 })
    const result = await saveCatalog({
      title: "Bad",
      status: "active",
      adjustmentBasisPoints: 0,
      includeNewProducts: false,
      customerIds: [],
      products: [
        { productId: variant.id, priceMinor: 150, priceBreaks: [{ minimum: 10, priceMinor: 160 }], quantityRules: null }
      ]
    })
    expect(result.error).toBe("Foil cord: Each break’s price must be lower than the one before")
  })
})
