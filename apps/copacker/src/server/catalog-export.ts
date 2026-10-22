import { money } from "@repo/copacker-shipments"
import { adjustmentLabel, catalogPricing, countOf, unitName } from "@/lib/catalog-pricing"
import { formatDate } from "@/lib/format"
import { catalogEditor } from "./catalogs"

// A catalog as its customers see it: each included variant with its price, volume pricing and quantity rules.
export async function priceList(orgId: string, supplierName: string, id: string) {
  const data = await catalogEditor(orgId, id)
  if (!data?.catalog) {
    return null
  }
  const entries = new Map(data.entries.map(({ productId, ...entry }) => [productId, entry]))
  const rows = data.products.flatMap((product) =>
    product.variants.flatMap((variant) => {
      const entry = entries.get(variant.id)
      if (!entry) {
        return []
      }
      const pricing = catalogPricing(variant, data.catalog!.adjustmentBasisPoints, entry)
      const rules = pricing.quantityRules
      return [
        {
          product: product.title,
          variant: variant.label,
          sku: variant.supplierSku,
          currency: variant.currency,
          unit: unitName(variant.priceBasis),
          priceMinor: pricing.priceMinor,
          breaks: pricing.priceBreaks.map((row) => ({
            label: `${countOf(row.minimum, variant.priceBasis)}+`,
            price: money(row.priceMinor, variant.currency)
          })),
          minimum: rules.minimum,
          increment: rules.increment,
          maximum: rules.maximum
        }
      ]
    })
  )
  return {
    supplier: supplierName,
    title: data.catalog.title,
    customers: data.customers.filter((customer) => customer.assigned).map((customer) => customer.name),
    adjustment: adjustmentLabel(data.catalog.adjustmentBasisPoints),
    date: formatDate(new Date()),
    rows
  }
}
export type PriceList = NonNullable<Awaited<ReturnType<typeof priceList>>>
