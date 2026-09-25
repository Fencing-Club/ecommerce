import { z } from "zod"
import { session } from "@/server/auth"
import { inventoryContext } from "@/server/inventory-context"
import { groupInventory, inventoryLocations, pageSizes } from "@/server/inventory-products"
import { noDefaults, readProductDefaults } from "@/server/product-defaults"

const querySchema = z.strictObject({
  locationId: z
    .string()
    .regex(/^gid:\/\/shopify\/Location\/\d+$/)
    .optional(),
  q: z.string().trim().max(100).optional(),
  includeExcluded: z.enum(["true", "false"]).default("false"),
  page: z
    .string()
    .regex(/^[1-9]\d{0,4}$/)
    .transform(Number)
    .default(1),
  pageSize: z.enum(pageSizes.map(String)).transform(Number).default(25)
})

// Shopify inventory grouped by product, one page at a time, for the Inventory page.
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
  const { page, pageSize, locationId, q } = query.data
  const { domain, data, rows, classifications, onOrder } = await inventoryContext(s.org.id)
  const products = groupInventory(rows, {
    locationId,
    query: q,
    classifications,
    includeExcluded: query.data.includeExcluded === "true",
    onOrder
  })
  const defaults = domain ? await readProductDefaults(s.org.id, domain) : new Map()
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
  const pageNumber = Math.min(page, totalPages)
  const levels = rows.flatMap((row) => row.levels)
  return Response.json(
    {
      observedAt: data?.observedAt ?? null,
      // Snapshots saved before product details and location kinds were collected need one more sync.
      needsResync: rows.some((row) => row.productId === undefined) || levels.some((level) => !level.locationKind),
      locations: inventoryLocations(rows, classifications),
      page: pageNumber,
      pageSize,
      totalPages,
      totalProducts: products.length,
      totalVariants: products.reduce((sum, product) => sum + product.variants.length, 0),
      products: products
        .slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
        .map((product) => ({ ...product, defaults: defaults.get(product.productId) ?? noDefaults }))
    },
    { headers }
  )
}
