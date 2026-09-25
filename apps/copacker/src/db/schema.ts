import type { Address, OrderInput, Packing, PackingDraft } from "@repo/aisle"
import type { CartonLabel } from "@repo/aisle/labels"
import { pgTable, uuid, text, timestamp, integer, jsonb, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core"

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
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("supplier_buyer_email").on(t.buyerOrgId, t.email)]
)
export const contacts = pgTable("contacts", {
  id: uuid().defaultRandom().primaryKey(),
  orgId: uuid()
    .notNull()
    .references(() => organizations.id),
  name: text().notNull(),
  kind: text({ enum: ["forwarder", "pickup"] }).notNull(),
  address: jsonb().$type<Address>().notNull(),
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
    amazonSellerId: text().notNull(),
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
    kind: text({ enum: ["amazon", "email", "shopify"] }).notNull(),
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
