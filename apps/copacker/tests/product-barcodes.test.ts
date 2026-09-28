import { randomUUID } from "node:crypto"
import { inflateSync } from "node:zlib"
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
  files: new Map<string, Uint8Array>()
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
  deleteFile: async (key: string) => void storage.files.delete(key)
}))
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn<() => void>() }))
// Shopify records the test variations as made in Pakistan, except CORD-1 (China). Variation 3 stands in for a bundle
// of CORD-1 and GLOVE-6, with no country of its own.
type TestVariant = {
  id: string
  inventoryItem: { countryCodeOfOrigin: string | null }
  productVariantComponents: { nodes: { productVariant: { id: string } }[] }
}
const shopify = vi.hoisted(() => ({
  variants: vi.fn<(ids: string[]) => Promise<TestVariant[]>>(async (ids) =>
    ids.map((id) => ({
      id,
      inventoryItem: {
        countryCodeOfOrigin:
          new Map<string, string | null>([
            ["gid://shopify/ProductVariant/1", "CN"],
            ["gid://shopify/ProductVariant/3", null]
          ]).get(id) ?? (id === "gid://shopify/ProductVariant/3" ? null : "PK")
      },
      productVariantComponents: {
        nodes:
          id === "gid://shopify/ProductVariant/3"
            ? [
                { productVariant: { id: "gid://shopify/ProductVariant/1" } },
                { productVariant: { id: "gid://shopify/ProductVariant/2" } }
              ]
            : []
      }
    }))
  )
}))
// Amazon lists only GLOVE-6 when Copacker asks for FNSKUs it hasn't synced.
const amazon = vi.hoisted(() => ({
  listings: vi.fn<(sellerId: string, skus: string[]) => Promise<Map<string, { asin: string; fnsku: string }>>>(
    async (_sellerId, skus) =>
      new Map(skus.filter((sku) => sku === "GLOVE-6").map((sku) => [sku, { asin: "B00GLOVE06", fnsku: "X00GLOVE06" }]))
  )
}))
vi.mock("../src/server/connections", async (original) => ({
  ...(await original<typeof import("../src/server/connections")>()),
  shopifyFor: async () => shopify,
  amazonFor: async () => amazon
}))

import { DELETE, GET, POST } from "../src/app/api/inventory/barcodes/route"
import { POST as downloadLabels } from "../src/app/api/inventory/labels/route"
import { GET as listLabelTypes, PATCH as setLabelTypes } from "../src/app/api/inventory/product-labels/route"
import { GET as lineLabel } from "../src/app/api/orders/[id]/labels/[itemId]/route"
import { GET as orderLabels } from "../src/app/api/orders/[id]/labels/route"
import { deleteDraftOrder } from "../src/server/orders"
import { labelFileName, lineLabels } from "../src/server/product-barcodes"
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
const sharedA = "gid://shopify/ProductVariant/3"
const sharedB = "gid://shopify/ProductVariant/4"
const unknownVariant = "gid://shopify/ProductVariant/99"

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

// A bulk upload: no variation chosen, so the SKU comes from the sku field or the file name.
async function uploadBySku(name: string, sku?: string) {
  const form = new FormData()
  form.set("file", new File([await pdf(1)], name, { type: "application/pdf" }))
  if (sku) {
    form.set("sku", sku)
  }
  return POST(
    new Request(`${appUrl()}/api/inventory/barcodes`, { method: "POST", headers: { origin: appUrl() }, body: form })
  )
}

const barcodeKeys = () => [...storage.files.keys()].filter((key) => key.startsWith("barcodes/"))

const barcodeUrl = (variantId: string) => `${appUrl()}/api/inventory/barcodes?${new URLSearchParams({ variantId })}`

// The test store's SKUs, as the stock snapshot below lists them.
const skus: Record<string, string> = { [variantA]: "CORD-1", [variantB]: "GLOVE-6" }

function item(id: string, variantId: string): OrderInput["items"][number] {
  return {
    id,
    variantId,
    inventoryItemId: "gid://shopify/InventoryItem/1",
    name: "Foil cord",
    variant: "",
    buyerSku: skus[variantId] ?? variantId,
    supplierSku: "",
    asin: "",
    fnsku: "",
    pieces: 10,
    piecesPerSet: 1,
    unitPrice: 100,
    instructions: "",
    prepCategory: "POLYBAGGING",
    suffocationWarning: false,
    amazonNetwork: "fba"
  }
}

async function order(items: OrderInput["items"], destination: OrderInput["destination"] = "warehouse") {
  const data = { reference: "PO-1", supplierId, currency: "USD", destination, items } as OrderInput
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

// Each line's label state, as the PO works it out from its products now.
const states = async (po: Awaited<ReturnType<typeof order>>) =>
  Object.fromEntries((await lineLabels(po)).map((label) => [label.itemId, label.state]))

const downloadLine = (orderId: string, itemId: string) =>
  lineLabel(new Request(`${appUrl()}/api/orders/${orderId}/labels/${itemId}`), {
    params: Promise.resolve({ id: orderId, itemId })
  })

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
  const rows = [
    { variantId: variantA, buyerSku: "CORD-1", productTitle: "Foil cord", variantTitle: "Default Title" },
    { variantId: variantB, buyerSku: "GLOVE-6", productTitle: "Glove", variantTitle: "6 / Left" },
    { variantId: sharedA, buyerSku: "SHARED", productTitle: "Mask", variantTitle: "S" },
    { variantId: sharedB, buyerSku: "SHARED", productTitle: "Mask", variantTitle: "M" }
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
})

afterAll(async () => {
  await pg.close()
})

describe("product barcodes", () => {
  it("saves a one-page PDF for a synced variation and replaces it on upload", async () => {
    const first = await upload(variantA, 1, "first.pdf")
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ name: "first.pdf" })
    const second = await upload(variantA, 1, "second.pdf")
    expect(await second.json()).toMatchObject({ replaced: true, target: { sku: "CORD-1", variant: null } })
    const rows = await database.select().from(tables.productBarcodes)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ variantId: variantA, productId: "gid://shopify/Product/1", name: "second.pdf" })
    // The replaced file is deleted from storage.
    expect(barcodeKeys()).toEqual([rows[0]!.objectKey])
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

  it("labels each PO line from its product: its upload, or the standard label with the SKU without Amazon", async () => {
    const uploaded = randomUUID()
    const standard = randomUUID()
    const po = await order([item(uploaded, variantA), item(standard, variantB)])
    expect(await states(po)).toEqual({ [uploaded]: "uploaded", [standard]: "standard" })
    // Labels are made when downloaded, and never stored on the PO.
    const upload = await downloadLine(po.id, uploaded)
    expect(upload.status).toBe(200)
    expect(upload.headers.get("content-disposition")).toContain("second.pdf")
    const made = await downloadLine(po.id, standard)
    expect(made.status).toBe(200)
    expect(made.headers.get("content-disposition")).toContain(encodeURIComponent("Foil cord.pdf"))
    expect(await labels(po.id)).toEqual([])
    expect((await downloadLine(po.id, randomUUID())).status).toBe(404)
  })
  it("matches bulk uploads by the SKU in the file name, or a SKU given instead", async () => {
    const byName = await uploadBySku("glove-6.PDF")
    expect(byName.status).toBe(200)
    expect(await byName.json()).toMatchObject({
      replaced: false,
      target: { variantId: variantB, sku: "GLOVE-6", product: "Glove", variant: "6 / Left" }
    })
    const unknown = await uploadBySku("scan 001.pdf")
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({ error: 'No variation has the SKU "scan 001"' })
    const shared = await uploadBySku("shared.pdf")
    expect(shared.status).toBe(409)
    expect((await shared.json()).error).toMatch(/^2 variations share the SKU "shared"/)
    const retried = await uploadBySku("scan 001.pdf", " glove-6 ")
    expect(await retried.json()).toMatchObject({ replaced: true, target: { variantId: variantB } })
    // Only the saved barcodes' files remain; files for rejected uploads were never stored.
    const saved = await database.select().from(tables.productBarcodes)
    expect(barcodeKeys().toSorted()).toEqual(saved.map((row) => row.objectKey).toSorted())
  })

  it("removes a barcode and its file", async () => {
    const [saved] = await database
      .select()
      .from(tables.productBarcodes)
      .where(eq(tables.productBarcodes.variantId, variantA))
    const removed = await DELETE(new Request(barcodeUrl(variantA), { method: "DELETE", headers: { origin: appUrl() } }))
    expect(removed.status).toBe(200)
    expect(
      await database.select().from(tables.productBarcodes).where(eq(tables.productBarcodes.variantId, variantA))
    ).toEqual([])
    expect(storage.files.has(saved!.objectKey)).toBe(false)
    // With the upload gone the standard label applies; without Amazon it prints the Shopify SKU.
    const standard = await GET(new Request(barcodeUrl(variantA)))
    expect(standard.status).toBe(200)
    expect(standard.headers.get("content-disposition")).toContain(encodeURIComponent("Foil cord.pdf"))
  })
})

describe("standard product labels", () => {
  const fnsku = "X00CORD001"
  const setProductLabel = (productLabel: "standard" | "uploaded" | "none") =>
    database
      .insert(tables.productDefaults)
      .values({ orgId: buyerId, shopifyDomain: domain, productId: "gid://shopify/Product/1", productLabel })
      .onConflictDoUpdate({
        target: [tables.productDefaults.orgId, tables.productDefaults.shopifyDomain, tables.productDefaults.productId],
        set: { productLabel }
      })

  beforeAll(async () => {
    await database
      .insert(tables.connections)
      .values({ orgId: buyerId, provider: "amazon", externalId: "SELLER1", encryptedToken: "token" })
    await database.insert(tables.stockSnapshots).values({
      orgId: buyerId,
      source: "fba",
      externalAccountId: "SELLER1",
      scopeKey: "ATVPDKIKX0DER",
      data: {
        source: "fba",
        rows: [{ sellerSku: "CORD-1", fnSku: fnsku }]
      } as unknown as typeof tables.stockSnapshots.$inferInsert.data
    })
  })

  it("previews the standard FNSKU label for a variation without an upload", async () => {
    const preview = await GET(new Request(`${barcodeUrl(variantA)}&view=inline`))
    expect(preview.status).toBe(200)
    expect(preview.headers.get("content-disposition")).toBe(
      `inline; filename*=UTF-8''${encodeURIComponent("Foil cord.pdf")}`
    )
    const pdf = await PDFDocument.load(new Uint8Array(await preview.arrayBuffer()))
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 })
  })

  it("prints the standard label, unless the product needs an uploaded one or no label", async () => {
    const line = randomUUID()
    const po = await order([{ ...item(line, variantA), fnsku }])
    expect(await states(po)).toEqual({ [line]: "standard" })

    await setProductLabel("uploaded")
    expect(await lineLabels(po)).toEqual([
      { itemId: line, state: "missing", problem: "Upload its label on the Products page" }
    ])
    expect((await downloadLine(po.id, line)).status).toBe(404)
    const preview = await GET(new Request(barcodeUrl(variantA)))
    expect(preview.status).toBe(404)
    expect(await preview.json()).toEqual({ error: "This product needs an uploaded label" })

    // No label: none on POs to the buyer's location, but Amazon still labels every unit.
    await setProductLabel("none")
    expect(await states(po)).toEqual({ [line]: "none" })
    expect(await states(await order([{ ...item(line, variantA), fnsku }], "amazon"))).toEqual({ [line]: "standard" })
    await setProductLabel("standard")
  })
  it("waits for the FNSKU on Amazon POs instead of printing the SKU", async () => {
    const line = randomUUID()
    const amazonBound = await order([item(line, variantA)], "amazon")
    expect(await lineLabels(amazonBound)).toEqual([
      { itemId: line, state: "missing", problem: "Its FNSKU is looked up when the purchase order is sent" }
    ])
  })
})

describe("deleting draft POs", () => {
  it("deletes a draft with its labels and files, and keeps sent POs", async () => {
    const line = randomUUID()
    const draft = await order([{ ...item(line, variantA), fnsku: "X00CORD001" }])
    // A label uploaded on the PO before labels were made from the products.
    const objectKey = `orders/${draft.id}/label.pdf`
    storage.files.set(objectKey, await pdf(1))
    await database.insert(tables.documents).values({
      orderId: draft.id,
      kind: "product_label",
      itemId: line,
      objectKey,
      name: "label.pdf",
      bytes: 1,
      orderRevision: 1,
      uploadedBy: "user"
    })
    const [label] = await labels(draft.id)
    expect(storage.files.has(label!.objectKey)).toBe(true)
    await deleteDraftOrder(actor(buyerId, "buyer"), draft.id)
    expect(await database.select().from(tables.orders).where(eq(tables.orders.id, draft.id))).toEqual([])
    expect(await labels(draft.id)).toEqual([])
    expect(storage.files.has(label!.objectKey)).toBe(false)

    const sent = await order([item(randomUUID(), variantA)])
    await database.update(tables.orders).set({ status: "submitted" }).where(eq(tables.orders.id, sent.id))
    await expect(deleteDraftOrder(actor(buyerId, "buyer"), sent.id)).rejects.toThrow(
      "Only draft purchase orders can be deleted"
    )
    await expect(deleteDraftOrder(actor(supplierOrgId, "supplier"), sent.id)).rejects.toThrow(
      "A buyer workspace is required"
    )
  })
})

describe("labels in bulk", () => {
  const product = "gid://shopify/Product/1"
  const json = (url: string, method: string, body: unknown) =>
    new Request(url, {
      method,
      headers: { origin: appUrl(), "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  const pages = async (response: Response) =>
    (await PDFDocument.load(new Uint8Array(await response.arrayBuffer()))).getPageCount()

  it("sets the label type for several products and downloads their labels as one PDF", async () => {
    expect(await (await listLabelTypes()).json()).toEqual([
      { productId: product, title: "Foil cord", variations: 4, productLabel: "standard" }
    ])
    // CORD-1 has a synced FNSKU, GLOVE-6 an upload, and the two SHARED variations print their SKU.
    const all = await downloadLabels(json(`${appUrl()}/api/inventory/labels`, "POST", { productIds: [product] }))
    expect(all.status).toBe(200)
    expect(all.headers.get("x-skipped-labels")).toBe("0")
    expect(await pages(all)).toBe(4)

    const set = await setLabelTypes(
      json(`${appUrl()}/api/inventory/product-labels`, "PATCH", { productIds: [product], productLabel: "uploaded" })
    )
    expect(await set.json()).toEqual({ updated: 1 })
    // Only GLOVE-6 has an uploaded label now; the rest are left out.
    const uploadedOnly = await downloadLabels(
      json(`${appUrl()}/api/inventory/labels`, "POST", { productIds: [product] })
    )
    expect(uploadedOnly.headers.get("x-skipped-labels")).toBe("3")
    expect(await pages(uploadedOnly)).toBe(1)
    await setLabelTypes(
      json(`${appUrl()}/api/inventory/product-labels`, "PATCH", { productIds: [product], productLabel: "standard" })
    )
  })

  it("looks up an FNSKU Amazon lists when the stock sync doesn't have it", async () => {
    await DELETE(new Request(barcodeUrl(variantB), { method: "DELETE", headers: { origin: appUrl() } }))
    const glove = await GET(new Request(barcodeUrl(variantB)))
    expect(glove.status).toBe(200)
    expect(amazon.listings).toHaveBeenCalledWith("SELLER1", ["GLOVE-6"])
  })

  it("prints a bundle's components' countries when it has none of its own", async () => {
    const response = await GET(new Request(barcodeUrl(sharedA)))
    expect(response.status).toBe(200)
    // The sheet's text is in its first (compressed) stream, drawn as hex strings.
    const pdf = Buffer.from(await response.arrayBuffer())
    const raw = pdf.toString("latin1")
    const start = raw.indexOf("stream\n") + 7
    const length = Number(/\/Length (\d+)/.exec(raw)![1])
    const text = inflateSync(pdf.subarray(start, start + length)).toString("latin1")
    const lines = [...text.matchAll(/<([0-9A-F]+)> Tj/g)].map((match) =>
      Buffer.from(match[1]!, "hex").toString("latin1")
    )
    expect(lines).toContain("Made in China and Pakistan")
  })

  it("combines a PO's labels, made from its products, in line order", async () => {
    const standard = randomUUID()
    const uploaded = randomUUID()
    const po = await order([{ ...item(standard, variantA), fnsku: "X00CORD001" }, item(uploaded, variantB)])
    await upload(variantB)
    const combined = await orderLabels(new Request(`${appUrl()}/api/orders/${po.id}/labels`), {
      params: Promise.resolve({ id: po.id })
    })
    expect(combined.status).toBe(200)
    expect(await pages(combined)).toBe(2)
    expect(await labels(po.id)).toEqual([])

    const unlabelled = await order([item(randomUUID(), variantA)], "amazon")
    const none = await orderLabels(new Request(`${appUrl()}/api/orders/${unlabelled.id}/labels`), {
      params: Promise.resolve({ id: unlabelled.id })
    })
    expect(none.status).toBe(404)
  })
})

describe("label file names", () => {
  it("names a generated label after its product and variation, without characters files can't have", () => {
    expect(labelFileName("Pro-Grip Fencing Glove (10, Left)")).toBe("Pro-Grip Fencing Glove (10, Left).pdf")
    expect(labelFileName('Mask: "Pro" 3/4')).toBe("Mask- -Pro- 3-4.pdf")
    expect(labelFileName("  ")).toBe("Product label.pdf")
  })
})
