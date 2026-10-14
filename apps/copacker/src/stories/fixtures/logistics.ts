import type { Address, OrderInput, Packing } from "@repo/aisle"
import type { ShopifyLocationKind } from "@repo/aisle/shopify"
import { http, HttpResponse } from "msw"
import type { PartnerAddress } from "@/components/partner-address"
import type { documents, shipments } from "@/db/schema"
import type { Access, Role } from "@/lib/access"
import type { AmazonShipment } from "@/server/amazon-shipments"
import { daysAgo, orderData, orderItem } from "./orders"

// Shipments, partners and their addresses, as the database keeps them, for stories.

// A request the app's forms send to /api/action.
export type ActionRequest = { action: string; data: Record<string, unknown> }

function isActionRequest(body: unknown): body is ActionRequest {
  return typeof body === "object" && body !== null && "action" in body && typeof body.action === "string"
}

// Answers /api/action and keeps each request in `sent` for the play function to check. `respond` answers a request
// itself, such as with the server's error; without it, or when it returns nothing, the change succeeds.
export function recordActions(sent: ActionRequest[], respond?: (request: ActionRequest) => Response | undefined) {
  return http.post("/api/action", async ({ request }) => {
    const body: unknown = await request.json()
    if (!isActionRequest(body)) {
      return HttpResponse.json({ error: "Unknown action" }, { status: 400 })
    }
    sent.push(body)
    return respond?.(body) ?? HttpResponse.json({ ok: true })
  })
}

// The server's error for a change it refused, as the app's API sends it.
export function serverError(error: string) {
  return HttpResponse.json({ error }, { status: 400 })
}

export const pickupAddress: Address = {
  name: "Mei Chen",
  phoneNumber: "+8657985551234",
  email: "mei@lotus.example.com",
  addressLine1: "1000 Siji Road",
  addressLine2: "Building 3",
  city: "Yiwu",
  stateOrRegion: "Zhejiang",
  postalCode: "322000",
  countryCode: "CN"
}

export const warehouseAddress: Address = {
  name: "Jordan Lee",
  phoneNumber: "+15035550142",
  email: "receiving@harbor.example.com",
  addressLine1: "2400 NW Front Ave",
  addressLine2: "",
  city: "Portland",
  stateOrRegion: "OR",
  postalCode: "97209",
  countryCode: "US"
}

export const forwarderAddress: Address = {
  name: "Wei Zhang",
  phoneNumber: "+8675555501234",
  email: "",
  addressLine1: "88 Harbor Road",
  addressLine2: "",
  city: "Shenzhen",
  stateOrRegion: "Guangdong",
  postalCode: "518000",
  countryCode: "CN"
}

export const partnerAddresses = {
  factory: { id: "3c1a8f2e-0d4b-4c7a-9e21-5a6b7c8d9e01", name: "Factory", address: pickupAddress },
  forwarderWarehouse: {
    id: "3c1a8f2e-0d4b-4c7a-9e21-5a6b7c8d9e02",
    name: "Shenzhen consolidation",
    address: forwarderAddress
  }
} satisfies Record<string, PartnerAddress>

export const supplierRecordId = "9a7e3f1c-2b4d-4e6f-8a1b-2c3d4e5f6a01"
export const forwarderRecordId = "9a7e3f1c-2b4d-4e6f-8a1b-2c3d4e5f6a02"
export const shipmentId = "c0ffee00-1234-4abc-9def-000000000001"
const orderId = "0b5e6d7c-8a9f-4b1c-9d2e-3f4a5b6c7d01"
const amazonOrderId = "0b5e6d7c-8a9f-4b1c-9d2e-3f4a5b6c7d02"

// One purchase order to the buyer's warehouse, and one to Amazon with a line for each network, each item made once so
// cartons and changes can point at it.
const warehouseOrder: OrderInput = orderData({ reference: "PO-1045" })
const amazonOrder: OrderInput = orderData({
  reference: "PO-1046",
  destination: "amazon",
  deliveryId: undefined,
  items: [
    orderItem({ name: "Canvas tote bag", variant: "Natural", fnsku: "X00TOTE001", asin: "B0TOTE0001" }),
    orderItem({ name: "Linen apron", variant: "Charcoal", pieces: 120, unitPrice: 890, fnsku: "X00APRN001" })
  ]
})

// The purchase orders as a shipment reads them: the order, its buyer and its supplier.
export const orderRecords = {
  warehouse: { id: orderId, data: warehouseOrder, buyerOrgId: "org_buyer", revision: 2, status: "submitted" },
  amazon: { id: amazonOrderId, data: amazonOrder, buyerOrgId: "org_buyer", revision: 1, status: "submitted" }
} as const

// Two cartons of the order's first two lines, ready in a few days, collected from the supplier's factory.
export function packingFor(order: OrderInput, overrides: Partial<Packing> = {}): Packing {
  const [first, second] = order.items
  return {
    readyDate: daysAgo(-5).toISOString().slice(0, 10),
    origin: pickupAddress,
    invoiceDocumentId: "d0c00000-0000-4000-8000-000000000001",
    cartons: [
      { cartonId: "C1", length: 60, width: 40, height: 40, weight: 18.5, items: [{ itemId: first!.id, pieces: 120 }] },
      {
        cartonId: "C2",
        length: 60,
        width: 40,
        height: 40,
        weight: 17,
        items: [
          { itemId: first!.id, pieces: 120 },
          { itemId: second!.id, pieces: 60 }
        ]
      }
    ],
    changes: [],
    ...overrides
  }
}

export type ShipmentRow = typeof shipments.$inferSelect

export function shipmentRow(overrides: Partial<ShipmentRow> = {}): ShipmentRow {
  return {
    id: shipmentId,
    orderId,
    revision: 3,
    orderRevision: 1,
    status: "packing",
    packing: null,
    packingDraft: null,
    snapshot: null,
    amazonNetwork: null,
    amazonOrderId: null,
    amazonShipmentId: null,
    operation: "none",
    labels: [],
    stockTaken: null,
    bookingReference: null,
    forwarderCarrier: null,
    forwarderReference: null,
    issue: null,
    createdAt: daysAgo(6),
    updatedAt: daysAgo(1),
    ...overrides
  }
}

export type DocumentRow = typeof documents.$inferSelect

let documentCount = 0

export function documentRow(
  kind: DocumentRow["kind"],
  name: string,
  overrides: Partial<DocumentRow> = {}
): DocumentRow {
  documentCount += 1
  return {
    id: `d0c00000-0000-4000-8000-${String(documentCount).padStart(12, "0")}`,
    orderId,
    shipmentId,
    kind,
    itemId: null,
    cartonId: null,
    objectKey: `documents/${name}`,
    name,
    bytes: 48213,
    orderRevision: 1,
    shipmentRevision: 3,
    outdated: 0,
    uploadedBy: "user_story",
    createdAt: daysAgo(2),
    ...overrides
  }
}

// Shopify locations a delivery address can be linked to.
export const shopifyLocations = [
  { id: "gid://shopify/Location/7001", name: "Portland warehouse" },
  { id: "gid://shopify/Location/7002", name: "Reno overflow" }
]

type SavedContact = {
  id: string
  name: string
  kind: "delivery" | "forwarder" | "pickup"
  address: Address
  shopifyLocationId: string | null
}

// A buyer's saved addresses: its warehouse, linked to a Shopify location, and older ones the Settings page still lists.
export const buyerContacts: SavedContact[] = [
  {
    id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a02",
    name: "Portland warehouse",
    kind: "delivery",
    address: warehouseAddress,
    shopifyLocationId: shopifyLocations[0]!.id
  },
  {
    id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a03",
    name: "Reno 3PL",
    kind: "delivery",
    address: { ...warehouseAddress, addressLine1: "900 Logistics Pkwy", city: "Reno", stateOrRegion: "NV" },
    shopifyLocationId: "gid://shopify/Location/7999"
  },
  {
    id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a04",
    name: "Shenzhen consolidation",
    kind: "forwarder",
    address: forwarderAddress,
    shopifyLocationId: null
  },
  {
    id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a05",
    name: "Lotus factory",
    kind: "pickup",
    address: pickupAddress,
    shopifyLocationId: null
  }
]

// A supplier's pickup addresses, one without the phone number Amazon needs.
export const supplierContacts: SavedContact[] = [
  {
    id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a06",
    name: "Factory",
    kind: "pickup",
    address: pickupAddress,
    shopifyLocationId: null
  },
  {
    id: "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a07",
    name: "Showroom",
    kind: "pickup",
    address: { ...pickupAddress, addressLine1: "55 Futian Market", addressLine2: "", phoneNumber: "" },
    shopifyLocationId: null
  }
]

type Member = { userId: string; email: string; name: string; role: Role; access: Access }
type Invitation = { email: string; role: "admin" | "member"; access: Access; expires: string; expired: boolean }

// Harbor Goods' team: its owner (the person signed in to stories), an admin, and a member who packs purchase orders.
export const team: { members: Member[]; invitations: Invitation[] } = {
  members: [
    { userId: "user_story", email: "alex@example.com", name: "Alex Rivera", role: "owner", access: {} },
    { userId: "user_priya", email: "priya@harbor.example.com", name: "Priya Shah", role: "admin", access: {} },
    {
      userId: "user_sam",
      email: "sam@harbor.example.com",
      name: "Sam Okafor",
      role: "member",
      access: { overview: "view", orders: "edit", shipments: "view", prices: "view" }
    }
  ],
  invitations: [
    {
      email: "jordan@harbor.example.com",
      role: "member",
      access: { shipments: "edit" },
      expires: "Oct 4",
      expired: false
    },
    { email: "casey@harbor.example.com", role: "admin", access: {}, expires: "Sep 20", expired: true }
  ]
}

// A connected store's order sync, as GET /api/sales reports it.
type SalesSync = {
  source: "shopify" | "amazon" | "ebay"
  externalAccountId: string
  status: "idle" | "queued" | "running" | "failed"
  errorCode: string | null
  coveredFrom: string | null
  coveredTo: string | null
  finishedAt: string | null
  progress: number | null
  orders: number
  recent: { orders: number; units: number }
}

export const shopifyAccount = "harbor-goods.myshopify.com"
export const amazonAccount = "A2HARBORGOODS1"
// An eBay seller's username.
export const ebayAccount = "harbor_goods"
const accounts = { shopify: shopifyAccount, amazon: amazonAccount, ebay: ebayAccount }

export function salesSync(source: SalesSync["source"], overrides: Partial<SalesSync> = {}): SalesSync {
  return {
    source,
    externalAccountId: accounts[source],
    status: "idle",
    errorCode: null,
    coveredFrom: daysAgo(730).toISOString(),
    coveredTo: daysAgo(0.1).toISOString(),
    finishedAt: daysAgo(0.1).toISOString(),
    progress: null,
    orders: 1284,
    recent: { orders: 212, units: 486 },
    ...overrides
  }
}

// One part of a store's inventory sync (Shopify, or Amazon's FBA or AWD), as GET /api/inventory reports it.
type StockSync = {
  externalAccountId: string | null
  observedAt: string | null
  refresh: { status: string; errorCode: string | null }
}

export function stockSync(overrides: Partial<StockSync> = {}): StockSync {
  return {
    externalAccountId: shopifyAccount,
    observedAt: daysAgo(0.2).toISOString(),
    refresh: { status: "idle", errorCode: null },
    ...overrides
  }
}

type LocationSetting = {
  locationId: string
  name: string
  kind: ShopifyLocationKind | null
  classification: "merchant" | "amazon_mirror" | "excluded" | "unresolved"
  revision: number
}

// The store's Shopify locations, as Shopify lists them: a third-party warehouse's, two of its own and Amazon's FBA
// mirror.
export const inventoryLocations: { snapshotId: string | null; locations: LocationSetting[] } = {
  snapshotId: "snap_20260927",
  locations: [
    {
      locationId: "gid://shopify/Location/7004",
      name: "ShipBob Reno",
      kind: "fulfillment_service",
      classification: "unresolved",
      revision: 4
    },
    {
      locationId: "gid://shopify/Location/7001",
      name: "Portland warehouse",
      kind: "merchant",
      classification: "merchant",
      revision: 2
    },
    {
      locationId: "gid://shopify/Location/7002",
      name: "Reno overflow",
      kind: "merchant",
      classification: "excluded",
      revision: 1
    },
    {
      locationId: "gid://shopify/Location/7003",
      name: "Amazon FBA",
      kind: "amazon_fulfillment",
      classification: "amazon_mirror",
      revision: 1
    }
  ]
}

// What a connected store's settings read: its order sync, each part's inventory sync (by the `source` the request asks
// for) and its Shopify locations.
export function storeSyncHandlers({
  sales = [salesSync("shopify"), salesSync("amazon"), salesSync("ebay")],
  stock = {},
  locations = inventoryLocations
}: {
  sales?: SalesSync[]
  stock?: Partial<Record<"shopify" | "fba" | "awd", StockSync>>
  locations?: typeof inventoryLocations
} = {}) {
  return [
    http.get("/api/connections/amazon-ads", () =>
      HttpResponse.json({ connected: false, active: false, failed: false })
    ),
    http.get("/api/sales", () => HttpResponse.json({ sources: sales })),
    http.get("/api/inventory", ({ request }) => {
      const source = new URL(request.url).searchParams.get("source")
      const status =
        source === "shopify" || source === "fba" || source === "awd"
          ? (stock[source] ?? stockSync({ externalAccountId: source === "shopify" ? shopifyAccount : amazonAccount }))
          : null
      return status ? HttpResponse.json(status) : HttpResponse.json({ error: "Unknown source" }, { status: 400 })
    }),
    http.get("/api/inventory/locations", () => HttpResponse.json(locations))
  ]
}

// A buyer's shipments, newest first as the list reads them: two for its warehouse order and four for its Amazon order.
export const shipmentList: ShipmentRow[] = [
  shipmentRow({
    id: "c0ffee00-1234-4abc-9def-000000000011",
    status: "packing",
    packingDraft: { readyDate: daysAgo(-9).toISOString().slice(0, 10), cartons: [{ cartonId: "C1" }] },
    createdAt: daysAgo(1)
  }),
  shipmentRow({
    id: "c0ffee00-1234-4abc-9def-000000000012",
    orderId: amazonOrderId,
    status: "waiting_labels",
    amazonNetwork: "awd_us",
    amazonOrderId: "STAR-8KQ2M7",
    amazonShipmentId: "STAR-8KQ2M7-1",
    packing: packingFor(amazonOrder),
    createdAt: daysAgo(3)
  }),
  shipmentRow({
    id: "c0ffee00-1234-4abc-9def-000000000013",
    status: "approval",
    packing: packingFor(warehouseOrder),
    createdAt: daysAgo(5)
  }),
  shipmentRow({
    id: "c0ffee00-1234-4abc-9def-000000000014",
    orderId: amazonOrderId,
    status: "cancelled",
    amazonNetwork: "fba",
    createdAt: daysAgo(20)
  }),
  shipmentRow({
    id: "c0ffee00-1234-4abc-9def-000000000015",
    orderId: amazonOrderId,
    status: "received",
    amazonNetwork: "fba",
    amazonShipmentId: "FBA18ABCD123",
    packing: packingFor(amazonOrder),
    createdAt: daysAgo(40)
  })
]

// Shipments in the buyer's Seller Central: one a purchase order shipment already shows, and two made elsewhere.
export const sellerCentralShipments: AmazonShipment[] = [
  {
    network: "awd_us",
    shipmentId: "STAR-8KQ2M7-1",
    name: null,
    status: "WORKING",
    createdAt: daysAgo(3).toISOString(),
    url: "https://sellercentral.amazon.com/awd/inbound-shipment/STAR-8KQ2M7-1"
  },
  {
    network: "fba",
    shipmentId: "FBA18ZZTOP01",
    name: "Spring restock",
    status: "IN_TRANSIT",
    createdAt: null,
    url: "https://sellercentral.amazon.com/fba/inbound-shipment/summary/FBA18ZZTOP01"
  },
  {
    network: "fba",
    shipmentId: "FBA17OLD0001",
    name: "Holiday",
    status: "CLOSED",
    createdAt: null,
    url: "https://sellercentral.amazon.com/fba/inbound-shipment/summary/FBA17OLD0001"
  }
]
