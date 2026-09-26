import { type Address, type OrderInput, type Packing, type PackingDraft, prepCategories } from "@repo/aisle"
import type { Amazon } from "@repo/aisle/amazon"
import type { CartonLabel } from "@repo/aisle/labels"
import type { AmazonSale, ShopifySale } from "@repo/aisle/sales"
import type { Shopify } from "@repo/aisle/shopify"
import { pgTable, uuid, text, timestamp, integer, jsonb, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core"
import type { CasePack } from "../lib/case-packs"
import { contactKinds } from "../lib/contacts"
import type { ImportProposal } from "../server/import-proposal"

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
export const organizations = pgTable("organizations", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  kind: text({ enum: ["buyer", "supplier"] }).notNull(),
  workosId: text().unique(),
  createdAt: createdAt()
})
export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    userId: text().notNull(),
    email: text().notNull(),
    role: text({ enum: ["owner", "member"] })
      .notNull()
      .default("member")
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })]
)
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid().defaultRandom().primaryKey(),
    buyerOrgId: uuid()
      .notNull()
      .references(() => organizations.id),
    supplierOrgId: uuid().references(() => organizations.id),
    name: text().notNull(),
    email: text().notNull(),
    invitationHash: text().unique(),
    expiresAt: timestamp({ withTimezone: true }),
    // Set when the buyer removes the supplier. The row stays so earlier POs keep their supplier.
    removedAt: timestamp({ withTimezone: true }),
    // Days from ordering to stock arriving at the buyer's own locations, and at Amazon. Restock orders enough to last
    // this long; unset uses the restock page's lead time.
    leadTimeDays: integer(),
    amazonLeadTimeDays: integer(),
    createdAt: createdAt()
  },
  // One buyer may work with several supplier workspaces owned by the same email.
  (t) => [uniqueIndex("supplier_buyer_name").on(t.buyerOrgId, t.name)]
)
export const supplierProfiles = pgTable("supplier_profiles", {
  orgId: uuid()
    .primaryKey()
    .references(() => organizations.id),
  website: text(),
  phoneNumber: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
})
export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierOrgId: uuid()
      .notNull()
      .references(() => organizations.id),
    supplierSku: text().notNull(),
    title: text().notNull(),
    active: integer().notNull().default(1),
    revision: integer().notNull().default(1),
    currency: text().notNull(),
    priceMinor: integer(),
    priceBasis: text().notNull().default("piece"),
    piecesPerSellablePack: integer().notNull().default(1),
    sellablePacksPerCase: integer(),
    notes: text(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("supplier_product_sku").on(t.supplierOrgId, t.supplierSku)]
)
export const supplierCatalogImports = pgTable("supplier_catalog_imports", {
  id: uuid().defaultRandom().primaryKey(),
  supplierOrgId: uuid()
    .notNull()
    .references(() => organizations.id),
  objectKey: text().notNull().unique(),
  filename: text().notNull(),
  createdBy: text().notNull(),
  rowCount: integer().notNull(),
  createdAt: createdAt()
})
export const contacts = pgTable("contacts", {
  id: uuid().defaultRandom().primaryKey(),
  orgId: uuid()
    .notNull()
    .references(() => organizations.id),
  name: text().notNull(),
  kind: text({ enum: contactKinds }).notNull(),
  address: jsonb().$type<Address>().notNull(),
  // For a delivery address, the Shopify location its stock appears at, so POs sent there show as on order there.
  shopifyLocationId: text(),
  createdAt: createdAt()
})
export const connections = pgTable(
  "connections",
  {
    id: uuid().defaultRandom().primaryKey(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    provider: text({ enum: ["amazon", "shopify"] }).notNull(),
    externalId: text().notNull(),
    encryptedToken: text().notNull(),
    scopes: text().notNull().default(""),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("connection_org_provider").on(t.orgId, t.provider)]
)
export const oauthStates = pgTable("oauth_states", {
  hash: text().primaryKey(),
  orgId: uuid()
    .notNull()
    .references(() => organizations.id),
  userId: text().notNull(),
  provider: text().notNull(),
  shop: text(),
  expiresAt: timestamp({ withTimezone: true }).notNull()
})
export const teamInvitations = pgTable("team_invitations", {
  id: uuid().defaultRandom().primaryKey(),
  orgId: uuid()
    .notNull()
    .references(() => organizations.id),
  email: text().notNull(),
  hash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt()
})
export const orders = pgTable(
  "orders",
  {
    id: uuid().defaultRandom().primaryKey(),
    buyerOrgId: uuid()
      .notNull()
      .references(() => organizations.id),
    supplierId: uuid()
      .notNull()
      .references(() => suppliers.id),
    shopifyDomain: text().notNull(),
    // Null until Amazon is connected; set when the PO is sent for an Amazon shipment.
    amazonSellerId: text(),
    status: text({ enum: ["draft", "submitted", "closed"] })
      .notNull()
      .default("draft"),
    revision: integer().notNull().default(1),
    data: jsonb().$type<OrderInput>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("orders_buyer").on(t.buyerOrgId), index("orders_supplier").on(t.supplierId)]
)
export const orderRevisions = pgTable(
  "order_revisions",
  {
    id: uuid().defaultRandom().primaryKey(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    revision: integer().notNull(),
    data: jsonb().$type<OrderInput>().notNull(),
    actor: text().notNull(),
    reason: text().notNull(),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("order_revision").on(t.orderId, t.revision)]
)
export type ShipmentState =
  | "packing"
  | "approval"
  | "queued"
  | "creating"
  | "waiting_labels"
  | "ready"
  | "collected"
  | "received"
  | "correction"
  | "needs_attention"
  | "cancelled"
export const shipments = pgTable(
  "shipments",
  {
    id: uuid().defaultRandom().primaryKey(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    revision: integer().notNull().default(1),
    orderRevision: integer().notNull(),
    status: text().$type<ShipmentState>().notNull().default("packing"),
    packing: jsonb().$type<Packing>(),
    packingDraft: jsonb("packing_draft").$type<PackingDraft>(),
    snapshot: jsonb().$type<OrderInput>(),
    amazonOrderId: text(),
    amazonShipmentId: text(),
    operation: text().notNull().default("none"),
    labels: jsonb().$type<CartonLabel[]>().notNull().default([]),
    bookingReference: text(),
    issue: text(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("shipments_order").on(t.orderId)]
)
export const documents = pgTable(
  "documents",
  {
    id: uuid().defaultRandom().primaryKey(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    shipmentId: uuid().references(() => shipments.id),
    kind: text({
      enum: [
        "invoice",
        "product_label",
        "carton_label",
        "shipping_label",
        "packing_list",
        "checklist",
        "purchase_order"
      ]
    }).notNull(),
    itemId: uuid(),
    cartonId: text(),
    objectKey: text().notNull().unique(),
    name: text().notNull(),
    bytes: integer().notNull(),
    orderRevision: integer().notNull(),
    shipmentRevision: integer(),
    outdated: integer().notNull().default(0),
    uploadedBy: text().notNull(),
    createdAt: createdAt()
  },
  (t) => [index("documents_order").on(t.orderId)]
)
export const events = pgTable("events", {
  id: uuid().defaultRandom().primaryKey(),
  orderId: uuid()
    .notNull()
    .references(() => orders.id),
  actor: text().notNull(),
  message: text().notNull(),
  createdAt: createdAt()
})
export const jobs = pgTable(
  "jobs",
  {
    id: uuid().defaultRandom().primaryKey(),
    key: text().notNull().unique(),
    kind: text({ enum: ["amazon", "email", "shopify", "import", "stock", "sales"] }).notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: text().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    runAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    leaseAt: timestamp({ withTimezone: true }),
    error: text(),
    createdAt: createdAt()
  },
  (t) => [index("jobs_pending").on(t.status, t.runAt)]
)
export const poImports = pgTable("po_imports", {
  id: uuid().defaultRandom().primaryKey(),
  orgId: uuid()
    .notNull()
    .references(() => organizations.id),
  createdBy: text().notNull(),
  objectKey: text().notNull().unique(),
  filename: text().notNull(),
  shopifyDomain: text().notNull(),
  amazonSellerId: text(),
  status: text({ enum: ["queued", "running", "review", "failed", "cancelled", "saved"] })
    .notNull()
    .default("queued"),
  revision: integer().notNull().default(1),
  proposal: jsonb().$type<ImportProposal>(),
  promptVersion: integer(),
  model: text(),
  tokens: integer(),
  error: text(),
  orderId: uuid().references(() => orders.id),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
})

export const stockSnapshots = pgTable(
  "stock_snapshots",
  {
    id: uuid().defaultRandom().primaryKey(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    source: text({ enum: ["awd", "shopify", "fba"] }).notNull(),
    externalAccountId: text().notNull(),
    scopeKey: text().notNull(),
    revision: integer().notNull().default(0),
    status: text({ enum: ["idle", "queued", "running", "failed"] })
      .notNull()
      .default("idle"),
    requestedAt: timestamp({ withTimezone: true }),
    attemptStartedAt: timestamp({ withTimezone: true }),
    attemptFinishedAt: timestamp({ withTimezone: true }),
    workerToken: uuid(),
    snapshotId: uuid(),
    data: jsonb().$type<Awaited<ReturnType<Amazon["awdStock"] | Amazon["fbaStock"] | Shopify["stock"]>>>(),
    errorCode: text()
  },
  (t) => [uniqueIndex("stock_scope").on(t.orgId, t.source, t.externalAccountId, t.scopeKey)]
)

export const inventoryLocationMappings = pgTable(
  "inventory_location_mappings",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    shopifyDomain: text().notNull(),
    locationId: text().notNull(),
    classification: text({ enum: ["merchant", "amazon_mirror", "excluded", "unresolved"] }).notNull(),
    revision: integer().notNull().default(1)
  },
  (t) => [primaryKey({ columns: [t.orgId, t.shopifyDomain, t.locationId] })]
)
// Buyer-owned product details that neither Shopify nor Amazon stores, used as defaults on new PO lines.
export const productDefaults = pgTable(
  "product_defaults",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    shopifyDomain: text().notNull(),
    productId: text().notNull(),
    description: text().notNull().default(""),
    prepCategory: text({ enum: prepCategories }),
    // Carton setups the supplier packs this product in; the first is the default.
    casePacks: jsonb().$type<CasePack[]>().notNull().default([]),
    // The smallest quantity worth ordering, in sellable units. Restock never suggests less.
    minimumOrder: integer(),
    revision: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.shopifyDomain, t.productId] })]
)
// Sales orders copied from Shopify and Amazon, as their readers return them, so restock can read any period quickly.
export const salesOrders = pgTable(
  "sales_orders",
  {
    id: uuid().defaultRandom().primaryKey(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    source: text({ enum: ["shopify", "amazon"] }).notNull(),
    externalAccountId: text().notNull(),
    orderId: text().notNull(),
    orderedAt: timestamp({ withTimezone: true }).notNull(),
    data: jsonb().$type<ShopifySale | AmazonSale>().notNull(),
    syncedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("sales_order_identity").on(t.orgId, t.source, t.externalAccountId, t.orderId),
    index("sales_order_period").on(t.orgId, t.source, t.orderedAt)
  ]
)
// Each source's order sync: its state and the unbroken period of orders stored.
export const salesSyncs = pgTable(
  "sales_syncs",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    source: text({ enum: ["shopify", "amazon"] }).notNull(),
    externalAccountId: text().notNull(),
    status: text({ enum: ["idle", "queued", "running", "failed"] })
      .notNull()
      .default("idle"),
    revision: integer().notNull().default(0),
    coveredFrom: timestamp({ withTimezone: true }),
    coveredTo: timestamp({ withTimezone: true }),
    requestedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    errorCode: text()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.source] })]
)
