import type { OrderInput } from "@repo/aisle"
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm"
import { db } from "@/db"
import { catalogs, events, orders, shipments, supplierProducts, suppliers } from "@/db/schema"
import { comparisons, type DayRange, rangeLabel, readPeriod } from "@/lib/date-range"
import { addDays, zonedDay } from "@/lib/time-zone"
import { supplierCustomers } from "./catalogs"
import { storeTimeZone } from "./store-time-zone"
import { inventoryRows, supplierOrders, totalsByCurrency } from "./supplier-workspace"

type Query = Record<string, string | string[] | undefined>
const shippedStates = new Set(["shipped", "forwarded", "received"])

// The pieces of each supplier SKU a PO's lines order; a bundle orders its components.
function skuPieces(data: OrderInput) {
  const totals = new Map<string, { pieces: number; value: number }>()
  const add = (sku: string | null | undefined, pieces: number, value: number) => {
    const key = sku?.trim()
    if (key && pieces > 0) {
      const current = totals.get(key) ?? { pieces: 0, value: 0 }
      totals.set(key, { pieces: current.pieces + pieces, value: current.value + value })
    }
  }
  for (const item of data.items) {
    if (item.components?.length) {
      const units = item.pieces / item.piecesPerSet
      const componentPieces = item.components.reduce((sum, component) => sum + component.quantity, 0)
      for (const component of item.components) {
        // A bundle's value is shared among its components by their pieces.
        add(
          component.supplierSku,
          units * component.quantity,
          (item.pieces * item.unitPrice * component.quantity) / componentPieces
        )
      }
    } else {
      add(item.supplierSku, item.pieces, item.pieces * item.unitPrice)
    }
  }
  return totals
}

// The pieces a price covers: one piece, a sellable pack, or a case; null for a case of unknown size.
function piecesPerPrice(product: {
  priceBasis: string
  piecesPerSellablePack: number
  sellablePacksPerCase: number | null
}) {
  if (product.priceBasis === "sellable_pack") {
    return product.piecesPerSellablePack
  }
  if (product.priceBasis === "case") {
    return product.sellablePacksPerCase === null ? null : product.piecesPerSellablePack * product.sellablePacksPerCase
  }
  return 1
}

const inRange = (day: string, range: DayRange | null) => !!range && day >= range.from && day <= range.to

function days(range: DayRange) {
  const list: string[] = []
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    list.push(day)
  }
  return list
}

// A change from the previous period as a fraction, or null when there's nothing to compare with.
function change(current: number, previous: number | null) {
  return previous ? (current - previous) / previous : null
}

// What a supplier's Overview shows for a period: orders received and pieces shipped against the period before, what
// its open orders wait on, the products and customers ordering most, and how stock stands against open orders.
export async function supplierOverview(org: { id: string; timeZone: string | null }, query: Query) {
  const timeZone = await storeTimeZone(org)
  const today = zonedDay(new Date(), timeZone)
  const period = readPeriod(query, today)
  const [list, raw, stock, customers, products, catalogRows] = await Promise.all([
    supplierOrders(org.id),
    db()
      .select({ id: orders.id, data: orders.data, customerId: suppliers.id })
      .from(orders)
      .innerJoin(suppliers, eq(suppliers.id, orders.supplierId))
      .where(and(eq(suppliers.supplierOrgId, org.id), isNull(suppliers.removedAt), ne(orders.status, "draft"))),
    inventoryRows(org.id),
    supplierCustomers(org.id),
    db()
      .select({
        groupId: supplierProducts.groupId,
        supplierSku: supplierProducts.supplierSku,
        title: supplierProducts.title,
        priceMinor: supplierProducts.priceMinor,
        currency: supplierProducts.currency,
        priceBasis: supplierProducts.priceBasis,
        piecesPerSellablePack: supplierProducts.piecesPerSellablePack,
        sellablePacksPerCase: supplierProducts.sellablePacksPerCase,
        active: supplierProducts.active
      })
      .from(supplierProducts)
      .where(eq(supplierProducts.supplierOrgId, org.id)),
    db().select({ id: catalogs.id, status: catalogs.status }).from(catalogs).where(eq(catalogs.supplierOrgId, org.id))
  ])
  const orderIds = list.map((order) => order.id)
  const [shipmentRows, shipEvents] = orderIds.length
    ? await Promise.all([
        db()
          .select({
            orderId: shipments.orderId,
            status: shipments.status,
            packing: shipments.packing,
            createdAt: shipments.createdAt
          })
          .from(shipments)
          .where(inArray(shipments.orderId, orderIds))
          .orderBy(asc(shipments.createdAt)),
        db()
          .select({ orderId: events.orderId, createdAt: events.createdAt })
          .from(events)
          .where(and(inArray(events.orderId, orderIds), eq(events.messageKey, "supplierShipped")))
          .orderBy(asc(events.createdAt))
      ])
    : [[], []]

  // The day each order came in, and the day each shipment left the supplier: its order's shipped events in turn.
  const dayOf = (time: Date) => zonedDay(time, timeZone)
  const shipped = orderIds.flatMap((orderId) => {
    const left = shipEvents.filter((event) => event.orderId === orderId)
    return shipmentRows
      .filter((row) => row.orderId === orderId && shippedStates.has(row.status))
      .flatMap((row, index) => {
        const event = left[index]
        const pieces = (row.packing?.cartons ?? []).reduce(
          (sum, carton) => sum + carton.items.reduce((count, item) => count + item.pieces, 0),
          0
        )
        return event ? [{ day: dayOf(event.createdAt), pieces }] : []
      })
  })
  const received = list.map((order) => ({ ...order, day: dayOf(order.sentAt) }))
  const current = received.filter((order) => inRange(order.day, period.range))
  const previous = period.previous ? received.filter((order) => inRange(order.day, period.previous)) : null
  const value = totalsByCurrency(received)
  // Money adds up per currency; charts and headline figures use the one most is ordered in.
  const currency = value[0]?.currency ?? products[0]?.currency ?? "USD"
  const sum = (rows: typeof received, pick: (order: (typeof received)[number]) => number) =>
    rows.reduce((total, order) => total + pick(order), 0)
  const valueOf = (rows: typeof received) =>
    sum(
      rows.filter((order) => order.currency === currency),
      (order) => order.total
    )
  const shippedPieces = (range: DayRange | null) =>
    shipped.filter((row) => inRange(row.day, range)).reduce((total, row) => total + row.pieces, 0)

  // Each day's orders, and the previous period's day by day beside it.
  const series = days(period.range).map((day, index) => {
    const before = period.previous ? addDays(period.previous.from, index) : null
    const onDay = (key: string | null) => received.filter((order) => order.day === key && order.currency === currency)
    return {
      day,
      value: onDay(day).reduce((total, order) => total + order.total, 0),
      orders: received.filter((order) => order.day === day).length,
      previous:
        before && inRange(before, period.previous)
          ? onDay(before).reduce((total, order) => total + order.total, 0)
          : null
    }
  })

  // The products and customers ordering most in the period.
  const inPeriod = new Set(current.map((order) => order.id))
  const bySku = new Map<string, { pieces: number; value: number }>()
  for (const order of raw.filter((row) => inPeriod.has(row.id) && row.data.currency === currency)) {
    for (const [sku, totals] of skuPieces(order.data)) {
      const prior = bySku.get(sku) ?? { pieces: 0, value: 0 }
      bySku.set(sku, { pieces: prior.pieces + totals.pieces, value: prior.value + totals.value })
    }
  }
  const topProducts = [...bySku]
    .map(([sku, totals]) => {
      const product = products.find((row) => row.supplierSku === sku)
      return { sku, title: product?.title ?? sku, groupId: product?.groupId ?? null, ...totals }
    })
    .toSorted((a, b) => b.pieces - a.pieces)
    .slice(0, 5)
  const topCustomers = customers
    .map((customer) => {
      const own = current.filter((order) => order.customerId === customer.id)
      return {
        id: customer.id,
        name: customer.name,
        orders: own.length,
        value: own.filter((order) => order.currency === currency).reduce((total, order) => total + order.total, 0)
      }
    })
    .filter((customer) => customer.orders > 0)
    .toSorted((a, b) => b.value - a.value || b.orders - a.orders)
    .slice(0, 5)

  // Stock against open orders, for tracked variants that don't sell past what's on hand.
  const tracked = stock.filter((row) => row.trackInventory)
  const counted = tracked.filter((row) => !row.continueSelling)
  const short = counted.filter((row) => row.available < 0)
  const out = counted.filter((row) => row.available >= 0 && row.onHand <= 0)
  const low = counted.filter((row) => row.committed > 0 && row.available > 0 && row.available < row.committed)
  // What stock on hand is worth at list price, in each product's own currency.
  const stockValue = totalsByCurrency(
    tracked.flatMap((row) => {
      const product = products.find((candidate) => candidate.supplierSku === row.supplierSku)
      const per = product && piecesPerPrice(product)
      return product && product.priceMinor !== null && per && row.onHand > 0
        ? [{ currency: product.currency, total: Math.round((row.onHand * product.priceMinor) / per) }]
        : []
    })
  )

  const open = received.filter((order) => order.stage !== "closed")
  const stage = (name: (typeof open)[number]["stage"]) => open.filter((order) => order.stage === name)
  const pipeline = (["pack", "waiting", "ship", "shipped"] as const).map((key) => ({
    key,
    orders: stage(key).length,
    pieces: sum(stage(key), (order) => order.pieces)
  }))
  const unpriced = new Set(
    products.filter((row) => row.active === 1 && row.priceMinor === null).map((row) => row.groupId)
  )
  const activeCatalogs = new Set(catalogRows.filter((row) => row.status === "active").map((row) => row.id))
  return {
    currency,
    period: {
      key: period.key,
      range: period.range,
      label: period.label,
      comparison: period.comparison,
      comparisonLabel: comparisons.find((option) => option.key === period.comparison)!.label,
      previousLabel: period.previous ? rangeLabel(period.previous) : null,
      today
    },
    kpis: {
      orders: { value: current.length, change: change(current.length, previous?.length ?? null) },
      value: { value: valueOf(current), change: change(valueOf(current), previous ? valueOf(previous) : null) },
      pieces: {
        value: sum(current, (order) => order.pieces),
        change: change(
          sum(current, (order) => order.pieces),
          previous ? sum(previous, (order) => order.pieces) : null
        )
      },
      shipped: {
        value: shippedPieces(period.range),
        change: change(shippedPieces(period.range), period.previous ? shippedPieces(period.previous) : null)
      }
    },
    series,
    pipeline,
    backlog: { orders: open.length, pieces: sum(open, (order) => order.pieces), value: totalsByCurrency(open) },
    topProducts,
    topCustomers,
    inventory: {
      tracked: tracked.length,
      short: short.length,
      out: out.length,
      low: low.length,
      healthy: counted.length - short.length - out.length - low.length,
      unlimited: tracked.length - counted.length,
      value: stockValue,
      watch: [...short.toSorted((a, b) => a.available - b.available), ...low].slice(0, 5)
    },
    attention: {
      pack: stage("pack").length,
      ship: stage("ship").length,
      short: short.length,
      unpriced: unpriced.size,
      uncatalogued: catalogRows.length
        ? customers.filter((customer) => !customer.catalogId || !activeCatalogs.has(customer.catalogId)).length
        : 0
    },
    recent: list.slice(0, 5)
  }
}
export type SupplierOverviewData = Awaited<ReturnType<typeof supplierOverview>>
