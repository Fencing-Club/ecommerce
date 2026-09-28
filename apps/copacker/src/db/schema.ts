import {
  type Address,
  amazonNetworks,
  type OrderInput,
  type Packing,
  type PackingDraft,
  prepCategories
} from "@repo/aisle"
import type { Amazon } from "@repo/aisle/amazon"
import type { CartonLabel } from "@repo/aisle/labels"
import type { AmazonSale, ShopifySale } from "@repo/aisle/sales"
import type { Shopify } from "@repo/aisle/shopify"
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  date,
  numeric,
  boolean
} from "drizzle-orm/pg-core"
import type { CasePack } from "../lib/case-packs"
import { defaultQuantityRules, type PriceBreak, type QuantityRules } from "../lib/catalog-pricing"
import { contactKinds } from "../lib/contacts"
import type { ProductImage } from "../lib/supplier-product"
import type { ImportProposal } from "../server/import-proposal"

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
export const organizations = pgTable("organizations", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  kind: text({ enum: ["buyer", "supplier", "forwarder"] }).notNull(),
  workosId: text().unique(),
  // The store's IANA time zone, such as America/Los_Angeles. Days and months on the Overview use it; null means UTC.
  timeZone: text(),
  // Shopify order tags whose orders are left out of Copacker's order counts, lists, Overview and Restock, compared
  // without regard to case. Shopify's Amazon sales channel tags its copies of Amazon's orders "Amazon"; those are
  // counted from Amazon itself.
  excludedShopifyTags: text().array().notNull().default(["Amazon"]),
  // Restock's sales period and default lead time in days, used by Restock and the Overview. Null uses 60 days.
  restockSalesDays: integer(),
  restockLeadTimeDays: integer(),
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
    // Where invitations and PO notifications go; null until the buyer invites the supplier.
    email: text(),
    invitationHash: text().unique(),
    expiresAt: timestamp({ withTimezone: true }),
    // Set when the buyer removes the supplier. The row stays so earlier POs keep their supplier.
    removedAt: timestamp({ withTimezone: true }),
    // Days from ordering to stock arriving at the buyer's own locations, and at Amazon. Restock orders enough to last
    // this long; unset uses the restock page's lead time.
    leadTimeDays: integer(),
    // Unused: payment terms are set on each PO, which starts due immediately. To drop in a later migration.
    paymentTerms: text().notNull().default("Due immediately"),
    // The supplier's name in Shopify's product Supplier field (custom.supplier), usually its legal name, such as
    // "SUZHOU BOPAC Teco CO., LTD" for Ok Fencing. Products with it belong to this supplier.
    shopifySupplierName: text(),
    // Contact details the buyer keeps until the supplier joins; after that the supplier's own profile is shown.
    website: text(),
    contactName: text(),
    contactEmail: text(),
    phoneNumber: text(),
    // The catalog the supplier gave this customer: the products it can order and their prices. Without an active one,
    // it orders from every active product at its own price.
    catalogId: uuid().references(() => catalogs.id, { onDelete: "set null" }),
    createdAt: createdAt()
  },
  // One buyer may work with several supplier workspaces owned by the same email.
  (t) => [uniqueIndex("supplier_buyer_name").on(t.buyerOrgId, t.name)]
)
// A freight forwarder a buyer ships POs to, such as a consolidator in China. Its addresses are the ones the buyer
// saved for it until it joins Copacker; after that it keeps its own in its workspace.
export const forwarders = pgTable(
  "forwarders",
  {
    id: uuid().defaultRandom().primaryKey(),
    buyerOrgId: uuid()
      .notNull()
      .references(() => organizations.id),
    forwarderOrgId: uuid().references(() => organizations.id),
    name: text().notNull(),
    // Where its invitation goes; null until the buyer invites it.
    email: text(),
    invitationHash: text().unique(),
    expiresAt: timestamp({ withTimezone: true }),
    // Set when the buyer removes the forwarder. The row stays so earlier POs keep their destination.
    removedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [uniqueIndex("forwarder_buyer_name").on(t.buyerOrgId, t.name)]
)
// A workspace's own contact details. A supplier's are shown to its buyers; a buyer's head its POs.
export const supplierProfiles = pgTable("supplier_profiles", {
  orgId: uuid()
    .primaryKey()
    .references(() => organizations.id),
  website: text(),
  phoneNumber: text(),
  contactName: text(),
  contactEmail: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
})
// A product a supplier sells, like a Shopify product: its name, photos, and the options its variants differ by. Its
// variants are the supplier_products rows, one per SKU, which hold the price and stock POs order from.
export const supplierProductGroups = pgTable(
  "supplier_product_groups",
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierOrgId: uuid()
      .notNull()
      .references(() => organizations.id),
    title: text().notNull(),
    // Where the supplier files it, such as "Epee", its own product code, and its page in the supplier's store.
    category: text(),
    productCode: text(),
    url: text(),
    // What a buyer should know about it, such as add-ons like a name on the pocket.
    description: text(),
    // The options its variants differ by, in order, such as Hand and Blade Size. Empty for a single variant.
    optionNames: text().array().notNull().default([]),
    // Photos in document storage, the first being the main one.
    images: jsonb().$type<ProductImage[]>().notNull().default([]),
    revision: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("supplier_product_group_org").on(t.supplierOrgId)]
)
// One variant of a supplier's product: a SKU with its price and stock. Its title is its full name, the product's title
// followed by its option values.
export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierOrgId: uuid()
      .notNull()
      .references(() => organizations.id),
    groupId: uuid()
      .notNull()
      .references(() => supplierProductGroups.id),
    // Its value for each of the product's options, such as { Hand: "Left" }, and its place in the product's list.
    options: jsonb().$type<Record<string, string>>().notNull().default({}),
    position: integer().notNull().default(0),
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
    // Whether the supplier counts this product's stock. Untracked products are made to order, so any quantity can be
    // ordered. A tracked product's POs can't order more than is on hand, less what open POs have ordered, unless it
    // continues selling when out of stock. Pieces leave stock when a shipment's commercial invoice is accepted.
    trackInventory: boolean().notNull().default(false),
    onHand: integer().notNull().default(0),
    continueSelling: boolean().notNull().default(false),
    // Lower unit prices for bigger orders, and how much a PO can order, in the price basis (see catalog-pricing).
    priceBreaks: jsonb().$type<PriceBreak[]>().notNull().default([]),
    quantityRules: jsonb().$type<QuantityRules>().notNull().default(defaultQuantityRules),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("supplier_product_sku").on(t.supplierOrgId, t.supplierSku),
    index("supplier_product_group").on(t.groupId)
  ]
)
// A supplier's price list for some of its customers, like a Shopify catalog: which products they can order, and at
// what prices. Only an active catalog applies.
export const catalogs = pgTable(
  "catalogs",
  {
    id: uuid().defaultRandom().primaryKey(),
    supplierOrgId: uuid()
      .notNull()
      .references(() => organizations.id),
    title: text().notNull(),
    status: text({ enum: ["active", "draft", "archived"] })
      .notNull()
      .default("active"),
    // Moves every price in the catalog that isn't fixed, in hundredths of a percent: -1000 is 10% off.
    adjustmentBasisPoints: integer().notNull().default(0),
    // Products the supplier adds later join the catalog.
    includeNewProducts: boolean().notNull().default(true),
    revision: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("catalog_supplier_title").on(t.supplierOrgId, t.title)]
)
// The products in a catalog. A row is a product the catalog includes, with anything the catalog sets differently.
export const catalogProducts = pgTable(
  "catalog_products",
  {
    catalogId: uuid()
      .notNull()
      .references(() => catalogs.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => supplierProducts.id, { onDelete: "cascade" }),
    // A fixed price in the product's currency and price basis, instead of the adjusted one.
    priceMinor: integer(),
    // Volume pricing and quantity rules for this catalog; null uses the product's.
    priceBreaks: jsonb().$type<PriceBreak[]>(),
    quantityRules: jsonb().$type<QuantityRules>()
  },
  (t) => [primaryKey({ columns: [t.catalogId, t.productId] }), index("catalog_product_product").on(t.productId)]
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
  // For a freight forwarder's address the buyer saved, the forwarder it belongs to.
  forwarderId: uuid().references(() => forwarders.id),
  // For a pickup address the buyer saved for a supplier that hasn't joined, the supplier it belongs to.
  supplierId: uuid().references(() => suppliers.id),
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
  // The supplier shipped the goods, to the forwarder on the way or straight to the destination.
  | "shipped"
  // A forwarder on the way shipped them on, with its freight cost, carrier and tracking.
  | "forwarded"
  | "received"
  | "correction"
  | "needs_attention"
  | "cancelled"
// Changes a supplier proposes to a sent PO: quantities, prices, added and removed products, payment terms and when the
// goods are ready. The buyer approves them into the PO's next revision, which comes with the supplier's commercial
// invoice, or declines them. One can be pending at a time.
export type ProposalLine = {
  // The PO line it changes; none for a product the supplier adds.
  itemId?: string
  supplierSku: string
  title: string
  pieces: number
  unitPrice: number
}
export type Proposal = {
  lines: ProposalLine[]
  paymentTerms: string
  readyDate: string | null
  note: string
}
export const orderProposals = pgTable(
  "order_proposals",
  {
    id: uuid().defaultRandom().primaryKey(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    // The PO revision the changes were made against. The PO changing since makes them stale.
    baseRevision: integer().notNull(),
    status: text({ enum: ["pending", "approved", "declined", "withdrawn"] })
      .notNull()
      .default("pending"),
    data: jsonb().$type<Proposal>().notNull(),
    proposedBy: text().notNull(),
    decidedBy: text(),
    decidedAt: timestamp({ withTimezone: true }),
    // Why the buyer declined, for the supplier.
    reason: text(),
    createdAt: createdAt()
  },
  (t) => [index("order_proposal_order").on(t.orderId)]
)
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
    // The Amazon network this shipment's cartons go to, for a PO to Amazon: FBA or AWD US. Set when the shipment is
    // queued; a submission with cartons for several networks becomes one shipment each.
    amazonNetwork: text({ enum: amazonNetworks }),
    amazonOrderId: text(),
    amazonShipmentId: text(),
    operation: text().notNull().default("none"),
    labels: jsonb().$type<CartonLabel[]>().notNull().default([]),
    // Pieces this shipment took from the supplier's stock, by supplier product, once its commercial invoice was
    // accepted. A correction puts them back.
    stockTaken: jsonb().$type<Record<string, number>>(),
    bookingReference: text(),
    // The carrier and tracking or booking number the forwarder shipped on with.
    forwarderCarrier: text(),
    forwarderReference: text(),
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
// Each person's name, position and company, which their comments show. Signing in asks for them until they're set.
export const profiles = pgTable("profiles", {
  userId: text().primaryKey(),
  firstName: text().notNull(),
  lastName: text().notNull(),
  position: text().notNull().default(""),
  company: text().notNull().default(""),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
})
export const events = pgTable("events", {
  id: uuid().defaultRandom().primaryKey(),
  orderId: uuid()
    .notNull()
    .references(() => orders.id),
  actor: text().notNull(),
  message: text().notNull(),
  // What the PO did, or a comment someone left on its timeline.
  kind: text({ enum: ["event", "comment"] })
    .notNull()
    .default("event"),
  // Who left a comment and their workspace, as named when they wrote it.
  author: text(),
  authorOrg: text(),
  createdAt: createdAt()
})
export const jobs = pgTable(
  "jobs",
  {
    id: uuid().defaultRandom().primaryKey(),
    key: text().notNull().unique(),
    kind: text({
      enum: [
        "amazon",
        "email",
        "shopify",
        "import",
        "stock",
        "sales",
        "shopify-event",
        "shopify-subscribe",
        "shopify-compliance",
        "amazon-event",
        "amazon-subscribe",
        "reconcile"
      ]
    }).notNull(),
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
    // Units in the supplier's case, for restock's rounding when no case pack is set. Copied from Shopify's product
    // custom.case_quantity once, then kept here.
    caseQuantity: integer(),
    // The smallest quantity worth ordering, in sellable units. Restock never suggests less.
    minimumOrder: integer(),
    // The supplier this product is ordered from, chosen by the buyer. Restock groups it under this supplier.
    supplierId: uuid().references(() => suppliers.id),
    // Where a PO line's product label comes from when no barcode was uploaded: "standard" prints Amazon's FNSKU label
    // with the Shopify title; "uploaded" needs the buyer's own, such as a label with size measurements; "none" needs
    // no label, except on POs to Amazon.
    productLabel: text({ enum: ["standard", "uploaded", "none"] })
      .notNull()
      .default("standard"),
    // Each unit's polybag gets a suffocation warning label. New PO lines for the product start with it.
    suffocationWarning: boolean().notNull().default(false),
    // The Amazon network new PO lines to Amazon for the product go to: FBA, or AWD US for bulk stock.
    amazonNetwork: text({ enum: amazonNetworks }).notNull().default("fba"),
    revision: integer().notNull().default(1),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.shopifyDomain, t.productId] })]
)
// A product variation's barcode label, a one-page PDF the buyer uploads once. New POs copy it as the line's product
// label, so the supplier prints it without the buyer uploading it again.
// Details Copacker keeps for each Shopify variation. They were Shopify metafields (custom.supplier_sku, custom.asin,
// custom.amazon_fulfillment_stock_target, custom.fencing_club_stock_target), copied here once per store.
export const variantFields = pgTable(
  "variant_fields",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    shopifyDomain: text().notNull(),
    variantId: text().notNull(),
    // The product's SKU in its supplier's catalog; supplier catalogs and PO lines match on it.
    supplierSku: text(),
    asin: text(),
    // The least to keep at Amazon (0: not stocked there) and at the store's own locations, in sellable units.
    amazonStockTarget: integer(),
    storeStockTarget: integer(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.shopifyDomain, t.variantId] })]
)
// When each store's Shopify metafields were copied into Copacker. Until then, stock syncs copy them first.
export const shopifyFieldImports = pgTable(
  "shopify_field_imports",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    shopifyDomain: text().notNull(),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.shopifyDomain] })]
)
export const productBarcodes = pgTable(
  "product_barcodes",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    shopifyDomain: text().notNull(),
    variantId: text().notNull(),
    productId: text().notNull(),
    objectKey: text().notNull().unique(),
    name: text().notNull(),
    bytes: integer().notNull(),
    uploadedBy: text().notNull(),
    createdAt: createdAt()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.shopifyDomain, t.variantId] })]
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
    errorCode: text(),
    // Amazon only: the unbroken period of daily FBA stock copied from the inventory ledger, and why it last failed.
    stockCoveredFrom: timestamp({ withTimezone: true }),
    stockCoveredTo: timestamp({ withTimezone: true }),
    stockErrorCode: text(),
    // The shape of the stored orders. Orders stored by an older version are read again, newest first, so they gain
    // the fields added since (such as prices).
    dataVersion: integer().notNull().default(0),
    // The unbroken period of the platform's money movements copied after its orders, and why that copy last failed:
    // Amazon's posted transactions (Finances API), or Shopify Payments balance transactions (labels, bills, disputes).
    feesCoveredFrom: timestamp({ withTimezone: true }),
    feesCoveredTo: timestamp({ withTimezone: true }),
    feesErrorCode: text()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.source] })]
)
// Sellable stock at the end of each day (or the lowest seen that day), so restock can leave out days an item was out
// of stock. Pool "fba" is keyed by seller SKU from Amazon's ledger; "shopify" by variant at one location, recorded
// from stock syncs.
export const stockDays = pgTable(
  "stock_days",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    externalAccountId: text().notNull(),
    pool: text({ enum: ["fba", "shopify"] }).notNull(),
    // The Shopify location, or the Amazon marketplace.
    scope: text().notNull(),
    // Seller SKU for FBA, variant ID for Shopify.
    itemKey: text().notNull(),
    day: date({ mode: "string" }).notNull(),
    units: integer().notNull(),
    origin: text({ enum: ["ledger", "snapshot"] }).notNull()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.externalAccountId, t.pool, t.scope, t.itemKey, t.day] })]
)
// Amazon transactions (order payments, refunds and their fees) copied from the Finances API, so margins can include
// Amazon's fees. Each is linked to the order it belongs to, when Amazon names one.
export const amazonTransactions = pgTable(
  "amazon_transactions",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    externalAccountId: text().notNull(),
    transactionId: text().notNull(),
    orderId: text(),
    postedAt: timestamp({ withTimezone: true }).notNull(),
    type: text().notNull(),
    currency: text().notNull(),
    // What the seller is paid for the transaction, and the Amazon fees within it (positive when charged), in minor units.
    totalMinor: integer().notNull(),
    feesMinor: integer().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull()
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.externalAccountId, t.transactionId] }),
    index("amazon_transaction_order").on(t.orgId, t.orderId),
    index("amazon_transaction_posted").on(t.orgId, t.externalAccountId, t.postedAt)
  ]
)
// What getting a PO's goods to the buyer cost beyond the supplier's price: freight, duty and other charges, in the
// PO's currency. The buyer's own record, kept apart from the PO so the supplier never sees it and it can be added as
// the bills arrive.
export const landedCosts = pgTable(
  "landed_costs",
  {
    id: uuid().defaultRandom().primaryKey(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    kind: text({ enum: ["freight", "duty", "other"] }).notNull(),
    description: text().notNull(),
    amountMinor: integer().notNull(),
    createdBy: text().notNull(),
    createdAt: createdAt()
  },
  (t) => [index("landed_cost_order").on(t.orderId)]
)
// Shopify Payments balance transactions: what Shopify added to or took from the payout balance, such as shipping labels,
// the Shopify bill when it's paid from payouts, and dispute fees. Copied so gross profit can include them.
export const shopifyBalanceTransactions = pgTable(
  "shopify_balance_transactions",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    externalAccountId: text().notNull(),
    transactionId: text().notNull(),
    type: text().notNull(),
    processedAt: timestamp({ withTimezone: true }).notNull(),
    orderId: text(),
    currency: text().notNull(),
    // The transaction's amount, Shopify's fee on it, and what it added to the balance (negative when taken), in minor
    // units.
    amountMinor: integer().notNull(),
    feeMinor: integer().notNull(),
    netMinor: integer().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull()
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.externalAccountId, t.transactionId] }),
    index("shopify_balance_processed").on(t.orgId, t.externalAccountId, t.processedAt)
  ]
)
// Costs paid every month that no platform reports, such as an app billed to a card. Each month's amount is spread over
// its days, so gross profit over any period carries its share.
export const monthlyCosts = pgTable(
  "monthly_costs",
  {
    id: uuid().defaultRandom().primaryKey(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    amountMinor: integer().notNull(),
    currency: text().notNull(),
    // The channel it's paid for, or null for the whole business.
    channel: text({ enum: ["amazon", "shopify"] }),
    // The first and last days it's paid; null for since before the sales history and for ongoing.
    startsOn: date({ mode: "string" }),
    endsOn: date({ mode: "string" }),
    createdBy: text().notNull(),
    createdAt: createdAt()
  },
  (t) => [index("monthly_cost_org").on(t.orgId)]
)
// Daily exchange rates (the European Central Bank's reference rates), as units of each currency per US dollar, so
// sales in several currencies can be added up. Shared by every workspace.
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    currency: text().notNull(),
    day: date({ mode: "string" }).notNull(),
    perUsd: numeric({ precision: 20, scale: 10 }).notNull()
  },
  (t) => [primaryKey({ columns: [t.currency, t.day] })]
)
// The FBA and AWD inbound shipments Amazon charged freight for, with the units of each seller SKU in them, so the
// freight can be spread over the products it carried.
export const amazonInboundShipments = pgTable(
  "amazon_inbound_shipments",
  {
    orgId: uuid()
      .notNull()
      .references(() => organizations.id),
    externalAccountId: text().notNull(),
    shipmentId: text().notNull(),
    network: text({ enum: ["fba", "awd"] }).notNull(),
    // Units by seller SKU; null when Amazon has no record of the shipment.
    units: jsonb().$type<Record<string, number>>(),
    fetchedAt: timestamp({ withTimezone: true }).notNull()
  },
  (t) => [primaryKey({ columns: [t.orgId, t.externalAccountId, t.shipmentId] })]
)
