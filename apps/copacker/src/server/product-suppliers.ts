import { inventoryContext } from "./inventory-context"
import { readProductDefaults } from "./product-defaults"
import { supplierLookup } from "./restock-page"

export type ProductWithoutSupplier = {
  productId: string
  title: string
  imageUrl: string | null
  skus: string[]
}

// Products restock can't order because no supplier is known: none chosen on the product, never on a PO, and no
// supplier catalog holds their Shopify supplier SKU. Untracked items, such as gift cards, aren't ordered and are left out.
export async function productsWithoutSupplier(orgId: string): Promise<ProductWithoutSupplier[]> {
  const context = await inventoryContext(orgId)
  const chosen = context.domain ? await readProductDefaults(orgId, context.domain) : new Map()
  const { supplierFor } = await supplierLookup(orgId, context.rows, chosen)
  const products = new Map<string, ProductWithoutSupplier & { supplied: boolean }>()
  for (const row of context.rows) {
    if (!row.productId || (!row.tracked && !row.bundle)) {
      continue
    }
    const product = products.get(row.productId) ?? {
      productId: row.productId,
      title: row.productTitle ?? row.buyerSku ?? "Untitled product",
      imageUrl: row.imageUrl ?? null,
      skus: [],
      supplied: false
    }
    product.supplied ||= supplierFor(row.variantId) !== null
    if (row.buyerSku) {
      product.skus.push(row.buyerSku)
    }
    products.set(row.productId, product)
  }
  return [...products.values()]
    .filter((product) => !product.supplied)
    .map(({ supplied: _supplied, ...product }) => product)
    .toSorted((a, b) => a.title.localeCompare(b.title))
}
