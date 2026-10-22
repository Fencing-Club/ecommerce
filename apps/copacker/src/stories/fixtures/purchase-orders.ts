import type { Address, SupplierCatalogStatus } from "@repo/copacker-orders"
import type { OrderInput } from "@repo/copacker-orders"
import { http, HttpResponse } from "msw/http"
import { expect, screen, waitFor, within } from "storybook/test"
import { z } from "zod"
import type { TimelineEntry } from "@/components/po-timeline"
import type { events } from "@/db/schema"
import type { orderRevisions } from "@/db/schema"
import type { contacts, documents, orders, shipments, suppliers } from "@/db/schema"
import type { CatalogProduct } from "@/lib/api"
import type { QuantityRules } from "@/lib/catalog-pricing"
import type { ImportProposal } from "@/lib/import-proposal"
import type { ForwarderAddress } from "@/server/forwarders"
import type { ListedOrder } from "@/server/supplier-workspace"
import { workspaces } from "../workspace"
import { daysAgo, deliveryId, orderData, orderItem, supplierId } from "./orders"

// A dialog once it has opened: its content fades in, so it counts as shown only once it's visible.
export async function shownDialog(name: string, role: "dialog" | "alertdialog" = "dialog") {
  const dialog = await screen.findByRole(role, { name })
  await waitFor(() => expect(dialog).toBeVisible())
  return within(dialog)
}

// A purchase order's page and what hangs off it (its supplier, shipments, documents and timeline) as the database
// keeps them, and the products, suppliers and addresses its editor offers.

const actionBody = z.object({ action: z.string(), data: z.record(z.string(), z.unknown()) })
type Action = z.infer<typeof actionBody>

// The app's /api/action, which reports each action it's sent to `seen` and answers with `respond`'s reply, or success.
export function actionHandler(seen: (body: Action) => void, respond?: (body: Action) => Response | undefined) {
  return http.post("/api/action", async ({ request }) => {
    const body = actionBody.parse(await request.json())
    seen(body)
    return respond?.(body) ?? HttpResponse.json({ ok: true })
  })
}

export const orderId = "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9e01"
export const forwarderId = "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9e02"
export const stopId = "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9e03"
const otherSupplierId = "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9e04"
const studioId = "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9e05"
const noPhoneStopId = "3c9e2b1a-6d4f-4a8b-9c2e-1f0a5b7d9e06"

type Order = typeof orders.$inferSelect
type Supplier = typeof suppliers.$inferSelect
type Shipment = typeof shipments.$inferSelect
type Document = typeof documents.$inferSelect
type Contact = typeof contacts.$inferSelect

// PO-1042 to the buyer's warehouse: three products from Lotus Manufacturing.
export const order = orderData()

export function orderRecord(overrides: Partial<Order> = {}): Order {
  return {
    id: orderId,
    buyerOrgId: workspaces.buyer.id,
    supplierId,
    shopifyDomain: "harbor-goods.myshopify.com",
    amazonSellerId: null,
    status: "submitted",
    revision: 1,
    data: order,
    createdAt: daysAgo(12),
    updatedAt: daysAgo(10),
    ...overrides
  }
}

export function supplierRecord(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: supplierId,
    buyerOrgId: workspaces.buyer.id,
    supplierOrgId: workspaces.supplier.id,
    name: "Lotus Manufacturing",
    email: "orders@lotus.example.com",
    invitationHash: null,
    expiresAt: null,
    removedAt: null,
    leadTimeDays: 60,
    paymentTerms: "Due immediately",
    shopifySupplierName: null,
    website: null,
    contactName: "Mei Chen",
    contactEmail: "mei@lotus.example.com",
    phoneNumber: null,
    catalogId: null,
    createdAt: daysAgo(90),
    ...overrides
  }
}

let shipmentCount = 0

export function shipmentRecord(overrides: Partial<Shipment> = {}): Shipment {
  shipmentCount += 1
  return {
    id: `6a2d4f1e-0b3c-4d5e-8f7a-${String(shipmentCount).padStart(12, "0")}`,
    orderId,
    revision: 1,
    orderRevision: 1,
    status: "packing",
    packing: null,
    packingDraft: null,
    snapshot: null,
    amazonNetwork: null,
    linkedAmazonShipmentId: null,
    amazonOrderId: null,
    amazonShipmentId: null,
    packingGroups: null,
    operation: "none",
    labels: [],
    stockTaken: null,
    bookingReference: null,
    transport: {
      service: "parcel",
      handoff: "supplier",
      collection: "pickup",
      carrierLabels: "per_carton",
      instructions: ""
    },
    forwarderCarrier: null,
    forwarderReference: null,
    issue: null,
    createdAt: daysAgo(9),
    updatedAt: daysAgo(8),
    ...overrides
  }
}

// The address the supplier ships from, which a packed shipment keeps as its origin.
export const pickupAddress: Address = {
  name: "Mei Chen",
  addressLine1: "88 Harbour Road",
  addressLine2: "",
  city: "Ningbo",
  stateOrRegion: "Zhejiang",
  postalCode: "315000",
  countryCode: "CN",
  phoneNumber: "+86 574 5555 0100",
  email: ""
}

export const pickupLocations = [
  { id: "supplier-origin", name: "Northwind Textiles / Main factory", address: pickupAddress },
  {
    id: "supplier-warehouse",
    name: "Northwind Textiles / Ningbo warehouse",
    address: { ...pickupAddress, addressLine1: "26 Yongjiang Road", addressLine2: "Building 2", postalCode: "315020" }
  },
  {
    id: "supplier-hangzhou",
    name: "Northwind Textiles / Hangzhou factory",
    address: { ...pickupAddress, addressLine1: "118 Binsheng Road", city: "Hangzhou", postalCode: "310051" }
  }
]

// A shipment's packing, one carton of each product.
export function packed(cartons: number) {
  return {
    readyDate: "2026-10-05",
    origin: pickupAddress,
    cartons: Array.from({ length: cartons }, (_, index) => ({
      cartonId: `C${index + 1}`,
      length: 60,
      width: 40,
      height: 40,
      weight: 12,
      items: [{ itemId: order.items[0]!.id, pieces: 40 }]
    })),
    changes: []
  }
}

let documentCount = 0

export function documentRecord(overrides: Partial<Document> = {}): Document {
  documentCount += 1
  return {
    id: `8e1b2c3d-4e5f-4a6b-8c7d-${String(documentCount + 100).padStart(12, "0")}`,
    orderId,
    shipmentId: null,
    kind: "purchase_order",
    itemId: null,
    cartonId: null,
    trackingNumber: null,
    sourceName: null,
    sourcePage: null,
    objectKey: `documents/${documentCount}.pdf`,
    name: "PO-1042.pdf",
    bytes: 48_000,
    orderRevision: 1,
    shipmentRevision: null,
    outdated: false,
    uploadedBy: "user_story",
    createdAt: daysAgo(10),
    ...overrides
  }
}

function contact(overrides: Partial<Contact> & Pick<Contact, "id" | "name" | "kind">): Contact {
  return {
    orgId: workspaces.buyer.id,
    address: {
      name: "Receiving",
      addressLine1: "1200 Harbor Way",
      addressLine2: "",
      city: "Oakland",
      stateOrRegion: "CA",
      postalCode: "94607",
      countryCode: "US",
      phoneNumber: "+1 510 555 0142",
      email: ""
    },
    shopifyLocationId: null,
    forwarderId: null,
    supplierId: null,
    createdAt: daysAgo(120),
    ...overrides
  }
}

// The buyer's warehouse, where PO-1042 is delivered, and the forwarder's warehouse on the way.
export const warehouse = contact({
  id: deliveryId,
  name: "Oakland warehouse",
  kind: "delivery",
  shopifyLocationId: "gid://shopify/Location/1"
})
export const forwarderWarehouse = contact({
  id: stopId,
  name: "Ningbo warehouse",
  kind: "delivery",
  forwarderId,
  address: { ...pickupAddress, name: "Bayline Ningbo", addressLine1: "12 Port Avenue" }
})

// The editor's choices: the buyer's suppliers, its delivery addresses, and the forwarders' addresses a PO can stop at.
export const builderSuppliers = [
  { id: supplierId, name: "Lotus Manufacturing" },
  { id: otherSupplierId, name: "Northwind Textiles" }
]
export const deliveries = [
  { id: deliveryId, name: "Oakland warehouse", shopifyLocationId: "gid://shopify/Location/1" },
  { id: studioId, name: "Portland studio", shopifyLocationId: null }
]
export const stops = [
  { addressId: stopId, forwarderId, label: "Bayline Freight, Ningbo warehouse", hasPhone: true },
  { addressId: noPhoneStopId, forwarderId, label: "Bayline Freight, Shenzhen yard", hasPhone: false }
]

// The forwarders' addresses as the buyer's pages read them: one the forwarder can be reached at, one without a phone.
export const forwarding: ForwarderAddress[] = [
  {
    forwarderId,
    forwarderName: "Bayline Freight",
    joined: false,
    addressId: stopId,
    addressName: "Ningbo warehouse",
    address: forwarderWarehouse.address
  },
  {
    forwarderId,
    forwarderName: "Bayline Freight",
    joined: false,
    addressId: noPhoneStopId,
    addressName: "Shenzhen yard",
    address: { ...forwarderWarehouse.address, addressLine1: "3 Yantian Road", phoneNumber: "" }
  }
]

// The store's products as the product picker lists them, with stock at Amazon and in total.
const pickerProducts = [
  {
    productId: "gid://shopify/Product/30001",
    title: "Waffle towel",
    imageUrl: "https://images.unsplash.com/photo-1636714573130-bbb1d4b19cc1?w=160&fit=crop",
    variants: [
      {
        variantId: "gid://shopify/ProductVariant/300011",
        title: "Sand",
        sku: "TOWEL-SAND",
        available: 120,
        levels: [
          { locationId: "amazon:fba", available: 40 },
          { locationId: "gid://shopify/Location/1", available: 80 }
        ]
      },
      {
        variantId: "gid://shopify/ProductVariant/300012",
        title: "Slate",
        sku: "TOWEL-SLATE",
        available: 15,
        levels: [{ locationId: "amazon:awd", available: 15 }]
      }
    ]
  },
  {
    productId: "gid://shopify/Product/30002",
    title: "Linen napkin set",
    imageUrl: "https://images.unsplash.com/photo-1636714573130-bbb1d4b19cc1?w=160&fit=crop",
    variants: [
      {
        variantId: "gid://shopify/ProductVariant/300021",
        title: null,
        sku: "NAPKIN-SET",
        available: null,
        levels: []
      }
    ]
  }
]

function catalogProduct(variantId: string, product: string, title: string, sku: string, cost: string): CatalogProduct {
  return {
    id: variantId,
    title,
    sku,
    product: { id: `gid://shopify/Product/${sku}`, title: product },
    inventoryItem: {
      id: variantId.replace("ProductVariant", "InventoryItem"),
      unitCost: { amount: cost, currencyCode: "USD" },
      countryCodeOfOrigin: "PT"
    },
    requiresComponents: false,
    productVariantComponents: { nodes: [], pageInfo: { hasNextPage: false } },
    supplierSku: { value: `LM-${sku}` },
    asin: null,
    amazonAsin: "",
    fnsku: "",
    amazonError: null,
    lineDefaults: { piecesPerSet: 1, prepCategory: "POLYBAGGING", suffocationWarning: true, amazonNetwork: "fba" }
  }
}

export const catalogProducts = [
  catalogProduct("gid://shopify/ProductVariant/300011", "Waffle towel", "Sand", "TOWEL-SAND", "6.50"),
  catalogProduct("gid://shopify/ProductVariant/300012", "Waffle towel", "Slate", "TOWEL-SLATE", "6.50"),
  catalogProduct("gid://shopify/ProductVariant/300021", "Linen napkin set", "Default Title", "NAPKIN-SET", "12.00")
]

// The product picker's API: the store's products, filtered by what's searched, and the chosen variations' catalog
// details. Each request is reported, so a story can check what was asked for.
export function productHandlers(seen: (url: URL) => void = () => undefined) {
  return [
    http.get("/api/inventory/products", ({ request }) => {
      const url = new URL(request.url)
      seen(url)
      const q = url.searchParams.get("q")?.toLowerCase()
      return HttpResponse.json({
        products: q ? pickerProducts.filter((product) => product.title.toLowerCase().includes(q)) : pickerProducts
      })
    }),
    http.get("/api/catalog", ({ request }) => {
      const url = new URL(request.url)
      seen(url)
      const ids = url.searchParams.get("ids")?.split(",") ?? []
      return HttpResponse.json(catalogProducts.filter((product) => ids.includes(product.id)))
    })
  ]
}

type Quote = {
  status: SupplierCatalogStatus
  unitPriceMinor: number | null
  available: number | null
  tiers?: Array<{ minimumPieces: number; unitPriceMinor: number }>
  rules?: QuantityRules
}
const matchBody = z.object({ supplierId: z.string(), currency: z.string(), supplierSkus: z.array(z.string()) })

// The supplier's catalog as the purchase order editor looks up its lines: each supplier SKU's quote from `quotes`, or
// none when the supplier keeps no catalog, without volume prices or rules unless the quote has them, as the server
// answers. Each lookup is reported.
export function catalogMatches(
  quotes: Record<string, Quote> = {},
  seen: (body: z.infer<typeof matchBody>) => void = () => undefined
) {
  return http.post("/api/supplier-catalog/match", async ({ request }) => {
    const body = matchBody.parse(await request.json())
    seen(body)
    return HttpResponse.json(
      body.supplierSkus.map((sku) => ({
        sku,
        product: null,
        tiers: [],
        rules: null,
        ...(quotes[sku] ?? { status: "supplier_catalog_unavailable", unitPriceMinor: null, available: null })
      }))
    )
  })
}

// A purchase order's first stop, which every timeline has: the purchase order being created, as its first revision.
export const createdTimelineEntry: TimelineEntry = {
  key: "revision-1",
  at: daysAgo(12),
  content: { key: "created", values: null },
  comment: false,
  author: null,
  authorOrg: null,
  revision: orderData({ items: [orderItem({ buyerSku: "TOTE-NAT", supplierSku: "", pieces: 240 })] }),
  revisionNumber: 1
}

// PO-1042's timeline: comments from both sides, the supplier's events, and its two revisions.
export const timelineEntries: TimelineEntry[] = [
  {
    key: "comment-supplier",
    at: daysAgo(1),
    content: "Cartons ship Friday.\nTracking to follow.",
    comment: true,
    author: "Mei Chen",
    authorOrg: "Lotus Manufacturing",
    visibility: "shared",
    revision: null,
    revisionNumber: null
  },
  {
    key: "ready",
    at: daysAgo(2),
    content: { key: "readyDateSet", values: { date: "2026-10-05" } },
    comment: false,
    author: null,
    authorOrg: null,
    visibility: "shared",
    revision: null,
    revisionNumber: null
  },
  {
    key: "forwarded",
    at: daysAgo(2),
    content: { key: "forwarderShipped", values: { forwarder: "Bayline Freight", tracking: "MAEU 204113" } },
    comment: false,
    author: null,
    authorOrg: null,
    revision: null,
    revisionNumber: null
  },
  {
    key: "revision-2",
    at: daysAgo(5),
    content: { key: "approvedSupplierChanges", values: null },
    comment: false,
    author: null,
    authorOrg: null,
    revision: orderData({ items: [orderItem({ buyerSku: "TOTE-NAT", supplierSku: "LM-TOTE", pieces: 300 })] }),
    revisionNumber: 2
  },
  {
    key: "comment-buyer",
    at: daysAgo(9),
    content: "Please use the recycled polybags.",
    comment: true,
    author: "Alex Rivera",
    authorOrg: "Harbor Goods",
    revision: null,
    revisionNumber: null
  },
  {
    key: "legacy",
    at: daysAgo(10),
    content: "Purchase order emailed to Lotus Manufacturing",
    comment: false,
    author: null,
    authorOrg: null,
    revision: null,
    revisionNumber: null
  },
  createdTimelineEntry
]

// PO-1042's history as the database keeps it: its events and comments, and its revisions.
export const history: Array<typeof events.$inferSelect> = [
  {
    id: "9f0a1b2c-3d4e-4f5a-8b6c-000000000001",
    orderId,
    actor: "user_supplier",
    internalOrgId: null,
    messageKey: null,
    messageValues: null,
    message: "Cartons ship Friday.",
    kind: "comment",
    author: "Mei Chen",
    authorOrg: "Lotus Manufacturing",
    createdAt: daysAgo(1)
  },
  {
    id: "9f0a1b2c-3d4e-4f5a-8b6c-000000000002",
    orderId,
    actor: "user_story",
    internalOrgId: null,
    messageKey: "submittedToSupplier",
    messageValues: null,
    message: null,
    kind: "event",
    author: null,
    authorOrg: null,
    createdAt: daysAgo(10)
  }
]
export const revisions: Array<typeof orderRevisions.$inferSelect> = [
  {
    id: "9f0a1b2c-3d4e-4f5a-8b6c-000000000003",
    orderId,
    revision: 1,
    data: order,
    actor: "user_story",
    reason: "created",
    createdAt: daysAgo(12)
  }
]

// A supplier's orders, as its Orders page lists them.
function supplierOrder(
  reference: string,
  stage: ListedOrder["stage"],
  status: string,
  customer: string,
  days: number
): ListedOrder {
  return {
    id: `order-${reference}`,
    reference,
    customerId: `customer-${customer}`,
    customer,
    sentAt: daysAgo(days),
    orderStatus: stage === "closed" ? "closed" : "submitted",
    status,
    stage,
    shipmentId: null,
    currency: "USD",
    total: 295_800,
    pieces: 420,
    lines: 3,
    firstItem: "Canvas tote bag"
  }
}

export const supplierOrders = [
  supplierOrder("PO-1045", "pack", "packing", "Harbor Goods", 2),
  supplierOrder("PO-1044", "ship", "ready", "Harbor Goods", 6),
  supplierOrder("PO-1031", "closed", "closed", "Juniper Home", 40)
]

// A purchase order read from a PDF, waiting for review: one line matched to a product, one the reader couldn't match,
// and a freight charge.
export const importId = "4b7c9d2e-1f3a-4c5b-9d8e-000000000001"
export const importedVariantId = "gid://shopify/ProductVariant/100001"
export const importProposal: ImportProposal = {
  reference: "LM-2026-118",
  currency: "USD",
  items: [
    {
      description: "Canvas tote, natural",
      sourceSku: "LM-TOTE-001",
      sourcePage: 1,
      sourceQuantity: 240,
      sourceUnit: "pcs",
      sourceUnitPrice: "4.25",
      sourceLineTotal: "1020.00",
      selectedVariantId: importedVariantId,
      candidateVariantIds: [importedVariantId],
      pieces: 240,
      piecesPerSet: 1,
      pricePerPiece: "4.25",
      reason: "SKU matches the supplier SKU",
      warnings: []
    },
    {
      description: "Market basket, large",
      sourceSku: "LM-BASKET-L",
      sourcePage: 2,
      sourceQuantity: 60,
      sourceUnit: "pcs",
      sourceUnitPrice: "14.50",
      sourceLineTotal: "900.00",
      selectedVariantId: null,
      candidateVariantIds: [],
      pieces: 60,
      piecesPerSet: 1,
      pricePerPiece: "14.50",
      reason: "No product with this SKU",
      warnings: ["Quantity is hard to read"]
    }
  ],
  adjustments: [{ description: "Freight", amount: "85.00", sourcePage: 2 }],
  documentTotal: "1975.00",
  warnings: ["The document has no ship-to address"]
}
function importRow(n: number, filename: string, status: string, days: number) {
  return {
    id: n === 1 ? importId : `4b7c9d2e-1f3a-4c5b-9d8e-00000000010${n}`,
    filename,
    status,
    revision: 1,
    createdAt: daysAgo(days).toISOString()
  }
}

// The workspace's imports, one in each state.
export const importList = [
  importRow(2, "scan-0921.pdf", "queued", 0),
  importRow(3, "juniper-order.pdf", "running", 0),
  importRow(1, "lotus-po-118.pdf", "review", 1),
  importRow(4, "blurry-scan.pdf", "failed", 2),
  importRow(5, "old-po.pdf", "cancelled", 8),
  importRow(6, "northwind-invoice.pdf", "saved", 12)
]
export const importedProducts = {
  [importedVariantId]: { title: "Canvas tote bag", variant: "Natural", sku: "TOTE-001" }
}

// The PO's landed costs recorded so far.
export const landedCosts = [
  { id: "a1b2c3d4-0000-4000-8000-000000000001", kind: "Freight", description: "Bayline invoice 2291", amount: 42_000 },
  { id: "a1b2c3d4-0000-4000-8000-000000000002", kind: "duty", description: "", amount: 18_550 }
]

// Order data for a PO to Amazon, which lists its lines' networks.
export const amazonOrder: OrderInput = orderData({ destination: "amazon", deliveryId: undefined })
