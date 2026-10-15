import { forbidden } from "next/navigation"
import { z } from "zod"
import { can } from "@/lib/access"
import { session } from "@/server/auth"
import { errorResponse } from "@/server/errors"
import { inventoryContext } from "@/server/inventory-context"
import { type AmazonOnlyStock, groupInventory, isCollective, pageSizes } from "@/server/inventory-products"
import { withRequest } from "@/server/next-request"
import { fnskuFor, type ProductBarcode, readProductBarcodes } from "@/server/product-barcodes"
import { noDefaults, readProductDefaults } from "@/server/product-defaults"
import { readVariantFields } from "@/server/product-fields"
import { serverText } from "@/server/text"

const querySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  // "missing" lists only products with a variation that has no barcode.
  barcode: z.literal("missing").optional(),
  // "missing" lists only products with a standard-label variation that has no country of origin in Shopify.
  country: z.literal("missing").optional(),
  page: z
    .string()
    .regex(/^[1-9]\d{0,4}$/)
    .transform(Number)
    .default(1),
  pageSize: z.enum(pageSizes.map(String)).transform(Number).default(25)
})

const holdsStock = (stock: AmazonOnlyStock) =>
  [stock.fba, stock.awd].some((pool) =>
    [pool?.available, pool?.onHand, pool?.incoming].some((value) => (value ?? 0) > 0)
  )

// SKUs more than one Shopify variation uses, ignoring case. Bulk barcode uploads and Amazon matching can't tell them
// apart, so they're fixed in Shopify.
function duplicateSkus(rows: Awaited<ReturnType<typeof inventoryContext>>["rows"]) {
  const bySku = new Map<
    string,
    { sku: string; variants: { variantId: string; product: string; variant: string | null }[] }
  >()
  for (const row of rows) {
    const sku = row.buyerSku?.trim()
    if (!sku) {
      continue
    }
    const entry = bySku.get(sku.toLowerCase()) ?? { sku, variants: [] }
    entry.variants.push({
      variantId: row.variantId,
      product: row.productTitle ?? sku,
      variant: row.variantTitle && row.variantTitle !== "Default Title" ? row.variantTitle : null
    })
    bySku.set(sku.toLowerCase(), entry)
  }
  return [...bySku.values()]
    .filter((entry) => entry.variants.length > 1)
    .toSorted((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true }))
}

// Inventory across Shopify's counted locations and Amazon's FBA and AWD, grouped by product, one page at a time.
export const GET = withRequest(async function GET(request: Request) {
  const s = await session()
  const headers = { "Cache-Control": "private, no-store" }
  if (s.org.kind !== "buyer") {
    return errorResponse("buyerWorkspaceRequired", 403, headers)
  }
  // The Products page, and purchase orders' product picker.
  if (!can(s, "products") && !can(s, "orders", "edit")) {
    forbidden()
  }
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) {
    return errorResponse("invalidInventoryQuery", 400, headers)
  }
  const { page, pageSize, q, barcode, country } = query.data
  const { domain, data, rows, inventoryRows, inventoryClassifications, onOrder, amazonOnly, fbaRows } =
    await inventoryContext(s.org.id)
  // Every Shopify product is listed, including those stocked only at locations that don't count toward the totals.
  const grouped = groupInventory(inventoryRows, {
    untitled: (await serverText())("untitledProduct"),
    everyProduct: true,
    query: q,
    classifications: inventoryClassifications,
    onOrder
  })
  const [defaults, barcodes, fields] = domain
    ? await Promise.all([
        readProductDefaults(s.org.id, domain),
        readProductBarcodes(s.org.id, domain),
        readVariantFields(s.org.id, domain)
      ])
    : [new Map(), new Map<string, ProductBarcode>(), new Map()]
  // Variations whose product needs an uploaded label, such as one with size measurements, and that don't have one.
  // Others get the standard FNSKU label.
  const unlabelled = (product: (typeof grouped)[number]) =>
    defaults.get(product.productId)?.productLabel === "uploaded"
      ? product.variants.filter((variant) => !barcodes.has(variant.variantId)).length
      : 0
  // Standard-label variations with no country of origin in Shopify, whose labels leave out "Made in". Undefined means
  // the snapshot predates collecting it.
  // A bundle has no inventory item of its own, so it takes its components' countries.
  const ownCountries = new Map(rows.map((row) => [row.variantId, row.countryOfOrigin]))
  const countries = new Map(
    rows.map((row) => {
      const components = row.bundle?.components
      if (row.countryOfOrigin || !components?.length) {
        return [row.variantId, row.countryOfOrigin]
      }
      const codes = components.map((component) => ownCountries.get(component.variantId))
      if (codes.some((code) => code === undefined)) {
        return [row.variantId, row.countryOfOrigin]
      }
      const known = [...new Set(codes.filter(Boolean))]
      return [row.variantId, known.length ? known.join(", ") : null]
    })
  )
  const withoutCountry = (product: (typeof grouped)[number]) =>
    defaults.get(product.productId)?.productLabel === "uploaded"
      ? 0
      : product.variants.filter((variant) => countries.get(variant.variantId) === null).length
  const products = grouped.filter(
    (product) => (!barcode || unlabelled(product) > 0) && (!country || withoutCountry(product) > 0)
  )
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
  const pageNumber = Math.min(page, totalPages)
  const levels = rows.flatMap((row) => row.levels)
  const supplierSkus = new Map(rows.map((row) => [row.variantId, row.supplierSku ?? null]))
  return Response.json(
    {
      observedAt: data?.observedAt ?? null,
      // Snapshots saved before product details and location kinds were collected need one more sync.
      needsResync:
        rows.some(
          (row) =>
            row.productId === undefined ||
            row.amazonStockTarget === undefined ||
            row.caseQuantity === undefined ||
            row.unitCostMinor === undefined ||
            row.countryOfOrigin === undefined
        ) || levels.some((level) => !level.locationKind),
      // Amazon SKUs that match no single Shopify variant and hold or expect stock. Resold-returns listings, and
      // listings Amazon still reports with nothing on hand or inbound, are left out.
      amazonOnly: amazonOnly.filter((stock) => !stock.resold && holdsStock(stock)),
      page: pageNumber,
      pageSize,
      totalPages,
      totalProducts: products.length,
      totalVariants: products.reduce((sum, product) => sum + product.variants.length, 0),
      // Variations in this selection that need an uploaded label and don't have one.
      missingBarcodes: grouped.reduce((sum, product) => sum + unlabelled(product), 0),
      missingCountries: grouped.reduce((sum, product) => sum + withoutCountry(product), 0),
      duplicateSkus: duplicateSkus(rows.filter((row) => !isCollective(row))),
      products: products.slice((pageNumber - 1) * pageSize, pageNumber * pageSize).map((product) => ({
        ...product,
        defaults: defaults.get(product.productId) ?? noDefaults,
        variants: product.variants.map((variant) => ({
          ...variant,
          barcode: barcodes.get(variant.variantId) ?? null,
          // For the standard label; null until Amazon's FBA sync reports exactly one for the SKU.
          fnsku: variant.sku ? fnskuFor(fbaRows ?? [], variant.sku) : null,
          // Kept in Copacker and edited from the product's Edit panel.
          supplierSku: supplierSkus.get(variant.variantId) ?? null,
          asin: fields.get(variant.variantId)?.asin ?? null,
          storeStockTarget: fields.get(variant.variantId)?.storeStockTarget ?? null,
          // ISO codes from Shopify (a bundle's come from its components), null when none is recorded, or left out
          // before a sync collects it.
          countryOfOrigin: countries.get(variant.variantId)
        }))
      }))
    },
    { headers }
  )
})
