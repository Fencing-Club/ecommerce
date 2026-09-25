import type { Amazon } from "@repo/aisle/amazon"
import type { Shopify } from "@repo/aisle/shopify"
import { bundleSales, type VariantSales } from "./bundle-sales"
import type { LocationClassification } from "./inventory-locations"
import { groupInventory, type PendingOrder } from "./inventory-products"
import { poolRestock } from "./pool-restock"
import type { ProductDefaults } from "./product-defaults"
import { reorderList, type RestockSuggestion } from "./restock-report"
import type { DemandGap, DemandRow } from "./sales-attribution"

export type RestockTarget = { pool: "shopify"; locationId: string } | { pool: "fba" | "awd" }
type Catalog = Awaited<ReturnType<Shopify["stock"]>>["rows"]
type FbaStock = Awaited<ReturnType<Amazon["fbaStock"]>>
type AwdStock = Awaited<ReturnType<Amazon["awdStock"]>>
type Sales = { rows: DemandRow[]; gaps: DemandGap[] } | null
const knownSum = (values: (number | null | undefined)[]) =>
  values.every((value) => value === null || value === undefined)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0)

export function restockPoolReport(input: {
  target: RestockTarget
  catalog: Catalog
  classifications: ReadonlyMap<string, LocationClassification>
  onOrder: ReadonlyMap<string, PendingOrder[]>
  shopifySales: Sales
  amazonSales: Sales
  fbaStock: FbaStock | null
  awdStock: AwdStock | null
  salesDays: number
  leadTimeDays: number
  // Copacker's product details: the default case pack and minimum order.
  productDefaults?: ReadonlyMap<string, Pick<ProductDefaults, "casePacks" | "minimumOrder">>
}) {
  const { target, catalog, classifications, onOrder } = input
  const products = groupInventory(catalog, {
    ...(target.pool === "shopify" && { locationId: target.locationId }),
    classifications,
    onOrder,
    includeExcluded: target.pool !== "shopify"
  })
  const chosenRows =
    target.pool === "shopify"
      ? (input.shopifySales?.rows.filter((row) => row.pool === "shopify" && row.locationId === target.locationId) ?? [])
      : (input.amazonSales?.rows.filter((row) => row.pool === "fba") ?? [])
  // Amazon reports the sellable SKU shipped. An FBA multipack has its own physical stock;
  // its sale must not also become demand for separately stocked component SKUs.
  const variants =
    target.pool === "shopify" ? bundleSales(catalog, chosenRows).variants : new Map<string, VariantSales>()
  const suggestions = new Map<string, RestockSuggestion>()
  const catalogByVariant = new Map(catalog.map((row) => [row.variantId, row]))
  const skus = new Map<string, number>()
  for (const row of catalog) {
    if (row.buyerSku) {
      skus.set(row.buyerSku, (skus.get(row.buyerSku) ?? 0) + 1)
    }
  }
  if (target.pool !== "shopify") {
    const bySku = new Map(
      catalog.flatMap((row) =>
        row.buyerSku && skus.get(row.buyerSku) === 1 ? [[row.buyerSku, row.variantId] as const] : []
      )
    )
    for (const row of chosenRows) {
      const variantId = row.buyerSku ? bySku.get(row.buyerSku) : null
      if (!variantId) {
        continue
      }
      const sold = variants.get(variantId) ?? { soldAlone: 0, soldInBundles: 0, bundlesSold: 0 }
      sold.soldAlone += row.fulfilledUnits
      variants.set(variantId, sold)
    }
  }
  const fbaBySku = new Map<string, FbaStock["rows"]>()
  for (const row of input.fbaStock?.rows ?? []) {
    fbaBySku.set(row.sellerSku, [...(fbaBySku.get(row.sellerSku) ?? []), row])
  }
  const awdBySku = new Map<string, AwdStock["rows"]>()
  for (const row of input.awdStock?.rows ?? []) {
    awdBySku.set(row.sellerSku, [...(awdBySku.get(row.sellerSku) ?? []), row])
  }
  let selectedStockSkus: Map<string, FbaStock["rows"] | AwdStock["rows"]> | null = null
  if (target.pool === "fba") {
    selectedStockSkus = fbaBySku
  } else if (target.pool === "awd") {
    selectedStockSkus = awdBySku
  }
  const unmatchedStockSkus = selectedStockSkus
    ? [...selectedStockSkus].filter(([sku, rows]) => skus.get(sku) !== 1 || rows.length !== 1).length
    : 0
  const productOf = new Map(
    products.flatMap((product) => product.variants.map((variant) => [variant.variantId, product.productId]))
  )
  for (const variant of products.flatMap((product) => product.variants)) {
    const details = input.productDefaults?.get(productOf.get(variant.variantId) ?? "")
    const pending = onOrder.get(variant.variantId) ?? []
    const targetPending = pending
      .filter((order) => {
        if (target.pool === "shopify") {
          return order.locationIds.includes(target.locationId)
        }
        if (target.pool === "fba") {
          return order.destination === "fba"
        }
        return order.destination === "awd_us" || order.destination === "awd_china"
      })
      .reduce((sum, order) => sum + order.units, 0)
    let availability: unknown
    let incoming: number | null
    if (target.pool === "shopify") {
      if (variant.stock !== "tracked") {
        continue
      }
      const level = variant.levels.find((level) => level.locationId === target.locationId)
      if (!level) {
        continue
      }
      availability = { source: "shopify", available: level.available, committed: null, onHand: level.onHand }
      incoming = level.incoming === null ? null : Math.max(0, level.incoming) + targetPending
    } else if (target.pool === "fba") {
      if (!variant.sku || skus.get(variant.sku) !== 1) {
        continue
      }
      const rows = fbaBySku.get(variant.sku)
      const amazonTarget = catalogByVariant.get(variant.variantId)?.amazonStockTarget
      if (amazonTarget === 0 || (rows && rows.length !== 1) || (!rows && !(amazonTarget && amazonTarget > 0))) {
        continue
      }
      const row = rows?.[0]
      availability = {
        source: "fba",
        fulfillableQuantity: row ? (row.inventoryDetails?.fulfillableQuantity ?? null) : 0,
        pendingCustomerOrderQuantity: row?.inventoryDetails?.reservedQuantity?.pendingCustomerOrderQuantity ?? null,
        totalQuantity: row?.totalQuantity ?? 0
      }
      const providerInbound = knownSum([
        row?.inventoryDetails?.inboundWorkingQuantity,
        row?.inventoryDetails?.inboundShippedQuantity,
        row?.inventoryDetails?.inboundReceivingQuantity
      ])
      if (!row) {
        incoming = targetPending
      } else if (providerInbound === null) {
        incoming = targetPending || null
      } else {
        incoming = Math.max(providerInbound, targetPending)
      }
    } else {
      if (!variant.sku || skus.get(variant.sku) !== 1) {
        continue
      }
      const rows = awdBySku.get(variant.sku)
      const amazonTarget = catalogByVariant.get(variant.variantId)?.amazonStockTarget
      if (amazonTarget === 0 || (rows && rows.length !== 1) || (!rows && !(amazonTarget && amazonTarget > 0))) {
        continue
      }
      const row = rows?.[0]
      availability = {
        source: "awd",
        availableDistributable: row?.availableDistributable ?? 0,
        reservedDistributable: row?.reservedDistributable ?? 0,
        onHand: row?.onHand ?? 0
      }
      if (!row) {
        incoming = targetPending
      } else if (row.inbound === null) {
        incoming = targetPending || null
      } else {
        incoming = Math.max(row.inbound, targetPending)
      }
    }
    const calculated = poolRestock({
      selection:
        target.pool === "shopify"
          ? { pool: "shopify", variantId: variant.variantId, locationId: target.locationId }
          : { pool: target.pool, buyerSku: variant.sku!, skuIsUnique: true },
      availability,
      incoming,
      // Copacker's default case pack, otherwise Shopify's product case quantity.
      caseQuantity: catalogByVariant.get(variant.variantId)?.bundle
        ? null
        : (details?.casePacks[0]?.units ?? catalogByVariant.get(variant.variantId)?.caseQuantity ?? null),
      // Amazon locations top up to the variant's Amazon stock target, as in Aisle.
      targetStock:
        target.pool === "shopify" ? null : (catalogByVariant.get(variant.variantId)?.amazonStockTarget ?? null),
      minimumOrder: details?.minimumOrder ?? null,
      unitCostMinor: catalogByVariant.get(variant.variantId)?.bundle
        ? null
        : (catalogByVariant.get(variant.variantId)?.unitCostMinor ?? null),
      stocked: true,
      unitsVerified: true,
      shopifySales: input.shopifySales,
      amazonSales: input.amazonSales,
      leadTimeDays: input.leadTimeDays,
      salesWindowDays: input.salesDays
    })
    const result = calculated.recommendation
    suggestions.set(variant.variantId, {
      daysRemaining: result.daysRemaining === null ? null : Math.floor(result.daysRemaining),
      purchaseUnits: result.purchaseUnits,
      stockoutBeforeArrival: result.stockoutBeforeArrival,
      caseCount: result.caseCount,
      estimatedCostMinor: result.estimatedCostMinor,
      costCurrency: catalogByVariant.get(variant.variantId)?.costCurrency ?? null
    })
  }
  const blockedCount = [...suggestions.values()].filter((suggestion) => suggestion.purchaseUnits === null).length
  return {
    products,
    suggestions,
    reorder: reorderList(products, suggestions, variants),
    variants,
    blockedCount,
    unmatchedStockSkus
  }
}
