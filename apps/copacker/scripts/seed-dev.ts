// Fills the local database with a demo Shopify store for every buyer workspace, so Inventory and POs can be tried
// without connecting real accounts. Refuses to run against anything but a local database.
// Usage: pnpm db:seed (after signing in locally once, so a workspace exists).
import { randomUUID } from "node:crypto"
import type { Shopify } from "@repo/aisle/shopify"
import { and, eq } from "drizzle-orm"
import { db } from "../src/db/index"
import { connections, orders, organizations, stockSnapshots, suppliers } from "../src/db/schema"
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
    levels: [level("warehouse", 42, 20), level("amazon", 18)]
  }),
  variant(2, 10, {
    buyerSku: "grip-right",
    productTitle: "Pro-grip glove",
    variantTitle: "Right",
    levels: [level("warehouse", 7), level("amazon", 3)]
  }),
  // A multipack: a Shopify bundle of three left gloves, sold on Amazon under its own SKU.
  variant(3, 11, {
    buyerSku: "grip-left-3pk",
    productTitle: "Pro-grip glove 3-pack",
    variantTitle: "Default Title",
    bundle: { available: 14, components: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 3 }] },
    levels: [level("warehouse", null)]
  }),
  variant(4, 12, {
    buyerSku: "body-cord",
    productTitle: "Body cord",
    variantTitle: "Default Title",
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
      data
    })
    .onConflictDoUpdate({
      target: [stockSnapshots.orgId, stockSnapshots.source, stockSnapshots.externalAccountId, stockSnapshots.scopeKey],
      set: { data, snapshotId: randomUUID(), status: "idle" }
    })
  const [{ id: supplierId }] = await db()
    .insert(suppliers)
    .values({ buyerOrgId: org.id, name: "Demo supplier", email: "supplier@example.com" })
    .onConflictDoUpdate({ target: [suppliers.buyerOrgId, suppliers.email], set: { name: "Demo supplier" } })
    .returning({ id: suppliers.id })
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
              prepCategory: "POLYBAGGING"
            }
          ]
        }
      })
  }
  process.stdout.write(`Seeded ${org.name}\n`)
}
process.exit(0)
