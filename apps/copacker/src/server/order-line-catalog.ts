import { randomUUID } from "node:crypto"
import { orderLine, type Destination } from "@repo/copacker-orders"
import { shopifyFor } from "./connections"
import { lineDefaultsFor } from "./product-defaults"
import { withVariantFields } from "./product-fields"

// All draft entry points hydrate from the pinned store and the same product defaults. Missing variants stay missing
// so each caller can report its own row-specific error instead of quietly dropping a selected product.
export async function orderLineCatalog(
  orgId: string,
  shopifyDomain: string,
  variantIds: string[],
  currency: string,
  destination: Destination
) {
  const shopify = await shopifyFor(orgId, shopifyDomain)
  const [variants, defaultsFor] = await Promise.all([
    shopify.variants([...new Set(variantIds)]).then((found) => withVariantFields(orgId, shopifyDomain, found)),
    lineDefaultsFor(orgId, shopifyDomain)
  ])
  return new Map(
    variants.flatMap((variant) =>
      variant
        ? [[variant.id, orderLine(variant, randomUUID(), defaultsFor(variant), currency, destination)] as const]
        : []
    )
  )
}
