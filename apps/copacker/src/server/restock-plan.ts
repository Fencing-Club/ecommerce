import type { Amazon } from "@repo/aisle/amazon"
import type { Shopify } from "@repo/aisle/shopify"
import type { CasePack } from "@/lib/case-packs"
import { bundleSales } from "./bundle-sales"
import type { LocationClassification } from "./inventory-locations"
import { groupInventory, type PendingOrder } from "./inventory-products"
import type { ProductDefaults } from "./product-defaults"
import { restockRecommendation } from "./restock"
import type { DemandGap, DemandRow } from "./sales-attribution"

type Catalog = Awaited<ReturnType<Shopify["stock"]>>["rows"]
type FbaRow = Awaited<ReturnType<Amazon["fbaStock"]>>["rows"][number]
type AwdRow = Awaited<ReturnType<Amazon["awdStock"]>>["rows"][number]
type Sales = { rows: DemandRow[]; gaps: DemandGap[] } | null

// Where stock is being replenished: Amazon as a whole (FBA and AWD; the warehouse is chosen when shipping), or one of
// the buyer's Shopify locations.
export type RestockChannel = { kind: "amazon" } | { kind: "shopify"; locationId: string }
export type RestockSupplier = {
  id: string
  name: string
  leadTimeDays: number | null
  amazonLeadTimeDays: number | null
}

// "no_listing": Shopify sets an Amazon stock target, but Amazon has no FBA or AWD inventory for the SKU, so there's
// nothing to send stock to until the listing exists.
export type RestockStatus = "stockout" | "reorder" | "stocked" | "blocked" | "not_stocked" | "no_listing"
export type BlockReason = "stock_unknown" | "demand_unknown" | "incoming_unknown" | "sku_ambiguous"

export type RestockLine = {
  variantId: string
  productId: string | null
  product: string
  variant: string | null
  sku: string | null
  imageUrl: string | null
  // Pieces in one sellable unit when the variation is a multipack bundle.
  packOf: number | null
  supplier: { id: string; name: string } | null
  // A supplier name that isn't one of the buyer's suppliers: the product is ordered outside Copacker, so it gets no PO.
  externalSupplier: string | null
  status: RestockStatus
  blocked: BlockReason[]
  // Units sold in the sales period; on Shopify, split into sold alone and sold inside bundles.
  sold: number | null
  soldAlone: number | null
  soldInBundles: number | null
  salesDays: number
  // Days of the sales period the item was out of stock, and the days the sales rate is measured over.
  stockoutDays: number
  rateDays: number
  leadTimeDays: number
  available: number | null
  incoming: number | null
  targetStock: number | null
  // Where the target stock is kept: "Amazon", or the Shopify location's name.
  targetWhere: string | null
  minimumOrder: number | null
  caseQuantity: number | null
  casePack: CasePack | null
  // Units needed before the minimum order and case rounding.
  need: number | null
  purchaseUnits: number | null
  caseCount: number | null
  unitCostMinor: number | null
  costCurrency: string | null
  estimatedCostMinor: number | null
  daysRemaining: number | null
  // The Shopify selling price, and what's expected to be lost while the item is out of stock before a reorder placed
  // now arrives: stock and incoming units cover `lead time - lostDays` days, and the rest go unsold. Null when the
  // sales rate or (for money) the price or cost isn't known.
  priceMinor: number | null
  priceCurrency: string | null
  lostDays: number | null
  lostUnits: number | null
  lostSalesMinor: number | null
  lostProfitMinor: number | null
}

const amazonDestinations = new Set<string>(["fba", "awd_us", "awd_china", "amazon"])

function sum(values: (number | null | undefined)[]) {
  return values.every((value) => value === null || value === undefined)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

// The lead time a supplier needs for this channel, else the page's default.
export function supplierLeadTime(supplier: RestockSupplier | null, channel: RestockChannel, fallback: number) {
  if (!supplier) {
    return fallback
  }
  if (channel.kind === "amazon") {
    return supplier.amazonLeadTimeDays ?? supplier.leadTimeDays ?? fallback
  }
  return supplier.leadTimeDays ?? fallback
}

function status(line: Pick<RestockLine, "blocked" | "purchaseUnits" | "daysRemaining" | "leadTimeDays" | "available">) {
  if (line.blocked.length || line.purchaseUnits === null) {
    return "blocked" as const
  }
  if (line.purchaseUnits === 0) {
    return "stocked" as const
  }
  const runsOut =
    (line.available !== null && line.available <= 0) ||
    (line.daysRemaining !== null && line.daysRemaining < line.leadTimeDays)
  return runsOut ? ("stockout" as const) : ("reorder" as const)
}

// One suggestion per variation for the chosen channel: what's sold, what's there and on the way, and how many to
// order from its supplier to last through that supplier's lead time.
export function restockPlan(input: {
  channel: RestockChannel
  catalog: Catalog
  classifications: ReadonlyMap<string, LocationClassification>
  onOrder: ReadonlyMap<string, PendingOrder[]>
  shopifySales: Sales
  amazonSales: Sales
  fbaRows: FbaRow[] | null
  awdRows: AwdRow[] | null
  salesDays: number
  leadTimeDays: number
  productDefaults: ReadonlyMap<string, Pick<ProductDefaults, "casePacks" | "minimumOrder">>
  // The supplier each variation was last ordered from.
  supplierFor: (variantId: string) => RestockSupplier | null
  // The Shopify supplier of a variation ordered outside Copacker.
  externalSupplierFor?: (variantId: string) => string | null
  // Days of the sales period the variation was out of stock in this channel, when known.
  stockoutsFor?: (variantId: string, sku: string | null) => number
}): RestockLine[] {
  const { channel, catalog } = input
  const products = groupInventory(catalog, {
    ...(channel.kind === "shopify" && { locationId: channel.locationId }),
    classifications: input.classifications,
    onOrder: input.onOrder,
    includeExcluded: channel.kind === "amazon"
  })
  const catalogByVariant = new Map(catalog.map((row) => [row.variantId, row]))
  const skuCount = new Map<string, number>()
  for (const row of catalog) {
    if (row.buyerSku) {
      skuCount.set(row.buyerSku, (skuCount.get(row.buyerSku) ?? 0) + 1)
    }
  }
  const bySku = <T extends { sellerSku: string }>(rows: T[] | null) => {
    const map = new Map<string, T[]>()
    for (const row of rows ?? []) {
      map.set(row.sellerSku, [...(map.get(row.sellerSku) ?? []), row])
    }
    return map
  }
  const fbaBySku = bySku(input.fbaRows)
  const awdBySku = bySku(input.awdRows)
  const shopifyRows =
    channel.kind === "shopify"
      ? (input.shopifySales?.rows.filter((row) => row.pool === "shopify" && row.locationId === channel.locationId) ??
        [])
      : []
  const split = bundleSales(catalog, shopifyRows).variants
  // A sales gap without product identity could belong to any variation, so demand is unknown everywhere.
  const sales = channel.kind === "amazon" ? input.amazonSales : input.shopifySales
  const unidentifiedGap = sales?.gaps.some((gap) => !gap.variantId && !gap.buyerSku) ?? false

  const lines: RestockLine[] = []
  for (const product of products) {
    for (const variant of product.variants) {
      const row = catalogByVariant.get(variant.variantId)
      const bundle = row?.bundle
      const details = input.productDefaults.get(product.productId)
      const supplier = input.supplierFor(variant.variantId)
      const leadTimeDays = supplierLeadTime(supplier, channel, input.leadTimeDays)
      const pending = (input.onOrder.get(variant.variantId) ?? []).filter((order) =>
        channel.kind === "amazon"
          ? amazonDestinations.has(order.destination)
          : order.locationIds.includes(channel.locationId)
      )
      const pendingUnits = pending.reduce((total, order) => total + order.units, 0)
      const blocked: BlockReason[] = []
      let available: number | null
      let incoming: number | null
      let sold: number | null = null
      let targetStock: number | null = null
      let targetWhere: string | null = null
      let notStocked = false
      let noListing = false
      if (channel.kind === "shopify") {
        // Bundles hold no stock of their own at a Shopify location; their components are restocked instead.
        if (variant.stock !== "tracked") {
          continue
        }
        const level = variant.levels.find((candidate) => candidate.locationId === channel.locationId)
        if (!level) {
          continue
        }
        available = level.available
        incoming = level.incoming === null ? null : Math.max(0, level.incoming) + pendingUnits
        // Shopify's Fencing Club stock target: the least to keep at the store's own location.
        targetStock = row?.storeStockTarget ?? null
        targetWhere = level.locationName
        if (sales && !unidentifiedGap && !sales.gaps.some((gap) => gap.variantId === variant.variantId)) {
          sold = shopifyRows
            .filter((demand) => demand.variantId === variant.variantId)
            .reduce((total, demand) => total + demand.fulfilledUnits, 0)
        }
      } else {
        const sku = variant.sku
        const fba = sku ? fbaBySku.get(sku) : undefined
        const awd = sku ? awdBySku.get(sku) : undefined
        const amazonTarget = row?.amazonStockTarget ?? null
        const amazonSold = sku
          ? (input.amazonSales?.rows.filter(
              (demand) => demand.buyerSku === sku && (demand.pool === "fba" || demand.pool === "fbm_unassigned")
            ) ?? [])
          : []
        // Only what Amazon holds, or should: a listing sold only from the buyer's own stock (FBM) isn't restocked there.
        if (!sku || (!fba && !awd && !(amazonTarget !== null && amazonTarget > 0))) {
          continue
        }
        notStocked = amazonTarget === 0
        noListing = !fba && !awd
        targetStock = amazonTarget
        targetWhere = "Amazon"
        if (skuCount.get(sku) !== 1 || (fba?.length ?? 0) > 1 || (awd?.length ?? 0) > 1) {
          blocked.push("sku_ambiguous")
        }
        const fbaRow = fba?.[0]
        const awdRow = awd?.[0]
        available = sum([
          fbaRow ? fbaRow.inventoryDetails?.fulfillableQuantity : 0,
          awdRow ? awdRow.availableDistributable : 0
        ])
        if (fbaRow && (fbaRow.inventoryDetails?.fulfillableQuantity ?? null) === null) {
          available = null
        }
        const inbound = sum([
          fbaRow?.inventoryDetails?.inboundWorkingQuantity,
          fbaRow?.inventoryDetails?.inboundShippedQuantity,
          fbaRow?.inventoryDetails?.inboundReceivingQuantity,
          awdRow?.inbound
        ])
        // A PO that has shipped shows up in Amazon's inbound, so the larger of the two is counted, not both.
        incoming = inbound === null && (fbaRow || awdRow) ? pendingUnits || null : Math.max(inbound ?? 0, pendingUnits)
        if (input.amazonSales && !unidentifiedGap && !input.amazonSales.gaps.some((gap) => gap.buyerSku === sku)) {
          sold = amazonSold.reduce((total, demand) => total + demand.fulfilledUnits, 0)
        }
      }
      if (available === null) {
        blocked.push("stock_unknown")
      }
      if (sold === null) {
        blocked.push("demand_unknown")
      }
      if (incoming === null) {
        blocked.push("incoming_unknown")
      }
      // Sales stop while an item is out of stock, so the rate uses only the days it was in stock. At least a week
      // (or the whole period, if shorter) keeps a few lucky days from inflating it.
      const stockoutDays = Math.min(input.salesDays, input.stockoutsFor?.(variant.variantId, variant.sku) ?? 0)
      const rateDays = Math.max(Math.min(input.salesDays, 7), input.salesDays - stockoutDays)
      const casePack = bundle && channel.kind === "shopify" ? null : (details?.casePacks[0] ?? null)
      const caseQuantity = casePack?.units ?? (bundle ? null : (row?.caseQuantity ?? null))
      const minimumOrder = details?.minimumOrder ?? null
      const unitCostMinor = bundle ? null : (row?.unitCostMinor ?? null)
      const recommend = (caseQuantityInput: number | null, minimum: number | null) =>
        restockRecommendation(
          {
            available,
            verifiedIncoming: incoming,
            soldUnits: sold,
            caseQuantity: caseQuantityInput,
            targetStock,
            minimumOrder: minimum,
            unitCostMinor,
            stocked: !notStocked,
            unitsVerified: !blocked.includes("sku_ambiguous")
          },
          { leadTimeDays, salesWindowDays: rateDays }
        )
      const result = recommend(caseQuantity, minimumOrder)
      const need = blocked.length ? null : recommend(null, null).purchaseUnits
      // Stock and what's already on the way last `covered` days at the sales rate; the rest of the lead time is lost.
      const perDay = sold !== null && rateDays > 0 ? sold / rateDays : null
      const covered = perDay && available !== null ? (Math.max(0, available) + (incoming ?? 0)) / perDay : null
      const lostDays = covered === null ? null : Math.max(0, leadTimeDays - covered)
      const lostUnits = lostDays === null || perDay === null ? null : Math.round(lostDays * perDay)
      const priceMinor = row?.priceMinor ?? null
      const priceCurrency = row?.priceCurrency ?? null
      const lostSalesMinor = lostUnits !== null && priceMinor !== null ? lostUnits * priceMinor : null
      const lostProfitMinor =
        lostSalesMinor !== null && lostUnits !== null && unitCostMinor !== null && row?.costCurrency === priceCurrency
          ? lostSalesMinor - lostUnits * unitCostMinor
          : null
      const packOf =
        bundle?.components?.length && channel.kind === "amazon"
          ? bundle.components.reduce((total, component) => total + component.quantity, 0)
          : null
      const line = {
        variantId: variant.variantId,
        productId: product.productId,
        product: product.title,
        variant: variant.title,
        sku: variant.sku,
        imageUrl: variant.imageUrl ?? product.imageUrl,
        packOf,
        supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
        externalSupplier: supplier ? null : (input.externalSupplierFor?.(variant.variantId) ?? null),
        blocked: notStocked ? [] : blocked,
        sold,
        soldAlone: channel.kind === "shopify" ? (split.get(variant.variantId)?.soldAlone ?? 0) : null,
        soldInBundles: channel.kind === "shopify" ? (split.get(variant.variantId)?.soldInBundles ?? 0) : null,
        salesDays: input.salesDays,
        stockoutDays,
        rateDays,
        leadTimeDays,
        available,
        incoming,
        targetStock,
        targetWhere,
        minimumOrder,
        caseQuantity,
        casePack,
        need: notStocked ? 0 : need,
        purchaseUnits: result.purchaseUnits,
        caseCount: result.caseCount,
        unitCostMinor,
        costCurrency: row?.costCurrency ?? null,
        estimatedCostMinor: result.estimatedCostMinor,
        daysRemaining: result.daysRemaining === null ? null : Math.floor(result.daysRemaining),
        priceMinor,
        priceCurrency,
        lostDays: lostDays === null ? null : Math.ceil(lostDays),
        lostUnits,
        lostSalesMinor,
        lostProfitMinor
      }
      if (notStocked) {
        lines.push({ ...line, status: "not_stocked" })
      } else if (noListing) {
        lines.push({ ...line, status: "no_listing", purchaseUnits: null, caseCount: null, estimatedCostMinor: null })
      } else {
        lines.push({ ...line, status: status(line) })
      }
    }
  }
  return lines
}
