import { type Destination, type OrderInput, type OrderItem } from "@repo/copacker-orders"
import { receiverFor } from "@repo/copacker-packing-rules"

// Purchase orders as the database keeps them, for stories.

export const supplierId = "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a01"
export const deliveryId = "5b0c7a1e-8a4f-4d8e-9b1a-3f2d6c7e8a02"

// A date some days before now, so a story reads the same relative to today.
export function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

let itemCount = 0

export function orderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  itemCount += 1
  const n = String(itemCount).padStart(3, "0")
  return {
    id: `7d1f0c2a-4b3e-4f5a-8c6d-0000000${n.padStart(5, "0")}`,
    variantId: `gid://shopify/ProductVariant/100${n}`,
    inventoryItemId: `gid://shopify/InventoryItem/200${n}`,
    name: "Canvas tote bag",
    variant: "Natural",
    buyerSku: `TOTE-${n}`,
    supplierSku: `LM-TOTE-${n}`,
    asin: "",
    fnsku: "",
    pieces: 240,
    piecesPerSet: 1,
    unitPrice: 425,
    instructions: "",
    prepCategory: "POLYBAGGING",
    suffocationWarning: true,
    receiver: "fba",
    ...overrides
  }
}

// A PO's lines sent where the PO goes: each line keeps its receiver when it is there, such as AWD US on a PO to Amazon,
// and otherwise goes to that destination's first receiver.
export function sendTo<T extends { items: OrderItem[] }>(order: T, destination: Destination): T {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item, receiver: receiverFor(destination, item.receiver) }))
  }
}

// A PO, to the buyer's location unless `destination` says otherwise.
export function orderData({
  destination = "warehouse",
  ...overrides
}: Partial<OrderInput> & { destination?: Destination } = {}): OrderInput {
  return sendTo(orderDataTo(overrides), destination)
}
function orderDataTo(overrides: Partial<OrderInput>): OrderInput {
  return {
    supplierId,
    reference: "PO-1042",
    deliveryId,
    currency: "USD",
    paymentTerms: "Net 30",
    notes: "",
    items: [
      orderItem(),
      orderItem({ name: "Linen apron", variant: "Charcoal", pieces: 120, unitPrice: 890 }),
      orderItem({ name: "Market basket", variant: "Large", pieces: 60, unitPrice: 1450 })
    ],
    ...overrides
  }
}

type Status = "draft" | "submitted" | "closed"

// A row of the Purchase orders list: the order and its supplier's name.
export function orderRow(reference: string, status: Status, supplier: string, days: number) {
  return {
    order: {
      id: `order-${reference}`,
      status,
      data: orderData({ reference }),
      createdAt: daysAgo(days)
    },
    supplier: { name: supplier }
  }
}

export const orderRows = [
  orderRow("PO-1046", "draft", "Lotus Manufacturing", 1),
  orderRow("PO-1045", "submitted", "Lotus Manufacturing", 4),
  orderRow("PO-1044", "submitted", "Northwind Textiles", 9),
  orderRow("PO-1043", "closed", "Northwind Textiles", 30),
  orderRow("PO-1042", "closed", "Lotus Manufacturing", 400)
]
