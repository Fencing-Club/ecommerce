import { z } from "zod"
import { session } from "@/server/auth"
import { inventoryContext } from "@/server/inventory-context"
import { type AmazonOnlyStock, groupInventory, pageSizes } from "@/server/inventory-products"
import { fnskuFor, type ProductBarcode, readProductBarcodes } from "@/server/product-barcodes"
import { noDefaults, readProductDefaults } from "@/server/product-defaults"

const querySchema = z.strictObject({
  q: z.string().trim().max(100).optional(),
  // "missing" lists only products with a variation that has no barcode.
  barcode: z.literal("missing").optional(),
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
export async function GET(request: Request) {
  const s = await session()
  const headers = { "Cache-Control": "private, no-store" }
  if (s.org.kind !== "buyer") {
    return Response.json({ error: "A buyer workspace is required" }, { status: 403, headers })
  }
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) {
    return Response.json({ error: "Invalid inventory query" }, { status: 400, headers })
  }
  const { page, pageSize, q, barcode } = query.data
  const { domain, data, rows, inventoryRows, inventoryClassifications, onOrder, amazonOnly, fbaRows } =
    await inventoryContext(s.org.id)
  // Every Shopify product is listed, including those stocked only at locations that don't count toward the totals.
  const grouped = groupInventory(inventoryRows, {
    everyProduct: true,
    query: q,
    classifications: inventoryClassifications,
    onOrder
  })
  const [defaults, barcodes] = domain
    ? await Promise.all([readProductDefaults(s.org.id, domain), readProductBarcodes(s.org.id, domain)])
    : [new Map(), new Map<string, ProductBarcode>()]
  // Variations whose product needs an uploaded label, such as one with size measurements, and that don't have one.
  // Others get the standard FNSKU label.
  const unlabelled = (product: (typeof grouped)[number]) =>
    defaults.get(product.productId)?.productLabel === "uploaded"
      ? product.variants.filter((variant) => !barcodes.has(variant.variantId)).length
      : 0
  const products = barcode ? grouped.filter((product) => unlabelled(product) > 0) : grouped
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
  const pageNumber = Math.min(page, totalPages)
  const levels = rows.flatMap((row) => row.levels)
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
            row.unitCostMinor === undefined
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
      duplicateSkus: duplicateSkus(rows),
      products: products.slice((pageNumber - 1) * pageSize, pageNumber * pageSize).map((product) => ({
        ...product,
        defaults: defaults.get(product.productId) ?? noDefaults,
        variants: product.variants.map((variant) => ({
          ...variant,
          barcode: barcodes.get(variant.variantId) ?? null,
          // For the standard label; null until Amazon's FBA sync reports exactly one for the SKU.
          fnsku: variant.sku ? fnskuFor(fbaRows ?? [], variant.sku) : null
        }))
      }))
    },
    { headers }
  )
}
