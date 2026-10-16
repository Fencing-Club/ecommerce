import { mkdir, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { Page } from "@playwright/test"
import { expect } from "../fixtures"

export type VariantInput = {
  sku: string
  // In dollars; null for no price yet.
  price?: number | null
  options?: Record<string, string>
  track?: boolean
  onHand?: number
  continueSelling?: boolean
}

export type ProductInput = {
  title: string
  status?: "active" | "archived"
  optionNames?: string[]
  variants: VariantInput[]
}

// Fixture requests share the browser's cookies and explicit app origin. They survive a document navigation.
async function send(page: Page, url: string, method: "POST" | "DELETE", body?: unknown) {
  if (!page.url().startsWith("http")) {
    await page.goto("/overview")
  }
  const response = await page.request.fetch(url, {
    method,
    data: body,
    headers: { "Content-Type": "application/json", Origin: new URL(page.url()).origin }
  })
  const result = { ok: response.ok(), text: await response.text() }
  expect(result.ok, result.text).toBe(true)
  const parsed: unknown = JSON.parse(result.text)
  return parsed
}

function idOf(result: unknown) {
  if (typeof result === "object" && result !== null && "id" in result && typeof result.id === "string") {
    return result.id
  }
  throw new Error(`No id in ${JSON.stringify(result)}`)
}

// Creates a product as the product page saves one, for a test that needs products to work with.
export async function createProduct(page: Page, input: ProductInput) {
  const result = await send(page, "/api/supplier-catalog/products", "POST", {
    title: input.title,
    status: input.status ?? "active",
    category: "",
    productCode: "",
    url: "",
    description: "",
    optionNames: input.optionNames ?? [],
    images: [],
    variants: input.variants.map((variant) => ({
      supplierSku: variant.sku,
      options: variant.options ?? {},
      currency: "USD",
      priceMinor: variant.price === undefined || variant.price === null ? null : Math.round(variant.price * 100),
      priceBasis: "piece",
      piecesPerSellablePack: 1,
      sellablePacksPerCase: null,
      trackInventory: variant.track ?? false,
      onHand: variant.onHand ?? 0,
      continueSelling: variant.continueSelling ?? false,
      priceBreaks: [],
      quantityRules: { increment: 1, minimum: 1, maximum: null },
      notes: null
    }))
  })
  return idOf(result)
}

// Creates a catalog that takes no new products, as the catalog page saves one.
export async function createCatalog(
  page: Page,
  input: { title: string; status?: "active" | "draft" | "archived"; productIds?: string[] }
) {
  const result = await send(page, "/api/catalogs", "POST", {
    title: input.title,
    status: input.status ?? "draft",
    adjustmentBasisPoints: 0,
    includeNewProducts: false,
    customerIds: [],
    products: (input.productIds ?? []).map((productId) => ({
      productId,
      priceMinor: null,
      priceBreaks: null,
      quantityRules: null
    }))
  })
  return idOf(result)
}

export async function deleteCatalog(page: Page, id: string) {
  await send(page, `/api/catalogs/${id}`, "DELETE")
}

// E2E Buyer is the supplier's one customer and has one catalog at a time, so the tests that assign it take turns
// across workers. A lock left by a run that was stopped expires after two minutes.
export async function withCustomer<T>(run: () => Promise<T>) {
  const key = (process.env.E2E_BASE_URL ?? process.env.E2E_PORT ?? "3005").replace(/\W+/g, "-")
  const lock = path.join(os.tmpdir(), `copacker-e2e-customer-${key}`)
  for (;;) {
    try {
      await mkdir(lock)
      break
    } catch {
      const age = await stat(lock).then(
        (info) => Date.now() - info.mtimeMs,
        () => 0
      )
      if (age > 120_000) {
        await rm(lock, { recursive: true, force: true })
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  try {
    return await run()
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

// A SKU no other test or run uses.
export function uniqueSku(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
}
