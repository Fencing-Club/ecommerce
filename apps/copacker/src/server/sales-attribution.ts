import type { AmazonSale, ShopifySale } from "@repo/aisle/sales"

export type DemandRow = {
  variantId: string | null
  buyerSku: string | null
  locationId: string | null
  pool: "shopify" | "fba" | "fbm_unassigned"
  // The bundle variant these units were sold in, when the customer bought a bundle rather than the item itself.
  // Amazon reports the listing sold, so its bundle sales appear under the bundle's own SKU instead.
  bundleVariantId: string | null
  fulfilledUnits: number
}
export type DemandGap = {
  sourceName: string | null
  locationId: string | null
  orderId: string
  variantId: string | null
  buyerSku: string | null
  reason:
    | "channel_unmapped"
    | "location_unmapped"
    | "unfulfilled"
    | "product_unmapped"
    | "quantity_unknown"
    | "fulfillment_unmapped"
  units: number | null
}
export type LocationClass = "merchant" | "amazon_mirror" | "excluded" | "unresolved"
// A count by cause makes a coverage gap actionable; a null unit remains unknown, never zero.
export function summarizeDemandGaps(gaps: DemandGap[]) {
  const summary: Partial<Record<DemandGap["reason"], { units: number; unknownCount: number }>> = {}
  for (const gap of gaps) {
    const current = summary[gap.reason] ?? { units: 0, unknownCount: 0 }
    if (gap.units === null) {
      current.unknownCount++
    } else {
      current.units += gap.units
    }
    summary[gap.reason] = current
  }
  return summary
}
function add(rows: Map<string, DemandRow>, row: DemandRow) {
  const key = JSON.stringify([row.pool, row.locationId, row.variantId, row.buyerSku, row.bundleVariantId])
  const prior = rows.get(key)
  const fulfilledUnits = (prior?.fulfilledUnits ?? 0) + row.fulfilledUnits
  if (!Number.isSafeInteger(fulfilledUnits)) {
    throw new Error("Sales quantity exceeds the supported range")
  }
  rows.set(key, { ...row, fulfilledUnits })
}

// Unknown app/source names are never assumed to be Shopify demand. In particular, numeric integration app IDs
// and Amazon imports cannot enter local demand via a guessed channel name or the inventory location's title.
const nativeShopifySources = new Set(["web", "pos", "shopify_draft_order"])
export function attributeShopifySales(orders: ShopifySale[], locations: ReadonlyMap<string, LocationClass>) {
  const rows = new Map<string, DemandRow>(),
    gaps: DemandGap[] = []
  let excludedFulfilledUnits = 0
  for (const order of orders) {
    if (order.test || order.cancelledAt) {
      continue
    }
    for (const line of order.lines) {
      const identity = {
        orderId: order.id,
        variantId: line.variant?.id ?? null,
        buyerSku: line.sku,
        sourceName: order.sourceName,
        locationId: null
      }
      if (!nativeShopifySources.has(order.sourceName ?? "")) {
        gaps.push({ ...identity, reason: "channel_unmapped", units: line.currentQuantity })
        continue
      }
      if (!line.variant) {
        gaps.push({ ...identity, reason: "product_unmapped", units: line.currentQuantity })
        continue
      }
      let fulfilled = 0
      for (const fulfillment of order.fulfillments) {
        if (fulfillment.status !== "SUCCESS") {
          continue
        }
        for (const item of fulfillment.lines.filter((item) => item.lineItem.id === line.id)) {
          if (item.quantity === null) {
            gaps.push({
              ...identity,
              locationId: fulfillment.location?.id ?? null,
              reason: "quantity_unknown",
              units: null
            })
            continue
          }
          fulfilled += item.quantity
          if (!Number.isSafeInteger(fulfilled) || fulfilled > line.quantity) {
            throw new Error("Fulfilled sales quantities are inconsistent")
          }
          const classification = fulfillment.location ? locations.get(fulfillment.location.id) : undefined
          if (classification === "amazon_mirror" || classification === "excluded") {
            excludedFulfilledUnits += item.quantity
          } else if (classification !== "merchant" || !fulfillment.location) {
            gaps.push({
              ...identity,
              locationId: fulfillment.location?.id ?? null,
              reason: "location_unmapped",
              units: item.quantity
            })
          } else {
            add(rows, {
              variantId: line.variant.id,
              buyerSku: line.sku,
              locationId: fulfillment.location.id,
              pool: "shopify",
              bundleVariantId: line.lineItemGroup?.variantId ?? null,
              fulfilledUnits: item.quantity
            })
          }
        }
      }
      // Net unfulfilled units cannot be placed in a warehouse without fulfillment-order allocation.
      // Refunded/returned fulfilled units remain gross demand; only inventory receipts restore stock.
      if (line.currentQuantity > fulfilled) {
        gaps.push({ ...identity, reason: "unfulfilled", units: line.currentQuantity - fulfilled })
      }
    }
    const lineIds = new Set(order.lines.map((line) => line.id))
    if (
      order.fulfillments.some((f) => f.status === "SUCCESS" && f.lines.some((line) => !lineIds.has(line.lineItem.id)))
    ) {
      throw new Error("Fulfillment refers to an unknown order line")
    }
  }
  if (!Number.isSafeInteger(excludedFulfilledUnits)) {
    throw new Error("Excluded quantity exceeds the supported range")
  }
  return { rows: [...rows.values()], gaps, excludedFulfilledUnits, attributionComplete: gaps.length === 0 }
}

export function attributeAmazonSales(orders: AmazonSale[]) {
  const rows = new Map<string, DemandRow>(),
    gaps: DemandGap[] = []
  const confirmed = new Map<string, { buyerSku: string; pool: "fba" | "fbm_unassigned"; units: number }>()
  for (const order of orders) {
    const status = order.fulfillment?.fulfillmentStatus
    if (status === "CANCELLED" || status === "UNFULFILLABLE") {
      continue
    }
    for (const item of order.orderItems) {
      const identity = {
        orderId: order.orderId,
        variantId: null,
        buyerSku: item.product.sellerSku ?? null,
        sourceName: order.salesChannel.channelName,
        locationId: null
      }
      if (order.salesChannel.channelName !== "AMAZON") {
        gaps.push({ ...identity, reason: "channel_unmapped", units: item.quantityOrdered })
        continue
      }
      if (!identity.buyerSku) {
        gaps.push({ ...identity, reason: "product_unmapped", units: item.quantityOrdered })
        continue
      }
      const fulfilled = item.fulfillment?.quantityFulfilled
      if (fulfilled === undefined) {
        gaps.push({ ...identity, reason: "quantity_unknown", units: null })
        continue
      }
      if (fulfilled > item.quantityOrdered) {
        throw new Error("Amazon fulfilled quantity exceeds ordered units")
      }
      if (order.fulfillment?.fulfilledBy !== "AMAZON" && order.fulfillment?.fulfilledBy !== "MERCHANT") {
        gaps.push({ ...identity, reason: "fulfillment_unmapped", units: item.quantityOrdered })
        continue
      }
      add(rows, {
        variantId: null,
        buyerSku: identity.buyerSku,
        locationId: null,
        pool: order.fulfillment.fulfilledBy === "AMAZON" ? "fba" : "fbm_unassigned",
        bundleVariantId: null,
        fulfilledUnits: fulfilled
      })
      const unfulfilled = item.fulfillment?.quantityUnfulfilled
      if (unfulfilled !== undefined && unfulfilled > item.quantityOrdered - fulfilled) {
        throw new Error("Amazon fulfillment quantities exceed ordered units")
      }
      if (unfulfilled === undefined && status !== "SHIPPED") {
        gaps.push({ ...identity, reason: "quantity_unknown", units: null })
      } else if (unfulfilled && (status === "UNSHIPPED" || status === "PARTIALLY_SHIPPED")) {
        const pool = order.fulfillment.fulfilledBy === "AMAZON" ? "fba" : "fbm_unassigned"
        const key = JSON.stringify([pool, identity.buyerSku])
        const units = (confirmed.get(key)?.units ?? 0) + unfulfilled
        if (!Number.isSafeInteger(units)) {
          throw new Error("Unfulfilled demand exceeds the supported range")
        }
        confirmed.set(key, { buyerSku: identity.buyerSku, pool, units })
      } else if (unfulfilled && status !== "PENDING" && status !== "PENDING_AVAILABILITY") {
        gaps.push({ ...identity, reason: "fulfillment_unmapped", units: unfulfilled })
      }
    }
  }
  return {
    rows: [...rows.values()],
    confirmedUnfulfilled: [...confirmed.values()],
    gaps,
    attributionComplete: gaps.length === 0
  }
}
