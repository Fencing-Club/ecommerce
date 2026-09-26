import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import type { OrderInput } from "@repo/aisle"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { PDFDocument } from "pdf-lib"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import * as tables from "../src/db/schema"
import type { Session } from "../src/server/auth"

const context = vi.hoisted(() => ({ current: null as unknown, actor: null as Session | null }))
const storage = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  copies: [] as { from: string; to: string }[]
}))
vi.mock("@/db", () => ({ db: () => context.current }))
vi.mock("../src/server/auth", async (original) => ({
  ...(await original<typeof import("../src/server/auth")>()),
  session: async () => context.actor
}))
vi.mock("../src/server/storage", async (original) => ({
  ...(await original<typeof import("../src/server/storage")>()),
  putFile: async (key: string, bytes: Uint8Array) => void storage.files.set(key, bytes),
  getFile: async (key: string) => storage.files.get(key)!,
  copyFile: async (from: string, to: string) => {
    storage.copies.push({ from, to })
    storage.files.set(to, storage.files.get(from)!)
  }
}))
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))

import { DELETE, GET, POST } from "../src/app/api/inventory/barcodes/route"
import { attachProductBarcodes } from "../src/server/product-barcodes"
import { appUrl } from "../src/server/security"
import { applyMigrations } from "./migrations"

const pg = new PGlite()
const database = drizzle(pg, { schema: tables })
const buyerId = randomUUID()
const supplierOrgId = randomUUID()
const supplierId = randomUUID()
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

async function pdf(pages: number) {
  const doc = await PDFDocument.create()
  for (let index = 0; index < pages; index++) {
    doc.addPage()
  }
  return new Uint8Array(await doc.save())
}

async function upload(variantId: string, pages = 1, name = "label.pdf") {
  const form = new FormData()
  form.set("variantId", variantId)
  form.set("file", new File([await pdf(pages)], name, { type: "application/pdf" }))
  return POST(
    new Request(`${appUrl()}/api/inventory/barcodes`, { method: "POST", headers: { origin: appUrl() }, body: form })
  )
}

const barcodeUrl = (variantId: string) => `${appUrl()}/api/inventory/barcodes?${new URLSearchParams({ variantId })}`

function item(id: string, variantId: string): OrderInput["items"][number] {
  return {
    id,
    variantId,
    inventoryItemId: "gid://shopify/InventoryItem/1",
    name: "Foil cord",
    variant: "",
    buyerSku: variantId,
    supplierSku: "",
    asin: "",
    fnsku: "",
    pieces: 10,
    piecesPerSet: 1,
    unitPrice: 100,
    instructions: "",
    prepCategory: "POLYBAGGING"
  }
}

async function order(items: OrderInput["items"]) {
  const data = { reference: "PO-1", supplierId, currency: "USD", destination: "warehouse", items } as OrderInput
  const [row] = await database
    .insert(tables.orders)
    .values({ buyerOrgId: buyerId, supplierId, shopifyDomain: domain, data })
    .returning()
  return row!
}

const labels = (orderId: string) =>
  database
    .select()
    .from(tables.documents)
    .where(and(eq(tables.documents.orderId, orderId), eq(tables.documents.kind, "product_label")))

beforeAll(async () => {
  await applyMigrations(pg)
  context.current = database
  await database.insert(tables.organizations).values([
    { id: buyerId, name: "Buyer", kind: "buyer" },
    { id: supplierOrgId, name: "Supplier", kind: "supplier" }
  ])
  await database
    .insert(tables.suppliers)
    .values({ id: supplierId, buyerOrgId: buyerId, supplierOrgId, name: "Supplier", email: "s@example.com" })
  await database
    .insert(tables.connections)
    .values({ orgId: buyerId, provider: "shopify", externalId: domain, encryptedToken: "token" })
  const rows = [variantA, variantB].map((variantId) => ({
    variantId,
    productId: "gid://shopify/Product/1",
    levels: []
  }))
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
})

afterAll(async () => {
  await pg.close()
})

describe("product barcodes", () => {
  it("saves a one-page PDF for a synced variation and replaces it on upload", async () => {
    const first = await upload(variantA, 1, "first.pdf")
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ name: "first.pdf" })
    await upload(variantA, 1, "second.pdf")
    const rows = await database.select().from(tables.productBarcodes)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ variantId: variantA, productId: "gid://shopify/Product/1", name: "second.pdf" })
    const download = await GET(new Request(barcodeUrl(variantA)))
    expect(download.status).toBe(200)
    expect(download.headers.get("content-type")).toBe("application/pdf")
  })

  it("rejects multi-page files, unknown variations and supplier workspaces", async () => {
    const multi = await upload(variantB, 2)
    expect(multi.status).toBe(400)
    expect(await multi.json()).toEqual({ error: "Upload a barcode PDF with one page" })
    expect((await upload(unknownVariant)).status).toBe(404)
    context.actor = actor(supplierOrgId, "supplier")
    expect((await upload(variantB)).status).toBe(403)
    expect((await GET(new Request(barcodeUrl(variantA)))).status).toBe(403)
  })

  it("copies saved barcodes onto a PO's unlabelled lines and keeps labels uploaded on the PO", async () => {
    const withLabel = randomUUID()
    const withBarcode = randomUUID()
    const without = randomUUID()
    const created = await order([item(withLabel, variantA), item(withBarcode, variantA), item(without, variantB)])
    await database.insert(tables.documents).values({
      orderId: created.id,
      kind: "product_label",
      itemId: withLabel,
      objectKey: `orders/${created.id}/manual.pdf`,
      name: "manual.pdf",
      bytes: 1,
      orderRevision: 1,
      uploadedBy: "user"
    })
    await attachProductBarcodes(actor(buyerId, "buyer"), created.id)
    const attached = await labels(created.id)
    expect(attached.map((doc) => [doc.itemId, doc.name]).toSorted()).toEqual(
      [
        [withLabel, "manual.pdf"],
        [withBarcode, "second.pdf"]
      ].toSorted()
    )
    // Running again, such as on submit, adds nothing.
    await attachProductBarcodes(actor(buyerId, "buyer"), created.id)
    expect(await labels(created.id)).toHaveLength(2)
  })

  it("removes a barcode", async () => {
    const removed = await DELETE(new Request(barcodeUrl(variantA), { method: "DELETE", headers: { origin: appUrl() } }))
    expect(removed.status).toBe(200)
    expect(await database.select().from(tables.productBarcodes)).toEqual([])
    expect((await GET(new Request(barcodeUrl(variantA)))).status).toBe(404)
  })
})
