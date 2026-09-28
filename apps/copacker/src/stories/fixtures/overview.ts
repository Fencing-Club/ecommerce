import type { Overview, SetupStep } from "@/server/overview"
import type { DailySales } from "@/server/overview-sales"
import type { SupplierOverviewData } from "@/server/supplier-overview"
import { daysAgo } from "./orders"

// The buyer's and supplier's Overviews as the server works them out, for stories.

// A day key, such as "2026-09-01", some days before today.
export function dayKey(days: number) {
  return daysAgo(days).toISOString().slice(0, 10)
}

// Thirty days of sales ending `end` days ago, Amazon and Shopify side by side. `scale` makes a quieter period.
function salesDays(end: number, scale: number): DailySales[] {
  return Array.from({ length: 30 }, (_, index) => {
    const amazon = Math.round((6 + ((index * 7) % 9)) * scale)
    const shopify = Math.round((3 + ((index * 5) % 6)) * scale)
    return {
      date: dayKey(end + 29 - index),
      amazon: { orders: amazon, units: amazon * 2, revenueMinor: amazon * 5200, unpriced: 0 },
      shopify: { orders: shopify, units: shopify + 2, revenueMinor: shopify * 4150, unpriced: 0 },
      ebay: null
    }
  })
}

function totals(days: DailySales[]) {
  const cells = days.flatMap((day) => [day.amazon, day.shopify, day.ebay]).filter((cell) => cell !== null)
  return {
    orders: cells.reduce((sum, cell) => sum + cell.orders, 0),
    units: cells.reduce((sum, cell) => sum + cell.units, 0),
    revenueMinor: cells.reduce((sum, cell) => sum + cell.revenueMinor, 0),
    unpriced: 0
  }
}

const daily = salesDays(1, 1)
const previousDaily = salesDays(31, 0.8)
const current = totals(daily)

export const setupSteps: SetupStep[] = [
  { key: "connect", title: "Connect a store", detail: "Shopify or Amazon", href: "/settings#integrations", done: true },
  {
    key: "orders",
    title: "Copy your orders",
    detail: "Sales history for restock",
    href: "/sales",
    done: false,
    syncing: { progress: 0.4 }
  },
  { key: "stock", title: "Sync your stock", detail: "Stock at every location", href: "/products", done: false },
  { key: "costs", title: "Add unit costs", detail: "12 products have no unit cost", href: "/products", done: false }
]

const period: Overview["period"] = {
  key: "last30",
  label: "Last 30 days",
  range: { from: dayKey(30), to: dayKey(1) },
  rangeLabel: "Last 30 days",
  comparison: "previousPeriod",
  comparisonLabel: "Previous period",
  previous: { from: dayKey(60), to: dayKey(31) },
  previousLabel: "Previous 30 days",
  today: dayKey(0)
}

const usd = (minor: number) => [{ currency: "USD", minor }]

export const buyerOverview: Overview = {
  generatedAt: daysAgo(0).toISOString(),
  timeZone: "America/Los_Angeles",
  connected: ["amazon", "shopify"],
  channels: [
    { key: "amazon", label: "Amazon" },
    { key: "shopify:81234", label: "Harbor Warehouse" }
  ],
  channel: null,
  restockChannel: null,
  period,
  setup: setupSteps.map((step) => ({ ...step, done: true, syncing: undefined })),
  sales: {
    sources: ["amazon", "shopify"],
    daily,
    totals: { ...current, previous: totals(previousDaily) },
    previousDaily,
    currency: "USD",
    profit: {
      currency: "USD",
      revenueMinor: current.revenueMinor,
      costedRevenueMinor: current.revenueMinor - 42000,
      costMinor: 500000,
      feesMinor: 238000,
      charges: [
        { key: "amazon-refunds", label: "Amazon refunds", minor: -18400, currency: "USD" },
        { key: "shopify-disputes", label: "Shopify disputes", minor: -1500, currency: "USD" },
        { key: "amazon-ads", label: "Amazon ads", minor: -96000, currency: "USD" },
        { key: "shopify-labels", label: "Shopify shipping labels", minor: -22000, currency: "USD" },
        { key: "monthly:rent", label: "Warehouse rent, monthly cost", minor: -150000, currency: "USD" }
      ],
      chargesMinor: -287900,
      profitMinor: 412300,
      margin: 0.28
    },
    estimatedFeeOrders: 4,
    movers: {
      rising: [
        {
          id: "gid://shopify/ProductVariant/1001",
          product: "Canvas tote bag",
          variant: "Natural",
          sku: "TOTE-NAT",
          imageUrl: null,
          current: 84,
          previous: 52
        }
      ],
      falling: [
        {
          id: "gid://shopify/ProductVariant/1002",
          product: "Linen apron",
          variant: null,
          sku: "APRON-CHR",
          imageUrl: null,
          current: 12,
          previous: 30
        }
      ]
    },
    customers: {
      customers: 180,
      returning: 45,
      yearCustomers: 1200,
      repeatCustomers: 360,
      yearOrders: 1800,
      yearRevenueMinor: 9600000,
      currency: "USD",
      status: "ready",
      historyFrom: daysAgo(400).toISOString()
    },
    otherMarketplaceOrders: 2,
    moversComparable: true
  },
  restock: {
    days: 60,
    leadTimeDays: 60,
    stockouts: 2,
    reorders: 3,
    blocked: 1,
    reorderCost: usd(342000),
    reorderUncosted: 0,
    lostDays: 9,
    lostUnits: 40,
    lostValue: usd(96000),
    expectedLost: usd(124000),
    expectedLostUnits: 52,
    expectedLostItems: 2,
    expectedLostUnpriced: 0,
    itemsOut: 1,
    unitsOnHand: 3120,
    stockValue: usd(1840000),
    retailValue: usd(4210000),
    uncosted: 0,
    unpriced: 0,
    channels: [
      { key: "amazon", label: "Amazon", available: 2100, incoming: 600, value: usd(1210000), retail: usd(2900000) },
      {
        key: "shopify:81234",
        label: "Harbor Warehouse",
        available: 1020,
        incoming: 0,
        value: usd(630000),
        retail: usd(1310000)
      }
    ],
    cover: [
      { key: "out", label: "Out of stock", items: 1, channel: "amazon" },
      { key: "under14", label: "Under 2 weeks", items: 2, channel: "amazon" },
      { key: "under30", label: "2 to 4 weeks", items: 4, channel: "shopify:81234" },
      { key: "under60", label: "1 to 2 months", items: 6, channel: "amazon" },
      { key: "under90", label: "2 to 3 months", items: 3, channel: "amazon" },
      { key: "over90", label: "Over 3 months", items: 2, channel: "shopify:81234" },
      { key: "unsold", label: "Not selling", items: 0, channel: "amazon" }
    ],
    slow: {
      items: 2,
      units: 340,
      value: usd(210000),
      top: [
        {
          variantId: "gid://shopify/ProductVariant/1003",
          channel: "Harbor Warehouse",
          channelKey: "shopify:81234",
          product: "Market basket",
          variant: "Large",
          sku: "BASKET-L",
          imageUrl: null,
          available: 220,
          daysRemaining: 140,
          bucket: "over90",
          value: { minor: 160000, currency: "USD" }
        },
        {
          variantId: "gid://shopify/ProductVariant/1004",
          channel: "Amazon",
          channelKey: "amazon",
          product: "Cotton napkins",
          variant: null,
          sku: "NAPKIN-4",
          imageUrl: null,
          available: 120,
          daysRemaining: null,
          bucket: "unsold",
          value: null
        }
      ]
    },
    bestSellers: [
      {
        variantId: "gid://shopify/ProductVariant/1001",
        product: "Canvas tote bag",
        variant: "Natural",
        sku: "TOTE-NAT",
        imageUrl: null,
        sold: 420,
        available: 0,
        daysRemaining: 0,
        status: "stockout",
        channel: "amazon",
        channels: ["Amazon", "Harbor Warehouse"]
      },
      {
        variantId: "gid://shopify/ProductVariant/1005",
        product: "Linen apron",
        variant: "Charcoal",
        sku: "APRON-CHR",
        imageUrl: null,
        sold: 210,
        available: 380,
        daysRemaining: 54,
        status: "stocked",
        channel: "shopify:81234",
        channels: ["Harbor Warehouse"]
      }
    ],
    landedProducts: 3
  },
  purchasing: {
    openCount: 7,
    open: usd(2480000),
    draftCount: 1,
    drafts: usd(310000),
    bySupplier: [
      { name: "Lotus Manufacturing", orders: 2, value: usd(920000) },
      { name: "Northwind Textiles", orders: 1, value: usd(610000) },
      { name: "Cedar Works", orders: 1, value: usd(380000) },
      { name: "Maple Crafts", orders: 1, value: usd(270000) },
      { name: "Pine Street Goods", orders: 1, value: usd(180000) },
      { name: "Birch Supply", orders: 1, value: [{ currency: "EUR", minor: 120000 }] }
    ]
  },
  upcoming: {
    reorders: usd(342000),
    purchaseOrders: [
      { key: "overdue", label: "Past due", orders: 1, value: usd(180000) },
      { key: "next30", label: "Due in the next 30 days", orders: 3, value: usd(1320000) },
      { key: "next60", label: "Due in 31 to 60 days", orders: 0, value: [] },
      { key: "later", label: "Due later", orders: 3, value: usd(980000) }
    ],
    next60: usd(1842000)
  },
  attention: [
    {
      key: "stockouts",
      tone: "critical",
      title: "2 items will run out",
      detail: "Before an order placed today arrives",
      href: "/restock?status=order",
      action: "Reorder"
    },
    {
      key: "shipments",
      tone: "warning",
      title: "1 shipment needs approval",
      detail: "Lotus Manufacturing is waiting",
      href: "/shipments",
      action: "Review"
    },
    {
      key: "drafts",
      tone: "info",
      title: "1 draft purchase order",
      detail: "Not sent yet",
      href: "/orders?status=draft",
      action: "Open"
    }
  ]
}

// A buyer who hasn't connected a store: nothing to show but setting up.
export const unconnectedOverview: Overview = {
  ...buyerOverview,
  connected: [],
  channels: [],
  setup: setupSteps.map((step) => ({ ...step, done: false, syncing: undefined }))
}

export const supplierOverviewData: SupplierOverviewData = {
  currency: "USD",
  period: {
    key: period.key,
    range: period.range,
    label: period.label,
    comparison: period.comparison,
    comparisonLabel: period.comparisonLabel,
    previousLabel: period.previousLabel,
    today: period.today
  },
  kpis: {
    orders: { value: 12, change: 0.2 },
    value: { value: 4820000, change: -0.05 },
    pieces: { value: 3600, change: 0.1 },
    shipped: { value: 2400, change: null }
  },
  series: daily.map((day, index) => ({
    day: day.date,
    value: (index % 4) * 120000,
    orders: index % 4 ? 1 : 0,
    previous: (index % 3) * 90000
  })),
  pipeline: [
    { key: "pack", orders: 2, pieces: 600 },
    { key: "waiting", orders: 1, pieces: 240 },
    { key: "ship", orders: 1, pieces: 360 },
    { key: "shipped", orders: 3, pieces: 1100 }
  ],
  backlog: { orders: 7, pieces: 2300, value: [{ currency: "USD", amount: 2850000 }] },
  topProducts: [
    { sku: "LM-TOTE-001", title: "Canvas tote bag", groupId: null, pieces: 1200, value: 510000 },
    { sku: "LM-APRON-002", title: "Linen apron", groupId: null, pieces: 600, value: 534000 }
  ],
  topCustomers: [
    { id: "customer-harbor", name: "Harbor Goods", orders: 8, value: 3200000 },
    { id: "customer-summit", name: "Summit Outfitters", orders: 4, value: 1620000 }
  ],
  inventory: {
    tracked: 14,
    short: 1,
    out: 2,
    low: 1,
    healthy: 9,
    unlimited: 1,
    value: [{ currency: "USD", amount: 1240000 }],
    watch: []
  },
  attention: { pack: 2, ship: 1, short: 1, unpriced: 0, uncatalogued: 0 },
  recent: []
}
