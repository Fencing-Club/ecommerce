import type { ValidationIssue } from "@repo/copacker-packing-rules"
import type { OrderInput } from "@repo/copacker-shipments"

type Product = Pick<OrderInput["items"][number], "buyerSku" | "supplierSku" | "name" | "variant">

// Products a packing rule found by the buyer's SKU, as the supplier knows them: by the supplier SKU the carton lists, or
// for a product without one, its name, with the variant when another has the same name. The supplier never sees the
// buyer's SKUs. A SKU the order doesn't have stays.
export function productNames(products: readonly Product[], skus: readonly string[]) {
  const found = skus.map((sku) => products.find((product) => product.buyerSku === sku))
  return found.map((product, index) => {
    if (!product) {
      return skus[index]!
    }
    if (product.supplierSku) {
      return product.supplierSku
    }
    const sameName = found.some(
      (other, position) => position !== index && !other?.supplierSku && other?.name === product.name
    )
    return sameName && product.variant ? `${product.name}, ${product.variant}` : product.name
  })
}

// What a packing rule's message names, given the purchase order's products: two products that can't share a carton go
// by their supplier SKUs.
export function issueValues(issue: ValidationIssue, products: readonly Product[]) {
  if (issue.code === "packingGroups") {
    const [product, other] = productNames(products, [issue.values.sku, issue.values.other])
    return { receiver: issue.values.receiver, product: product!, other: other! }
  }
  return "values" in issue ? issue.values : undefined
}
