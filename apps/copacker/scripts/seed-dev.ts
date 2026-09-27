// Fills the local database with a demo Shopify store for every buyer workspace, so Inventory, POs and Restock can be
// tried without connecting real accounts. Refuses to run against anything but a local database.
// Usage: pnpm db:seed (after signing in locally once, so a workspace exists).
import { randomUUID } from "node:crypto"
import type { ShopifySale } from "@repo/aisle/sales"
import type { Shopify } from "@repo/aisle/shopify"
import { and, eq } from "drizzle-orm"
import { db } from "../src/db/index"
import {
  connections,
  orders,
  organizations,
  productDefaults,
  salesOrders,
  salesSyncs,
  stockSnapshots,
  suppliers
} from "../src/db/schema"
import { salesDataVersion } from "../src/server/sales-orders"
import { encrypt } from "../src/server/security"

const url = new URL(process.env.DATABASE_URL ?? "postgres://invalid")
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  throw new Error("db:seed only runs against a local database")
}

const shop = "copacker-demo.myshopify.com"
const location = (id: number) => `gid://shopify/Location/${id}`
const locations = {
  warehouse: { locationId: location(1), locationName: "Warehouse", locationKind: "merchant" as const },
  amazon: { locationId: location(2), locationName: "Amazon Fulfillment", locationKind: "amazon_fulfillment" as const },
  collective: {
    locationId: location(3),
    locationName: "Partner via Shopify Collective",
    locationKind: "shopify_collective" as const
  }
}
type Row = Awaited<ReturnType<Shopify["stock"]>>["rows"][number]
const level = (at: keyof typeof locations, available: number | null, incoming = 0) => ({
  ...locations[at],
  available,
  onHand: available,
  incoming,
  committed: 0
})
const variant = (id: number, product: number, fields: Partial<Row>): Row => ({
  variantId: `gid://shopify/ProductVariant/${id}`,
  inventoryItemId: `gid://shopify/InventoryItem/${id}`,
  buyerSku: `demo-${id}`,
  productId: `gid://shopify/Product/${product}`,
  imageUrl: null,
  tracked: true,
  unit: "shopify_inventory_unit",
  levels: [],
  ...fields
})
const rows: Row[] = [
  variant(1, 10, {
    buyerSku: "grip-left",
    productTitle: "Pro-grip glove",
    variantTitle: "Left",
    unitCostMinor: 850,
    costCurrency: "USD",
    priceMinor: 2499,
    priceCurrency: "USD",
    levels: [level("warehouse", 42, 20), level("amazon", 18)]
  }),
  variant(2, 10, {
    buyerSku: "grip-right",
    productTitle: "Pro-grip glove",
    variantTitle: "Right",
    unitCostMinor: 850,
    costCurrency: "USD",
    priceMinor: 2499,
    priceCurrency: "USD",
    levels: [level("warehouse", 7), level("amazon", 3)]
  }),
  // A multipack: a Shopify bundle of three left gloves, sold on Amazon under its own SKU.
  variant(3, 11, {
    buyerSku: "grip-left-3pk",
    productTitle: "Pro-grip glove 3-pack",
    variantTitle: "Default Title",
    priceMinor: 6499,
    priceCurrency: "USD",
    bundle: { available: 14, components: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 3 }] },
    levels: [level("warehouse", null)]
  }),
  variant(4, 12, {
    buyerSku: "body-cord",
    productTitle: "Body cord",
    variantTitle: "Default Title",
    unitCostMinor: 1200,
    costCurrency: "USD",
    priceMinor: 3499,
    priceCurrency: "USD",
    levels: [level("warehouse", 120), level("amazon", 40)]
  }),
  variant(5, 13, {
    buyerSku: "partner-shoe",
    productTitle: "Partner volleyball shoe",
    variantTitle: "Default Title",
    levels: [level("collective", 60)]
  }),
  variant(6, 14, {
    buyerSku: "gift-card",
    productTitle: "Gift card",
    variantTitle: "Default Title",
    tracked: false,
    levels: [level("warehouse", 0)]
  })
]

// 90 days of priced web orders, paid with Shopify Payments and shipped from the warehouse: a left glove daily (two every other day over the last month),
// a right glove every other day, and two body cords every third day (every sixth over the last month), with 10% off
// every fifth order. Restock and the Overview read these as stored Shopify orders.
const prices: Record<number, string> = { 1: "24.99", 2: "24.99", 4: "34.99" }
const day = 86400000
const today = Math.floor(Date.now() / day) * day
function demoOrders() {
  const sales: ShopifySale[] = []
  for (let ago = 1; ago <= 90; ago++) {
    const lines = [
      { variant: 1, sku: "grip-left", quantity: ago <= 30 && ago % 2 === 0 ? 2 : 1 },
      ...(ago % 2 === 0 ? [{ variant: 2, sku: "grip-right", quantity: 1 }] : []),
      ...(ago % (ago <= 30 ? 6 : 3) === 0 ? [{ variant: 4, sku: "body-cord", quantity: 2 }] : [])
    ].map((line, index) => ({
      id: `gid://shopify/LineItem/${ago * 10 + index}`,
      quantity: line.quantity,
      currentQuantity: line.quantity,
      sku: line.sku,
      variant: { id: `gid://shopify/ProductVariant/${line.variant}` },
      lineItemGroup: null,
      originalUnitPriceSet: { shopMoney: { amount: prices[line.variant]!, currencyCode: "USD" } },
      discountAllocations:
        ago % 5 === 0
          ? [
              {
                allocatedAmountSet: {
                  shopMoney: {
                    amount: ((Number(prices[line.variant]) * line.quantity) / 10).toFixed(2),
                    currencyCode: "USD"
                  }
                }
              }
            ]
          : []
    }))
    sales.push({
      id: `gid://shopify/Order/${ago}`,
      name: `#${2000 - ago}`,
      createdAt: new Date(today - ago * day + 12 * 3600000).toISOString(),
      cancelledAt: null,
      test: false,
      sourceName: "web",
      lines,
      // Paid with Shopify Payments: 2.9% plus 30 cents.
      transactions: [
        {
          id: `gid://shopify/OrderTransaction/${ago}`,
          kind: "SALE",
          status: "SUCCESS",
          fees: [
            {
              amount: {
                amount: (
                  lines.reduce(
                    (sum, line) => sum + Number(line.originalUnitPriceSet.shopMoney.amount) * line.quantity,
                    0
                  ) *
                    0.029 +
                  0.3
                ).toFixed(2),
                currencyCode: "USD"
              },
              taxAmount: { amount: "0.00", currencyCode: "USD" }
            }
          ]
        }
      ],
      fulfillments: [
        {
          id: `gid://shopify/Fulfillment/${ago}`,
          status: "SUCCESS",
          location: { id: locations.warehouse.locationId },
          lines: lines.map((line) => ({ id: `${line.id}/f`, quantity: line.quantity, lineItem: { id: line.id } }))
        }
      ]
    })
  }
  return sales
}

const buyers = await db().select().from(organizations).where(eq(organizations.kind, "buyer"))
if (!buyers.length) {
  throw new Error("Sign in locally first so a buyer workspace exists")
}
for (const org of buyers) {
  const [connected] = await db()
    .select({ externalId: connections.externalId })
    .from(connections)
    .where(and(eq(connections.orgId, org.id), eq(connections.provider, "shopify")))
  if (connected && connected.externalId !== shop) {
    process.stdout.write(`Skipped ${org.name}: it is connected to ${connected.externalId}
`)
    continue
  }
  const token = encrypt(JSON.stringify({ token: "demo", expiresAt: Date.now() + 365 * 86400000 }), `${org.id}:shopify`)
  await db()
    .insert(connections)
    .values({ orgId: org.id, provider: "shopify", externalId: shop, encryptedToken: token, scopes: "read_products" })
    .onConflictDoNothing()
  const now = new Date().toISOString()
  const data = {
    source: "shopify" as const,
    scopeKey: "store" as const,
    shopifyDomain: shop,
    startedAt: now,
    observedAt: now,
    rows
  }
  await db()
    .insert(stockSnapshots)
    .values({
      orgId: org.id,
      source: "shopify",
      externalAccountId: shop,
      scopeKey: "store",
      snapshotId: randomUUID(),
      attemptFinishedAt: new Date(),
      data
    })
    .onConflictDoUpdate({
      target: [stockSnapshots.orgId, stockSnapshots.source, stockSnapshots.externalAccountId, stockSnapshots.scopeKey],
      set: { data, snapshotId: randomUUID(), status: "idle", attemptFinishedAt: new Date() }
    })
  const [{ id: supplierId }] = await db()
    .insert(suppliers)
    .values({ buyerOrgId: org.id, name: "Demo supplier", email: "supplier@example.com" })
    .onConflictDoUpdate({ target: [suppliers.buyerOrgId, suppliers.name], set: { email: "supplier@example.com" } })
    .returning({ id: suppliers.id })
  // The gloves come from the demo supplier; the body cord has no supplier yet, so Restock shows both groups.
  await db()
    .insert(productDefaults)
    .values({ orgId: org.id, shopifyDomain: shop, productId: "gid://shopify/Product/10", supplierId })
    .onConflictDoUpdate({
      target: [productDefaults.orgId, productDefaults.shopifyDomain, productDefaults.productId],
      set: { supplierId }
    })
  await db()
    .delete(salesOrders)
    .where(and(eq(salesOrders.orgId, org.id), eq(salesOrders.externalAccountId, shop)))
  await db()
    .insert(salesOrders)
    .values(
      demoOrders().map((sale) => ({
        orgId: org.id,
        source: "shopify" as const,
        externalAccountId: shop,
        orderId: sale.id,
        orderedAt: new Date(sale.createdAt),
        data: sale
      }))
    )
  const sync = {
    externalAccountId: shop,
    status: "idle" as const,
    coveredFrom: new Date(today - 120 * day),
    coveredTo: new Date(today),
    finishedAt: new Date(),
    // The orders above carry prices, so they're stored in the current shape.
    dataVersion: salesDataVersion
  }
  await db()
    .insert(salesSyncs)
    .values({ orgId: org.id, source: "shopify", ...sync })
    .onConflictDoUpdate({ target: [salesSyncs.orgId, salesSyncs.source], set: sync })
  const existing = await db().select({ id: orders.id }).from(orders).where(eq(orders.buyerOrgId, org.id))
  if (!existing.length) {
    // A sent PO to Amazon AWD, so On order shows at the Amazon location.
    await db()
      .insert(orders)
      .values({
        buyerOrgId: org.id,
        supplierId,
        shopifyDomain: shop,
        status: "submitted",
        data: {
          supplierId,
          reference: "DEMO-1",
          destination: "awd_us",
          currency: "USD",
          dueDate: "2026-12-01",
          paymentTerms: "30% deposit, 70% before shipment",
          notes: "",
          adjustments: [],
          items: [
            {
              id: randomUUID(),
              variantId: "gid://shopify/ProductVariant/3",
              inventoryItemId: "gid://shopify/InventoryItem/3",
              name: "Pro-grip glove 3-pack",
              variant: "",
              buyerSku: "grip-left-3pk",
              supplierSku: "",
              asin: "",
              fnsku: "",
              pieces: 150,
              piecesPerSet: 3,
              unitPrice: 400,
              instructions: "",
              prepCategory: "POLYBAGGING",
              suffocationWarning: false
            }
          ]
        }
      })
  }
  process.stdout.write(`Seeded ${org.name}\n`)
}
process.exit(0)
