import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/auth"
import { catalogTemplate, parseSupplierCatalogCsv } from "../src/server/supplier-catalog-csv"

const context = vi.hoisted(() => ({ current: null as unknown, actor: null as Session | null }))
const storage = vi.hoisted(() => ({ putFile: vi.fn<() => Promise<void>>(async () => undefined) }))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))
vi.mock("../src/server/storage", () => ({ putFile: storage.putFile }))
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))

import { GET as exportCatalog } from "../src/app/api/supplier-catalog/export/route"
import { POST as importCatalog } from "../src/app/api/supplier-catalog/import/route"
import { POST as matchCatalog } from "../src/app/api/supplier-catalog/match/route"
import { POST as saveProduct } from "../src/app/api/supplier-catalog/products/route"
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
    user: { id: `user-${id}`, email: "owner@example.com", emailVerified: true },
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
    workspaces: []
  }
}

function upload(csv: string, mode: "preview" | "commit", preview?: { revisionHash: string; fileHash: string }) {
  const form = new FormData()
  form.set("file", new File([csv], "catalog.csv", { type: "text/csv" }))
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

function match(link: string, sku: string) {
  return matchCatalog(
    new Request(`${appUrl()}/api/supplier-catalog/match`, {
      method: "POST",
      headers: { origin: appUrl(), "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: link, currency: "USD", supplierSkus: [sku] })
    })
  )
}

function save(id: string, revision: number, active: boolean) {
  return saveProduct(
    new Request(`${appUrl()}/api/supplier-catalog/products`, {
      method: "POST",
      headers: { origin: appUrl(), "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        revision,
        supplierSku: "SAME",
        title: "Foil cord",
        currency: "USD",
        priceMinor: 190,
        priceBasis: "piece",
        piecesPerSellablePack: 1,
        sellablePacksPerCase: 160,
        notes: null,
        active
      })
    })
  )
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

describe("supplier catalog API", () => {
  const csv = `${catalogTemplate}SAME,Foil cord,USD,1.90,piece,1,160,\r\n`

  it("serves an Excel-compatible CSV template with an attachment filename", async () => {
    const response = await downloadTemplate()
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="supplier-catalog-template.csv"')
    expect(await response.text()).toBe(catalogTemplate)
  })

  it("keeps identical supplier SKUs isolated and buyer lookup scoped to the selected supplier", async () => {
    const previewA = await upload(csv, "preview")
    expect(previewA.status).toBe(200)
    const stateA = await previewA.json()
    expect((await upload(csv, "commit", stateA)).status).toBe(200)

    context.actor = actor(supplierB, "supplier")
    const secondCsv = `${catalogTemplate}SAME,Foil cord,USD,2.50,piece,1,160,\r\n`
    const stateB = await (await upload(secondCsv, "preview")).json()
    expect((await upload(secondCsv, "commit", stateB)).status).toBe(200)

    context.actor = actor(buyerId, "buyer")
    expect((await (await match(linkA, "SAME")).json())[0]).toMatchObject({ status: "matched", unitPriceMinor: 190 })
    expect((await (await match(linkB, "SAME")).json())[0]).toMatchObject({ status: "matched", unitPriceMinor: 250 })
    expect((await (await match(linkA, "same")).json())[0]).toMatchObject({ status: "not_in_supplier_catalog" })
  })

  it("rejects buyer uploads and stale previews without changing supplier products", async () => {
    context.actor = actor(buyerId, "buyer")
    expect((await upload(csv, "preview")).status).toBe(403)
    context.actor = actor(supplierA, "supplier")
    const stale = await (await upload(csv, "preview")).json()
    await database.insert(tables.supplierProducts).values({
      supplierOrgId: supplierA,
      supplierSku: "SAME",
      title: "Manual edit",
      currency: "USD",
      priceMinor: 100
    })
    const response = await upload(csv, "commit", stale)
    expect(response.status).toBe(400)
    expect(
      (
        await database
          .select()
          .from(tables.supplierProducts)
          .where(eq(tables.supplierProducts.supplierOrgId, supplierA))
      )[0]
    ).toMatchObject({ title: "Manual edit", priceMinor: 100, revision: 1 })
  })

  it("treats a repeated file as one import and does not bump the product revision", async () => {
    const preview = await (await upload(csv, "preview")).json()
    expect(await (await upload(csv, "commit", preview)).json()).toMatchObject({ imported: true, created: 1 })
    expect(await (await upload(csv, "commit", preview)).json()).toMatchObject({ imported: false })
    expect(await database.select().from(tables.supplierCatalogImports)).toHaveLength(1)
    expect((await database.select().from(tables.supplierProducts))[0]).toMatchObject({ revision: 1 })
  })

  it("keeps manual edits tenant-scoped and rejects stale revisions", async () => {
    const [created] = await database
      .insert(tables.supplierProducts)
      .values({
        supplierOrgId: supplierA,
        supplierSku: "SAME",
        title: "Foil cord",
        currency: "USD",
        priceMinor: 190
      })
      .returning()
    context.actor = actor(supplierB, "supplier")
    expect((await save(created!.id, 1, false)).status).toBe(409)
    context.actor = actor(supplierA, "supplier")
    expect((await save(created!.id, 1, false)).status).toBe(200)
    expect((await save(created!.id, 1, true)).status).toBe(409)
    context.actor = actor(buyerId, "buyer")
    expect((await (await match(linkA, "SAME")).json())[0]).toMatchObject({ status: "archived_supplier_product" })
  })

  it("exports only this supplier's active catalog and reimports changed fields without revising unchanged rows", async () => {
    const [first, second] = await database
      .insert(tables.supplierProducts)
      .values([
        {
          supplierOrgId: supplierA,
          supplierSku: "A,1",
          title: 'Foil "special"\ncord',
          currency: "USD",
          priceMinor: 190,
          notes: "Line one\nLine two"
        },
        { supplierOrgId: supplierA, supplierSku: "B", title: "Epee cord", currency: "USD", priceMinor: null },
        { supplierOrgId: supplierA, supplierSku: "OLD", title: "Archived", currency: "USD", active: 0 },
        { supplierOrgId: supplierB, supplierSku: "OTHER", title: "Other tenant", currency: "USD" }
      ])
      .returning()
    const response = await exportCatalog()
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="supplier-catalog.csv"')
    const exported = await response.text()
    expect(parseSupplierCatalogCsv(exported)).toMatchObject([
      { supplierSku: "A,1", title: 'Foil "special"\ncord', priceMinor: 190, notes: "Line one\nLine two" },
      { supplierSku: "B", priceMinor: null }
    ])
    const edited = exported.replace("1.90,piece", "2.25,piece")
    const preview = await (await upload(edited, "preview")).json()
    expect(preview).toMatchObject({ count: 2, created: 0, updated: 1, unchanged: 1 })
    expect(await (await upload(edited, "commit", preview)).json()).toMatchObject({
      imported: true,
      created: 0,
      updated: 1,
      unchanged: 1
    })
    const rows = await database.select().from(tables.supplierProducts)
    expect(rows.find((row) => row.id === first!.id)).toMatchObject({ priceMinor: 225, revision: 2 })
    expect(rows.find((row) => row.id === second!.id)).toMatchObject({ priceMinor: null, revision: 1 })
    expect(rows.find((row) => row.supplierSku === "OLD")).toMatchObject({ active: 0 })
  })

  it("denies buyers access to supplier exports and requires the exact previewed file", async () => {
    context.actor = actor(buyerId, "buyer")
    expect((await exportCatalog()).status).toBe(403)
    context.actor = actor(supplierA, "supplier")
    const preview = await (await upload(csv, "preview")).json()
    const changed = csv.replace("1.90", "2.00")
    expect((await upload(changed, "commit", preview)).status).toBe(400)
    expect(await database.select().from(tables.supplierProducts)).toHaveLength(0)
  })
})
